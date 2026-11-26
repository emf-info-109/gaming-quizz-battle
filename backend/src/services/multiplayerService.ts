/**
 * Mode multijoueur – compatible multi-instances.
 *
 * Règles d'or :
 *  1. Aucune donnée de partie en mémoire Node.js : tout est lu dans MySQL à chaque requête.
 *  2. Aucune minuterie (setTimeout) : la phase courante est CALCULÉE à partir de
 *     games.started_at et de NOW(3) de MySQL (voir domain/gameClock.ts).
 *     MySQL est l'unique horloge de référence → pas de décalage entre WEB-01 et WEB-02.
 *  3. Les transitions qui écrivent (démarrage, réponses) sont protégées par des
 *     transactions, des verrous de ligne (SELECT ... FOR UPDATE) et des contraintes UNIQUE.
 */
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config.js';
import { isDuplicateKeyError, withTransaction } from '../db/pool.js';
import type { Pool, Queryable, ResultSetHeader, RowDataPacket } from '../db/pool.js';
import { computeClock, type ClockState, type GameStatus } from '../domain/gameClock.js';
import { generateGameCode } from '../domain/gameCode.js';
import { computePoints } from '../domain/scoring.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { pickRandomQuestionIds, resolveCategory } from './categoryService.js';
import type { AuthPlayer } from './playerService.js';
import { loadPublicQuestion, type PublicQuestion } from './soloService.js';

/** Une salle d'attente abandonnée expire après ce délai. */
export const LOBBY_TTL_HOURS = 3;
/**
 * Présence dans une salle d'attente : chaque joueur interroge la partie toutes
 * les 1 à 2 s. Sans nouvelle depuis ce délai, il est considéré comme parti :
 *  - l'organisateur → la partie est annulée pour tout le monde ;
 *  - un autre joueur → il est retiré de la salle.
 * 90 s : les navigateurs ralentissent les minuteries des onglets en arrière-plan
 * jusqu'à une fois par minute (le joueur reste donc présent s'il change d'onglet).
 */
export const LOBBY_PRESENCE_SECONDS = 90;
/**
 * Fermeture de l'onglet (événement « pagehide ») : le joueur n'a plus que ce délai
 * pour revenir. Assez court pour voir l'organisateur partir, assez long pour
 * qu'un simple rechargement de la page n'annule pas la partie.
 */
export const AWAY_GRACE_SECONDS = 10;
/** Nombre de messages renvoyés au premier chargement du chat. */
export const CHAT_HISTORY_LIMIT = 50;

interface MultiGameRow extends RowDataPacket {
  id: string;
  code: string;
  name: string;
  is_public: number;
  host_player_id: string;
  status: GameStatus;
  category_name: string | null;
  category_icon: string | null;
  category_slug: string | null;
  question_count: number;
  question_duration_ms: number;
  reveal_duration_ms: number;
  countdown_ms: number;
  max_players: number;
  elapsed_ms: number | null;
  lobby_expired: number;
}

async function loadGameByCode(db: Queryable, code: string, forUpdate = false) {
  const [rows] = await db.execute<MultiGameRow[]>(
    `SELECT g.id, g.code, COALESCE(g.name, CONCAT('Partie de ', hp.pseudo)) AS name, g.is_public,
            g.host_player_id, g.status, g.question_count, g.question_duration_ms,
            g.reveal_duration_ms, g.countdown_ms, g.max_players,
            TIMESTAMPDIFF(MICROSECOND, g.started_at, NOW(3)) DIV 1000 AS elapsed_ms,
            (g.created_at < NOW(3) - INTERVAL ${LOBBY_TTL_HOURS} HOUR) AS lobby_expired,
            c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug
       FROM games g
       JOIN players hp ON hp.id = g.host_player_id
       LEFT JOIN categories c ON c.id = g.category_id
      WHERE g.code = ? AND g.mode = 'multi'
      ${forUpdate ? 'FOR UPDATE OF g' : ''}`,
    [code],
  );
  const game = rows[0];
  if (!game) throw notFound('GAME_NOT_FOUND', 'Aucune partie ne correspond à ce code.');
  return { ...game, elapsed_ms: game.elapsed_ms === null ? null : Number(game.elapsed_ms) };
}

function clockOf(game: Awaited<ReturnType<typeof loadGameByCode>>): ClockState {
  return computeClock({
    status: game.status,
    elapsedMs: game.elapsed_ms,
    questionCount: game.question_count,
    questionDurationMs: game.question_duration_ms,
    revealDurationMs: game.reveal_duration_ms,
    countdownMs: game.countdown_ms,
  });
}

async function isParticipant(db: Queryable, gameId: string, playerId: string): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT 1 FROM game_players WHERE game_id = ? AND player_id = ?',
    [gameId, playerId],
  );
  return rows.length > 0;
}

/**
 * Marque comme terminées les parties dont le temps total est écoulé.
 * Idempotent et sans danger en cas d'exécution simultanée sur plusieurs instances
 * (la condition `status = 'in_progress'` garantit qu'une seule mise à jour a lieu).
 */
export async function finalizeElapsedGames(db: Queryable, gameId?: string): Promise<void> {
  await db.execute(
    `UPDATE games
        SET status = 'finished',
            finished_at = started_at + INTERVAL
              (countdown_ms + question_count * (question_duration_ms + reveal_duration_ms)) * 1000 MICROSECOND
      WHERE mode = 'multi' AND status = 'in_progress'
        AND started_at + INTERVAL
              (countdown_ms + question_count * (question_duration_ms + reveal_duration_ms)) * 1000 MICROSECOND <= NOW(3)
        ${gameId ? 'AND id = ?' : ''}`,
    gameId ? [gameId] : [],
  );
}

/**
 * Annule les salles d'attente dont l'organisateur ne donne plus signe de vie
 * (onglet fermé, navigateur arrêté...). Idempotent, sans danger en parallèle
 * sur plusieurs instances. Renvoie le nombre de salles annulées.
 */
export async function cancelAbandonedLobbies(db: Queryable, gameId?: string): Promise<number> {
  const [res] = await db.execute<ResultSetHeader>(
    `UPDATE games g
       JOIN game_players host_gp ON host_gp.game_id = g.id AND host_gp.player_id = g.host_player_id
        SET g.status = 'cancelled', g.finished_at = NOW(3)
      WHERE g.mode = 'multi' AND g.status = 'lobby'
        AND host_gp.last_seen_at < NOW(3) - INTERVAL ${LOBBY_PRESENCE_SECONDS} SECOND
        ${gameId ? 'AND g.id = ?' : ''}`,
    gameId ? [gameId] : [],
  );
  return res.affectedRows;
}

/** Retire de la salle les joueurs (hors organisateur) qui ne donnent plus signe de vie. */
async function pruneAbsentPlayers(db: Queryable, gameId: string, hostId: string): Promise<void> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT gp.player_id, p.pseudo FROM game_players gp JOIN players p ON p.id = gp.player_id
      WHERE gp.game_id = ? AND gp.player_id <> ?
        AND gp.last_seen_at < NOW(3) - INTERVAL ${LOBBY_PRESENCE_SECONDS} SECOND`,
    [gameId, hostId],
  );
  for (const r of rows) {
    // La condition est répétée : si deux instances font le ménage en même temps,
    // une seule supprime le joueur (et une seule annonce son départ).
    const [res] = await db.execute<ResultSetHeader>(
      `DELETE FROM game_players WHERE game_id = ? AND player_id = ?
          AND last_seen_at < NOW(3) - INTERVAL ${LOBBY_PRESENCE_SECONDS} SECOND`,
      [gameId, r.player_id],
    );
    if (res.affectedRows === 1) await addSystemMessage(db, gameId, `${r.pseudo} a quitté la salle`);
  }
}

/**
 * Un joueur n'est que dans UNE salle d'attente à la fois. Quand il en crée ou en
 * rejoint une autre :
 *  - les salles qu'il organise sont annulées pour tous les joueurs ;
 *  - il est retiré des salles des autres organisateurs (avec une annonce).
 */
async function leaveOtherLobbies(conn: Queryable, player: AuthPlayer, exceptGameId: string): Promise<void> {
  await conn.execute(
    `UPDATE games SET status = 'cancelled', finished_at = NOW(3)
      WHERE mode = 'multi' AND status = 'lobby' AND host_player_id = ? AND id <> ?`,
    [player.id, exceptGameId],
  );
  const [rows] = await conn.execute<RowDataPacket[]>(
    `SELECT g.id FROM game_players gp JOIN games g ON g.id = gp.game_id
      WHERE gp.player_id = ? AND g.mode = 'multi' AND g.status = 'lobby' AND g.host_player_id <> ? AND g.id <> ?`,
    [player.id, player.id, exceptGameId],
  );
  for (const r of rows) {
    const [res] = await conn.execute<ResultSetHeader>('DELETE FROM game_players WHERE game_id = ? AND player_id = ?', [
      r.id,
      player.id,
    ]);
    if (res.affectedRows === 1) await addSystemMessage(conn, r.id, `${player.pseudo} a quitté la salle`);
  }
}

// -----------------------------------------------------------------------------
//  Création / salle d'attente
// -----------------------------------------------------------------------------

export interface CreateMultiOptions {
  /** Nom de la partie (« Partie de <pseudo> » si absent) */
  name?: string;
  /** Visible dans la liste des parties en attente */
  isPublic?: boolean;
}

export async function createMultiGame(
  pool: Pool,
  cfg: AppConfig['game'],
  host: AuthPlayer,
  categorySlug: string,
  options: CreateMultiOptions = {},
) {
  const name = options.name ?? `Partie de ${host.pseudo}`;
  const isPublic = options.isPublic ?? true;
  const category = await resolveCategory(pool, categorySlug);
  const questionIds = await pickRandomQuestionIds(pool, category?.id ?? null, cfg.questionsPerGame);
  if (questionIds.length === 0) throw badRequest('NO_QUESTIONS', 'Aucune question disponible pour cette catégorie.');

  // Collision de code (très rare) : la contrainte UNIQUE la détecte, on réessaie.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const gameId = randomUUID();
    const code = generateGameCode();
    try {
      await withTransaction(pool, async (conn) => {
        // Une seule salle à la fois : créer une partie fait quitter (ou annule) la précédente.
        await leaveOtherLobbies(conn, host, gameId);
        await conn.execute(
          `INSERT INTO games (id, code, name, is_public, mode, host_player_id, category_id, status, question_count,
                              question_duration_ms, reveal_duration_ms, countdown_ms, max_players)
           VALUES (?, ?, ?, ?, 'multi', ?, ?, 'lobby', ?, ?, ?, ?, ?)`,
          [
            gameId,
            code,
            name,
            isPublic,
            host.id,
            category?.id ?? null,
            questionIds.length,
            cfg.questionDurationMs,
            cfg.revealDurationMs,
            cfg.countdownMs,
            cfg.maxPlayersPerGame,
          ],
        );
        await conn.execute('INSERT INTO game_players (game_id, player_id) VALUES (?, ?)', [gameId, host.id]);
        const placeholders = questionIds.map(() => '(?, ?, ?)').join(', ');
        await conn.execute(
          `INSERT INTO game_questions (game_id, position, question_id) VALUES ${placeholders}`,
          questionIds.flatMap((qid, i) => [gameId, i, qid]),
        );
      });
      return { gameId, code, name };
    } catch (err) {
      if (isDuplicateKeyError(err, 'uq_games_code') && attempt < 5) continue;
      throw err;
    }
  }
  throw new Error('Impossible de générer un code de partie unique.');
}

export async function joinMultiGame(pool: Pool, player: AuthPlayer, code: string) {
  return withTransaction(pool, async (conn) => {
    // Verrou sur la partie : deux joueurs qui rejoignent en même temps (sur deux
    // instances différentes) sont traités l'un après l'autre → la limite de
    // participants ne peut pas être dépassée.
    const game = await loadGameByCode(conn, code, true);

    if (await isParticipant(conn, game.id, player.id)) {
      return { code: game.code, alreadyJoined: true };
    }
    if (game.status === 'cancelled') throw conflict('GAME_CANCELLED', 'Cette partie a été annulée.');
    if (game.status !== 'lobby') throw conflict('GAME_ALREADY_STARTED', 'La partie a déjà commencé.');
    if (Number(game.lobby_expired)) throw conflict('GAME_EXPIRED', 'Cette salle d’attente a expiré.');
    if ((await cancelAbandonedLobbies(conn, game.id)) > 0) {
      throw conflict('GAME_CANCELLED', 'Cette partie a été annulée : l’organisateur a quitté la salle.');
    }
    await pruneAbsentPlayers(conn, game.id, game.host_player_id);

    const [countRows] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM game_players WHERE game_id = ?',
      [game.id],
    );
    if (Number(countRows[0]?.n ?? 0) >= game.max_players) {
      throw conflict('GAME_FULL', `La partie est complète (${game.max_players} joueurs maximum).`);
    }
    // Une seule salle à la fois : rejoindre celle-ci fait quitter (ou annule) les autres.
    await leaveOtherLobbies(conn, player, game.id);
    await conn.execute('INSERT INTO game_players (game_id, player_id) VALUES (?, ?)', [game.id, player.id]);
    await addSystemMessage(conn, game.id, `${player.pseudo} a rejoint la salle`);
    return { code: game.code, alreadyJoined: false };
  });
}

export async function leaveMultiGame(pool: Pool, player: AuthPlayer, code: string) {
  return withTransaction(pool, async (conn) => {
    const game = await loadGameByCode(conn, code, true);
    if (!(await isParticipant(conn, game.id, player.id))) return { left: true };
    if (game.status !== 'lobby') {
      throw conflict('GAME_ALREADY_STARTED', 'Impossible de quitter une partie en cours : ton score est conservé.');
    }
    if (game.host_player_id === player.id) {
      // L'organisateur quitte la salle : la partie est annulée pour tout le monde.
      await conn.execute(`UPDATE games SET status = 'cancelled', finished_at = NOW(3) WHERE id = ?`, [game.id]);
    } else {
      await conn.execute('DELETE FROM game_players WHERE game_id = ? AND player_id = ?', [game.id, player.id]);
      await addSystemMessage(conn, game.id, `${player.pseudo} a quitté la salle`);
    }
    return { left: true };
  });
}

export async function startMultiGame(pool: Pool, player: AuthPlayer, code: string) {
  return withTransaction(pool, async (conn) => {
    const game = await loadGameByCode(conn, code, true);
    if (game.host_player_id !== player.id) {
      throw forbidden('NOT_HOST', 'Seul l’organisateur peut démarrer la partie.');
    }
    if (game.status !== 'lobby') throw conflict('GAME_ALREADY_STARTED', 'La partie a déjà été démarrée.');
    // started_at = heure MySQL : c'est LA référence de temps de toute la partie.
    await conn.execute(`UPDATE games SET status = 'in_progress', started_at = NOW(3) WHERE id = ?`, [game.id]);
    return { started: true };
  });
}

// -----------------------------------------------------------------------------
//  État (endpoint interrogé en polling par tous les joueurs)
// -----------------------------------------------------------------------------

export interface PlayerStanding {
  id: string;
  pseudo: string;
  avatar: string;
  isHost: boolean;
  score: number;
  correctCount: number;
  rank: number;
  answeredCurrent: boolean;
  lastPoints: number | null;
}

export interface ChatMessage {
  id: number;
  kind: 'chat' | 'system';
  /** null pour un message automatique */
  playerId: string | null;
  pseudo: string | null;
  avatar: string | null;
  text: string;
  createdAt: string;
}

export interface MultiGameState {
  code: string;
  name: string;
  isPublic: boolean;
  status: GameStatus;
  phase: ClockState['phase'];
  phaseRemainingMs: number;
  questionIndex: number;
  questionCount: number;
  questionDurationMs: number;
  revealDurationMs: number;
  category: string;
  categoryIcon: string;
  categorySlug: string | null;
  maxPlayers: number;
  hostPlayerId: string;
  isHost: boolean;
  players: PlayerStanding[];
  answeredCount: number;
  question: PublicQuestion | null;
  myAnswer: { choice: number | null; isCorrect?: boolean; points?: number } | null;
  reveal: { correctIndex: number; distribution: [number, number, number, number] } | null;
  /**
   * Chat de la salle d'attente (vide une fois la partie lancée). Avec
   * `afterMessageId`, seuls les messages plus récents sont renvoyés.
   */
  messages: ChatMessage[];
}

export async function getMultiGameState(
  pool: Pool,
  player: AuthPlayer,
  code: string,
  afterMessageId?: number,
): Promise<MultiGameState> {
  let game = await loadGameByCode(pool, code);
  if (!(await isParticipant(pool, game.id, player.id))) {
    throw forbidden('NOT_IN_GAME', 'Tu ne participes pas à cette partie. Rejoins-la avec son code.');
  }

  let messages: ChatMessage[] = [];
  if (game.status === 'lobby') {
    // Présence dans la salle (au plus une écriture toutes les 5 s par joueur).
    await pool.execute(
      `UPDATE game_players SET last_seen_at = NOW(3)
        WHERE game_id = ? AND player_id = ? AND last_seen_at < NOW(3) - INTERVAL 5 SECOND`,
      [game.id, player.id],
    );
    // L'organisateur est parti sans annuler : la partie est annulée pour tous.
    if (game.host_player_id !== player.id && (await cancelAbandonedLobbies(pool, game.id)) > 0) {
      game = await loadGameByCode(pool, code);
    } else {
      await pruneAbsentPlayers(pool, game.id, game.host_player_id);
      messages = await loadMessages(pool, game.id, afterMessageId);
    }
  }
  let clock = clockOf(game);

  // La partie est terminée selon l'horloge mais pas encore en base : on persiste.
  if (clock.phase === 'finished' && game.status === 'in_progress') {
    await finalizeElapsedGames(pool, game.id);
    game = await loadGameByCode(pool, code);
    clock = clockOf(game);
  }

  const current = clock.questionIndex;
  // Scores visibles = uniquement les questions déjà corrigées. Pendant une question,
  // afficher les points en direct révélerait qui a trouvé la bonne réponse.
  const visibleUpTo = clock.revealedCount;
  const lastRevealed = visibleUpTo - 1;

  const [playerRows] = await pool.execute<RowDataPacket[]>(
    `SELECT p.id, p.pseudo, p.avatar, gp.joined_at,
            COALESCE(SUM(CASE WHEN a.position < ? THEN a.points END), 0)            AS score,
            COALESCE(SUM(CASE WHEN a.position < ? AND a.is_correct THEN 1 END), 0) AS correct_count,
            COALESCE(MAX(a.position = ?), 0)                                        AS answered_current,
            MAX(CASE WHEN a.position = ? THEN a.points END)                         AS last_points
       FROM game_players gp
       JOIN players p ON p.id = gp.player_id
       LEFT JOIN answers a ON a.game_id = gp.game_id AND a.player_id = gp.player_id
      WHERE gp.game_id = ?
      GROUP BY p.id, p.pseudo, p.avatar, gp.joined_at
      ORDER BY score DESC, correct_count DESC, gp.joined_at ASC`,
    [visibleUpTo, visibleUpTo, current, lastRevealed, game.id],
  );

  let previousScore = -1;
  let previousRank = 0;
  const players: PlayerStanding[] = playerRows.map((r, i) => {
    const score = Number(r.score);
    const rank = score === previousScore ? previousRank : i + 1;
    previousScore = score;
    previousRank = rank;
    return {
      id: r.id,
      pseudo: r.pseudo,
      avatar: r.avatar,
      isHost: r.id === game.host_player_id,
      score,
      correctCount: Number(r.correct_count),
      rank,
      answeredCurrent: current >= 0 && Boolean(Number(r.answered_current)),
      lastPoints: lastRevealed >= 0 && r.last_points !== null ? Number(r.last_points) : null,
    };
  });

  let question: PublicQuestion | null = null;
  let myAnswer: MultiGameState['myAnswer'] = null;
  let reveal: MultiGameState['reveal'] = null;

  if (clock.phase === 'question' || clock.phase === 'reveal') {
    question = await loadPublicQuestion(pool, game.id, current);
    const [mine] = await pool.execute<RowDataPacket[]>(
      'SELECT selected_index, is_correct, points FROM answers WHERE game_id = ? AND player_id = ? AND position = ?',
      [game.id, player.id, current],
    );
    const m = mine[0];
    if (clock.phase === 'question') {
      // Pendant la question : on confirme seulement le choix, jamais s'il est correct.
      myAnswer = m ? { choice: m.selected_index === null ? null : Number(m.selected_index) } : null;
    } else {
      const [correctRows] = await pool.execute<RowDataPacket[]>(
        `SELECT q.correct_index FROM game_questions gq JOIN questions q ON q.id = gq.question_id
          WHERE gq.game_id = ? AND gq.position = ?`,
        [game.id, current],
      );
      const [distRows] = await pool.execute<RowDataPacket[]>(
        `SELECT selected_index, COUNT(*) AS n FROM answers
          WHERE game_id = ? AND position = ? AND selected_index IS NOT NULL
          GROUP BY selected_index`,
        [game.id, current],
      );
      const distribution: [number, number, number, number] = [0, 0, 0, 0];
      for (const d of distRows) distribution[Number(d.selected_index)] = Number(d.n);
      reveal = { correctIndex: Number(correctRows[0]?.correct_index ?? 0), distribution };
      myAnswer = m
        ? {
            choice: m.selected_index === null ? null : Number(m.selected_index),
            isCorrect: Boolean(m.is_correct),
            points: Number(m.points),
          }
        : null;
    }
  }

  return {
    code: game.code,
    name: game.name,
    isPublic: Boolean(Number(game.is_public)),
    status: game.status,
    phase: clock.phase,
    phaseRemainingMs: Math.round(clock.phaseRemainingMs),
    questionIndex: current,
    questionCount: game.question_count,
    questionDurationMs: game.question_duration_ms,
    revealDurationMs: game.reveal_duration_ms,
    category: game.category_name ?? 'Toutes catégories',
    categoryIcon: game.category_icon ?? '🎲',
    categorySlug: game.category_slug ?? null,
    maxPlayers: game.max_players,
    hostPlayerId: game.host_player_id,
    isHost: game.host_player_id === player.id,
    players,
    answeredCount: players.filter((p) => p.answeredCurrent).length,
    question,
    myAnswer,
    reveal,
    messages,
  };
}

// -----------------------------------------------------------------------------
//  Réponses
// -----------------------------------------------------------------------------

export async function submitMultiAnswer(
  pool: Pool,
  player: AuthPlayer,
  code: string,
  position: number,
  choice: number | null,
) {
  if (choice === null) throw badRequest('CHOICE_REQUIRED', 'Choisis une réponse.');

  return withTransaction(pool, async (conn) => {
    const game = await loadGameByCode(conn, code);
    // Verrou sur la ligne du participant : sérialise les envois simultanés d'un
    // même joueur (double clic, deux onglets, deux instances...).
    const [gpRows] = await conn.execute<RowDataPacket[]>(
      'SELECT player_id FROM game_players WHERE game_id = ? AND player_id = ? FOR UPDATE',
      [game.id, player.id],
    );
    if (gpRows.length === 0) throw forbidden('NOT_IN_GAME', 'Tu ne participes pas à cette partie.');

    const clock = clockOf(game);
    if (clock.phase !== 'question' || !clock.acceptingAnswers) {
      throw conflict('ANSWERS_CLOSED', 'Le temps de réponse est écoulé.');
    }
    if (clock.questionIndex !== position) {
      throw conflict('NOT_CURRENT_QUESTION', 'Cette question n’est pas la question en cours.');
    }

    const [qRows] = await conn.execute<RowDataPacket[]>(
      `SELECT q.id, q.correct_index FROM game_questions gq JOIN questions q ON q.id = gq.question_id
        WHERE gq.game_id = ? AND gq.position = ?`,
      [game.id, position],
    );
    const q = qRows[0];
    if (!q) throw notFound('QUESTION_NOT_FOUND', 'Question introuvable.');

    const isCorrect = Number(q.correct_index) === choice;
    const responseMs = Math.min(Math.round(clock.questionElapsedMs), game.question_duration_ms);
    const points = computePoints(isCorrect, responseMs, game.question_duration_ms);

    try {
      await conn.execute(
        `INSERT INTO answers (game_id, player_id, position, question_id, selected_index, is_correct, response_ms, points)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [game.id, player.id, position, q.id, choice, isCorrect, responseMs, points],
      );
    } catch (err) {
      if (isDuplicateKeyError(err, 'uq_answers_one_per_question')) {
        throw conflict('ALREADY_ANSWERED', 'Tu as déjà répondu à cette question.');
      }
      throw err;
    }
    await conn.execute(
      `UPDATE game_players
          SET score = score + ?, correct_count = correct_count + ?, answered_count = answered_count + 1
        WHERE game_id = ? AND player_id = ?`,
      [points, isCorrect ? 1 : 0, game.id, player.id],
    );
    // La correction n'est PAS renvoyée ici : elle sera visible à la fin du chrono.
    return { accepted: true, position, choice };
  });
}

// -----------------------------------------------------------------------------
//  Chat de la salle d'attente
// -----------------------------------------------------------------------------

async function addSystemMessage(db: Queryable, gameId: string, text: string): Promise<void> {
  await db.execute(`INSERT INTO game_messages (game_id, player_id, kind, body) VALUES (?, NULL, 'system', ?)`, [
    gameId,
    text.slice(0, 200),
  ]);
}

async function loadMessages(db: Queryable, gameId: string, afterMessageId?: number): Promise<ChatMessage[]> {
  // Premier chargement : les derniers messages ; ensuite : uniquement les nouveaux.
  const [rows] =
    afterMessageId === undefined
      ? await db.execute<RowDataPacket[]>(
          `SELECT * FROM (
             SELECT m.id, m.kind, m.player_id, p.pseudo, p.avatar, m.body, m.created_at
               FROM game_messages m LEFT JOIN players p ON p.id = m.player_id
              WHERE m.game_id = ?
              ORDER BY m.id DESC LIMIT ${CHAT_HISTORY_LIMIT}
           ) last ORDER BY id ASC`,
          [gameId],
        )
      : await db.execute<RowDataPacket[]>(
          `SELECT m.id, m.kind, m.player_id, p.pseudo, p.avatar, m.body, m.created_at
             FROM game_messages m LEFT JOIN players p ON p.id = m.player_id
            WHERE m.game_id = ? AND m.id > ?
            ORDER BY m.id ASC LIMIT ${CHAT_HISTORY_LIMIT * 2}`,
          [gameId, afterMessageId],
        );
  return rows.map((r) => ({
    id: Number(r.id),
    kind: r.kind,
    playerId: r.player_id ?? null,
    pseudo: r.pseudo ?? null,
    avatar: r.avatar ?? null,
    text: r.body,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

export async function postChatMessage(pool: Pool, player: AuthPlayer, code: string, text: string) {
  const game = await loadGameByCode(pool, code);
  if (!(await isParticipant(pool, game.id, player.id))) {
    throw forbidden('NOT_IN_GAME', 'Tu ne participes pas à cette partie.');
  }
  if (game.status !== 'lobby') throw conflict('CHAT_CLOSED', 'Le chat est fermé : la partie a commencé.');
  const [res] = await pool.execute<ResultSetHeader>(
    `INSERT INTO game_messages (game_id, player_id, kind, body) VALUES (?, ?, 'chat', ?)`,
    [game.id, player.id, text],
  );
  return { id: Number(res.insertId) };
}

// -----------------------------------------------------------------------------
//  Liste des parties en attente de joueurs
// -----------------------------------------------------------------------------

export interface OpenGame {
  code: string;
  name: string;
  category: string;
  categorySlug: string | null;
  host: { pseudo: string; avatar: string };
  playerCount: number;
  maxPlayers: number;
  questionCount: number;
  /** Le joueur qui consulte la liste est déjà dans cette salle */
  joined: boolean;
  createdAt: string;
}

/**
 * Salles publiques, pas encore lancées, pas expirées, dont l'organisateur est
 * toujours présent. Les plus récentes d'abord ; les salles complètes restent
 * visibles (affichées « complète »).
 */
export async function listOpenGames(pool: Pool, player: AuthPlayer): Promise<OpenGame[]> {
  await cancelAbandonedLobbies(pool);
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT g.code, COALESCE(g.name, CONCAT('Partie de ', hp.pseudo)) AS name, g.max_players, g.question_count,
            g.created_at, c.name AS category_name, c.slug AS category_slug,
            hp.pseudo AS host_pseudo, hp.avatar AS host_avatar,
            COUNT(gp.player_id) AS player_count,
            COALESCE(SUM(gp.player_id = ?), 0) AS joined
       FROM games g
       JOIN players hp ON hp.id = g.host_player_id
       JOIN game_players host_gp ON host_gp.game_id = g.id AND host_gp.player_id = g.host_player_id
       JOIN game_players gp ON gp.game_id = g.id
       LEFT JOIN categories c ON c.id = g.category_id
      WHERE g.mode = 'multi' AND g.status = 'lobby' AND g.is_public
        AND g.created_at >= NOW(3) - INTERVAL ${LOBBY_TTL_HOURS} HOUR
        AND host_gp.last_seen_at >= NOW(3) - INTERVAL ${LOBBY_PRESENCE_SECONDS} SECOND
      GROUP BY g.id, g.code, g.name, g.max_players, g.question_count, g.created_at,
               c.name, c.slug, hp.pseudo, hp.avatar
      ORDER BY g.created_at DESC
      LIMIT 50`,
    [player.id],
  );
  return rows.map((r) => ({
    code: r.code,
    name: r.name,
    category: r.category_name ?? 'Toutes catégories',
    categorySlug: r.category_slug ?? null,
    host: { pseudo: r.host_pseudo, avatar: r.host_avatar },
    playerCount: Number(r.player_count),
    maxPlayers: Number(r.max_players),
    questionCount: Number(r.question_count),
    joined: Number(r.joined) > 0,
    createdAt: new Date(r.created_at).toISOString(),
  }));
}

/**
 * Le joueur ferme l'onglet (« pagehide ») : il n'a plus que AWAY_GRACE_SECONDS pour
 * revenir. S'il recharge simplement la page, sa prochaine requête le rend présent.
 */
export async function markAway(pool: Pool, player: AuthPlayer, code: string) {
  const game = await loadGameByCode(pool, code);
  if (game.status === 'lobby') {
    await pool.execute(
      `UPDATE game_players
          SET last_seen_at = LEAST(last_seen_at, NOW(3) - INTERVAL ${LOBBY_PRESENCE_SECONDS - AWAY_GRACE_SECONDS} SECOND)
        WHERE game_id = ? AND player_id = ?`,
      [game.id, player.id],
    );
  }
  return { away: true };
}

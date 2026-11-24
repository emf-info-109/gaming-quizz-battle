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
import type { Pool, Queryable, RowDataPacket } from '../db/pool.js';
import { computeClock, type ClockState, type GameStatus } from '../domain/gameClock.js';
import { generateGameCode } from '../domain/gameCode.js';
import { computePoints } from '../domain/scoring.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { pickRandomQuestionIds, resolveCategory } from './categoryService.js';
import type { AuthPlayer } from './playerService.js';
import { loadPublicQuestion, type PublicQuestion } from './soloService.js';

/** Une salle d'attente abandonnée expire après ce délai. */
export const LOBBY_TTL_HOURS = 3;

interface MultiGameRow extends RowDataPacket {
  id: string;
  code: string;
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
    `SELECT g.id, g.code, g.host_player_id, g.status, g.question_count, g.question_duration_ms,
            g.reveal_duration_ms, g.countdown_ms, g.max_players,
            TIMESTAMPDIFF(MICROSECOND, g.started_at, NOW(3)) DIV 1000 AS elapsed_ms,
            (g.created_at < NOW(3) - INTERVAL ${LOBBY_TTL_HOURS} HOUR) AS lobby_expired,
            c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug
       FROM games g
       LEFT JOIN categories c ON c.id = g.category_id
      WHERE g.code = ? AND g.mode = 'multi'
      ${forUpdate ? 'FOR UPDATE' : ''}`,
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

// -----------------------------------------------------------------------------
//  Création / salle d'attente
// -----------------------------------------------------------------------------

export async function createMultiGame(pool: Pool, cfg: AppConfig['game'], host: AuthPlayer, categorySlug: string) {
  const category = await resolveCategory(pool, categorySlug);
  const questionIds = await pickRandomQuestionIds(pool, category?.id ?? null, cfg.questionsPerGame);
  if (questionIds.length === 0) throw badRequest('NO_QUESTIONS', 'Aucune question disponible pour cette catégorie.');

  // Collision de code (très rare) : la contrainte UNIQUE la détecte, on réessaie.
  for (let attempt = 1; attempt <= 5; attempt++) {
    const gameId = randomUUID();
    const code = generateGameCode();
    try {
      await withTransaction(pool, async (conn) => {
        await conn.execute(
          `INSERT INTO games (id, code, mode, host_player_id, category_id, status, question_count,
                              question_duration_ms, reveal_duration_ms, countdown_ms, max_players)
           VALUES (?, ?, 'multi', ?, ?, 'lobby', ?, ?, ?, ?, ?)`,
          [
            gameId,
            code,
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
      return { gameId, code };
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

    const [countRows] = await conn.execute<RowDataPacket[]>(
      'SELECT COUNT(*) AS n FROM game_players WHERE game_id = ?',
      [game.id],
    );
    if (Number(countRows[0]?.n ?? 0) >= game.max_players) {
      throw conflict('GAME_FULL', `La partie est complète (${game.max_players} joueurs maximum).`);
    }
    await conn.execute('INSERT INTO game_players (game_id, player_id) VALUES (?, ?)', [game.id, player.id]);
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

export interface MultiGameState {
  code: string;
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
}

export async function getMultiGameState(pool: Pool, player: AuthPlayer, code: string): Promise<MultiGameState> {
  let game = await loadGameByCode(pool, code);
  if (!(await isParticipant(pool, game.id, player.id))) {
    throw forbidden('NOT_IN_GAME', 'Tu ne participes pas à cette partie. Rejoins-la avec son code.');
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

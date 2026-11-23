/**
 * Mode solo : 10 questions, 15 s par question, au rythme du joueur.
 *
 * L'heure d'affichage de chaque question est enregistrée en base
 * (games.current_question_started_at, horloge MySQL). Le temps de réponse est
 * donc mesuré par le serveur : le navigateur ne peut ni tricher sur le temps,
 * ni connaître la bonne réponse avant d'avoir répondu (ou laissé expirer le chrono).
 */
import { randomUUID } from 'node:crypto';
import type { AppConfig } from '../config.js';
import { withTransaction, isDuplicateKeyError } from '../db/pool.js';
import type { Pool, PoolConnection, Queryable, RowDataPacket } from '../db/pool.js';
import { ANSWER_GRACE_MS } from '../domain/gameClock.js';
import { computePoints } from '../domain/scoring.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import type { AuthPlayer } from './playerService.js';
import { pickRandomQuestionIds, resolveCategory } from './categoryService.js';

export interface PublicQuestion {
  position: number;
  prompt: string;
  answers: [string, string, string, string];
  difficulty: 'easy' | 'medium' | 'hard';
  category: { slug: string; name: string; icon: string; color: string };
}

interface SoloGameRow extends RowDataPacket {
  id: string;
  host_player_id: string;
  status: 'in_progress' | 'finished' | 'cancelled' | 'lobby';
  mode: 'solo' | 'multi';
  question_count: number;
  question_duration_ms: number;
  current_position: number | null;
  elapsed_ms: number | null;
  category_name: string | null;
}

/** Charge (et verrouille si `forUpdate`) une partie solo appartenant au joueur. */
async function loadSoloGame(db: Queryable, gameId: string, player: AuthPlayer, forUpdate: boolean) {
  const [rows] = await db.execute<SoloGameRow[]>(
    `SELECT g.id, g.host_player_id, g.status, g.mode, g.question_count, g.question_duration_ms,
            g.current_position,
            TIMESTAMPDIFF(MICROSECOND, g.current_question_started_at, NOW(3)) DIV 1000 AS elapsed_ms,
            c.name AS category_name
       FROM games g
       LEFT JOIN categories c ON c.id = g.category_id
      WHERE g.id = ? AND g.mode = 'solo'
      ${forUpdate ? 'FOR UPDATE' : ''}`,
    [gameId],
  );
  const game = rows[0];
  // Une partie d'un autre joueur est traitée comme inexistante (pas de fuite d'information).
  if (!game || game.host_player_id !== player.id) throw notFound('GAME_NOT_FOUND', 'Partie introuvable.');
  return { ...game, elapsed_ms: game.elapsed_ms === null ? null : Number(game.elapsed_ms) };
}

export async function loadPublicQuestion(db: Queryable, gameId: string, position: number): Promise<PublicQuestion> {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT gq.position, q.prompt, q.answer_1, q.answer_2, q.answer_3, q.answer_4, q.difficulty,
            c.slug, c.name, c.icon, c.color
       FROM game_questions gq
       JOIN questions q ON q.id = gq.question_id
       JOIN categories c ON c.id = q.category_id
      WHERE gq.game_id = ? AND gq.position = ?`,
    [gameId, position],
  );
  const r = rows[0];
  if (!r) throw notFound('QUESTION_NOT_FOUND', 'Question introuvable.');
  // ⚠️ correct_index n'est volontairement PAS sélectionné ici.
  return {
    position: r.position,
    prompt: r.prompt,
    answers: [r.answer_1, r.answer_2, r.answer_3, r.answer_4],
    difficulty: r.difficulty,
    category: { slug: r.slug, name: r.name, icon: r.icon, color: r.color },
  };
}

async function loadCorrectIndex(db: Queryable, gameId: string, position: number) {
  const [rows] = await db.execute<RowDataPacket[]>(
    `SELECT q.id, q.correct_index FROM game_questions gq JOIN questions q ON q.id = gq.question_id
      WHERE gq.game_id = ? AND gq.position = ?`,
    [gameId, position],
  );
  const r = rows[0];
  if (!r) throw notFound('QUESTION_NOT_FOUND', 'Question introuvable.');
  return { questionId: Number(r.id), correctIndex: Number(r.correct_index) };
}

async function hasAnswered(db: Queryable, gameId: string, playerId: string, position: number): Promise<boolean> {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT 1 FROM answers WHERE game_id = ? AND player_id = ? AND position = ?',
    [gameId, playerId, position],
  );
  return rows.length > 0;
}

/**
 * Enregistre une réponse et met à jour le score dans la MÊME transaction.
 * La contrainte UNIQUE (game_id, player_id, position) rejette tout doublon.
 */
async function recordAnswer(
  conn: PoolConnection,
  args: {
    gameId: string;
    playerId: string;
    position: number;
    questionId: number;
    selectedIndex: number | null;
    isCorrect: boolean;
    responseMs: number;
    points: number;
  },
) {
  try {
    await conn.execute(
      `INSERT INTO answers (game_id, player_id, position, question_id, selected_index, is_correct, response_ms, points)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        args.gameId,
        args.playerId,
        args.position,
        args.questionId,
        args.selectedIndex,
        args.isCorrect,
        args.responseMs,
        args.points,
      ],
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
    [args.points, args.isCorrect ? 1 : 0, args.gameId, args.playerId],
  );
}

export async function createSoloGame(pool: Pool, cfg: AppConfig['game'], player: AuthPlayer, categorySlug: string) {
  const category = await resolveCategory(pool, categorySlug);
  const questionIds = await pickRandomQuestionIds(pool, category?.id ?? null, cfg.questionsPerGame);
  if (questionIds.length === 0) throw badRequest('NO_QUESTIONS', 'Aucune question disponible pour cette catégorie.');

  const gameId = randomUUID();
  await withTransaction(pool, async (conn) => {
    await conn.execute(
      `INSERT INTO games (id, code, mode, host_player_id, category_id, status, question_count,
                          question_duration_ms, reveal_duration_ms, countdown_ms, max_players, started_at)
       VALUES (?, NULL, 'solo', ?, ?, 'in_progress', ?, ?, 0, 0, 1, NOW(3))`,
      [gameId, player.id, category?.id ?? null, questionIds.length, cfg.questionDurationMs],
    );
    await conn.execute('INSERT INTO game_players (game_id, player_id) VALUES (?, ?)', [gameId, player.id]);
    const placeholders = questionIds.map(() => '(?, ?, ?)').join(', ');
    await conn.execute(
      `INSERT INTO game_questions (game_id, position, question_id) VALUES ${placeholders}`,
      questionIds.flatMap((qid, i) => [gameId, i, qid]),
    );
  });
  return {
    gameId,
    questionCount: questionIds.length,
    questionDurationMs: cfg.questionDurationMs,
    category: category?.name ?? 'Toutes catégories',
  };
}

async function getScore(db: Queryable, gameId: string, playerId: string) {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT score, correct_count, answered_count FROM game_players WHERE game_id = ? AND player_id = ?',
    [gameId, playerId],
  );
  const r = rows[0];
  return {
    score: Number(r?.score ?? 0),
    correctCount: Number(r?.correct_count ?? 0),
    answeredCount: Number(r?.answered_count ?? 0),
  };
}

/** État courant (permet de reprendre une partie après un rafraîchissement de page). */
export async function getSoloState(pool: Pool, player: AuthPlayer, gameId: string) {
  const game = await loadSoloGame(pool, gameId, player, false);
  const score = await getScore(pool, gameId, player.id);
  let current: { question: PublicQuestion; remainingMs: number } | null = null;

  if (game.status === 'in_progress' && game.current_position !== null && game.elapsed_ms !== null) {
    const answered = await hasAnswered(pool, gameId, player.id, game.current_position);
    if (!answered && game.elapsed_ms < game.question_duration_ms) {
      current = {
        question: await loadPublicQuestion(pool, gameId, game.current_position),
        remainingMs: game.question_duration_ms - game.elapsed_ms,
      };
    }
  }
  return {
    gameId,
    status: game.status,
    category: game.category_name ?? 'Toutes catégories',
    questionCount: game.question_count,
    questionDurationMs: game.question_duration_ms,
    currentPosition: game.current_position,
    ...score,
    current,
  };
}

/**
 * Affiche la question suivante. Si la question en cours n'a pas reçu de réponse
 * et que son temps est écoulé, elle est enregistrée comme "sans réponse".
 * Appel idempotent : tant que la question courante est ouverte, elle est renvoyée.
 */
export async function nextSoloQuestion(pool: Pool, player: AuthPlayer, gameId: string) {
  return withTransaction(pool, async (conn) => {
    const game = await loadSoloGame(conn, gameId, player, true);
    if (game.status !== 'in_progress') throw conflict('GAME_FINISHED', 'Cette partie est terminée.');

    const pos = game.current_position;
    if (pos !== null && game.elapsed_ms !== null) {
      const answered = await hasAnswered(conn, gameId, player.id, pos);
      if (!answered) {
        if (game.elapsed_ms < game.question_duration_ms + ANSWER_GRACE_MS) {
          // Question encore ouverte : on la renvoie (rafraîchissement, double clic...)
          return {
            finished: false as const,
            question: await loadPublicQuestion(conn, gameId, pos),
            durationMs: game.question_duration_ms,
            remainingMs: Math.max(0, game.question_duration_ms - game.elapsed_ms),
            questionCount: game.question_count,
          };
        }
        const { questionId } = await loadCorrectIndex(conn, gameId, pos);
        await recordAnswer(conn, {
          gameId,
          playerId: player.id,
          position: pos,
          questionId,
          selectedIndex: null,
          isCorrect: false,
          responseMs: game.question_duration_ms,
          points: 0,
        });
      }
    }

    const nextPos = pos === null ? 0 : pos + 1;
    if (nextPos >= game.question_count) {
      // Dernière question expirée sans réponse : la partie se termine ici (commit).
      await conn.execute(`UPDATE games SET status = 'finished', finished_at = NOW(3) WHERE id = ?`, [gameId]);
      return { finished: true as const };
    }
    await conn.execute(
      'UPDATE games SET current_position = ?, current_question_started_at = NOW(3) WHERE id = ?',
      [nextPos, gameId],
    );
    return {
      finished: false as const,
      question: await loadPublicQuestion(conn, gameId, nextPos),
      durationMs: game.question_duration_ms,
      remainingMs: game.question_duration_ms,
      questionCount: game.question_count,
    };
  });
}

export async function answerSoloQuestion(
  pool: Pool,
  player: AuthPlayer,
  gameId: string,
  position: number,
  choice: number | null,
) {
  return withTransaction(pool, async (conn) => {
    const game = await loadSoloGame(conn, gameId, player, true);
    if (game.status !== 'in_progress') throw conflict('GAME_FINISHED', 'Cette partie est terminée.');
    if (game.current_position !== position || game.elapsed_ms === null) {
      throw conflict('NOT_CURRENT_QUESTION', 'Cette question n’est pas la question en cours.');
    }

    const { questionId, correctIndex } = await loadCorrectIndex(conn, gameId, position);
    const responseMs = Math.min(game.elapsed_ms, game.question_duration_ms);
    // Réponse arrivée après le chrono (+ marge réseau) : comptée comme "temps écoulé".
    const timedOut = choice === null || game.elapsed_ms > game.question_duration_ms + ANSWER_GRACE_MS;
    const selectedIndex = timedOut ? null : choice;
    const isCorrect = selectedIndex !== null && selectedIndex === correctIndex;
    const points = computePoints(isCorrect, responseMs, game.question_duration_ms);

    await recordAnswer(conn, {
      gameId,
      playerId: player.id,
      position,
      questionId,
      selectedIndex,
      isCorrect,
      responseMs,
      points,
    });

    const isLastQuestion = position >= game.question_count - 1;
    if (isLastQuestion) {
      await conn.execute(`UPDATE games SET status = 'finished', finished_at = NOW(3) WHERE id = ?`, [gameId]);
    }
    const score = await getScore(conn, gameId, player.id);
    return {
      position,
      selectedIndex,
      correctIndex,
      isCorrect,
      timedOut,
      points,
      responseMs,
      totalScore: score.score,
      correctCount: score.correctCount,
      isLastQuestion,
    };
  });
}

/** Récapitulatif final avec les bonnes réponses (uniquement une fois la partie terminée). */
export async function getSoloResults(pool: Pool, player: AuthPlayer, gameId: string) {
  const game = await loadSoloGame(pool, gameId, player, false);
  if (game.status !== 'finished') {
    throw conflict('GAME_NOT_FINISHED', 'Les résultats seront disponibles à la fin de la partie.');
  }
  const [rows] = await pool.execute<RowDataPacket[]>(
    `SELECT gq.position, q.prompt, q.answer_1, q.answer_2, q.answer_3, q.answer_4, q.correct_index,
            q.difficulty, c.name AS category,
            a.selected_index, a.is_correct, a.points, a.response_ms
       FROM game_questions gq
       JOIN questions q ON q.id = gq.question_id
       JOIN categories c ON c.id = q.category_id
       LEFT JOIN answers a ON a.game_id = gq.game_id AND a.position = gq.position AND a.player_id = ?
      WHERE gq.game_id = ?
      ORDER BY gq.position`,
    [player.id, gameId],
  );
  const score = await getScore(pool, gameId, player.id);
  return {
    gameId,
    category: game.category_name ?? 'Toutes catégories',
    questionCount: game.question_count,
    totalScore: score.score,
    correctCount: score.correctCount,
    questions: rows.map((r) => ({
      position: r.position,
      prompt: r.prompt,
      category: r.category,
      difficulty: r.difficulty,
      answers: [r.answer_1, r.answer_2, r.answer_3, r.answer_4],
      correctIndex: Number(r.correct_index),
      selectedIndex: r.selected_index === null ? null : Number(r.selected_index),
      isCorrect: Boolean(r.is_correct),
      points: Number(r.points ?? 0),
      responseMs: r.response_ms === null ? null : Number(r.response_ms),
    })),
  };
}

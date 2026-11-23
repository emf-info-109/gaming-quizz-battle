/**
 * Classements (global et par catégorie), calculés à partir des parties terminées.
 *
 * Une question sans réponse (temps écoulé) compte comme une erreur dans le taux
 * de réussite : on part donc des questions posées (game_questions), et non des
 * seules réponses enregistrées.
 */
import type { Queryable, RowDataPacket } from '../db/pool.js';
import { resolveCategory } from './categoryService.js';
import { finalizeElapsedGames } from './multiplayerService.js';

export interface LeaderboardEntry {
  rank: number;
  playerId: string;
  pseudo: string;
  avatar: string;
  gamesPlayed: number;
  correctAnswers: number;
  questionsSeen: number;
  totalScore: number;
  successRate: number;
}

export async function getLeaderboard(db: Queryable, categorySlug: string, limit: number) {
  await finalizeElapsedGames(db);
  const category = await resolveCategory(db, categorySlug);
  const safeLimit = Math.max(1, Math.min(100, Math.trunc(limit)));

  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT p.id, p.pseudo, p.avatar,
            COUNT(DISTINCT gp.game_id)          AS games_played,
            COUNT(*)                            AS questions_seen,
            COALESCE(SUM(a.is_correct), 0)      AS correct_answers,
            COALESCE(SUM(a.points), 0)          AS total_score
       FROM game_players gp
       JOIN games g           ON g.id = gp.game_id AND g.status = 'finished'
       JOIN players p         ON p.id = gp.player_id
       JOIN game_questions gq ON gq.game_id = gp.game_id
       JOIN questions q       ON q.id = gq.question_id
       LEFT JOIN answers a    ON a.game_id = gp.game_id AND a.player_id = gp.player_id AND a.position = gq.position
      ${category ? 'WHERE q.category_id = ?' : ''}
      GROUP BY p.id, p.pseudo, p.avatar
      ORDER BY total_score DESC, correct_answers DESC, p.pseudo ASC
      LIMIT ${safeLimit}`,
    category ? [category.id] : [],
  );

  const entries: LeaderboardEntry[] = rows.map((r, i) => {
    const seen = Number(r.questions_seen);
    const correct = Number(r.correct_answers);
    return {
      rank: i + 1,
      playerId: r.id,
      pseudo: r.pseudo,
      avatar: r.avatar,
      gamesPlayed: Number(r.games_played),
      correctAnswers: correct,
      questionsSeen: seen,
      totalScore: Number(r.total_score),
      successRate: seen > 0 ? Math.round((correct / seen) * 1000) / 10 : 0,
    };
  });
  return { category: category?.name ?? 'Classement global', entries };
}

import type { Queryable, RowDataPacket } from '../db/pool.js';
import { ONLINE_WINDOW_SECONDS } from './playerService.js';

export interface GlobalStats {
  onlinePlayers: number;
  totalPlayers: number;
  finishedGames: number;
  activeMultiGames: number;
  questionCount: number;
}

export async function getGlobalStats(db: Queryable): Promise<GlobalStats> {
  const [rows] = await db.query<RowDataPacket[]>(
    `SELECT
       (SELECT COUNT(*) FROM players WHERE last_seen_at >= NOW(3) - INTERVAL ${ONLINE_WINDOW_SECONDS} SECOND) AS online_players,
       (SELECT COUNT(*) FROM players) AS total_players,
       (SELECT COUNT(*) FROM games WHERE status = 'finished') AS finished_games,
       (SELECT COUNT(*) FROM games WHERE mode = 'multi' AND status IN ('lobby', 'in_progress')
                                     AND created_at >= NOW(3) - INTERVAL 3 HOUR) AS active_multi_games,
       (SELECT COUNT(*) FROM questions WHERE is_active = TRUE) AS question_count`,
  );
  const r = rows[0]!;
  return {
    onlinePlayers: Number(r.online_players),
    totalPlayers: Number(r.total_players),
    finishedGames: Number(r.finished_games),
    activeMultiGames: Number(r.active_multi_games),
    questionCount: Number(r.question_count),
  };
}

/**
 * Joueurs anonymes : pseudo + avatar, identifiés par un UUID et un jeton secret.
 */
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool, Queryable, RowDataPacket } from '../db/pool.js';

export interface AuthPlayer {
  id: string;
  pseudo: string;
  avatar: string;
}

/** 32 octets aléatoires encodés en base64url = 43 caractères. */
const TOKEN_REGEX = /^[A-Za-z0-9_-]{43}$/;

export function isWellFormedToken(token: string): boolean {
  return TOKEN_REGEX.test(token);
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

/** Délai d'inactivité après lequel un joueur n'est plus compté comme "connecté". */
export const ONLINE_WINDOW_SECONDS = 60;

export async function createPlayer(
  pool: Pool,
  pseudo: string,
  avatar: string,
): Promise<{ player: AuthPlayer; token: string }> {
  const id = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await pool.execute('INSERT INTO players (id, pseudo, avatar, token_hash) VALUES (?, ?, ?, ?)', [
    id,
    pseudo,
    avatar,
    hashToken(token),
  ]);
  return { player: { id, pseudo, avatar }, token };
}

export async function findPlayerByToken(db: Queryable, token: string): Promise<AuthPlayer | null> {
  const [rows] = await db.execute<RowDataPacket[]>(
    'SELECT id, pseudo, avatar FROM players WHERE token_hash = ? LIMIT 1',
    [hashToken(token)],
  );
  const row = rows[0];
  return row ? { id: row.id, pseudo: row.pseudo, avatar: row.avatar } : null;
}

/**
 * Met à jour la date de dernière activité, au plus une fois toutes les 15 s
 * par joueur pour éviter une écriture à chaque requête de polling.
 */
export async function touchPlayer(db: Queryable, playerId: string): Promise<void> {
  await db.execute(
    'UPDATE players SET last_seen_at = NOW(3) WHERE id = ? AND last_seen_at < NOW(3) - INTERVAL 15 SECOND',
    [playerId],
  );
}

export async function updatePlayer(
  db: Queryable,
  playerId: string,
  changes: { pseudo?: string; avatar?: string },
): Promise<AuthPlayer> {
  const sets: string[] = [];
  const params: string[] = [];
  if (changes.pseudo !== undefined) {
    sets.push('pseudo = ?');
    params.push(changes.pseudo);
  }
  if (changes.avatar !== undefined) {
    sets.push('avatar = ?');
    params.push(changes.avatar);
  }
  if (sets.length > 0) {
    await db.execute(`UPDATE players SET ${sets.join(', ')} WHERE id = ?`, [...params, playerId]);
  }
  const [rows] = await db.execute<RowDataPacket[]>('SELECT id, pseudo, avatar FROM players WHERE id = ?', [playerId]);
  const row = rows[0]!;
  return { id: row.id, pseudo: row.pseudo, avatar: row.avatar };
}

export interface PlayerStats {
  gamesPlayed: number;
  soloGames: number;
  multiGames: number;
  totalScore: number;
  correctAnswers: number;
  questionsSeen: number;
  successRate: number;
  bestScore: number;
  recentGames: Array<{
    gameId: string;
    mode: 'solo' | 'multi';
    category: string | null;
    score: number;
    correctCount: number;
    questionCount: number;
    finishedAt: string;
  }>;
}

export async function getPlayerStats(db: Queryable, playerId: string): Promise<PlayerStats> {
  const [aggRows] = await db.execute<RowDataPacket[]>(
    `SELECT COUNT(*)                                  AS games_played,
            COALESCE(SUM(g.mode = 'solo'), 0)         AS solo_games,
            COALESCE(SUM(g.mode = 'multi'), 0)        AS multi_games,
            COALESCE(SUM(gp.score), 0)                AS total_score,
            COALESCE(SUM(gp.correct_count), 0)        AS correct_answers,
            COALESCE(SUM(g.question_count), 0)        AS questions_seen,
            COALESCE(MAX(gp.score), 0)                AS best_score
       FROM game_players gp
       JOIN games g ON g.id = gp.game_id AND g.status = 'finished'
      WHERE gp.player_id = ?`,
    [playerId],
  );
  const a = aggRows[0]!;
  const [recent] = await db.execute<RowDataPacket[]>(
    `SELECT g.id, g.mode, c.name AS category, gp.score, gp.correct_count, g.question_count, g.finished_at
       FROM game_players gp
       JOIN games g ON g.id = gp.game_id AND g.status = 'finished'
       LEFT JOIN categories c ON c.id = g.category_id
      WHERE gp.player_id = ?
      ORDER BY g.finished_at DESC
      LIMIT 10`,
    [playerId],
  );
  const questionsSeen = Number(a.questions_seen);
  const correct = Number(a.correct_answers);
  return {
    gamesPlayed: Number(a.games_played),
    soloGames: Number(a.solo_games),
    multiGames: Number(a.multi_games),
    totalScore: Number(a.total_score),
    correctAnswers: correct,
    questionsSeen,
    successRate: questionsSeen > 0 ? Math.round((correct / questionsSeen) * 1000) / 10 : 0,
    bestScore: Number(a.best_score),
    recentGames: recent.map((r) => ({
      gameId: r.id,
      mode: r.mode,
      category: r.category ?? null,
      score: Number(r.score),
      correctCount: Number(r.correct_count),
      questionCount: Number(r.question_count),
      finishedAt: new Date(r.finished_at).toISOString(),
    })),
  };
}

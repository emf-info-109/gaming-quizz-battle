import { Router } from 'express';
import { leaderboardQuerySchema } from '../domain/validation.js';
import type { AppDeps } from '../http/deps.js';
import { listCategories } from '../services/categoryService.js';
import { getLeaderboard } from '../services/leaderboardService.js';
import { getGlobalStats } from '../services/statsService.js';

export function catalogRouter({ pool }: AppDeps): Router {
  const router = Router();

  router.get('/categories', async (_req, res) => {
    res.json({ categories: await listCategories(pool) });
  });

  router.get('/leaderboard', async (req, res) => {
    const q = leaderboardQuerySchema.parse(req.query);
    res.json(await getLeaderboard(pool, q.category, q.limit));
  });

  router.get('/stats', async (_req, res) => {
    res.json(await getGlobalStats(pool));
  });

  return router;
}

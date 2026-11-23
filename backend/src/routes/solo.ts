import { Router } from 'express';
import { answerSchema, createGameSchema, uuidSchema } from '../domain/validation.js';
import type { AppDeps } from '../http/deps.js';
import { requirePlayer } from '../middleware/auth.js';
import {
  answerSoloQuestion,
  createSoloGame,
  getSoloResults,
  getSoloState,
  nextSoloQuestion,
} from '../services/soloService.js';

export function soloRouter({ pool, config, limiters }: AppDeps): Router {
  const router = Router();
  router.use(requirePlayer(pool));

  router.post('/games', limiters.gameActions, async (req, res) => {
    const { category } = createGameSchema.parse(req.body);
    res.status(201).json(await createSoloGame(pool, config.game, req.player!, category));
  });

  router.get('/games/:id', async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    res.json(await getSoloState(pool, req.player!, id));
  });

  router.post('/games/:id/next', async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    res.json(await nextSoloQuestion(pool, req.player!, id));
  });

  router.post('/games/:id/answers', async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    const { position, choice } = answerSchema.parse(req.body);
    res.status(201).json(await answerSoloQuestion(pool, req.player!, id, position, choice));
  });

  router.get('/games/:id/results', async (req, res) => {
    const id = uuidSchema.parse(req.params.id);
    res.json(await getSoloResults(pool, req.player!, id));
  });

  return router;
}

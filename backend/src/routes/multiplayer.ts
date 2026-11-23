import { Router } from 'express';
import { answerSchema, createGameSchema, gameCodeSchema, joinGameSchema } from '../domain/validation.js';
import type { AppDeps } from '../http/deps.js';
import { requirePlayer } from '../middleware/auth.js';
import {
  createMultiGame,
  getMultiGameState,
  joinMultiGame,
  leaveMultiGame,
  startMultiGame,
  submitMultiAnswer,
} from '../services/multiplayerService.js';

export function multiplayerRouter({ pool, config, limiters }: AppDeps): Router {
  const router = Router();
  router.use(requirePlayer(pool));

  router.post('/', limiters.gameActions, async (req, res) => {
    const { category } = createGameSchema.parse(req.body);
    res.status(201).json(await createMultiGame(pool, config.game, req.player!, category));
  });

  router.post('/join', limiters.gameActions, async (req, res) => {
    const { code } = joinGameSchema.parse(req.body);
    res.json(await joinMultiGame(pool, req.player!, code));
  });

  /** Endpoint de polling (toutes les 1 à 2 secondes) */
  router.get('/:code', async (req, res) => {
    const code = gameCodeSchema.parse(req.params.code);
    res.json(await getMultiGameState(pool, req.player!, code));
  });

  router.post('/:code/start', async (req, res) => {
    const code = gameCodeSchema.parse(req.params.code);
    res.json(await startMultiGame(pool, req.player!, code));
  });

  router.post('/:code/leave', async (req, res) => {
    const code = gameCodeSchema.parse(req.params.code);
    res.json(await leaveMultiGame(pool, req.player!, code));
  });

  router.post('/:code/answers', async (req, res) => {
    const code = gameCodeSchema.parse(req.params.code);
    const { position, choice } = answerSchema.parse(req.body);
    res.status(201).json(await submitMultiAnswer(pool, req.player!, code, position, choice));
  });

  return router;
}

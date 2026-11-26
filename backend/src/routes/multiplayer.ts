import { Router } from 'express';
import {
  answerSchema,
  chatMessageSchema,
  createGameSchema,
  gameCodeSchema,
  gameStateQuerySchema,
  joinGameSchema,
} from '../domain/validation.js';
import type { AppDeps } from '../http/deps.js';
import { requirePlayer } from '../middleware/auth.js';
import {
  createMultiGame,
  getMultiGameState,
  joinMultiGame,
  leaveMultiGame,
  listOpenGames,
  postChatMessage,
  startMultiGame,
  submitMultiAnswer,
} from '../services/multiplayerService.js';

export function multiplayerRouter({ pool, config, limiters }: AppDeps): Router {
  const router = Router();
  router.use(requirePlayer(pool));

  /** Salles publiques en attente de joueurs (rafraîchie toutes les quelques secondes) */
  router.get('/', async (req, res) => {
    res.json({ games: await listOpenGames(pool, req.player!) });
  });

  router.post('/', limiters.gameActions, async (req, res) => {
    const { category, name, isPublic } = createGameSchema.parse(req.body);
    res.status(201).json(await createMultiGame(pool, config.game, req.player!, category, { name, isPublic }));
  });

  router.post('/join', limiters.gameActions, async (req, res) => {
    const { code } = joinGameSchema.parse(req.body);
    res.json(await joinMultiGame(pool, req.player!, code));
  });

  /** Endpoint de polling (toutes les 1 à 2 secondes) */
  router.get('/:code', async (req, res) => {
    const code = gameCodeSchema.parse(req.params.code);
    const { afterMessageId } = gameStateQuerySchema.parse(req.query);
    res.json(await getMultiGameState(pool, req.player!, code, afterMessageId));
  });

  router.post('/:code/messages', limiters.chat, async (req, res) => {
    const code = gameCodeSchema.parse(req.params.code);
    const { text } = chatMessageSchema.parse(req.body);
    res.status(201).json(await postChatMessage(pool, req.player!, code, text));
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

import { Router } from 'express';
import { AVATARS } from '../domain/avatars.js';
import { createPlayerSchema, updatePlayerSchema } from '../domain/validation.js';
import type { AppDeps } from '../http/deps.js';
import { requirePlayer } from '../middleware/auth.js';
import { createPlayer, getPlayerStats, updatePlayer } from '../services/playerService.js';
import { finalizeElapsedGames } from '../services/multiplayerService.js';

export function playersRouter({ pool, limiters }: AppDeps): Router {
  const router = Router();
  const auth = requirePlayer(pool);

  router.get('/avatars', (_req, res) => {
    res.json({ avatars: AVATARS });
  });

  /** Création d'un joueur anonyme : renvoie l'identifiant et le jeton secret (une seule fois). */
  router.post('/players', limiters.playerCreate, async (req, res) => {
    const input = createPlayerSchema.parse(req.body);
    const { player, token } = await createPlayer(pool, input.pseudo, input.avatar);
    res.status(201).json({ player, token });
  });

  router.get('/players/me', auth, (req, res) => {
    res.json({ player: req.player });
  });

  router.patch('/players/me', auth, async (req, res) => {
    const input = updatePlayerSchema.parse(req.body);
    const player = await updatePlayer(pool, req.player!.id, input);
    res.json({ player });
  });

  router.get('/players/me/stats', auth, async (req, res) => {
    await finalizeElapsedGames(pool);
    res.json({ stats: await getPlayerStats(pool, req.player!.id) });
  });

  return router;
}

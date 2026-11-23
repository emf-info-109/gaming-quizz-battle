import type { Request, RequestHandler } from 'express';
import { ipKeyGenerator, rateLimit } from 'express-rate-limit';
import type { AppConfig } from '../config.js';

/**
 * Limitation de débit.
 *
 * ⚠️ Les compteurs sont conservés dans la mémoire de CHAQUE instance : avec
 * deux serveurs web derrière HAProxy, la limite effective globale est donc
 * environ multipliée par deux. C'est un compromis volontaire (pas d'état
 * utilisateur, uniquement de la protection) ; une version plus stricte pourrait
 * partager les compteurs (Redis, MySQL) ou limiter directement dans HAProxy.
 */
function limiter(windowMs: number, limit: number, keyBy: 'ip' | 'player', message: string): RequestHandler {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    keyGenerator: (req: Request) =>
      keyBy === 'player' && req.player ? `player:${req.player.id}` : ipKeyGenerator(req.ip ?? 'unknown'),
    handler: (_req, res) => {
      res.status(429).json({ error: { code: 'RATE_LIMITED', message } });
    },
  });
}

export function createRateLimiters(cfg: AppConfig['rateLimits']) {
  return {
    api: limiter(60_000, cfg.apiPerMinute, 'ip', 'Trop de requêtes. Patiente quelques secondes.'),
    playerCreate: limiter(
      15 * 60_000,
      cfg.playerCreatePer15Min,
      'ip',
      'Trop de profils créés depuis cette adresse. Réessaie plus tard.',
    ),
    gameActions: limiter(60_000, cfg.gameActionsPerMinute, 'player', 'Trop d’actions sur les parties. Ralentis un peu !'),
    diag: limiter(60_000, cfg.diagPerMinute, 'ip', 'Limite du générateur de diagnostic atteinte. Attends une minute.'),
  };
}

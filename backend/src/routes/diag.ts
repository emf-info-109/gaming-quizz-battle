/**
 * Endpoint léger utilisé par le générateur de requêtes du tableau de bord Cloud.
 * Protégé par une limite de débit dédiée.
 */
import { Router } from 'express';
import type { AppDeps } from '../http/deps.js';

export function diagRouter({ config, limiters }: AppDeps): Router {
  const router = Router();
  router.get('/ping', limiters.diag, (req, res) => {
    res.json({ instance: config.instanceName, requestId: req.requestId, serverTime: new Date().toISOString() });
  });
  return router;
}

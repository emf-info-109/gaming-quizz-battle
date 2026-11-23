/**
 * Endpoints de supervision utilisés par HAProxy (et par les humains).
 *
 *  GET /health : "liveness"  – le processus Node répond-il ? (n'interroge PAS MySQL)
 *  GET /ready  : "readiness" – l'instance peut-elle servir du trafic ? (MySQL OK, pas en arrêt)
 *
 * Exemple HAProxy :  option httpchk GET /ready
 *                    http-check expect status 200
 */
import os from 'node:os';
import { Router, type RequestHandler } from 'express';
import { pingDatabase } from '../db/pool.js';
import type { AppDeps } from '../http/deps.js';

export const APP_VERSION = '1.0.0';

export function healthRouter({ config, pool, readiness, startedAt }: AppDeps): Router {
  const router = Router();
  const uptime = () => Math.round((Date.now() - startedAt) / 1000);

  const health: RequestHandler = (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    res.json({ status: 'UP', instance: config.instanceName, uptime: uptime() });
  };

  const ready: RequestHandler = async (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (readiness.shuttingDown) {
      res.status(503).json({ status: 'SHUTTING_DOWN', instance: config.instanceName, checks: { database: 'SKIPPED' } });
      return;
    }
    if (!readiness.databaseInitialized) {
      // Base pas encore créée/peuplée (premier démarrage ou MySQL injoignable)
      res.status(503).json({ status: 'INITIALIZING', instance: config.instanceName, checks: { database: 'NOT_INITIALIZED' } });
      return;
    }
    const t0 = Date.now();
    try {
      await pingDatabase(pool);
      res.json({
        status: 'READY',
        instance: config.instanceName,
        uptime: uptime(),
        checks: { database: 'UP', databaseLatencyMs: Date.now() - t0 },
      });
    } catch {
      res.status(503).json({ status: 'NOT_READY', instance: config.instanceName, checks: { database: 'DOWN' } });
    }
  };

  router.get('/health', health);
  router.get('/ready', ready);
  // Alias sous /api pour les configurations où seul /api/ est relayé vers Express
  router.get('/api/health', health);
  router.get('/api/ready', ready);

  router.get('/api/instance', (_req, res) => {
    res.json({
      instance: config.instanceName,
      hostname: os.hostname(),
      pid: process.pid,
      uptime: uptime(),
      nodeVersion: process.version,
      appVersion: APP_VERSION,
      serverTime: new Date().toISOString(),
    });
  });

  return router;
}

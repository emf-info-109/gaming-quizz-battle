/**
 * Point d'entrée de production : node dist/server.js (lancé par systemd).
 */
import { createApp } from './app.js';
import { buildConfig, loadEnvFile } from './config.js';
import { startDatabaseBootstrap } from './db/bootstrap.js';
import { createPool } from './db/pool.js';
import type { Readiness } from './http/deps.js';
import { createLogger } from './logger.js';
import { createRateLimiters } from './middleware/rateLimits.js';

loadEnvFile();
const config = buildConfig();
const logger = createLogger(config.instanceName, config.logLevel);
const pool = createPool(config.db);
const readiness: Readiness = { shuttingDown: false, databaseInitialized: !config.autoMigrate };

const app = createApp({
  config,
  pool,
  logger,
  readiness,
  limiters: createRateLimiters(config.rateLimits),
  startedAt: Date.now(),
});

const server = app.listen(config.port, config.host, () => {
  logger.info('server_started', {
    url: `http://${config.host}:${config.port}`,
    env: config.env,
    database: `${config.db.host}:${config.db.port}/${config.db.database}`,
  });
});
// Doit rester supérieur au keepalive_timeout de Nginx/HAProxy pour éviter des 502 sporadiques.
server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;

// Premier démarrage : création des tables + 140 questions (AUTO_MIGRATE=true par défaut).
// Le démarrage ne bloque pas si MySQL est indisponible : /health répond, /ready renvoie 503
// et l'initialisation est retentée régulièrement.
const bootstrap = config.autoMigrate ? startDatabaseBootstrap(config, logger, readiness) : null;

/**
 * Arrêt propre (systemctl stop/restart) :
 *  1. /ready renvoie 503 → HAProxy retire l'instance du pool ;
 *  2. on termine les requêtes en cours puis on ferme les connexions MySQL.
 */
let stopping = false;
function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  readiness.shuttingDown = true;
  bootstrap?.stop();
  logger.info('shutdown_started', { signal });
  const drainMs = config.env === 'production' ? 2_000 : 0;
  setTimeout(() => {
    server.close(() => {
      pool
        .end()
        .catch(() => undefined)
        .finally(() => {
          logger.info('shutdown_complete');
          process.exit(0);
        });
    });
    server.closeIdleConnections();
    // Sécurité : on force l'arrêt au bout de 10 s
    setTimeout(() => process.exit(1), 10_000).unref();
  }, drainMs);
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (reason) => {
  logger.error('unhandled_rejection', { error: String(reason) });
});

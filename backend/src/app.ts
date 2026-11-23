/**
 * Construction de l'application Express.
 *
 * createApp() ne démarre pas de serveur : les tests peuvent ainsi créer
 * plusieurs "instances" (WEB-01, WEB-02) partageant la même base MySQL.
 */
import cors from 'cors';
import express, { type Express } from 'express';
import helmet from 'helmet';
import type { AppDeps } from './http/deps.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { noStore, requestContext } from './middleware/requestContext.js';
import { catalogRouter } from './routes/catalog.js';
import { diagRouter } from './routes/diag.js';
import { healthRouter } from './routes/health.js';
import { multiplayerRouter } from './routes/multiplayer.js';
import { playersRouter } from './routes/players.js';
import { soloRouter } from './routes/solo.js';

export function createApp(deps: AppDeps): Express {
  const { config, logger, limiters } = deps;
  const app = express();

  app.disable('x-powered-by');
  // Derrière Nginx (+ HAProxy) : nécessaire pour obtenir la vraie IP du client.
  app.set('trust proxy', config.trustProxy);

  app.use(requestContext(config.instanceName, logger));
  app.use(
    helmet({
      // HSTS est une décision d'infrastructure (HAProxy/Nginx, une fois le HTTPS en place).
      // L'activer ici pourrait bloquer les tests avec un certificat auto-signé.
      strictTransportSecurity: false,
    }),
  );
  app.use(
    cors({
      // Liste blanche explicite ; vide = aucune origine tierce autorisée.
      origin: (origin, cb) => cb(null, !origin ? false : config.corsOrigins.includes(origin)),
      methods: ['GET', 'POST', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization'],
      exposedHeaders: ['X-Instance-Name', 'X-Request-Id'],
      maxAge: 600,
    }),
  );
  app.use(express.json({ limit: '10kb' }));

  // Health checks : hors limitation de débit (HAProxy les appelle en continu).
  app.use(healthRouter(deps));

  app.use('/api', noStore, limiters.api);
  app.use('/api/diag', diagRouter(deps));
  app.use('/api', playersRouter(deps));
  app.use('/api', catalogRouter(deps));
  app.use('/api/solo', soloRouter(deps));
  app.use('/api/games', multiplayerRouter(deps));

  app.use(notFoundHandler);
  app.use(errorHandler(logger));
  return app;
}

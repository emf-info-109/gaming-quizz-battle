import type { AppConfig } from '../config.js';
import type { Pool } from '../db/pool.js';
import type { Logger } from '../logger.js';
import type { createRateLimiters } from '../middleware/rateLimits.js';

/** État de disponibilité de l'instance (passe à "shuttingDown" lors d'un arrêt propre). */
export interface Readiness {
  shuttingDown: boolean;
  /** true quand les tables et les données initiales sont en place */
  databaseInitialized: boolean;
}

export interface AppDeps {
  config: AppConfig;
  pool: Pool;
  logger: Logger;
  readiness: Readiness;
  limiters: ReturnType<typeof createRateLimiters>;
  startedAt: number;
}

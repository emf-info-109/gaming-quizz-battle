/**
 * Initialisation automatique de la base au démarrage de l'API.
 *
 * Au PREMIER démarrage sur une base vide, l'application :
 *   1. crée les tables (migrations),
 *   2. insère les catégories et les 140 questions (seeds).
 * Aux démarrages suivants, rien n'est refait (sauf nouvelle migration ou
 * fichier de seed modifié).
 *
 * Si MySQL n'est pas joignable, l'API démarre quand même (/health = 200,
 * /ready = 503) et réessaie régulièrement jusqu'à ce que la base réponde.
 * Deux instances qui démarrent en même temps ne se gênent pas : un verrou
 * MySQL (GET_LOCK) fait passer l'une après l'autre.
 */
import type { AppConfig } from '../config.js';
import type { Readiness } from '../http/deps.js';
import type { Logger } from '../logger.js';
import { describeDbError } from './dbErrors.js';
import { openAdminConnection, runMigrations, runSeeds } from './migrator.js';

export async function initializeDatabase(db: AppConfig['db'], databaseDir?: string) {
  const conn = await openAdminConnection(db);
  try {
    const migrations = await runMigrations(conn, databaseDir);
    const seeds = await runSeeds(conn, databaseDir);
    return { migrations, seeds };
  } finally {
    await conn.end().catch(() => undefined);
  }
}

export function startDatabaseBootstrap(config: AppConfig, logger: Logger, readiness: Readiness) {
  let timer: NodeJS.Timeout | undefined;
  let delayMs = 3_000;
  let stopped = false;

  const attempt = async () => {
    if (stopped || readiness.shuttingDown) return;
    try {
      const { migrations, seeds } = await initializeDatabase(config.db);
      readiness.databaseInitialized = true;
      if (migrations.applied.length || seeds.length) {
        logger.info('database_initialized', { migrations: migrations.applied, seeds });
      } else {
        logger.info('database_up_to_date');
      }
      for (const w of migrations.warnings) logger.warn('migration_warning', { warning: w });
    } catch (err) {
      logger.warn('database_init_failed', {
        hint: describeDbError(err, { ...config.db }),
        retryInSeconds: delayMs / 1000,
      });
      timer = setTimeout(attempt, delayMs);
      delayMs = Math.min(delayMs * 2, 30_000);
    }
  };

  void attempt();
  return {
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

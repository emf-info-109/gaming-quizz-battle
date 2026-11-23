/**
 * Initialisation automatique de la base au démarrage (AUTO_MIGRATE).
 */
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase, startDatabaseBootstrap } from '../../src/db/bootstrap.js';
import { dropAllTables, openAdminConnection } from '../../src/db/migrator.js';
import type { Logger } from '../../src/logger.js';
import { closeAllInstances, createInstance, dbAvailable, sleep, testConfig } from './helpers.js';

async function blankDatabase() {
  const conn = await openAdminConnection(testConfig().db);
  await dropAllTables(conn);
  await conn.end();
}

async function countQuestions(): Promise<number> {
  const conn = await openAdminConnection(testConfig().db);
  const [rows] = await conn.query('SELECT COUNT(*) AS n FROM questions');
  await conn.end();
  return Number((rows as Array<{ n: number }>)[0]!.n);
}

describe.skipIf(!dbAvailable)('initialisation automatique de la base', () => {
  beforeEach(blankDatabase);
  afterAll(closeAllInstances);

  it('crée les tables et insère les 140 questions sur une base vide, une seule fois', async () => {
    const first = await initializeDatabase(testConfig().db);
    expect(first.migrations.applied).toEqual(['001_initial_schema.sql']);
    expect(first.seeds).toEqual(['001_categories.sql', '002_questions.sql']);
    expect(await countQuestions()).toBe(140);

    const second = await initializeDatabase(testConfig().db);
    expect(second.migrations.applied).toEqual([]);
    expect(second.seeds).toEqual([]);
    expect(await countQuestions()).toBe(140);
  });

  it('deux instances qui démarrent en même temps n’initialisent la base qu’une fois', async () => {
    const [a, b] = await Promise.all([initializeDatabase(testConfig().db), initializeDatabase(testConfig().db)]);
    expect([...a.migrations.applied, ...b.migrations.applied]).toEqual(['001_initial_schema.sql']);
    expect([...a.seeds, ...b.seeds].sort()).toEqual(['001_categories.sql', '002_questions.sql']);
    expect(await countQuestions()).toBe(140);
  });

  it('/ready renvoie 503 tant que la base n’est pas initialisée', async () => {
    const web = createInstance('WEB-01');
    web.readiness.databaseInitialized = false;
    const res = await request(web.app).get('/ready').expect(503);
    expect(res.body.status).toBe('INITIALIZING');
  });

  it('réessaie avec un message clair si MySQL est injoignable', async () => {
    const warnings: Array<Record<string, unknown>> = [];
    const logger: Logger = { error: () => {}, info: () => {}, debug: () => {}, warn: (_m, meta) => warnings.push(meta ?? {}) };
    const readiness = { shuttingDown: false, databaseInitialized: false };
    const bootstrap = startDatabaseBootstrap(testConfig({ DB_HOST: '127.0.0.1', DB_PORT: '1' }), logger, readiness);
    await sleep(500);
    bootstrap.stop();
    expect(readiness.databaseInitialized).toBe(false);
    expect(String(warnings[0]?.hint)).toMatch(/Connexion refusée/);
  });

  it('démarre une instance sur une base vide et la rend prête', async () => {
    const readiness = { shuttingDown: false, databaseInitialized: false };
    const silent: Logger = { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} };
    const bootstrap = startDatabaseBootstrap(testConfig(), silent, readiness);
    for (let i = 0; i < 50 && !readiness.databaseInitialized; i++) await sleep(100);
    bootstrap.stop();
    expect(readiness.databaseInitialized).toBe(true);
    expect(await countQuestions()).toBe(140);
  });
});

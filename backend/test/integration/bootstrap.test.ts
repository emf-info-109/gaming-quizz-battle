/**
 * Initialisation automatique de la base au démarrage (AUTO_MIGRATE).
 */
import { cpSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { initializeDatabase, startDatabaseBootstrap } from '../../src/db/bootstrap.js';
import { dropAllTables, findDatabaseDir, openAdminConnection } from '../../src/db/migrator.js';
import type { Logger } from '../../src/logger.js';
import { closeAllInstances, createInstance, createPlayer, dbAvailable, sleep, testConfig } from './helpers.js';

const ALL_MIGRATIONS = ['001_initial_schema.sql', '002_lobby_chat.sql'];

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
    expect(first.migrations.applied).toEqual(ALL_MIGRATIONS);
    expect(first.seeds).toEqual(['001_categories.sql', '002_questions.sql']);
    expect(await countQuestions()).toBe(140);

    const second = await initializeDatabase(testConfig().db);
    expect(second.migrations.applied).toEqual([]);
    expect(second.seeds).toEqual([]);
    expect(await countQuestions()).toBe(140);
  });

  it('deux instances qui démarrent en même temps n’initialisent la base qu’une fois', async () => {
    const [a, b] = await Promise.all([initializeDatabase(testConfig().db), initializeDatabase(testConfig().db)]);
    expect([...a.migrations.applied, ...b.migrations.applied]).toEqual(ALL_MIGRATIONS);
    expect([...a.seeds, ...b.seeds].sort()).toEqual(['001_categories.sql', '002_questions.sql']);
    expect(await countQuestions()).toBe(140);
  });

  it('met à jour une base déjà installée (migration 002) sans perdre les parties en cours', async () => {
    // Base « ancienne version » : uniquement la migration 001 et les seeds.
    const oldDir = mkdtempSync(path.join(tmpdir(), 'gq-db-v1-'));
    try {
      const current = findDatabaseDir();
      cpSync(path.join(current, 'seeds'), path.join(oldDir, 'seeds'), { recursive: true });
      cpSync(path.join(current, 'migrations', '001_initial_schema.sql'), path.join(oldDir, 'migrations', '001_initial_schema.sql'));
      expect((await initializeDatabase(testConfig().db, oldDir)).migrations.applied).toEqual(['001_initial_schema.sql']);
    } finally {
      rmSync(oldDir, { recursive: true, force: true });
    }

    // Une salle d'attente créée avec l'ancienne version (sans nom)
    const web = createInstance('WEB-01');
    const host = await createPlayer(web.app, 'Ancien');
    const conn = await openAdminConnection(testConfig().db);
    await conn.query(
      `INSERT INTO games (id, code, mode, host_player_id, status, question_count, question_duration_ms,
                          reveal_duration_ms, countdown_ms, max_players)
       VALUES (UUID(), 'KWD234', 'multi', ?, 'lobby', 1, 15000, 6000, 4000, 30)`,
      [host.id],
    );
    await conn.query(`INSERT INTO game_players (game_id, player_id) SELECT id, ? FROM games WHERE code = 'KWD234'`, [host.id]);
    await conn.query(`INSERT INTO game_questions (game_id, position, question_id) SELECT id, 0, 1 FROM games WHERE code = 'KWD234'`);
    await conn.end();

    const upgrade = await initializeDatabase(testConfig().db);
    expect(upgrade.migrations.applied).toEqual(['002_lobby_chat.sql']);

    const stateRes = await request(web.app).get('/api/games/KWD234').set('Authorization', host.auth).expect(200);
    expect(stateRes.body).toMatchObject({ name: 'Partie de Ancien', isPublic: true, messages: [] });
    const list = await request(web.app).get('/api/games').set('Authorization', host.auth).expect(200);
    expect(list.body.games.map((g: { code: string }) => g.code)).toContain('KWD234');
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

/**
 * Outils pour les tests d'intégration.
 *
 * Les tests utilisent une base dédiée (gaming_quiz_test par défaut) qui est
 * entièrement recréée : migrations + seeds. Plusieurs "instances" de l'API
 * (WEB-01, WEB-02...) sont créées avec chacune leur propre pool de connexions,
 * exactement comme deux VM qui partagent le même serveur MySQL.
 */
import request from 'supertest';
import type { Express } from 'express';
import { createApp } from '../../src/app.js';
import { buildConfig, loadEnvFile, type AppConfig } from '../../src/config.js';
import { createPool, type Pool } from '../../src/db/pool.js';
import { dropAllTables, openAdminConnection, runMigrations, runSeeds } from '../../src/db/migrator.js';
import { silentLogger } from '../../src/logger.js';
import { createRateLimiters } from '../../src/middleware/rateLimits.js';
import type { Readiness } from '../../src/http/deps.js';

loadEnvFile();

export function testConfig(overrides: Partial<Record<string, string>> = {}): AppConfig {
  return buildConfig({
    ...process.env,
    NODE_ENV: 'test',
    DB_NAME: process.env.TEST_DB_NAME ?? 'gaming_quiz_test',
    RATE_LIMIT_API_PER_MINUTE: '100000',
    RATE_LIMIT_PLAYER_CREATE_PER_15MIN: '100000',
    RATE_LIMIT_GAME_ACTIONS_PER_MINUTE: '100000',
    ...overrides,
  });
}

async function checkDatabase(): Promise<boolean> {
  try {
    const conn = await openAdminConnection(testConfig().db);
    await conn.end();
    return true;
  } catch (err) {
    if (process.env.REQUIRE_DB_TESTS === '1') throw err;
    console.warn(
      `\n⚠️  Tests d'intégration ignorés : base de test inaccessible (${(err as Error).message}).\n` +
        '   Lancez "docker compose up -d" ou configurez DB_* / TEST_DB_NAME.\n',
    );
    return false;
  }
}

export const dbAvailable = await checkDatabase();

/** Recrée complètement la base de test (installation sur base vierge). */
export async function resetDatabase(): Promise<void> {
  const conn = await openAdminConnection(testConfig().db);
  try {
    await dropAllTables(conn);
    await runMigrations(conn);
    await runSeeds(conn);
  } finally {
    await conn.end();
  }
}

export interface TestInstance {
  name: string;
  app: Express;
  pool: Pool;
  readiness: Readiness;
  close(): Promise<void>;
}

const openInstances = new Set<TestInstance>();

export function createInstance(name: string, overrides: Partial<Record<string, string>> = {}): TestInstance {
  const config = testConfig({ INSTANCE_NAME: name, ...overrides });
  const pool = createPool(config.db);
  const readiness: Readiness = { shuttingDown: false };
  const app = createApp({
    config,
    pool,
    logger: silentLogger,
    readiness,
    limiters: createRateLimiters(config.rateLimits),
    startedAt: Date.now(),
  });
  const instance: TestInstance = {
    name,
    app,
    pool,
    readiness,
    async close() {
      openInstances.delete(instance);
      await pool.end().catch(() => undefined);
    },
  };
  openInstances.add(instance);
  return instance;
}

export async function closeAllInstances(): Promise<void> {
  await Promise.all([...openInstances].map((i) => i.close()));
}

/**
 * Simule HAProxy en round-robin : chaque appel est envoyé à l'instance suivante.
 */
export function roundRobin(instances: TestInstance[]) {
  let i = 0;
  return () => {
    const inst = instances[i % instances.length]!;
    i++;
    return request(inst.app);
  };
}

export async function createPlayer(app: Express, pseudo: string, avatar = 'robot') {
  const res = await request(app).post('/api/players').send({ pseudo, avatar }).expect(201);
  return { id: res.body.player.id as string, token: res.body.token as string, auth: `Bearer ${res.body.token}` };
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

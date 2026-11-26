/**
 * Chargement et validation de la configuration.
 *
 * Toute la configuration provient des variables d'environnement :
 *  - en production : fichier EnvironmentFile de systemd (/etc/gaming-quiz/gaming-quiz.env)
 *  - en développement : fichier .env à la racine du dépôt (chargé par dotenv)
 *
 * Aucune valeur secrète n'a de valeur par défaut dans le code.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** Charge le fichier .env (racine du dépôt) sans écraser les variables déjà définies. */
export function loadEnvFile(): void {
  const candidate = process.env.ENV_FILE ?? path.resolve(moduleDir, '../../.env');
  if (existsSync(candidate)) {
    dotenv.config({ path: candidate, quiet: true });
  }
}

const boolFromEnv = z
  .enum(['true', 'false', '1', '0', 'yes', 'no'])
  .default('false')
  .transform((v) => v === 'true' || v === '1' || v === 'yes');

const intFromEnv = (def: number, min: number, max: number) =>
  z.coerce.number().int().min(min).max(max).default(def);

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  INSTANCE_NAME: z
    .string()
    .trim()
    .min(1)
    .max(40)
    .regex(/^[A-Za-z0-9._-]+$/, 'INSTANCE_NAME : lettres, chiffres, point, tiret ou underscore')
    .default('LOCAL'),
  HOST: z.string().default('127.0.0.1'),
  PORT: intFromEnv(3000, 1, 65535),
  TRUST_PROXY: z.string().default('loopback,uniquelocal'),
  CORS_ORIGINS: z.string().default(''),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  AUTO_MIGRATE: z
    .enum(['true', 'false', '1', '0', 'yes', 'no'])
    .default('true')
    .transform((v) => v === 'true' || v === '1' || v === 'yes'),

  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: intFromEnv(3306, 1, 65535),
  DB_NAME: z.string().min(1).default('gaming_quiz'),
  DB_USER: z.string().min(1).default('quiz_app'),
  DB_PASSWORD: z.string().default(''),
  DB_POOL_SIZE: intFromEnv(10, 1, 200),
  DB_SSL: boolFromEnv,

  QUESTION_DURATION_MS: intFromEnv(15_000, 1_000, 120_000),
  REVEAL_DURATION_MS: intFromEnv(6_000, 500, 60_000),
  COUNTDOWN_MS: intFromEnv(4_000, 0, 60_000),
  QUESTIONS_PER_GAME: intFromEnv(10, 1, 20),
  MAX_PLAYERS_PER_GAME: intFromEnv(30, 2, 100),

  RATE_LIMIT_API_PER_MINUTE: intFromEnv(3000, 10, 1_000_000),
  RATE_LIMIT_PLAYER_CREATE_PER_15MIN: intFromEnv(100, 1, 1_000_000),
  RATE_LIMIT_GAME_ACTIONS_PER_MINUTE: intFromEnv(30, 1, 1_000_000),
  RATE_LIMIT_DIAG_PER_MINUTE: intFromEnv(600, 1, 1_000_000),
  RATE_LIMIT_CHAT_PER_MINUTE: intFromEnv(20, 1, 1_000_000),
});

export interface AppConfig {
  env: 'development' | 'production' | 'test';
  instanceName: string;
  host: string;
  port: number;
  trustProxy: string | boolean | number;
  corsOrigins: string[];
  logLevel: 'error' | 'warn' | 'info' | 'debug';
  /** Créer les tables et insérer les questions automatiquement au démarrage */
  autoMigrate: boolean;
  db: {
    host: string;
    port: number;
    database: string;
    user: string;
    password: string;
    poolSize: number;
    ssl: boolean;
  };
  game: {
    questionDurationMs: number;
    revealDurationMs: number;
    countdownMs: number;
    questionsPerGame: number;
    maxPlayersPerGame: number;
  };
  rateLimits: {
    apiPerMinute: number;
    playerCreatePer15Min: number;
    gameActionsPerMinute: number;
    diagPerMinute: number;
    chatPerMinute: number;
  };
}

function parseTrustProxy(raw: string): string | boolean | number {
  const value = raw.trim();
  if (value === 'true') return true;
  if (value === 'false' || value === '') return false;
  if (/^\d+$/.test(value)) return Number(value);
  return value;
}

export function buildConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Configuration invalide :\n${details}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    instanceName: e.INSTANCE_NAME,
    host: e.HOST,
    port: e.PORT,
    trustProxy: parseTrustProxy(e.TRUST_PROXY),
    corsOrigins: e.CORS_ORIGINS.split(',')
      .map((o) => o.trim())
      .filter(Boolean),
    logLevel: e.LOG_LEVEL,
    autoMigrate: e.AUTO_MIGRATE,
    db: {
      host: e.DB_HOST,
      port: e.DB_PORT,
      database: e.DB_NAME,
      user: e.DB_USER,
      password: e.DB_PASSWORD,
      poolSize: e.DB_POOL_SIZE,
      ssl: e.DB_SSL,
    },
    game: {
      questionDurationMs: e.QUESTION_DURATION_MS,
      revealDurationMs: e.REVEAL_DURATION_MS,
      countdownMs: e.COUNTDOWN_MS,
      questionsPerGame: e.QUESTIONS_PER_GAME,
      maxPlayersPerGame: e.MAX_PLAYERS_PER_GAME,
    },
    rateLimits: {
      apiPerMinute: e.RATE_LIMIT_API_PER_MINUTE,
      playerCreatePer15Min: e.RATE_LIMIT_PLAYER_CREATE_PER_15MIN,
      gameActionsPerMinute: e.RATE_LIMIT_GAME_ACTIONS_PER_MINUTE,
      diagPerMinute: e.RATE_LIMIT_DIAG_PER_MINUTE,
      chatPerMinute: e.RATE_LIMIT_CHAT_PER_MINUTE,
    },
  };
}

/**
 * Exécution reproductible des migrations et des seeds SQL.
 *
 *  - database/migrations/NNN_nom.sql : appliquées UNE seule fois, dans l'ordre,
 *    et enregistrées dans la table schema_migrations (avec leur empreinte SHA-256).
 *  - database/seeds/NNN_nom.sql : rejouables à volonté (INSERT ... ON DUPLICATE KEY UPDATE).
 *
 * Un verrou nommé MySQL (GET_LOCK) empêche deux serveurs de migrer en même temps.
 * ⚠️ En MySQL, les instructions DDL (CREATE/ALTER) valident implicitement la
 * transaction : une migration interrompue doit être corrigée manuellement.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mysql from 'mysql2/promise';
import type { Connection, RowDataPacket } from 'mysql2/promise';
import type { AppConfig } from '../config.js';

const LOCK_NAME = 'gaming_quiz_migrations';

/** Trouve le dossier database/ en remontant depuis ce fichier (fonctionne depuis src/ et dist/). */
export function findDatabaseDir(): string {
  if (process.env.DATABASE_DIR) return path.resolve(process.env.DATABASE_DIR);
  let dir = path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 6; i++) {
    const candidate = path.join(dir, 'database', 'migrations');
    if (existsSync(candidate)) return path.join(dir, 'database');
    dir = path.dirname(dir);
  }
  throw new Error('Dossier database/ introuvable (définir DATABASE_DIR).');
}

function sqlFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort();
}

const checksum = (content: string) => createHash('sha256').update(content).digest('hex');

export async function openAdminConnection(db: AppConfig['db']): Promise<Connection> {
  return mysql.createConnection({
    host: db.host,
    port: db.port,
    user: db.user,
    password: db.password,
    database: db.database,
    multipleStatements: true, // uniquement pour cet outil, jamais pour l'API
    charset: 'utf8mb4_0900_ai_ci',
    ssl: db.ssl ? { rejectUnauthorized: true } : undefined,
  });
}

async function withLock<T>(conn: Connection, fn: () => Promise<T>): Promise<T> {
  const [rows] = await conn.query<RowDataPacket[]>('SELECT GET_LOCK(?, 60) AS ok', [LOCK_NAME]);
  if (Number(rows[0]?.ok) !== 1) throw new Error('Impossible d’obtenir le verrou de migration.');
  try {
    return await fn();
  } finally {
    await conn.query('SELECT RELEASE_LOCK(?)', [LOCK_NAME]);
  }
}

async function ensureMigrationsTable(conn: Connection) {
  await conn.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     VARCHAR(255) NOT NULL PRIMARY KEY,
      checksum    CHAR(64)     NOT NULL,
      applied_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
}

export interface MigrationReport {
  applied: string[];
  skipped: string[];
  warnings: string[];
}

export async function runMigrations(conn: Connection, databaseDir = findDatabaseDir()): Promise<MigrationReport> {
  return withLock(conn, async () => {
    await ensureMigrationsTable(conn);
    const [rows] = await conn.query<RowDataPacket[]>('SELECT version, checksum FROM schema_migrations');
    const applied = new Map(rows.map((r) => [String(r.version), String(r.checksum)]));
    const report: MigrationReport = { applied: [], skipped: [], warnings: [] };

    const dir = path.join(databaseDir, 'migrations');
    for (const file of sqlFiles(dir)) {
      const content = readFileSync(path.join(dir, file), 'utf8');
      const sum = checksum(content);
      const known = applied.get(file);
      if (known) {
        if (known !== sum) report.warnings.push(`${file} a été modifiée après son application (empreinte différente).`);
        report.skipped.push(file);
        continue;
      }
      await conn.query(content);
      await conn.query('INSERT INTO schema_migrations (version, checksum) VALUES (?, ?)', [file, sum]);
      report.applied.push(file);
    }
    return report;
  });
}

/**
 * Exécute les seeds. Par défaut, un seed n'est rejoué que s'il est nouveau ou
 * si son contenu a changé (empreinte enregistrée dans schema_seeds) : c'est ce
 * qui permet de peupler la base au PREMIER démarrage sans tout réécrire ensuite.
 * `force: true` les rejoue tous (commande "npm run db:seed").
 */
export async function runSeeds(
  conn: Connection,
  databaseDir = findDatabaseDir(),
  options: { force?: boolean } = {},
): Promise<string[]> {
  return withLock(conn, async () => {
    await conn.query(`
      CREATE TABLE IF NOT EXISTS schema_seeds (
        name        VARCHAR(255) NOT NULL PRIMARY KEY,
        checksum    CHAR(64)     NOT NULL,
        applied_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`);
    // Lu APRÈS avoir obtenu le verrou : si une autre instance vient de peupler
    // la base, on le voit et on ne refait rien.
    const [rows] = await conn.query<RowDataPacket[]>('SELECT name, checksum FROM schema_seeds');
    const known = new Map(rows.map((r) => [String(r.name), String(r.checksum)]));

    const dir = path.join(databaseDir, 'seeds');
    const done: string[] = [];
    for (const file of sqlFiles(dir)) {
      const content = readFileSync(path.join(dir, file), 'utf8');
      const sum = checksum(content);
      if (!options.force && known.get(file) === sum) continue;
      await conn.query(content);
      await conn.query(
        'INSERT INTO schema_seeds (name, checksum) VALUES (?, ?) AS new ON DUPLICATE KEY UPDATE checksum = new.checksum, applied_at = CURRENT_TIMESTAMP(3)',
        [file, sum],
      );
      done.push(file);
    }
    return done;
  });
}

export async function migrationStatus(conn: Connection, databaseDir = findDatabaseDir()) {
  await ensureMigrationsTable(conn);
  const [rows] = await conn.query<RowDataPacket[]>('SELECT version, applied_at FROM schema_migrations ORDER BY version');
  const appliedSet = new Set(rows.map((r) => String(r.version)));
  const files = sqlFiles(path.join(databaseDir, 'migrations'));
  return files.map((f) => ({ version: f, applied: appliedSet.has(f) }));
}

/** Supprime toutes les tables (tests et développement uniquement). */
export async function dropAllTables(conn: Connection): Promise<void> {
  const [rows] = await conn.query<RowDataPacket[]>(
    'SELECT table_name AS t FROM information_schema.tables WHERE table_schema = DATABASE()',
  );
  if (rows.length === 0) return;
  await conn.query('SET FOREIGN_KEY_CHECKS = 0');
  for (const r of rows) await conn.query(`DROP TABLE IF EXISTS \`${String(r.t).replace(/`/g, '')}\``);
  await conn.query('SET FOREIGN_KEY_CHECKS = 1');
}

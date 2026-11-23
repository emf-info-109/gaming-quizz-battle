/**
 * Outil en ligne de commande pour la base de données.
 *
 *   npm run db:check     → teste la connexion et les droits (utilisé par setup.sh)
 *   npm run db:migrate   → applique les migrations manquantes
 *   npm run db:seed      → (ré)insère les catégories et les 140 questions
 *   npm run db:setup     → migrate + seed
 *   npm run db:status    → liste des migrations appliquées / en attente
 *
 * Remarque : par défaut (AUTO_MIGRATE=true), l'API fait déjà "migrate + seed"
 * toute seule au démarrage. Cet outil reste utile pour le diagnostic.
 *
 * En production (après "npm run build") : node dist/cli/db.js <commande>
 */
import { buildConfig, loadEnvFile } from '../config.js';
import { describeDbError } from '../db/dbErrors.js';
import { migrationStatus, openAdminConnection, runMigrations, runSeeds } from '../db/migrator.js';

const COMMANDS = ['check', 'migrate', 'seed', 'setup', 'status'];

async function main() {
  const command = process.argv[2] ?? 'setup';
  if (!COMMANDS.includes(command)) {
    console.error(`Usage : db.js <${COMMANDS.join('|')}>`);
    process.exit(2);
  }
  loadEnvFile();
  const config = buildConfig();
  const target = { ...config.db };
  console.log(`→ Base ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`);

  let conn;
  try {
    conn = await openAdminConnection(config.db);
  } catch (err) {
    console.error(`✖ ${describeDbError(err, target)}`);
    process.exit(1);
  }

  try {
    if (command === 'check') {
      await conn.query('SELECT 1');
      console.log('  ✔ connexion à MySQL réussie');
      // L'application doit pouvoir créer ses tables au premier démarrage.
      await conn.query('CREATE TABLE IF NOT EXISTS _gq_setup_check (id INT)');
      await conn.query('DROP TABLE _gq_setup_check');
      console.log('  ✔ droits suffisants pour créer les tables');
      return;
    }
    if (command === 'status') {
      for (const m of await migrationStatus(conn)) console.log(`  ${m.applied ? '✔' : '…'} ${m.version}`);
      return;
    }
    if (command === 'migrate' || command === 'setup') {
      const report = await runMigrations(conn);
      for (const f of report.applied) console.log(`  ✔ migration appliquée : ${f}`);
      for (const f of report.skipped) console.log(`  · déjà appliquée     : ${f}`);
      for (const w of report.warnings) console.warn(`  ⚠ ${w}`);
    }
    if (command === 'seed' || command === 'setup') {
      const seeds = await runSeeds(conn, undefined, { force: command === 'seed' });
      for (const f of seeds) console.log(`  ✔ seed exécuté      : ${f}`);
      if (seeds.length === 0) console.log('  · données initiales déjà présentes');
    }
    console.log('Terminé.');
  } catch (err) {
    console.error(`✖ ${describeDbError(err, target)}`);
    process.exitCode = 1;
  } finally {
    await conn.end();
  }
}

main().catch((err: Error) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});

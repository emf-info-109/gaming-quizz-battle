/**
 * Outil en ligne de commande pour la base de données.
 *
 *   npm run db:migrate   → applique les migrations manquantes
 *   npm run db:seed      → (ré)insère les catégories et les 140 questions
 *   npm run db:setup     → migrate + seed (installation complète)
 *   npm run db:status    → liste des migrations appliquées / en attente
 *
 * En production (après "npm run build") : node dist/cli/db.js setup
 */
import { buildConfig, loadEnvFile } from '../config.js';
import { migrationStatus, openAdminConnection, runMigrations, runSeeds } from '../db/migrator.js';

async function main() {
  const command = process.argv[2] ?? 'setup';
  if (!['migrate', 'seed', 'setup', 'status'].includes(command)) {
    console.error('Usage : db.ts <migrate|seed|setup|status>');
    process.exit(2);
  }
  loadEnvFile();
  const config = buildConfig();
  console.log(`→ Base ${config.db.user}@${config.db.host}:${config.db.port}/${config.db.database}`);
  const conn = await openAdminConnection(config.db);
  try {
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
      for (const f of await runSeeds(conn)) console.log(`  ✔ seed exécuté      : ${f}`);
    }
    console.log('Terminé.');
  } finally {
    await conn.end();
  }
}

main().catch((err: Error) => {
  console.error(`✖ ${err.message}`);
  process.exit(1);
});

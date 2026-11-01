import { Pool } from 'pg';
import { loadConfig } from '../../../config/app-config';
import { ConsoleAppLogger } from '../console-logger';
import { SqlMigrationRunner } from './migration-runner';

/** Point d'entrée en ligne de commande : `npm run migrate` (appelé par l'entrypoint Docker). */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new ConsoleAppLogger('Migrations', config.http.prettyLogs);
  const pool = new Pool({ connectionString: config.persistence.databaseUrl, max: 1 });
  try {
    const applied = await new SqlMigrationRunner(pool, config.persistence.migrationsDir, logger).run();
    logger.info(applied.length > 0 ? 'Schéma mis à jour' : 'Schéma déjà à jour', { applied });
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});

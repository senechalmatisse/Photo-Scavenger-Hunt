import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { Pool } from 'pg';
import { AppLogger } from '../../application/ports';

const MIGRATION_FILE = /^V(\d{3,})__([a-z0-9_]+)\.sql$/;
/** Clé de verrou consultatif : une seule instance applique les migrations à la fois. */
const ADVISORY_LOCK_KEY = 762_215_001;

const CREATE_HISTORY = `
CREATE TABLE IF NOT EXISTS schema_migrations
(
  version INTEGER NOT NULL,
  description VARCHAR(200) NOT NULL,
  checksum CHAR(64) NOT NULL,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT schema_migrations_pk PRIMARY KEY (version)
)`;

const SELECT_APPLIED = `
SELECT version,
  checksum
FROM schema_migrations
ORDER BY version`;

const INSERT_APPLIED = `
INSERT INTO schema_migrations
(
  version,
  description,
  checksum
)
VALUES ($1, $2, $3)`;

interface MigrationFile {
  readonly version: number;
  readonly description: string;
  readonly sql: string;
  readonly checksum: string;
}

/**
 * Lanceur de migrations SQL versionnées (`V001__description.sql`), à la manière de Flyway :
 * scripts SQL lisibles par un DBA, appliqués dans l'ordre, chacun dans sa transaction,
 * avec contrôle d'intégrité (un script déjà appliqué ne doit plus être modifié).
 */
export class SqlMigrationRunner {
  constructor(
    private readonly pool: Pool,
    private readonly directory: string,
    private readonly logger: AppLogger,
  ) {}

  async run(): Promise<number[]> {
    const migrations = await this.loadMigrations();
    const client = await this.pool.connect();
    try {
      await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);
      await client.query(CREATE_HISTORY);
      const applied = new Map(
        (await client.query<{ version: number; checksum: string }>(SELECT_APPLIED)).rows.map((row) => [row.version, row.checksum]),
      );
      const done: number[] = [];
      for (const migration of migrations) {
        const knownChecksum = applied.get(migration.version);
        if (knownChecksum !== undefined) {
          if (knownChecksum !== migration.checksum) {
            throw new Error(`La migration V${migration.version} a été modifiée après son application.`);
          }
          continue;
        }
        await client.query('BEGIN');
        try {
          await client.query(migration.sql);
          await client.query(INSERT_APPLIED, [migration.version, migration.description, migration.checksum]);
          await client.query('COMMIT');
        } catch (error) {
          await client.query('ROLLBACK');
          throw new Error(`Échec de la migration V${migration.version} : ${(error as Error).message}`);
        }
        this.logger.info('Migration appliquée', { version: migration.version, description: migration.description });
        done.push(migration.version);
      }
      return done;
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]).catch(() => undefined);
      client.release();
    }
  }

  private async loadMigrations(): Promise<MigrationFile[]> {
    const files = (await readdir(this.directory)).filter((file) => MIGRATION_FILE.test(file));
    const migrations = await Promise.all(
      files.map(async (file) => {
        const [, version, description] = MIGRATION_FILE.exec(file) as RegExpExecArray;
        const sql = await readFile(join(this.directory, file), 'utf8');
        return {
          version: Number(version),
          description: description.replace(/_/g, ' '),
          sql,
          checksum: createHash('sha256').update(sql).digest('hex'),
        };
      }),
    );
    return migrations.sort((a, b) => a.version - b.version);
  }
}

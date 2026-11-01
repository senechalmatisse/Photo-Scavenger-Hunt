import { AsyncLocalStorage } from 'node:async_hooks';
import { Pool, PoolClient, QueryResultRow, types } from 'pg';
import { UnitOfWork } from '../../application/ports';

// DATE (OID 1082) reste une chaîne `YYYY-MM-DD` : pas de décalage de fuseau implicite.
types.setTypeParser(1082, (value: string) => value);
// BIGINT (OID 20) : les durées en millisecondes tiennent largement dans un Number.
types.setTypeParser(20, (value: string) => Number(value));

type Executor = Pick<PoolClient, 'query'>;

/**
 * Accès PostgreSQL partagé par les repositories.
 * La transaction courante est portée par AsyncLocalStorage : un repository appelé dans
 * `transaction()` utilise automatiquement la connexion de la transaction (Unit of Work).
 */
export class PgDatabase {
  private readonly transactionClient = new AsyncLocalStorage<PoolClient>();

  constructor(readonly pool: Pool) {}

  async query<R extends QueryResultRow>(sql: string, params: readonly unknown[] = []): Promise<R[]> {
    const result = await this.executor().query<R>(sql, params as unknown[]);
    return result.rows;
  }

  async execute(sql: string, params: readonly unknown[] = []): Promise<number> {
    const result = await this.executor().query(sql, params as unknown[]);
    return result.rowCount ?? 0;
  }

  async transaction<T>(work: () => Promise<T>): Promise<T> {
    if (this.transactionClient.getStore()) {
      return work();
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await this.transactionClient.run(client, work);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }

  private executor(): Executor {
    return this.transactionClient.getStore() ?? this.pool;
  }
}

export class PgUnitOfWork implements UnitOfWork {
  constructor(private readonly database: PgDatabase) {}

  run<T>(work: () => Promise<T>): Promise<T> {
    return this.database.transaction(work);
  }
}

/** Code SQLSTATE 23505 : violation de contrainte d'unicité. */
export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  const pgError = error as { code?: string; constraint?: string };
  return pgError?.code === '23505' && (constraint === undefined || pgError.constraint === constraint);
}

/** Les colonnes JSONB sont envoyées sérialisées ; `null` reste un NULL SQL (et non le JSON `null`). */
export function json(value: unknown): string | null {
  return value === null || value === undefined ? null : JSON.stringify(value);
}

import type { FactoryProvider, InjectionToken } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { PgDatabase } from './persistence/pg-database';
import { APP_CONFIG, PG_DATABASE } from './tokens';

/**
 * Fournisseur dont l'implémentation dépend du pilote de persistance configuré
 * (pattern Abstract Factory au point de montage) : PostgreSQL en production, mémoire en démo/tests.
 */
export function byPersistenceDriver<T, TDeps extends unknown[] = []>(
  provide: InjectionToken,
  build: {
    readonly postgres: (database: PgDatabase, ...deps: TDeps) => T;
    readonly memory: (...deps: TDeps) => T;
  },
  inject: InjectionToken[] = [],
): FactoryProvider<T> {
  return {
    provide,
    useFactory: (config: AppConfig, database: PgDatabase, ...deps: TDeps) =>
      config.persistence.driver === 'postgres' ? build.postgres(database, ...deps) : build.memory(...deps),
    inject: [APP_CONFIG, PG_DATABASE, ...inject],
  };
}

/** Raccourci pour un cas d'usage construit à partir de dépendances injectées. */
export function useCase<T>(provide: InjectionToken, factory: (...deps: never[]) => T, inject: InjectionToken[]): FactoryProvider<T> {
  return { provide, useFactory: factory as (...deps: unknown[]) => T, inject };
}

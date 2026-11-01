import { Global, Inject, Module, OnApplicationShutdown } from '@nestjs/common';
import Redis from 'ioredis';
import { Pool } from 'pg';
import { AppConfig } from '../../config/app-config';
import { AppLogger } from '../application/ports';
import { GameCalendar } from '../domain/game-calendar';
import { Clock } from '../domain/ports';
import { InMemoryCacheStore, RedisCacheStore } from './cache/cache-stores';
import { ConsoleAppLogger } from './console-logger';
import { InProcessEventBus } from './in-process-event-bus';
import { InMemoryUnitOfWork } from './persistence/in-memory-store';
import { PgDatabase, PgUnitOfWork } from './persistence/pg-database';
import { CryptoRandomSource, SystemClock, UuidGenerator } from './system';
import {
  APP_CONFIG,
  APP_LOGGER,
  CACHE_STORE,
  CLOCK,
  EVENT_BUS,
  GAME_CALENDAR,
  ID_GENERATOR,
  PG_DATABASE,
  RANDOM_SOURCE,
  REDIS_CLIENT,
  UNIT_OF_WORK,
} from './tokens';

/**
 * Noyau technique partagé (global) : horloge, identifiants, journal, bus d'événements,
 * calendrier du jeu, base PostgreSQL, Redis et cache. Les connexions ne sont ouvertes
 * qu'à la première utilisation : un pilote « memory » n'ouvre aucune connexion.
 */
@Global()
@Module({
  providers: [
    { provide: CLOCK, useClass: SystemClock },
    { provide: ID_GENERATOR, useClass: UuidGenerator },
    { provide: RANDOM_SOURCE, useClass: CryptoRandomSource },
    {
      provide: APP_LOGGER,
      useFactory: (config: AppConfig) => new ConsoleAppLogger('App', config.http.prettyLogs, config.env === 'test'),
      inject: [APP_CONFIG],
    },
    { provide: EVENT_BUS, useFactory: (logger: AppLogger) => new InProcessEventBus(logger), inject: [APP_LOGGER] },
    { provide: GAME_CALENDAR, useFactory: (config: AppConfig) => new GameCalendar(config.game.timeZone), inject: [APP_CONFIG] },
    {
      provide: PG_DATABASE,
      useFactory: (config: AppConfig) =>
        new PgDatabase(new Pool({ connectionString: config.persistence.databaseUrl, max: 10, idleTimeoutMillis: 30_000 })),
      inject: [APP_CONFIG],
    },
    {
      provide: UNIT_OF_WORK,
      useFactory: (config: AppConfig, database: PgDatabase) =>
        config.persistence.driver === 'postgres' ? new PgUnitOfWork(database) : new InMemoryUnitOfWork(),
      inject: [APP_CONFIG, PG_DATABASE],
    },
    {
      provide: REDIS_CLIENT,
      useFactory: (config: AppConfig) => new Redis(config.redis.url, { lazyConnect: true, maxRetriesPerRequest: 2 }),
      inject: [APP_CONFIG],
    },
    {
      provide: CACHE_STORE,
      useFactory: (config: AppConfig, redis: Redis, clock: Clock) =>
        config.cache.driver === 'redis' ? new RedisCacheStore(redis) : new InMemoryCacheStore(clock),
      inject: [APP_CONFIG, REDIS_CLIENT, CLOCK],
    },
  ],
  exports: [CLOCK, ID_GENERATOR, RANDOM_SOURCE, APP_LOGGER, EVENT_BUS, GAME_CALENDAR, PG_DATABASE, UNIT_OF_WORK, REDIS_CLIENT, CACHE_STORE],
})
export class SharedKernelModule implements OnApplicationShutdown {
  constructor(
    @Inject(PG_DATABASE) private readonly database: PgDatabase,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async onApplicationShutdown(): Promise<void> {
    this.redis.disconnect();
    await this.database.close();
  }
}

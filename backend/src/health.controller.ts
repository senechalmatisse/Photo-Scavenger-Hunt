import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type Redis from 'ioredis';
import { AppConfig } from './config/app-config';
import { Public } from './modules/identity/presentation/security';
import { PgDatabase } from './shared/infrastructure/persistence/pg-database';
import { APP_CONFIG, PG_DATABASE, REDIS_CLIENT } from './shared/infrastructure/tokens';

/** Sondes pour Docker / Traefik : vivacité (le processus répond) et disponibilité (dépendances joignables). */
@ApiTags('Supervision')
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PG_DATABASE) private readonly database: PgDatabase,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  @Get()
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<Record<string, string>> {
    const checks: Record<string, string> = { photos: this.config.photos.provider };
    try {
      if (this.config.persistence.driver === 'postgres') {
        await this.database.query('SELECT 1 AS ok');
        checks.database = 'ok';
      }
      if (this.config.cache.driver === 'redis' || this.config.leaderboards.driver === 'redis') {
        await this.redis.ping();
        checks.redis = 'ok';
      }
    } catch (error) {
      throw new ServiceUnavailableException({ ...checks, error: error instanceof Error ? error.message : 'indisponible' });
    }
    return { status: 'ok', ...checks };
  }
}

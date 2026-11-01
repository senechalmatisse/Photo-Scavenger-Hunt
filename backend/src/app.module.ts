import { DynamicModule, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppConfig } from './config/app-config';
import { ConfigModule } from './config/config.module';
import { HealthController } from './health.controller';
import { ChallengesModule } from './modules/challenges/challenges.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { GameplayModule } from './modules/gameplay/gameplay.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard, RolesGuard } from './modules/identity/presentation/security';
import { LeaderboardsModule } from './modules/leaderboards/leaderboards.module';
import { PhotosModule } from './modules/photos/photos.module';
import { ProgressionModule } from './modules/progression/progression.module';
import { AppLogger } from './shared/application/ports';
import { DomainExceptionFilter } from './shared/infrastructure/http/domain-exception.filter';
import { SharedKernelModule } from './shared/infrastructure/shared-kernel.module';
import { APP_LOGGER } from './shared/infrastructure/tokens';

/**
 * Racine de composition : assemble les modules métier (monolithe modulaire).
 * L'ordre des gardes globales compte : limitation de débit → authentification → rôles.
 */
@Module({})
export class AppModule {
  static forRoot(config: AppConfig): DynamicModule {
    return {
      module: AppModule,
      imports: [
        ConfigModule.forRoot(config),
        SharedKernelModule,
        ThrottlerModule.forRoot([{ ttl: 60_000, limit: 240 }]),
        IdentityModule,
        PhotosModule,
        ChallengesModule,
        GameplayModule,
        ProgressionModule,
        LeaderboardsModule,
        DashboardModule,
      ],
      controllers: [HealthController],
      providers: [
        { provide: APP_GUARD, useClass: ThrottlerGuard },
        { provide: APP_GUARD, useExisting: JwtAuthGuard },
        { provide: APP_GUARD, useExisting: RolesGuard },
        { provide: APP_FILTER, useFactory: (logger: AppLogger) => new DomainExceptionFilter(logger), inject: [APP_LOGGER] },
      ],
    };
  }
}

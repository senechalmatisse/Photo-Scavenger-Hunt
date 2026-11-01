import { Module } from '@nestjs/common';
import { AppLogger } from '../../shared/application/ports';
import { Clock } from '../../shared/domain/ports';
import { useCase } from '../../shared/infrastructure/providers';
import { APP_LOGGER, CLOCK } from '../../shared/infrastructure/tokens';
import { BrowseCatalog, GetDailyChallenge } from '../challenges/public-api';
import { ChallengesModule } from '../challenges/challenges.module';
import { GetDailySessionStatus, ListPlayerHistory } from '../gameplay/public-api';
import { GameplayModule } from '../gameplay/gameplay.module';
import { GetLeaderboard } from '../leaderboards/public-api';
import { LeaderboardsModule } from '../leaderboards/leaderboards.module';
import { GetPlayerProgress } from '../progression/public-api';
import { ProgressionModule } from '../progression/progression.module';
import { GetDashboard } from './application/get-dashboard';
import { DashboardController } from './presentation/dashboard.controller';

@Module({
  imports: [ChallengesModule, GameplayModule, ProgressionModule, LeaderboardsModule],
  controllers: [DashboardController],
  providers: [
    useCase(
      GetDashboard,
      (
        daily: GetDailyChallenge,
        dailyStatus: GetDailySessionStatus,
        progress: GetPlayerProgress,
        history: ListPlayerHistory,
        catalog: BrowseCatalog,
        leaderboard: GetLeaderboard,
        clock: Clock,
        logger: AppLogger,
      ) => new GetDashboard(daily, dailyStatus, progress, history, catalog, leaderboard, clock, logger),
      [GetDailyChallenge, GetDailySessionStatus, GetPlayerProgress, ListPlayerHistory, BrowseCatalog, GetLeaderboard, CLOCK, APP_LOGGER],
    ),
  ],
})
export class DashboardModule {}

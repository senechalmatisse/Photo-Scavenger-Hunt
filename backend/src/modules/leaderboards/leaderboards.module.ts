import { Inject, Module, OnModuleInit } from '@nestjs/common';
import type Redis from 'ioredis';
import { AppConfig } from '../../config/app-config';
import { EventBus } from '../../shared/application/ports';
import { GameCalendar } from '../../shared/domain/game-calendar';
import { Clock } from '../../shared/domain/ports';
import { useCase } from '../../shared/infrastructure/providers';
import { APP_CONFIG, CLOCK, EVENT_BUS, GAME_CALENDAR, REDIS_CLIENT } from '../../shared/infrastructure/tokens';
import { GameSessionFinished } from '../gameplay/public-api';
import { IdentityModule } from '../identity/identity.module';
import { PLAYER_DIRECTORY } from '../identity/identity.tokens';
import { PlayerDirectory, UserDeleted } from '../identity/public-api';
import { ErasePlayerScores, GetLeaderboard, RecordLeaderboardPoints } from './application/leaderboard-use-cases';
import { LeaderboardStore } from './domain/leaderboard';
import { InMemoryLeaderboardStore, RedisLeaderboardStore } from './infrastructure/leaderboard-stores';
import { LeaderboardsController } from './presentation/leaderboards.controller';

const LEADERBOARD_STORE = Symbol('LeaderboardStore');

@Module({
  imports: [IdentityModule],
  controllers: [LeaderboardsController],
  providers: [
    {
      provide: LEADERBOARD_STORE,
      useFactory: (config: AppConfig, redis: Redis): LeaderboardStore =>
        config.leaderboards.driver === 'redis' ? new RedisLeaderboardStore(redis) : new InMemoryLeaderboardStore(),
      inject: [APP_CONFIG, REDIS_CLIENT],
    },
    useCase(RecordLeaderboardPoints, (store: LeaderboardStore) => new RecordLeaderboardPoints(store), [LEADERBOARD_STORE]),
    useCase(
      GetLeaderboard,
      (store: LeaderboardStore, players: PlayerDirectory, calendar: GameCalendar, clock: Clock) => new GetLeaderboard(store, players, calendar, clock),
      [LEADERBOARD_STORE, PLAYER_DIRECTORY, GAME_CALENDAR, CLOCK],
    ),
    useCase(ErasePlayerScores, (store: LeaderboardStore) => new ErasePlayerScores(store), [LEADERBOARD_STORE]),
  ],
  exports: [GetLeaderboard],
})
export class LeaderboardsModule implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly record: RecordLeaderboardPoints,
    private readonly erase: ErasePlayerScores,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe<GameSessionFinished>(GameSessionFinished.TYPE, 'leaderboards', (event) => this.record.execute(event.payload));
    this.bus.subscribe<UserDeleted>(UserDeleted.TYPE, 'leaderboards', (event) => this.erase.execute(event.userId));
  }
}

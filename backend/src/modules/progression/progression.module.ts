import { Inject, Module, OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { EventBus, UnitOfWork } from '../../shared/application/ports';
import { GameCalendar } from '../../shared/domain/game-calendar';
import { Clock } from '../../shared/domain/ports';
import { byPersistenceDriver, useCase } from '../../shared/infrastructure/providers';
import { APP_CONFIG, CLOCK, EVENT_BUS, GAME_CALENDAR, UNIT_OF_WORK } from '../../shared/infrastructure/tokens';
import { GameSessionFinished } from '../gameplay/public-api';
import { UserDeleted } from '../identity/public-api';
import { ErasePlayerProgress, GetPlayerProgress, RecordSessionOutcome } from './application/progression-use-cases';
import { AchievementCatalog } from './domain/achievements';
import { QuadraticLevelCurve } from './domain/level-curve';
import { ProgressionRules } from './domain/player-progress';
import { PlayerProgressRepository, RewardLedger } from './domain/progression.repository';
import { InMemoryPlayerProgressRepository, InMemoryRewardLedger } from './infrastructure/in-memory-progression.repositories';
import { PgPlayerProgressRepository, PgRewardLedger } from './infrastructure/pg-progression.repositories';
import { ProgressController } from './presentation/progress.controller';

const PROGRESS_REPOSITORY = Symbol('PlayerProgressRepository');
const REWARD_LEDGER = Symbol('RewardLedger');
const PROGRESSION_RULES = Symbol('ProgressionRules');

@Module({
  controllers: [ProgressController],
  providers: [
    byPersistenceDriver<PlayerProgressRepository>(PROGRESS_REPOSITORY, {
      postgres: (database) => new PgPlayerProgressRepository(database),
      memory: () => new InMemoryPlayerProgressRepository(),
    }),
    byPersistenceDriver<RewardLedger>(REWARD_LEDGER, {
      postgres: (database) => new PgRewardLedger(database),
      memory: () => new InMemoryRewardLedger(),
    }),
    useCase(
      PROGRESSION_RULES,
      (config: AppConfig): ProgressionRules => ({
        levelCurve: new QuadraticLevelCurve(config.game.levelStepXp),
        achievements: new AchievementCatalog(),
        streak: { everyDays: config.game.streakEveryDays, bonusXp: config.game.streakBonusXp },
      }),
      [APP_CONFIG],
    ),
    useCase(
      RecordSessionOutcome,
      (repo: PlayerProgressRepository, ledger: RewardLedger, rules: ProgressionRules, uow: UnitOfWork, bus: EventBus) =>
        new RecordSessionOutcome(repo, ledger, rules, uow, bus),
      [PROGRESS_REPOSITORY, REWARD_LEDGER, PROGRESSION_RULES, UNIT_OF_WORK, EVENT_BUS],
    ),
    useCase(
      GetPlayerProgress,
      (repo: PlayerProgressRepository, rules: ProgressionRules, calendar: GameCalendar, clock: Clock) =>
        new GetPlayerProgress(repo, rules, calendar, clock),
      [PROGRESS_REPOSITORY, PROGRESSION_RULES, GAME_CALENDAR, CLOCK],
    ),
    useCase(
      ErasePlayerProgress,
      (repo: PlayerProgressRepository, ledger: RewardLedger, uow: UnitOfWork) => new ErasePlayerProgress(repo, ledger, uow),
      [PROGRESS_REPOSITORY, REWARD_LEDGER, UNIT_OF_WORK],
    ),
  ],
  exports: [GetPlayerProgress],
})
export class ProgressionModule implements OnModuleInit {
  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly record: RecordSessionOutcome,
    private readonly erase: ErasePlayerProgress,
  ) {}

  /** Réagit aux faits des autres modules sans qu'ils connaissent la progression (Observer). */
  onModuleInit(): void {
    this.bus.subscribe<GameSessionFinished>(GameSessionFinished.TYPE, 'progression', async (event) => {
      await this.record.execute(event.payload, event.occurredAt);
    });
    this.bus.subscribe<UserDeleted>(UserDeleted.TYPE, 'progression', (event) => this.erase.execute(event.userId));
  }
}

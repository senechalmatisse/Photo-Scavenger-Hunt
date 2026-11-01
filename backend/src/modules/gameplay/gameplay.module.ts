import { Inject, Module, OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { AppLogger, EventBus } from '../../shared/application/ports';
import { GameCalendar } from '../../shared/domain/game-calendar';
import { Clock, IdGenerator } from '../../shared/domain/ports';
import { IntervalJob } from '../../shared/infrastructure/interval-job';
import { byPersistenceDriver, useCase } from '../../shared/infrastructure/providers';
import { APP_CONFIG, APP_LOGGER, CLOCK, EVENT_BUS, GAME_CALENDAR, ID_GENERATOR } from '../../shared/infrastructure/tokens';
import { ChallengeCatalog, ValidationRuleFactory } from '../challenges/public-api';
import { ChallengesModule } from '../challenges/challenges.module';
import { UserDeleted } from '../identity/public-api';
import { GetPhoto } from '../photos/public-api';
import { PhotosModule } from '../photos/photos.module';
import { AnswerJudge, ChallengeGateway, PhotoFactsGateway } from './application/ports';
import { AbandonSession, GameplayCommandDeps, PauseSession, ResumeSession, SubmitAnswer, UseHint } from './application/session-commands';
import {
  ErasePlayerSessions,
  ExpireOverdueSessions,
  GetChallengeStats,
  GetDailySessionStatus,
  GetGameSession,
  ListPlayerHistory,
} from './application/session-queries';
import { StartGameSession } from './application/start-game-session';
import { GameModeRegistry } from './domain/game-mode';
import { GameSessionRepository } from './domain/game-session.repository';
import { RewardRules, ScoringPolicy, XpPolicy } from './domain/scoring';
import { ChallengeCatalogGateway, PhotoModuleFactsGateway, RuleBasedAnswerJudge } from './infrastructure/gateways';
import { InMemoryGameSessionRepository } from './infrastructure/in-memory-game-session.repository';
import { PgGameSessionRepository } from './infrastructure/pg-game-session.repository';
import { ChallengeStatsController, GameSessionsController } from './presentation/game-sessions.controller';

const SESSION_REPOSITORY = Symbol('GameSessionRepository');
const CHALLENGE_GATEWAY = Symbol('ChallengeGateway');
const PHOTO_FACTS = Symbol('PhotoFactsGateway');
const ANSWER_JUDGE = Symbol('AnswerJudge');
const REWARD_RULES = Symbol('RewardRules');
const COMMAND_DEPS = Symbol('GameplayCommandDeps');

@Module({
  imports: [ChallengesModule, PhotosModule],
  controllers: [GameSessionsController, ChallengeStatsController],
  providers: [
    byPersistenceDriver<GameSessionRepository>(SESSION_REPOSITORY, {
      postgres: (database) => new PgGameSessionRepository(database),
      memory: () => new InMemoryGameSessionRepository(),
    }),
    useCase(CHALLENGE_GATEWAY, (catalog: ChallengeCatalog) => new ChallengeCatalogGateway(catalog), [ChallengeCatalog]),
    useCase(PHOTO_FACTS, (getPhoto: GetPhoto) => new PhotoModuleFactsGateway(getPhoto), [GetPhoto]),
    useCase(ANSWER_JUDGE, (rules: ValidationRuleFactory) => new RuleBasedAnswerJudge(rules), [ValidationRuleFactory]),
    useCase(
      REWARD_RULES,
      (config: AppConfig): RewardRules => ({ scoring: ScoringPolicy.standard(config.game.scoring), xp: new XpPolicy() }),
      [APP_CONFIG],
    ),
    { provide: GameModeRegistry, useFactory: () => GameModeRegistry.standard() },
    useCase(
      COMMAND_DEPS,
      (sessions: GameSessionRepository, challenges: ChallengeGateway, rules: RewardRules, clock: Clock, bus: EventBus): GameplayCommandDeps => ({
        sessions,
        challenges,
        rules,
        clock,
        bus,
      }),
      [SESSION_REPOSITORY, CHALLENGE_GATEWAY, REWARD_RULES, CLOCK, EVENT_BUS],
    ),
    useCase(
      StartGameSession,
      (
        sessions: GameSessionRepository,
        challenges: ChallengeGateway,
        modes: GameModeRegistry,
        rules: RewardRules,
        calendar: GameCalendar,
        config: AppConfig,
        ids: IdGenerator,
        clock: Clock,
        bus: EventBus,
      ) => new StartGameSession(sessions, challenges, modes, rules, calendar, { participationXp: config.game.participationXp }, ids, clock, bus),
      [SESSION_REPOSITORY, CHALLENGE_GATEWAY, GameModeRegistry, REWARD_RULES, GAME_CALENDAR, APP_CONFIG, ID_GENERATOR, CLOCK, EVENT_BUS],
    ),
    useCase(UseHint, (deps: GameplayCommandDeps) => new UseHint(deps), [COMMAND_DEPS]),
    useCase(
      SubmitAnswer,
      (deps: GameplayCommandDeps, photos: PhotoFactsGateway, judge: AnswerJudge) => new SubmitAnswer(deps, photos, judge),
      [COMMAND_DEPS, PHOTO_FACTS, ANSWER_JUDGE],
    ),
    useCase(PauseSession, (deps: GameplayCommandDeps) => new PauseSession(deps), [COMMAND_DEPS]),
    useCase(ResumeSession, (deps: GameplayCommandDeps) => new ResumeSession(deps), [COMMAND_DEPS]),
    useCase(AbandonSession, (deps: GameplayCommandDeps) => new AbandonSession(deps), [COMMAND_DEPS]),
    useCase(
      GetGameSession,
      (sessions: GameSessionRepository, challenges: ChallengeGateway, rules: RewardRules, clock: Clock, bus: EventBus) =>
        new GetGameSession(sessions, challenges, rules, clock, bus),
      [SESSION_REPOSITORY, CHALLENGE_GATEWAY, REWARD_RULES, CLOCK, EVENT_BUS],
    ),
    useCase(ListPlayerHistory, (sessions: GameSessionRepository) => new ListPlayerHistory(sessions), [SESSION_REPOSITORY]),
    useCase(GetDailySessionStatus, (sessions: GameSessionRepository) => new GetDailySessionStatus(sessions), [SESSION_REPOSITORY]),
    useCase(GetChallengeStats, (sessions: GameSessionRepository) => new GetChallengeStats(sessions), [SESSION_REPOSITORY]),
    useCase(
      ExpireOverdueSessions,
      (sessions: GameSessionRepository, rules: RewardRules, clock: Clock, bus: EventBus, logger: AppLogger) =>
        new ExpireOverdueSessions(sessions, rules, clock, bus, logger),
      [SESSION_REPOSITORY, REWARD_RULES, CLOCK, EVENT_BUS, APP_LOGGER],
    ),
    useCase(ErasePlayerSessions, (sessions: GameSessionRepository) => new ErasePlayerSessions(sessions), [SESSION_REPOSITORY]),
  ],
  exports: [ListPlayerHistory, GetDailySessionStatus],
})
export class GameplayModule implements OnModuleInit, OnApplicationShutdown {
  private readonly expiryJob: IntervalJob;

  constructor(
    @Inject(EVENT_BUS) private readonly bus: EventBus,
    private readonly erase: ErasePlayerSessions,
    expire: ExpireOverdueSessions,
    @Inject(APP_CONFIG) config: AppConfig,
    @Inject(APP_LOGGER) logger: AppLogger,
  ) {
    this.expiryJob = new IntervalJob('session-expiry', config.game.expiryCheckIntervalMs, () => expire.execute(), logger);
  }

  onModuleInit(): void {
    this.bus.subscribe<UserDeleted>(UserDeleted.TYPE, 'gameplay', (event) => this.erase.execute(event.userId));
    this.expiryJob.start();
  }

  onApplicationShutdown(): void {
    this.expiryJob.stop();
  }
}

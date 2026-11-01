import { AppLogger } from '../shared/application/ports';
import { DomainEvent } from '../shared/domain/aggregate-root';
import { GameCalendar } from '../shared/domain/game-calendar';
import { IdGenerator, RandomSource } from '../shared/domain/ports';
import { InProcessEventBus } from '../shared/infrastructure/in-process-event-bus';
import { InMemoryUnitOfWork } from '../shared/infrastructure/persistence/in-memory-store';
import { FixedClock } from '../shared/infrastructure/system';
import { ChallengeDefinitionBuilder } from '../modules/challenges/application/challenge-definition-builder';
import { CreateChallenge, DisableChallenge, PublishChallenge, UpdateChallenge } from '../modules/challenges/application/challenge-commands';
import { ChallengeCatalog } from '../modules/challenges/application/challenge-catalog';
import { BrowseCatalog, GetChallengeDetails, PreviewValidation } from '../modules/challenges/application/challenge-queries';
import { GetDailyChallenge, ScheduleDailyChallenge } from '../modules/challenges/application/daily-challenge';
import { VerifyReferencePhotos } from '../modules/challenges/application/verify-reference-photos';
import { ChallengeRepository, DailyChallengeSchedule, DeterministicDailyPicker } from '../modules/challenges/domain/challenge.repository';
import { ValidationRuleFactory } from '../modules/challenges/domain/validation/validation-rule-factory';
import { InMemoryChallengeRepository } from '../modules/challenges/infrastructure/in-memory-challenge.repository';
import { DemoChallengeSeeder } from '../modules/challenges/infrastructure/demo-seed';
import { PhotoModuleReferenceProvider } from '../modules/challenges/infrastructure/reference-photo.adapter';
import { GetDashboard } from '../modules/dashboard/application/get-dashboard';
import { StartGameSession } from '../modules/gameplay/application/start-game-session';
import { AbandonSession, PauseSession, ResumeSession, SubmitAnswer, UseHint } from '../modules/gameplay/application/session-commands';
import {
  ErasePlayerSessions,
  ExpireOverdueSessions,
  GetChallengeStats,
  GetDailySessionStatus,
  GetGameSession,
  ListPlayerHistory,
} from '../modules/gameplay/application/session-queries';
import { GameModeRegistry } from '../modules/gameplay/domain/game-mode';
import { GameSessionRepository } from '../modules/gameplay/domain/game-session.repository';
import { ScoringPolicy, XpPolicy } from '../modules/gameplay/domain/scoring';
import { GameSessionFinished } from '../modules/gameplay/domain/session-events';
import { InMemoryGameSessionRepository } from '../modules/gameplay/infrastructure/in-memory-game-session.repository';
import { ChallengeCatalogGateway, PhotoModuleFactsGateway, RuleBasedAnswerJudge } from '../modules/gameplay/infrastructure/gateways';
import {
  DeleteAccount,
  GetProfile,
  Login,
  RegisterUser,
  StartGuestSession,
  UpdateProfile,
} from '../modules/identity/application/identity-use-cases';
import { UserDirectory } from '../modules/identity/application/player-directory';
import { IssuedToken, PasswordHasher, TokenClaims, TokenIssuer, UserRepository } from '../modules/identity/domain/ports';
import { UserDeleted } from '../modules/identity/domain/user';
import { InMemoryUserRepository } from '../modules/identity/infrastructure/in-memory-user.repository';
import { ErasePlayerScores, GetLeaderboard, RecordLeaderboardPoints } from '../modules/leaderboards/application/leaderboard-use-cases';
import { LeaderboardStore } from '../modules/leaderboards/domain/leaderboard';
import { InMemoryLeaderboardStore } from '../modules/leaderboards/infrastructure/leaderboard-stores';
import { GetPhoto, SearchPhotos } from '../modules/photos/application/photo-use-cases';
import { LicensePolicy } from '../modules/photos/domain/license';
import { FixturePhotoCatalog } from '../modules/photos/infrastructure/fixtures/fixture-photo-catalog';
import { ErasePlayerProgress, GetPlayerProgress, RecordSessionOutcome } from '../modules/progression/application/progression-use-cases';
import { AchievementCatalog } from '../modules/progression/domain/achievements';
import { QuadraticLevelCurve } from '../modules/progression/domain/level-curve';
import { PlayerProgressRepository, RewardLedger } from '../modules/progression/domain/progression.repository';
import { InMemoryPlayerProgressRepository, InMemoryRewardLedger } from '../modules/progression/infrastructure/in-memory-progression.repositories';

/** Générateur d'identifiants prévisible pour les tests. */
export class SequentialIds implements IdGenerator {
  private counter = 0;

  next(): string {
    this.counter += 1;
    return `00000000-0000-4000-8000-${String(this.counter).padStart(12, '0')}`;
  }
}

export class FakePasswordHasher implements PasswordHasher {
  async hash(plain: string): Promise<string> {
    return `hashed:${plain}`;
  }

  async verify(plain: string, hash: string): Promise<boolean> {
    return hash === `hashed:${plain}`;
  }
}

export class FakeTokenIssuer implements TokenIssuer {
  async issue(claims: TokenClaims): Promise<IssuedToken> {
    return { accessToken: Buffer.from(JSON.stringify(claims)).toString('base64url'), expiresIn: 3600 };
  }

  async verify(token: string): Promise<TokenClaims> {
    return JSON.parse(Buffer.from(token, 'base64url').toString('utf8')) as TokenClaims;
  }
}

export class SilentLogger implements AppLogger {
  readonly entries: { level: string; message: string }[] = [];

  info(message: string): void {
    this.entries.push({ level: 'info', message });
  }

  warn(message: string): void {
    this.entries.push({ level: 'warn', message });
  }

  error(message: string): void {
    this.entries.push({ level: 'error', message });
  }
}

/** Dépôts remplaçables (ex. adaptateurs PostgreSQL pour des tests d'intégration). */
export interface RepositoryOverrides {
  readonly users?: UserRepository;
  readonly challenges?: ChallengeRepository & DailyChallengeSchedule;
  readonly sessions?: GameSessionRepository;
  readonly progress?: PlayerProgressRepository;
  readonly ledger?: RewardLedger;
  readonly leaderboardStore?: LeaderboardStore;
}

/**
 * Racine de composition sans framework, en mémoire par défaut.
 * Elle câble exactement les mêmes cas d'usage que les modules Nest : les tests de scénario
 * exercent ainsi la vraie logique applicative, sans base de données ni HTTP.
 */
export function createInMemoryApp(start = new Date('2026-11-02T09:00:00.000Z'), overrides: RepositoryOverrides = {}) {
  const clock = new FixedClock(start);
  const ids = new SequentialIds();
  const random: RandomSource = { nextInt: () => 42 };
  const logger = new SilentLogger();
  const bus = new InProcessEventBus(logger);
  const uow = new InMemoryUnitOfWork();
  const calendar = new GameCalendar('Europe/Paris');
  const published: DomainEvent[] = [];
  const recordingBus = {
    publish: async (events: readonly DomainEvent[]) => {
      published.push(...events);
      await bus.publish(events);
    },
    subscribe: bus.subscribe.bind(bus),
  };

  // Identité
  const users = overrides.users ?? new InMemoryUserRepository();
  const hasher = new FakePasswordHasher();
  const tokens = new FakeTokenIssuer();
  const identity = {
    register: new RegisterUser(users, hasher, tokens, ids, clock, recordingBus),
    login: new Login(users, hasher, tokens, clock),
    guest: new StartGuestSession(users, tokens, ids, random, clock),
    profile: new GetProfile(users),
    updateProfile: new UpdateProfile(users, clock),
    deleteAccount: new DeleteAccount(users, clock, recordingBus),
  };

  // Photos
  const catalog = new FixturePhotoCatalog();
  const licenses = LicensePolicy.forProfile('non-commercial');
  const getPhoto = new GetPhoto(catalog, licenses);
  const photos = { search: new SearchPhotos(catalog, licenses), get: getPhoto };

  // Défis
  const rules = ValidationRuleFactory.withDefaults();
  const challengeRepo = overrides.challenges ?? new InMemoryChallengeRepository(rules);
  const referencePhotos = new PhotoModuleReferenceProvider(getPhoto);
  const builder = new ChallengeDefinitionBuilder(rules, referencePhotos);
  const daily = new GetDailyChallenge(challengeRepo, challengeRepo, new DeterministicDailyPicker(), calendar, clock);
  const challenges = {
    create: new CreateChallenge(challengeRepo, builder, ids, clock),
    update: new UpdateChallenge(challengeRepo, builder, clock),
    publish: new PublishChallenge(challengeRepo, referencePhotos, recordingBus, clock),
    disable: new DisableChallenge(challengeRepo, recordingBus, clock),
    browse: new BrowseCatalog(challengeRepo, clock),
    details: new GetChallengeDetails(challengeRepo, clock),
    preview: new PreviewValidation(rules, referencePhotos),
    daily,
    schedule: new ScheduleDailyChallenge(challengeRepo, challengeRepo, calendar, clock),
    verifyPhotos: new VerifyReferencePhotos(challengeRepo, referencePhotos, recordingBus, clock, logger),
    catalogFacade: new ChallengeCatalog(challengeRepo, daily, clock),
  };
  const seeder = new DemoChallengeSeeder(challengeRepo, challenges.create, challenges.publish, logger);

  // Gameplay
  const sessions = overrides.sessions ?? new InMemoryGameSessionRepository();
  const rewardRules = { scoring: ScoringPolicy.standard(), xp: new XpPolicy() };
  const gateway = new ChallengeCatalogGateway(challenges.catalogFacade);
  const commandDeps = { sessions, challenges: gateway, rules: rewardRules, clock, bus: recordingBus };
  const gameplay = {
    start: new StartGameSession(sessions, gateway, GameModeRegistry.standard(), rewardRules, calendar, { participationXp: 10 }, ids, clock, recordingBus),
    hint: new UseHint(commandDeps),
    submit: new SubmitAnswer(commandDeps, new PhotoModuleFactsGateway(getPhoto), new RuleBasedAnswerJudge(rules)),
    pause: new PauseSession(commandDeps),
    resume: new ResumeSession(commandDeps),
    abandon: new AbandonSession(commandDeps),
    get: new GetGameSession(sessions, gateway, rewardRules, clock, recordingBus),
    history: new ListPlayerHistory(sessions),
    dailyStatus: new GetDailySessionStatus(sessions),
    stats: new GetChallengeStats(sessions),
    expire: new ExpireOverdueSessions(sessions, rewardRules, clock, recordingBus, logger),
  };

  // Progression
  const progressRepo = overrides.progress ?? new InMemoryPlayerProgressRepository();
  const ledger = overrides.ledger ?? new InMemoryRewardLedger();
  const progressionRules = {
    levelCurve: new QuadraticLevelCurve(50),
    achievements: new AchievementCatalog(),
    streak: { everyDays: 7, bonusXp: 200 },
  };
  const progression = {
    record: new RecordSessionOutcome(progressRepo, ledger, progressionRules, uow, recordingBus),
    get: new GetPlayerProgress(progressRepo, progressionRules, calendar, clock),
  };

  // Classements
  const leaderboardStore = overrides.leaderboardStore ?? new InMemoryLeaderboardStore();
  const leaderboards = {
    record: new RecordLeaderboardPoints(leaderboardStore),
    get: new GetLeaderboard(leaderboardStore, new UserDirectory(users), calendar, clock),
  };

  const dashboard = new GetDashboard(
    challenges.daily,
    gameplay.dailyStatus,
    progression.get,
    gameplay.history,
    challenges.browse,
    leaderboards.get,
    clock,
    logger,
  );

  // Abonnements (identiques à ceux des modules Nest)
  bus.subscribe<GameSessionFinished>(GameSessionFinished.TYPE, 'progression', async (event) => {
    await progression.record.execute(event.payload, event.occurredAt);
  });
  bus.subscribe<GameSessionFinished>(GameSessionFinished.TYPE, 'leaderboards', async (event) => {
    await leaderboards.record.execute(event.payload);
  });
  bus.subscribe<UserDeleted>(UserDeleted.TYPE, 'gameplay', (event) => new ErasePlayerSessions(sessions).execute(event.userId));
  bus.subscribe<UserDeleted>(UserDeleted.TYPE, 'progression', (event) =>
    new ErasePlayerProgress(progressRepo, ledger, uow).execute(event.userId),
  );
  bus.subscribe<UserDeleted>(UserDeleted.TYPE, 'leaderboards', (event) => new ErasePlayerScores(leaderboardStore).execute(event.userId));

  return {
    clock,
    calendar,
    logger,
    published,
    identity,
    photos,
    challenges,
    seeder,
    gameplay,
    progression,
    leaderboards,
    dashboard,
    repositories: { users, challenges: challengeRepo, sessions, progress: progressRepo, ledger, leaderboardStore },
  };
}

export type InMemoryApp = ReturnType<typeof createInMemoryApp>;

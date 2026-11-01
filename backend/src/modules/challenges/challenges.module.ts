import { Inject, Module, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { AppLogger, EventBus } from '../../shared/application/ports';
import { GameCalendar } from '../../shared/domain/game-calendar';
import { Clock, IdGenerator } from '../../shared/domain/ports';
import { IntervalJob } from '../../shared/infrastructure/interval-job';
import { byPersistenceDriver, useCase } from '../../shared/infrastructure/providers';
import { APP_CONFIG, APP_LOGGER, CLOCK, EVENT_BUS, GAME_CALENDAR, ID_GENERATOR } from '../../shared/infrastructure/tokens';
import { GetPhoto } from '../photos/public-api';
import { PhotosModule } from '../photos/photos.module';
import { CreateChallenge, DisableChallenge, PublishChallenge, UpdateChallenge } from './application/challenge-commands';
import { ChallengeCatalog } from './application/challenge-catalog';
import { ChallengeDefinitionBuilder } from './application/challenge-definition-builder';
import {
  BrowseCatalog,
  GetChallengeDetails,
  GetChallengeForAdmin,
  ListChallengesForAdmin,
  PreviewValidation,
} from './application/challenge-queries';
import { GetDailyChallenge, ScheduleDailyChallenge } from './application/daily-challenge';
import { ReferencePhotoProvider } from './application/ports';
import { VerifyReferencePhotos } from './application/verify-reference-photos';
import { ChallengeRepository, DailyChallengePicker, DailyChallengeSchedule, DeterministicDailyPicker } from './domain/challenge.repository';
import { ValidationRuleFactory } from './domain/validation/validation-rule-factory';
import { DemoChallengeSeeder } from './infrastructure/demo-seed';
import { InMemoryChallengeRepository } from './infrastructure/in-memory-challenge.repository';
import { PgChallengeRepository } from './infrastructure/pg-challenge.repository';
import { PhotoModuleReferenceProvider } from './infrastructure/reference-photo.adapter';
import { AdminChallengesController, ChallengesController } from './presentation/challenges.controllers';

const CHALLENGE_REPOSITORY = Symbol('ChallengeRepository');
const DAILY_SCHEDULE = Symbol('DailyChallengeSchedule');
const DAILY_PICKER = Symbol('DailyChallengePicker');
const REFERENCE_PHOTOS = Symbol('ReferencePhotoProvider');

type Repository = ChallengeRepository & DailyChallengeSchedule;

@Module({
  imports: [PhotosModule],
  controllers: [ChallengesController, AdminChallengesController],
  providers: [
    { provide: ValidationRuleFactory, useFactory: () => ValidationRuleFactory.withDefaults() },
    byPersistenceDriver<Repository, [ValidationRuleFactory]>(
      CHALLENGE_REPOSITORY,
      {
        postgres: (database, rules) => new PgChallengeRepository(database, rules),
        memory: (rules) => new InMemoryChallengeRepository(rules),
      },
      [ValidationRuleFactory],
    ),
    { provide: DAILY_SCHEDULE, useExisting: CHALLENGE_REPOSITORY },
    { provide: DAILY_PICKER, useClass: DeterministicDailyPicker },
    useCase(REFERENCE_PHOTOS, (getPhoto: GetPhoto) => new PhotoModuleReferenceProvider(getPhoto), [GetPhoto]),
    useCase(
      ChallengeDefinitionBuilder,
      (rules: ValidationRuleFactory, photos: ReferencePhotoProvider) => new ChallengeDefinitionBuilder(rules, photos),
      [ValidationRuleFactory, REFERENCE_PHOTOS],
    ),
    useCase(
      CreateChallenge,
      (repo: ChallengeRepository, builder: ChallengeDefinitionBuilder, ids: IdGenerator, clock: Clock) => new CreateChallenge(repo, builder, ids, clock),
      [CHALLENGE_REPOSITORY, ChallengeDefinitionBuilder, ID_GENERATOR, CLOCK],
    ),
    useCase(
      UpdateChallenge,
      (repo: ChallengeRepository, builder: ChallengeDefinitionBuilder, clock: Clock) => new UpdateChallenge(repo, builder, clock),
      [CHALLENGE_REPOSITORY, ChallengeDefinitionBuilder, CLOCK],
    ),
    useCase(
      PublishChallenge,
      (repo: ChallengeRepository, photos: ReferencePhotoProvider, bus: EventBus, clock: Clock) => new PublishChallenge(repo, photos, bus, clock),
      [CHALLENGE_REPOSITORY, REFERENCE_PHOTOS, EVENT_BUS, CLOCK],
    ),
    useCase(
      DisableChallenge,
      (repo: ChallengeRepository, bus: EventBus, clock: Clock) => new DisableChallenge(repo, bus, clock),
      [CHALLENGE_REPOSITORY, EVENT_BUS, CLOCK],
    ),
    useCase(BrowseCatalog, (repo: ChallengeRepository, clock: Clock) => new BrowseCatalog(repo, clock), [CHALLENGE_REPOSITORY, CLOCK]),
    useCase(GetChallengeDetails, (repo: ChallengeRepository, clock: Clock) => new GetChallengeDetails(repo, clock), [CHALLENGE_REPOSITORY, CLOCK]),
    useCase(ListChallengesForAdmin, (repo: ChallengeRepository, clock: Clock) => new ListChallengesForAdmin(repo, clock), [CHALLENGE_REPOSITORY, CLOCK]),
    useCase(GetChallengeForAdmin, (repo: ChallengeRepository, clock: Clock) => new GetChallengeForAdmin(repo, clock), [CHALLENGE_REPOSITORY, CLOCK]),
    useCase(
      PreviewValidation,
      (rules: ValidationRuleFactory, photos: ReferencePhotoProvider) => new PreviewValidation(rules, photos),
      [ValidationRuleFactory, REFERENCE_PHOTOS],
    ),
    useCase(
      GetDailyChallenge,
      (repo: ChallengeRepository, schedule: DailyChallengeSchedule, picker: DailyChallengePicker, calendar: GameCalendar, clock: Clock) =>
        new GetDailyChallenge(repo, schedule, picker, calendar, clock),
      [CHALLENGE_REPOSITORY, DAILY_SCHEDULE, DAILY_PICKER, GAME_CALENDAR, CLOCK],
    ),
    useCase(
      ScheduleDailyChallenge,
      (repo: ChallengeRepository, schedule: DailyChallengeSchedule, calendar: GameCalendar, clock: Clock) =>
        new ScheduleDailyChallenge(repo, schedule, calendar, clock),
      [CHALLENGE_REPOSITORY, DAILY_SCHEDULE, GAME_CALENDAR, CLOCK],
    ),
    useCase(
      VerifyReferencePhotos,
      (repo: ChallengeRepository, photos: ReferencePhotoProvider, bus: EventBus, clock: Clock, logger: AppLogger) =>
        new VerifyReferencePhotos(repo, photos, bus, clock, logger),
      [CHALLENGE_REPOSITORY, REFERENCE_PHOTOS, EVENT_BUS, CLOCK, APP_LOGGER],
    ),
    useCase(
      ChallengeCatalog,
      (repo: ChallengeRepository, daily: GetDailyChallenge, clock: Clock) => new ChallengeCatalog(repo, daily, clock),
      [CHALLENGE_REPOSITORY, GetDailyChallenge, CLOCK],
    ),
    useCase(
      DemoChallengeSeeder,
      (repo: ChallengeRepository, create: CreateChallenge, publish: PublishChallenge, logger: AppLogger) =>
        new DemoChallengeSeeder(repo, create, publish, logger),
      [CHALLENGE_REPOSITORY, CreateChallenge, PublishChallenge, APP_LOGGER],
    ),
  ],
  exports: [ChallengeCatalog, GetDailyChallenge, BrowseCatalog, ValidationRuleFactory],
})
export class ChallengesModule implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly photoCheck: IntervalJob;

  constructor(
    private readonly seeder: DemoChallengeSeeder,
    verifyPhotos: VerifyReferencePhotos,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {
    this.photoCheck = new IntervalJob('photo-check', config.game.photoCheckIntervalMs, () => verifyPhotos.execute(), logger);
  }

  async onApplicationBootstrap(): Promise<void> {
    if (this.config.seedDemo) {
      if (this.config.photos.provider === 'fixtures') {
        await this.seeder.seed(null);
      } else {
        this.logger.warn('SEED_DEMO ignoré : les défis de démonstration reposent sur PHOTO_PROVIDER=fixtures');
      }
    }
    this.photoCheck.start();
  }

  onApplicationShutdown(): void {
    this.photoCheck.stop();
  }
}

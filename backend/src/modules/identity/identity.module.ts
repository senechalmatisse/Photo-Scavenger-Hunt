import { Inject, Module, OnApplicationBootstrap } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { AppConfig } from '../../config/app-config';
import { AppLogger, EventBus } from '../../shared/application/ports';
import { Clock, IdGenerator, RandomSource } from '../../shared/domain/ports';
import { byPersistenceDriver, useCase } from '../../shared/infrastructure/providers';
import { APP_CONFIG, APP_LOGGER, CLOCK, EVENT_BUS, ID_GENERATOR, RANDOM_SOURCE } from '../../shared/infrastructure/tokens';
import {
  DeleteAccount,
  EnsureAdministrator,
  GetProfile,
  Login,
  RegisterUser,
  StartGuestSession,
  UpdateProfile,
} from './application/identity-use-cases';
import { UserDirectory } from './application/player-directory';
import { PasswordHasher, TokenIssuer, UserRepository } from './domain/ports';
import { PASSWORD_HASHER, PLAYER_DIRECTORY, TOKEN_ISSUER, USER_REPOSITORY } from './identity.tokens';
import { InMemoryUserRepository } from './infrastructure/in-memory-user.repository';
import { PgUserRepository } from './infrastructure/pg-user.repository';
import { JwtTokenIssuer, ScryptPasswordHasher } from './infrastructure/security';
import { AuthController, MeController } from './presentation/identity.controllers';
import { JwtAuthGuard, RolesGuard } from './presentation/security';

@Module({
  imports: [JwtModule.register({})],
  controllers: [AuthController, MeController],
  providers: [
    byPersistenceDriver<UserRepository>(USER_REPOSITORY, {
      postgres: (database) => new PgUserRepository(database),
      memory: () => new InMemoryUserRepository(),
    }),
    {
      provide: PASSWORD_HASHER,
      useFactory: (config: AppConfig) => new ScryptPasswordHasher(config.auth.passwordCost),
      inject: [APP_CONFIG],
    },
    {
      provide: TOKEN_ISSUER,
      useFactory: (jwt: JwtService, config: AppConfig) => new JwtTokenIssuer(jwt, config.auth.jwtSecret, config.auth.jwtTtlSeconds),
      inject: [JwtService, APP_CONFIG],
    },
    useCase(
      RegisterUser,
      (users: UserRepository, hasher: PasswordHasher, tokens: TokenIssuer, ids: IdGenerator, clock: Clock, bus: EventBus) =>
        new RegisterUser(users, hasher, tokens, ids, clock, bus),
      [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_ISSUER, ID_GENERATOR, CLOCK, EVENT_BUS],
    ),
    useCase(
      Login,
      (users: UserRepository, hasher: PasswordHasher, tokens: TokenIssuer, clock: Clock) => new Login(users, hasher, tokens, clock),
      [USER_REPOSITORY, PASSWORD_HASHER, TOKEN_ISSUER, CLOCK],
    ),
    useCase(
      StartGuestSession,
      (users: UserRepository, tokens: TokenIssuer, ids: IdGenerator, random: RandomSource, clock: Clock) =>
        new StartGuestSession(users, tokens, ids, random, clock),
      [USER_REPOSITORY, TOKEN_ISSUER, ID_GENERATOR, RANDOM_SOURCE, CLOCK],
    ),
    useCase(GetProfile, (users: UserRepository) => new GetProfile(users), [USER_REPOSITORY]),
    useCase(UpdateProfile, (users: UserRepository, clock: Clock) => new UpdateProfile(users, clock), [USER_REPOSITORY, CLOCK]),
    useCase(
      DeleteAccount,
      (users: UserRepository, clock: Clock, bus: EventBus) => new DeleteAccount(users, clock, bus),
      [USER_REPOSITORY, CLOCK, EVENT_BUS],
    ),
    useCase(
      EnsureAdministrator,
      (users: UserRepository, hasher: PasswordHasher, ids: IdGenerator, clock: Clock) => new EnsureAdministrator(users, hasher, ids, clock),
      [USER_REPOSITORY, PASSWORD_HASHER, ID_GENERATOR, CLOCK],
    ),
    useCase(PLAYER_DIRECTORY, (users: UserRepository) => new UserDirectory(users), [USER_REPOSITORY]),
    JwtAuthGuard,
    RolesGuard,
  ],
  exports: [PLAYER_DIRECTORY, TOKEN_ISSUER, JwtAuthGuard, RolesGuard],
})
export class IdentityModule implements OnApplicationBootstrap {
  constructor(
    private readonly ensureAdministrator: EnsureAdministrator,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(APP_LOGGER) private readonly logger: AppLogger,
  ) {}

  /** Crée le compte administrateur initial (ADMIN_EMAIL / ADMIN_PASSWORD) s'il n'existe pas. */
  async onApplicationBootstrap(): Promise<void> {
    const { email, password, displayName } = this.config.admin;
    if (email && password && (await this.ensureAdministrator.execute({ email, password, displayName }))) {
      this.logger.info('Compte administrateur initial créé', { email });
    }
  }
}

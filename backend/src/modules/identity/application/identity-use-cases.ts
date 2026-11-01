import { EventBus } from '../../../shared/application/ports';
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from '../../../shared/domain/domain-error';
import { Clock, IdGenerator, RandomSource } from '../../../shared/domain/ports';
import { IssuedToken, PasswordHasher, TokenIssuer, UserRepository } from '../domain/ports';
import { Avatar, Email, User, UserRole } from '../domain/user';

export interface ProfileView {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatar: Avatar;
  readonly role: UserRole;
  readonly isGuest: boolean;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

export interface AuthResult extends IssuedToken {
  readonly user: ProfileView;
}

export function toProfileView(user: User): ProfileView {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    avatar: user.avatar,
    role: user.role,
    isGuest: user.isGuest,
    createdAt: user.createdAt.toISOString(),
    lastLoginAt: user.lastLoginAt ? user.lastLoginAt.toISOString() : null,
  };
}

/** Politique de mot de passe */
export function assertAcceptablePassword(password: string): void {
  if (password.length < 10 || password.length > 128) {
    throw new ValidationError('WEAK_PASSWORD', 'Le mot de passe doit contenir entre 10 et 128 caractères.');
  }
}

async function issueFor(tokens: TokenIssuer, user: User): Promise<AuthResult> {
  const token = await tokens.issue({ sub: user.id, role: user.role, guest: user.isGuest });
  return { ...token, user: toProfileView(user) };
}

/**
 * US-001 : création de compte. Si l'appelant est un invité, son compte est converti
 * (même identifiant) : sa progression est conservée.
 */
export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  async execute(
    input: { email: string; password: string; displayName: string },
    currentGuestId?: string,
  ): Promise<AuthResult> {
    const email = Email.normalize(input.email);
    assertAcceptablePassword(input.password);
    if (await this.users.findByEmail(email)) {
      throw new ConflictError('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse e-mail.');
    }
    const passwordHash = await this.hasher.hash(input.password);
    const now = this.clock.now();
    const guest = currentGuestId ? await this.users.findById(currentGuestId) : null;
    let user: User;
    if (guest && guest.isGuest) {
      guest.upgradeFromGuest({ email, passwordHash, displayName: input.displayName, now });
      user = guest;
    } else {
      user = User.register({ id: this.ids.next(), email, passwordHash, displayName: input.displayName, now });
    }
    await this.users.save(user);
    await this.bus.publish(user.pullEvents());
    return issueFor(this.tokens, user);
  }
}

/** US-002 : connexion. Le message d'erreur ne révèle pas si l'adresse existe. */
export class Login {
  /** Empreinte factice : le temps de réponse est identique que le compte existe ou non. */
  private dummyHash: Promise<string> | null = null;

  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: TokenIssuer,
    private readonly clock: Clock,
  ) {}

  async execute(input: { email: string; password: string }): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email.trim().toLowerCase());
    const hash = user?.passwordHash ?? (await this.getDummyHash());
    const valid = await this.hasher.verify(input.password, hash);
    if (!user || !user.passwordHash || !valid) {
      throw new UnauthorizedError('INVALID_CREDENTIALS', 'Adresse e-mail ou mot de passe incorrect.');
    }
    user.recordLogin(this.clock.now());
    await this.users.save(user);
    return issueFor(this.tokens, user);
  }

  private getDummyHash(): Promise<string> {
    this.dummyHash ??= this.hasher.hash('timing-equalizer-password');
    return this.dummyHash;
  }
}

/** US-006 : jouer sans inscription. */
export class StartGuestSession {
  constructor(
    private readonly users: UserRepository,
    private readonly tokens: TokenIssuer,
    private readonly ids: IdGenerator,
    private readonly random: RandomSource,
    private readonly clock: Clock,
  ) {}

  async execute(): Promise<AuthResult> {
    const suffix = String(this.random.nextInt(10_000)).padStart(4, '0');
    const user = User.guest({ id: this.ids.next(), displayName: `Invité ${suffix}`, now: this.clock.now() });
    await this.users.save(user);
    return issueFor(this.tokens, user);
  }
}

export class GetProfile {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<ProfileView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'Compte introuvable.');
    }
    return toProfileView(user);
  }
}

/** US-003 : pseudonyme et avatar. */
export class UpdateProfile {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
  ) {}

  async execute(userId: string, changes: { displayName?: string; avatar?: string }): Promise<ProfileView> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError('USER_NOT_FOUND', 'Compte introuvable.');
    }
    user.updateProfile(changes, this.clock.now());
    await this.users.save(user);
    return toProfileView(user);
  }
}

/** US-005 : suppression du compte ; les autres modules effacent leurs données sur l'événement UserDeleted. */
export class DeleteAccount {
  constructor(
    private readonly users: UserRepository,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  async execute(userId: string): Promise<void> {
    const user = await this.users.findById(userId);
    if (!user) {
      return;
    }
    user.markDeleted(this.clock.now());
    await this.users.delete(user.id);
    await this.bus.publish(user.pullEvents());
  }
}

/** Crée le compte administrateur initial s'il n'existe pas (démarrage de l'application). */
export class EnsureAdministrator {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: { email: string; password: string; displayName: string }): Promise<boolean> {
    const email = Email.normalize(input.email);
    if (await this.users.findByEmail(email)) {
      return false;
    }
    assertAcceptablePassword(input.password);
    const user = User.administrator({
      id: this.ids.next(),
      email,
      passwordHash: await this.hasher.hash(input.password),
      displayName: input.displayName,
      now: this.clock.now(),
    });
    user.pullEvents();
    await this.users.save(user);
    return true;
  }
}

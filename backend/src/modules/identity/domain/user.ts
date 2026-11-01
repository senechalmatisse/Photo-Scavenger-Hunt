import { AggregateRoot, DomainEvent } from '../../../shared/domain/aggregate-root';
import { BusinessRuleViolation, ValidationError, ensure } from '../../../shared/domain/domain-error';

export type UserRole = 'PLAYER' | 'ADMIN';

/** Avatars prédéfinis : pas de téléversement d'images dans le MVP (aucun stockage de fichiers). */
export const AVATARS = ['fox', 'owl', 'lighthouse', 'camera', 'compass', 'mountain', 'wave', 'tree'] as const;
export type Avatar = (typeof AVATARS)[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const DISPLAY_NAME_PATTERN = /^[\p{L}\p{N} _.-]{3,30}$/u;

export const Email = {
  normalize(raw: string): string {
    const email = raw.trim().toLowerCase();
    if (email.length > 254 || !EMAIL_PATTERN.test(email)) {
      throw new ValidationError('INVALID_EMAIL', 'Adresse e-mail invalide.');
    }
    return email;
  },
};

export const DisplayName = {
  normalize(raw: string): string {
    const name = raw.trim().replace(/\s+/g, ' ');
    if (!DISPLAY_NAME_PATTERN.test(name)) {
      throw new ValidationError(
        'INVALID_DISPLAY_NAME',
        'Le pseudonyme doit contenir 3 à 30 caractères (lettres, chiffres, espace, « _ », « . » ou « - »).',
      );
    }
    return name;
  },
};

export interface UserSnapshot {
  readonly id: string;
  readonly version: number;
  readonly email: string | null;
  readonly passwordHash: string | null;
  readonly displayName: string;
  readonly avatar: Avatar;
  readonly role: UserRole;
  readonly isGuest: boolean;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly lastLoginAt: Date | null;
}

type UserProps = { -readonly [K in keyof Omit<UserSnapshot, 'id' | 'version'>]: UserSnapshot[K] };

export class UserRegistered implements DomainEvent {
  static readonly TYPE = 'identity.user-registered';
  readonly type = UserRegistered.TYPE;

  constructor(
    readonly userId: string,
    readonly fromGuest: boolean,
    readonly occurredAt: Date,
  ) {}
}

/** Droit à l'effacement : chaque module supprime ses propres données à réception (US-005). */
export class UserDeleted implements DomainEvent {
  static readonly TYPE = 'identity.user-deleted';
  readonly type = UserDeleted.TYPE;

  constructor(
    readonly userId: string,
    readonly occurredAt: Date,
  ) {}
}

export class User extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private readonly props: UserProps,
  ) {
    super(id, version);
  }

  static register(params: { id: string; email: string; passwordHash: string; displayName: string; now: Date }): User {
    const user = new User(params.id, 0, {
      email: Email.normalize(params.email),
      passwordHash: params.passwordHash,
      displayName: DisplayName.normalize(params.displayName),
      avatar: 'compass',
      role: 'PLAYER',
      isGuest: false,
      createdAt: params.now,
      updatedAt: params.now,
      lastLoginAt: params.now,
    });
    user.record(new UserRegistered(params.id, false, params.now));
    return user;
  }

  /** Mode invité (US-006) : un vrai compte, sans identifiants, convertible plus tard. */
  static guest(params: { id: string; displayName: string; now: Date }): User {
    return new User(params.id, 0, {
      email: null,
      passwordHash: null,
      displayName: DisplayName.normalize(params.displayName),
      avatar: 'fox',
      role: 'PLAYER',
      isGuest: true,
      createdAt: params.now,
      updatedAt: params.now,
      lastLoginAt: params.now,
    });
  }

  static administrator(params: { id: string; email: string; passwordHash: string; displayName: string; now: Date }): User {
    const user = User.register(params);
    user.props.role = 'ADMIN';
    user.props.avatar = 'lighthouse';
    return user;
  }

  static restore(snapshot: UserSnapshot): User {
    const { id, version, ...props } = snapshot;
    return new User(id, version, { ...props });
  }

  /** Conversion invité → compte : l'identifiant est conservé, donc la progression aussi (US-001). */
  upgradeFromGuest(params: { email: string; passwordHash: string; displayName: string; now: Date }): void {
    if (!this.props.isGuest) {
      throw new BusinessRuleViolation('ALREADY_REGISTERED', 'Ce compte est déjà enregistré.');
    }
    this.props.email = Email.normalize(params.email);
    this.props.passwordHash = params.passwordHash;
    this.props.displayName = DisplayName.normalize(params.displayName);
    this.props.isGuest = false;
    this.props.updatedAt = params.now;
    this.record(new UserRegistered(this.id, true, params.now));
  }

  updateProfile(changes: { displayName?: string; avatar?: string }, now: Date): void {
    if (changes.displayName !== undefined) {
      this.props.displayName = DisplayName.normalize(changes.displayName);
    }
    if (changes.avatar !== undefined) {
      ensure((AVATARS as readonly string[]).includes(changes.avatar), 'INVALID_AVATAR', 'Avatar inconnu.');
      this.props.avatar = changes.avatar as Avatar;
    }
    this.props.updatedAt = now;
  }

  recordLogin(now: Date): void {
    this.props.lastLoginAt = now;
  }

  markDeleted(now: Date): void {
    this.record(new UserDeleted(this.id, now));
  }

  get email(): string | null {
    return this.props.email;
  }

  get passwordHash(): string | null {
    return this.props.passwordHash;
  }

  get displayName(): string {
    return this.props.displayName;
  }

  get avatar(): Avatar {
    return this.props.avatar;
  }

  get role(): UserRole {
    return this.props.role;
  }

  get isGuest(): boolean {
    return this.props.isGuest;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get lastLoginAt(): Date | null {
    return this.props.lastLoginAt;
  }

  toSnapshot(): UserSnapshot {
    return { id: this.id, version: this.version, ...this.props };
  }
}

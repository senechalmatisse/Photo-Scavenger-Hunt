import { join } from 'node:path';
import { ScoringConfig } from '../modules/gameplay/domain/scoring';
import { LicenseProfile } from '../modules/photos/domain/license';

export type PersistenceDriver = 'postgres' | 'memory';
export type KeyValueDriver = 'redis' | 'memory';
export type PhotoProvider = 'flickr' | 'fixtures';

/** Configuration typée et validée au démarrage (échec immédiat si une valeur est incohérente). */
export interface AppConfig {
  readonly env: 'development' | 'test' | 'production';
  readonly http: {
    readonly port: number;
    readonly corsOrigins: readonly string[];
    readonly trustProxy: boolean;
    readonly prettyLogs: boolean;
  };
  readonly auth: {
    readonly jwtSecret: string;
    readonly jwtTtlSeconds: number;
    /** Coût scrypt (log2 de N) : 17 recommandé par l'OWASP, abaisser uniquement en test. */
    readonly passwordCost: number;
  };
  readonly admin: { readonly email: string | null; readonly password: string | null; readonly displayName: string };
  readonly persistence: { readonly driver: PersistenceDriver; readonly databaseUrl: string; readonly migrationsDir: string };
  readonly redis: { readonly url: string };
  readonly cache: { readonly driver: KeyValueDriver; readonly searchTtlSeconds: number; readonly photoTtlSeconds: number };
  readonly leaderboards: { readonly driver: KeyValueDriver };
  readonly photos: {
    readonly provider: PhotoProvider;
    readonly flickrApiKey: string | null;
    readonly flickrBaseUrl: string;
    readonly timeoutMs: number;
    readonly licenseProfile: LicenseProfile;
    readonly allowedLicenses: readonly string[] | null;
    readonly retryAttempts: number;
    readonly circuitFailureThreshold: number;
    readonly circuitCooldownMs: number;
  };
  readonly game: {
    readonly timeZone: string;
    readonly participationXp: number;
    readonly scoring: ScoringConfig;
    readonly streakEveryDays: number;
    readonly streakBonusXp: number;
    readonly levelStepXp: number;
    readonly expiryCheckIntervalMs: number;
    readonly photoCheckIntervalMs: number;
  };
  readonly seedDemo: boolean;
}

export class ConfigError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Configuration invalide :\n - ${problems.join('\n - ')}`);
  }
}

class EnvReader {
  readonly problems: string[] = [];

  constructor(private readonly env: Record<string, string | undefined>) {}

  string(name: string, fallback?: string): string {
    const value = this.env[name]?.trim();
    if (value) {
      return value;
    }
    if (fallback === undefined) {
      this.problems.push(`${name} est obligatoire.`);
      return '';
    }
    return fallback;
  }

  optional(name: string): string | null {
    return this.env[name]?.trim() || null;
  }

  int(name: string, fallback: number, min: number, max: number): number {
    const raw = this.env[name]?.trim();
    const value = raw ? Number(raw) : fallback;
    if (!Number.isInteger(value) || value < min || value > max) {
      this.problems.push(`${name} doit être un entier entre ${min} et ${max} (reçu : ${raw}).`);
      return fallback;
    }
    return value;
  }

  bool(name: string, fallback: boolean): boolean {
    const raw = this.env[name]?.trim().toLowerCase();
    if (!raw) {
      return fallback;
    }
    if (!['true', 'false', '1', '0'].includes(raw)) {
      this.problems.push(`${name} doit valoir true ou false.`);
      return fallback;
    }
    return raw === 'true' || raw === '1';
  }

  oneOf<T extends string>(name: string, allowed: readonly T[], fallback: T): T {
    const raw = this.env[name]?.trim();
    if (!raw) {
      return fallback;
    }
    if (!(allowed as readonly string[]).includes(raw)) {
      this.problems.push(`${name} doit valoir ${allowed.join(' | ')} (reçu : ${raw}).`);
      return fallback;
    }
    return raw as T;
  }

  list(name: string): string[] | null {
    const raw = this.env[name]?.trim();
    return raw ? raw.split(',').map((item) => item.trim()).filter(Boolean) : null;
  }
}

export function loadConfig(env: Record<string, string | undefined> = process.env): AppConfig {
  const read = new EnvReader(env);
  const mode = read.oneOf('NODE_ENV', ['development', 'test', 'production'] as const, 'development');
  const production = mode === 'production';

  const jwtSecret = read.string('JWT_SECRET', production ? undefined : 'dev-only-secret-change-me-dev-only-secret');
  if (production && jwtSecret.length < 32) {
    read.problems.push('JWT_SECRET doit contenir au moins 32 caractères en production.');
  }
  const provider = read.oneOf('PHOTO_PROVIDER', ['flickr', 'fixtures'] as const, production ? 'flickr' : 'fixtures');
  const flickrApiKey = read.optional('FLICKR_API_KEY');
  if (provider === 'flickr' && !flickrApiKey) {
    read.problems.push('FLICKR_API_KEY est obligatoire avec PHOTO_PROVIDER=flickr.');
  }
  const timeZone = read.string('GAME_TIMEZONE', 'Europe/Paris');
  try {
    new Intl.DateTimeFormat('fr-FR', { timeZone });
  } catch {
    read.problems.push(`GAME_TIMEZONE inconnu : ${timeZone}.`);
  }

  const config: AppConfig = {
    env: mode,
    http: {
      port: read.int('PORT', 3000, 1, 65535),
      corsOrigins: read.list('CORS_ORIGINS') ?? ['http://localhost:4200'],
      trustProxy: read.bool('TRUST_PROXY', production),
      prettyLogs: read.bool('PRETTY_LOGS', !production),
    },
    auth: {
      jwtSecret,
      jwtTtlSeconds: read.int('JWT_TTL_SECONDS', 7200, 300, 2_592_000),
      passwordCost: read.int('PASSWORD_HASH_COST', 17, 10, 20),
    },
    admin: {
      email: read.optional('ADMIN_EMAIL'),
      password: read.optional('ADMIN_PASSWORD'),
      displayName: read.string('ADMIN_DISPLAY_NAME', 'Administrateur'),
    },
    persistence: {
      driver: read.oneOf('PERSISTENCE_DRIVER', ['postgres', 'memory'] as const, production ? 'postgres' : 'memory'),
      databaseUrl: read.string('DATABASE_URL', 'postgres://psh:psh@localhost:5432/psh'),
      migrationsDir: read.string('MIGRATIONS_DIR', join(process.cwd(), 'database', 'migrations')),
    },
    redis: { url: read.string('REDIS_URL', 'redis://localhost:6379') },
    cache: {
      driver: read.oneOf('CACHE_DRIVER', ['redis', 'memory'] as const, production ? 'redis' : 'memory'),
      searchTtlSeconds: read.int('CACHE_SEARCH_TTL_SECONDS', 300, 0, 86_400),
      photoTtlSeconds: read.int('CACHE_PHOTO_TTL_SECONDS', 3600, 0, 86_400),
    },
    leaderboards: {
      driver: read.oneOf('LEADERBOARD_DRIVER', ['redis', 'memory'] as const, production ? 'redis' : 'memory'),
    },
    photos: {
      provider,
      flickrApiKey,
      flickrBaseUrl: read.string('FLICKR_BASE_URL', 'https://api.flickr.com/services/rest/'),
      timeoutMs: read.int('FLICKR_TIMEOUT_MS', 5000, 500, 60_000),
      licenseProfile: read.oneOf('LICENSE_PROFILE', ['non-commercial', 'commercial'] as const, 'non-commercial'),
      allowedLicenses: read.list('ALLOWED_LICENSES'),
      retryAttempts: read.int('FLICKR_RETRY_ATTEMPTS', 2, 0, 5),
      circuitFailureThreshold: read.int('FLICKR_CIRCUIT_THRESHOLD', 5, 1, 100),
      circuitCooldownMs: read.int('FLICKR_CIRCUIT_COOLDOWN_MS', 30_000, 1000, 600_000),
    },
    game: {
      timeZone,
      participationXp: read.int('GAME_PARTICIPATION_XP', 10, 0, 1000),
      scoring: {
        noHintBonus: read.int('SCORE_NO_HINT_BONUS', 50, 0, 10_000),
        speedBonus: read.int('SCORE_SPEED_BONUS', 25, 0, 10_000),
        speedThresholdSeconds: read.int('SCORE_SPEED_THRESHOLD_SECONDS', 30, 1, 3600),
        dailyBonus: read.int('SCORE_DAILY_BONUS', 50, 0, 10_000),
      },
      streakEveryDays: read.int('STREAK_BONUS_EVERY_DAYS', 7, 1, 365),
      streakBonusXp: read.int('STREAK_BONUS_XP', 200, 0, 100_000),
      levelStepXp: read.int('LEVEL_STEP_XP', 50, 1, 10_000),
      expiryCheckIntervalMs: read.int('SESSION_EXPIRY_INTERVAL_MS', 60_000, 0, 3_600_000),
      photoCheckIntervalMs: read.int('PHOTO_CHECK_INTERVAL_MS', 86_400_000, 0, 604_800_000),
    },
    seedDemo: read.bool('SEED_DEMO', !production),
  };

  if (read.problems.length > 0) {
    throw new ConfigError(read.problems);
  }
  return config;
}

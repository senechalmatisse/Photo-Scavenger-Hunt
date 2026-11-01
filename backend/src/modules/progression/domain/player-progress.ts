import { AggregateRoot, DomainEvent } from '../../../shared/domain/aggregate-root';
import { LocalDate, LocalDates } from '../../../shared/domain/local-date';
import { AchievementCatalog, AchievementDefinition, EMPTY_STATS, PlayerStats } from './achievements';
import { LevelCurve } from './level-curve';

export interface UnlockedAchievement {
  readonly code: string;
  readonly unlockedAt: Date;
}

/** Résultat d'une partie terminée, vu par la progression (traduit depuis l'événement de gameplay). */
export interface SessionOutcome {
  readonly sessionId: string;
  readonly mode: 'DAILY' | 'CATALOG';
  readonly day: LocalDate;
  readonly status: 'VALIDATED' | 'FAILED' | 'EXPIRED' | 'ABANDONED';
  readonly points: number;
  readonly xp: number;
  readonly hintsUsed: number;
  readonly attempts: number;
  readonly isGeographic: boolean;
  readonly finishedAt: Date;
}

export interface StreakRule {
  readonly everyDays: number;
  readonly bonusXp: number;
}

export interface ProgressionRules {
  readonly levelCurve: LevelCurve;
  readonly achievements: AchievementCatalog;
  readonly streak: StreakRule;
}

export interface ProgressDelta {
  readonly xpGained: number;
  readonly pointsGained: number;
  readonly streakBonusXp: number;
  readonly levelReached: number | null;
  readonly unlocked: readonly AchievementDefinition[];
}

export interface PlayerProgressSnapshot {
  readonly playerId: string;
  readonly version: number;
  readonly xp: number;
  readonly points: number;
  readonly stats: PlayerStats;
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly lastDailyDay: LocalDate | null;
  readonly achievements: readonly UnlockedAchievement[];
  readonly updatedAt: Date;
}

export class LevelReached implements DomainEvent {
  static readonly TYPE = 'progression.level-reached';
  readonly type = LevelReached.TYPE;

  constructor(
    readonly playerId: string,
    readonly level: number,
    readonly occurredAt: Date,
  ) {}
}

export class AchievementUnlocked implements DomainEvent {
  static readonly TYPE = 'progression.achievement-unlocked';
  readonly type = AchievementUnlocked.TYPE;

  constructor(
    readonly playerId: string,
    readonly code: string,
    readonly occurredAt: Date,
  ) {}
}

type ProgressProps = { -readonly [K in keyof Omit<PlayerProgressSnapshot, 'playerId' | 'version'>]: PlayerProgressSnapshot[K] };

/**
 * Agrégat Progression : XP (progression globale), points (classements), statistiques,
 * série de défis quotidiens et badges (§3.6, §5.2).
 */
export class PlayerProgress extends AggregateRoot {
  private constructor(
    playerId: string,
    version: number,
    private readonly props: ProgressProps,
  ) {
    super(playerId, version);
  }

  static start(playerId: string, now: Date): PlayerProgress {
    return new PlayerProgress(playerId, 0, {
      xp: 0,
      points: 0,
      stats: EMPTY_STATS,
      currentStreak: 0,
      bestStreak: 0,
      lastDailyDay: null,
      achievements: [],
      updatedAt: now,
    });
  }

  static restore(snapshot: PlayerProgressSnapshot): PlayerProgress {
    const { playerId, version, ...props } = snapshot;
    return new PlayerProgress(playerId, version, { ...props, achievements: [...props.achievements] });
  }

  recordSession(outcome: SessionOutcome, rules: ProgressionRules): ProgressDelta {
    const levelBefore = rules.levelCurve.levelFor(this.props.xp);
    const won = outcome.status === 'VALIDATED';
    const counted = outcome.status !== 'ABANDONED';
    const stats = this.props.stats;

    this.props.stats = {
      missionsPlayed: stats.missionsPlayed + (counted ? 1 : 0),
      missionsWon: stats.missionsWon + (won ? 1 : 0),
      missionsWonWithoutHint: stats.missionsWonWithoutHint + (won && outcome.hintsUsed === 0 ? 1 : 0),
      geoMissionsWon: stats.geoMissionsWon + (won && outcome.isGeographic ? 1 : 0),
      dailyCompleted: stats.dailyCompleted + (counted && outcome.mode === 'DAILY' ? 1 : 0),
      hintsUsed: stats.hintsUsed + outcome.hintsUsed,
      photosSubmitted: stats.photosSubmitted + outcome.attempts,
    };

    const streakBonusXp = counted && outcome.mode === 'DAILY' ? this.extendStreak(outcome.day, rules.streak) : 0;
    this.props.xp += outcome.xp + streakBonusXp;
    this.props.points += outcome.points;
    this.props.updatedAt = outcome.finishedAt;

    const levelAfter = rules.levelCurve.levelFor(this.props.xp);
    if (levelAfter > levelBefore) {
      this.record(new LevelReached(this.id, levelAfter, outcome.finishedAt));
    }
    const unlocked = this.unlockAchievements(rules, levelAfter, outcome.finishedAt);

    return {
      xpGained: outcome.xp + streakBonusXp,
      pointsGained: outcome.points,
      streakBonusXp,
      levelReached: levelAfter > levelBefore ? levelAfter : null,
      unlocked,
    };
  }

  /** Série affichée : elle retombe à zéro si le défi d'hier a été manqué (US-054). */
  effectiveStreak(today: LocalDate): number {
    if (this.props.lastDailyDay === null) {
      return 0;
    }
    return LocalDates.daysBetween(this.props.lastDailyDay, today) <= 1 ? this.props.currentStreak : 0;
  }

  get playerId(): string {
    return this.id;
  }

  get xp(): number {
    return this.props.xp;
  }

  get points(): number {
    return this.props.points;
  }

  get stats(): PlayerStats {
    return this.props.stats;
  }

  get bestStreak(): number {
    return this.props.bestStreak;
  }

  get achievements(): readonly UnlockedAchievement[] {
    return this.props.achievements;
  }

  toSnapshot(): PlayerProgressSnapshot {
    return { playerId: this.id, version: this.version, ...this.props, achievements: [...this.props.achievements] };
  }

  private extendStreak(day: LocalDate, rule: StreakRule): number {
    const last = this.props.lastDailyDay;
    if (last === day) {
      return 0;
    }
    this.props.currentStreak = last !== null && LocalDates.daysBetween(last, day) === 1 ? this.props.currentStreak + 1 : 1;
    this.props.bestStreak = Math.max(this.props.bestStreak, this.props.currentStreak);
    this.props.lastDailyDay = day;
    return this.props.currentStreak % rule.everyDays === 0 ? rule.bonusXp : 0;
  }

  private unlockAchievements(rules: ProgressionRules, level: number, now: Date): AchievementDefinition[] {
    const owned = new Set(this.props.achievements.map((achievement) => achievement.code));
    const subject = { stats: this.props.stats, bestStreak: this.props.bestStreak, level };
    const unlocked = rules.achievements.definitions.filter(
      (definition) => !owned.has(definition.code) && definition.isSatisfiedBy(subject),
    );
    for (const definition of unlocked) {
      this.props.achievements = [...this.props.achievements, { code: definition.code, unlockedAt: now }];
      this.record(new AchievementUnlocked(this.id, definition.code, now));
    }
    return unlocked;
  }
}

import { EventBus, UnitOfWork } from '../../../shared/application/ports';
import { DomainEvent } from '../../../shared/domain/aggregate-root';
import { GameCalendar } from '../../../shared/domain/game-calendar';
import { Clock } from '../../../shared/domain/ports';
import type { SessionFinishedPayload } from '../../gameplay/public-api';
import { LevelProgress, levelProgress } from '../domain/level-curve';
import { PlayerStats } from '../domain/achievements';
import { PlayerProgress, ProgressDelta, ProgressionRules } from '../domain/player-progress';
import { PlayerProgressRepository, RewardLedger } from '../domain/progression.repository';

/**
 * Comptabilise une partie terminée (réaction à l'événement GameSessionFinished).
 * Idempotent grâce au registre : un événement rejoué n'attribue jamais deux fois les gains.
 */
export class RecordSessionOutcome {
  constructor(
    private readonly progress: PlayerProgressRepository,
    private readonly ledger: RewardLedger,
    private readonly rules: ProgressionRules,
    private readonly uow: UnitOfWork,
    private readonly bus: EventBus,
  ) {}

  async execute(outcome: SessionFinishedPayload, finishedAt: Date): Promise<ProgressDelta | null> {
    const committed = await this.uow.run(async () => {
      const appended = await this.ledger.append({
        sessionId: outcome.sessionId,
        playerId: outcome.playerId,
        points: outcome.points,
        xp: outcome.xp,
        day: outcome.day,
        awardedAt: finishedAt,
      });
      if (!appended) {
        return null;
      }
      const progress = (await this.progress.findByPlayer(outcome.playerId)) ?? PlayerProgress.start(outcome.playerId, finishedAt);
      const delta = progress.recordSession({ ...outcome, finishedAt }, this.rules);
      await this.progress.save(progress);
      return { delta, events: progress.pullEvents() };
    });
    if (!committed) {
      return null;
    }
    await this.bus.publish(committed.events as DomainEvent[]);
    return committed.delta;
  }
}

export interface AchievementView {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly unlockedAt: string | null;
}

export interface ProgressView {
  readonly playerId: string;
  readonly level: LevelProgress;
  readonly points: number;
  readonly stats: PlayerStats;
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly achievements: readonly AchievementView[];
}

/** US-013, US-053 à US-055 : niveau, statistiques, série et badges du joueur. */
export class GetPlayerProgress {
  constructor(
    private readonly progress: PlayerProgressRepository,
    private readonly rules: ProgressionRules,
    private readonly calendar: GameCalendar,
    private readonly clock: Clock,
  ) {}

  async execute(playerId: string): Promise<ProgressView> {
    const now = this.clock.now();
    const progress = (await this.progress.findByPlayer(playerId)) ?? PlayerProgress.start(playerId, now);
    const unlocked = new Map(progress.achievements.map((achievement) => [achievement.code, achievement.unlockedAt]));
    return {
      playerId,
      level: levelProgress(this.rules.levelCurve, progress.xp),
      points: progress.points,
      stats: progress.stats,
      currentStreak: progress.effectiveStreak(this.calendar.dayOf(now)),
      bestStreak: progress.bestStreak,
      achievements: this.rules.achievements.definitions.map((definition) => ({
        code: definition.code,
        name: definition.name,
        description: definition.description,
        icon: definition.icon,
        unlockedAt: unlocked.get(definition.code)?.toISOString() ?? null,
      })),
    };
  }
}

/** Droit à l'effacement : progression et registre du joueur. */
export class ErasePlayerProgress {
  constructor(
    private readonly progress: PlayerProgressRepository,
    private readonly ledger: RewardLedger,
    private readonly uow: UnitOfWork,
  ) {}

  async execute(playerId: string): Promise<void> {
    await this.uow.run(async () => {
      await this.progress.deleteByPlayer(playerId);
      await this.ledger.deleteByPlayer(playerId);
    });
  }
}

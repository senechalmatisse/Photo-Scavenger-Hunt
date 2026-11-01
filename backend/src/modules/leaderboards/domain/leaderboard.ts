import { ValidationError } from '../../../shared/domain/domain-error';
import { LocalDate, LocalDates } from '../../../shared/domain/local-date';

export const LEADERBOARD_PERIODS = ['ALL_TIME', 'WEEKLY', 'MONTHLY'] as const;
export type LeaderboardPeriod = (typeof LEADERBOARD_PERIODS)[number];

export interface ScoreEntry {
  readonly playerId: string;
  readonly points: number;
}

export interface RankedScore extends ScoreEntry {
  /** Rang à partir de 1. */
  readonly rank: number;
}

/** Clé d'un tableau : un classement par période (« WEEKLY:2026-W44 », « MONTHLY:2026-11 »...). */
export const LeaderboardKeys = {
  parsePeriod(raw: string): LeaderboardPeriod {
    const period = raw.toUpperCase().replace('-', '_');
    if (!(LEADERBOARD_PERIODS as readonly string[]).includes(period)) {
      throw new ValidationError('INVALID_PERIOD', `Période inconnue : ${raw} (attendu : all_time, weekly, monthly).`);
    }
    return period as LeaderboardPeriod;
  },

  forPeriod(period: LeaderboardPeriod, day: LocalDate): string {
    switch (period) {
      case 'ALL_TIME':
        return 'ALL_TIME';
      case 'WEEKLY':
        return `WEEKLY:${LocalDates.isoWeekKey(day)}`;
      case 'MONTHLY':
        return `MONTHLY:${LocalDates.monthKey(day)}`;
    }
  },

  /** Toutes les clés alimentées par des points gagnés un jour donné. */
  allFor(day: LocalDate): string[] {
    return LEADERBOARD_PERIODS.map((period) => LeaderboardKeys.forPeriod(period, day));
  },
};

/** Port de stockage des classements (Redis sorted sets en production). */
export interface LeaderboardStore {
  increment(boardKey: string, playerId: string, points: number): Promise<void>;
  top(boardKey: string, limit: number): Promise<RankedScore[]>;
  rankOf(boardKey: string, playerId: string): Promise<RankedScore | null>;
  removePlayer(playerId: string): Promise<void>;
}

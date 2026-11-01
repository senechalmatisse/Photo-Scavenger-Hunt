import { GameCalendar } from '../../../shared/domain/game-calendar';
import { Clock } from '../../../shared/domain/ports';
import type { SessionFinishedPayload } from '../../gameplay/public-api';
import type { PlayerDirectory } from '../../identity/public-api';
import { LeaderboardKeys, LeaderboardPeriod, LeaderboardStore, RankedScore } from '../domain/leaderboard';

/** Alimente les classements (général, hebdomadaire, mensuel) avec les points d'une partie gagnée. */
export class RecordLeaderboardPoints {
  constructor(private readonly store: LeaderboardStore) {}

  async execute(outcome: SessionFinishedPayload): Promise<void> {
    if (outcome.points <= 0) {
      return;
    }
    await Promise.all(
      LeaderboardKeys.allFor(outcome.day).map((key) => this.store.increment(key, outcome.playerId, outcome.points)),
    );
  }
}

export interface LeaderboardEntryView {
  readonly rank: number;
  readonly playerId: string;
  readonly displayName: string;
  readonly avatar: string;
  readonly points: number;
  readonly isMe: boolean;
}

export interface LeaderboardView {
  readonly period: LeaderboardPeriod;
  readonly board: string;
  readonly entries: readonly LeaderboardEntryView[];
  /** Position du joueur courant (US-063), même s'il n'est pas dans le haut du classement. */
  readonly me: LeaderboardEntryView | null;
}

/** US-060, US-061, US-063 : consultation d'un classement et de sa propre position. */
export class GetLeaderboard {
  constructor(
    private readonly store: LeaderboardStore,
    private readonly players: PlayerDirectory,
    private readonly calendar: GameCalendar,
    private readonly clock: Clock,
  ) {}

  async execute(period: LeaderboardPeriod, playerId: string, limit = 20): Promise<LeaderboardView> {
    const board = LeaderboardKeys.forPeriod(period, this.calendar.dayOf(this.clock.now()));
    const [top, mine] = await Promise.all([
      this.store.top(board, Math.min(Math.max(limit, 1), 100)),
      this.store.rankOf(board, playerId),
    ]);
    const ranked: RankedScore[] = mine && !top.some((entry) => entry.playerId === playerId) ? [...top, mine] : top;
    const profiles = await this.players.profiles(ranked.map((entry) => entry.playerId));
    const toView = (entry: RankedScore): LeaderboardEntryView => {
      const profile = profiles.get(entry.playerId);
      return {
        rank: entry.rank,
        playerId: entry.playerId,
        displayName: profile?.displayName ?? 'Joueur supprimé',
        avatar: profile?.avatar ?? 'compass',
        points: entry.points,
        isMe: entry.playerId === playerId,
      };
    };
    return { period, board, entries: top.map(toView), me: mine ? toView(mine) : null };
  }
}

export class ErasePlayerScores {
  constructor(private readonly store: LeaderboardStore) {}

  async execute(playerId: string): Promise<void> {
    await this.store.removePlayer(playerId);
  }
}

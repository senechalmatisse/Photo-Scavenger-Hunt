import { AppLogger } from '../../../shared/application/ports';
import { ServiceUnavailableError } from '../../../shared/domain/domain-error';
import { Clock } from '../../../shared/domain/ports';
import { BrowseCatalog, ChallengeViews, GetDailyChallenge, type PublicChallengeView } from '../../challenges/public-api';
import { GetDailySessionStatus, ListPlayerHistory, type SessionSummaryView } from '../../gameplay/public-api';
import { GetLeaderboard, type LeaderboardView } from '../../leaderboards/public-api';
import { type AchievementView, GetPlayerProgress, type ProgressView } from '../../progression/public-api';

export interface DashboardView {
  readonly daily: { readonly challenge: PublicChallengeView; readonly mySession: SessionSummaryView | null } | null;
  readonly progress: ProgressView;
  readonly recentSessions: readonly SessionSummaryView[];
  readonly availableChallenges: readonly PublicChallengeView[];
  readonly weeklyLeaderboard: LeaderboardView;
  readonly recentAchievements: readonly AchievementView[];
}

/**
 * US-010 à US-014 : point d'entrée après connexion.
 * Façade (pattern Facade / Backend-for-Frontend) qui compose les lectures de plusieurs modules
 * en un seul appel, sans porter de règle métier.
 */
export class GetDashboard {
  constructor(
    private readonly daily: GetDailyChallenge,
    private readonly dailyStatus: GetDailySessionStatus,
    private readonly progress: GetPlayerProgress,
    private readonly history: ListPlayerHistory,
    private readonly catalog: BrowseCatalog,
    private readonly leaderboard: GetLeaderboard,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async execute(playerId: string): Promise<DashboardView> {
    const [daily, progress, history, catalog, weeklyLeaderboard] = await Promise.all([
      this.daily.execute().catch((error: unknown) => this.degrade(error)),
      this.progress.execute(playerId),
      this.history.execute(playerId, { page: 1, pageSize: 5 }),
      this.catalog.execute({ page: 1, pageSize: 6 }),
      this.leaderboard.execute('WEEKLY', playerId, 5),
    ]);
    const now = this.clock.now();
    return {
      daily: daily
        ? {
            challenge: ChallengeViews.public(daily.challenge, now),
            mySession: await this.dailyStatus.execute(playerId, daily.day),
          }
        : null,
      progress,
      recentSessions: history.items,
      availableChallenges: catalog.items,
      weeklyLeaderboard,
      recentAchievements: progress.achievements
        .filter((achievement) => achievement.unlockedAt !== null)
        .sort((a, b) => (b.unlockedAt as string).localeCompare(a.unlockedAt as string))
        .slice(0, 3),
    };
  }

  /** Le tableau de bord reste affichable si un fournisseur externe est indisponible. */
  private degrade(error: unknown): null {
    if (error instanceof ServiceUnavailableError) {
      this.logger.warn('Défi du jour indisponible pour le tableau de bord', { code: error.code });
      return null;
    }
    throw error;
  }
}

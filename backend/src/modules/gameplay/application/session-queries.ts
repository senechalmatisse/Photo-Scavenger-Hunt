import { AppLogger, EventBus } from '../../../shared/application/ports';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { LocalDate } from '../../../shared/domain/local-date';
import { Page, PageRequest, Pages } from '../../../shared/domain/pagination';
import { Clock } from '../../../shared/domain/ports';
import { ChallengeStats, GameSessionRepository } from '../domain/game-session.repository';
import { RewardRules } from '../domain/scoring';
import { ChallengeGateway } from './ports';
import { SessionSummaryView, SessionView, toSessionSummary, toSessionView } from './session-view';

/** Consultation d'une partie ; une partie dont l'échéance est passée est expirée à la lecture. */
export class GetGameSession {
  constructor(
    private readonly sessions: GameSessionRepository,
    private readonly challenges: ChallengeGateway,
    private readonly rules: RewardRules,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  async execute(playerId: string, sessionId: string): Promise<SessionView> {
    const session = await this.sessions.findById(sessionId);
    if (!session || !session.isOwnedBy(playerId)) {
      throw new NotFoundError('SESSION_NOT_FOUND', 'Partie introuvable.', { sessionId });
    }
    const now = this.clock.now();
    if (session.expireIfOverdue(now, this.rules)) {
      await this.sessions.save(session);
      await this.bus.publish(session.pullEvents());
    }
    const reference = session.isFinished ? await this.challenges.referencePhotoOf(session.challengeId) : null;
    return toSessionView(session, now, reference);
  }
}

/** US-012 / US-046 : historique paginé des parties du joueur. */
export class ListPlayerHistory {
  constructor(private readonly sessions: GameSessionRepository) {}

  async execute(playerId: string, page: PageRequest): Promise<Page<SessionSummaryView>> {
    return Pages.map(await this.sessions.historyOf(playerId, page), toSessionSummary);
  }
}

/** Statut du joueur sur le défi du jour (affiché sur le tableau de bord). */
export class GetDailySessionStatus {
  constructor(private readonly sessions: GameSessionRepository) {}

  async execute(playerId: string, day: LocalDate): Promise<SessionSummaryView | null> {
    const session = await this.sessions.findDaily(playerId, day);
    return session ? toSessionSummary(session) : null;
  }
}

/** US-085 : statistiques de participation d'un défi. */
export class GetChallengeStats {
  constructor(private readonly sessions: GameSessionRepository) {}

  async execute(challengeId: string): Promise<ChallengeStats & { successRate: number | null }> {
    const stats = await this.sessions.statsFor(challengeId);
    const finished = stats.validated + stats.failed + stats.expired + stats.abandoned;
    return { ...stats, successRate: finished > 0 ? stats.validated / finished : null };
  }
}

/** Traitement périodique : clôt les parties dont le temps limite ou la journée est écoulé. */
export class ExpireOverdueSessions {
  constructor(
    private readonly sessions: GameSessionRepository,
    private readonly rules: RewardRules,
    private readonly clock: Clock,
    private readonly bus: EventBus,
    private readonly logger: AppLogger,
  ) {}

  async execute(batchSize = 200): Promise<number> {
    const now = this.clock.now();
    let expired = 0;
    for (const session of await this.sessions.findOverdue(now, batchSize)) {
      try {
        if (session.expireIfOverdue(now, this.rules)) {
          await this.sessions.save(session);
          await this.bus.publish(session.pullEvents());
          expired += 1;
        }
      } catch (error) {
        // Une partie modifiée en parallèle sera traitée au prochain passage.
        this.logger.warn('Expiration de partie reportée', { sessionId: session.id, error: String(error) });
      }
    }
    return expired;
  }
}

/** Droit à l'effacement (US-005) : suppression des parties d'un joueur supprimé. */
export class ErasePlayerSessions {
  constructor(private readonly sessions: GameSessionRepository) {}

  async execute(playerId: string): Promise<void> {
    await this.sessions.deleteByPlayer(playerId);
  }
}

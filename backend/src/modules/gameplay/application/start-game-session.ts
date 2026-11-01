import { EventBus } from '../../../shared/application/ports';
import { BusinessRuleViolation } from '../../../shared/domain/domain-error';
import { GameCalendar } from '../../../shared/domain/game-calendar';
import { Clock, IdGenerator } from '../../../shared/domain/ports';
import { GameModeRegistry } from '../domain/game-mode';
import { GameSession } from '../domain/game-session';
import { GameSessionRepository } from '../domain/game-session.repository';
import { RewardRules } from '../domain/scoring';
import { buildSessionTerms } from '../domain/session-terms';
import { ChallengeGateway } from './ports';
import { SessionView, toSessionView } from './session-view';

export interface StartedSession {
  readonly session: SessionView;
  /** `true` si une partie déjà en cours a été reprise au lieu d'en créer une nouvelle. */
  readonly resumed: boolean;
}

export interface GameplaySettings {
  readonly participationXp: number;
}

/**
 * US-024 : démarrer une mission.
 * Le mode (quotidien ou catalogue) est déterminé côté serveur, jamais choisi par le client.
 */
export class StartGameSession {
  constructor(
    private readonly sessions: GameSessionRepository,
    private readonly challenges: ChallengeGateway,
    private readonly modes: GameModeRegistry,
    private readonly rules: RewardRules,
    private readonly calendar: GameCalendar,
    private readonly settings: GameplaySettings,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
    private readonly bus: EventBus,
  ) {}

  async execute(playerId: string, challengeId: string): Promise<StartedSession> {
    const challenge = await this.challenges.findPlayable(challengeId);
    if (!challenge) {
      // Scénario « Défi indisponible » : aucune partie n'est créée.
      throw new BusinessRuleViolation('CHALLENGE_UNAVAILABLE', "Ce défi n'est pas disponible pour le moment.", { challengeId });
    }

    const now = this.clock.now();
    const active = await this.sessions.findActive(playerId, challengeId);
    if (active) {
      if (!active.expireIfOverdue(now, this.rules)) {
        return { session: toSessionView(active, now), resumed: true };
      }
      await this.persist(active);
    }

    const day = this.calendar.dayOf(now);
    const isDaily = (await this.challenges.todaysDailyChallengeId()) === challengeId;
    const mode = this.modes.get(isDaily ? 'DAILY' : 'CATALOG');
    if (mode.oncePerDay && (await this.sessions.findDaily(playerId, day))) {
      throw new BusinessRuleViolation('DAILY_ALREADY_PLAYED', 'Vous avez déjà joué le défi du jour. Revenez demain !');
    }
    const isReplay = await this.sessions.hasFinished(playerId, challengeId);
    if (isReplay && !(mode.allowsReplay && challenge.replayable)) {
      throw new BusinessRuleViolation('CHALLENGE_ALREADY_PLAYED', 'Vous avez déjà terminé ce défi, il ne peut pas être rejoué.');
    }

    const terms = buildSessionTerms(challenge, mode, {
      isReplay,
      participationXp: this.settings.participationXp,
      context: { startedAt: now, endOfGameDay: this.calendar.endOfDay(day) },
    });
    const session = GameSession.start({ id: this.ids.next(), playerId, challengeId, mode: mode.kind, day, terms, now });
    await this.persist(session);
    return { session: toSessionView(session, now), resumed: false };
  }

  private async persist(session: GameSession): Promise<void> {
    await this.sessions.save(session);
    await this.bus.publish(session.pullEvents());
  }
}

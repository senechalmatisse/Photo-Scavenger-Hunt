import { EventBus } from '../../../shared/application/ports';
import { NotFoundError } from '../../../shared/domain/domain-error';
import { Clock } from '../../../shared/domain/ports';
import type { Hint } from '../../challenges/public-api';
import { GameSession } from '../domain/game-session';
import { GameSessionRepository } from '../domain/game-session.repository';
import { RewardRules } from '../domain/scoring';
import { Attempt } from '../domain/session-states';
import { AnswerJudge, ChallengeGateway, PhotoFactsGateway } from './ports';
import { SessionView, toSessionView } from './session-view';

export interface GameplayCommandDeps {
  readonly sessions: GameSessionRepository;
  readonly challenges: ChallengeGateway;
  readonly rules: RewardRules;
  readonly clock: Clock;
  readonly bus: EventBus;
}

/**
 * Squelette commun des commandes sur une partie (pattern Template Method) :
 * charger la partie du joueur → appliquer l'action → persister → publier les événements → vue.
 */
abstract class SessionCommand<TInput, TResult> {
  constructor(protected readonly deps: GameplayCommandDeps) {}

  async execute(playerId: string, sessionId: string, input: TInput): Promise<{ result: TResult; session: SessionView }> {
    const session = await this.deps.sessions.findById(sessionId);
    // Une partie d'un autre joueur est traitée comme inexistante (pas de fuite d'information).
    if (!session || !session.isOwnedBy(playerId)) {
      throw new NotFoundError('SESSION_NOT_FOUND', 'Partie introuvable.', { sessionId });
    }
    const now = this.deps.clock.now();
    const result = await this.apply(session, input, now);
    await this.deps.sessions.save(session);
    await this.deps.bus.publish(session.pullEvents());
    const reference = session.isFinished ? await this.deps.challenges.referencePhotoOf(session.challengeId) : null;
    return { result, session: toSessionView(session, now, reference) };
  }

  protected abstract apply(session: GameSession, input: TInput, now: Date): Promise<TResult>;
}

/** US-025 / US-026 : révéler l'indice suivant (son coût est déduit au calcul du score). */
export class UseHint extends SessionCommand<void, Hint | null> {
  protected async apply(session: GameSession, _input: void, now: Date): Promise<Hint | null> {
    return session.useHint(now, this.deps.rules);
  }
}

/** US-027 / US-040 : soumettre une photographie, validée immédiatement côté serveur. */
export class SubmitAnswer extends SessionCommand<{ photoId: string }, Attempt | null> {
  constructor(
    deps: GameplayCommandDeps,
    private readonly photos: PhotoFactsGateway,
    private readonly judge: AnswerJudge,
  ) {
    super(deps);
  }

  protected async apply(session: GameSession, input: { photoId: string }, now: Date): Promise<Attempt | null> {
    if (session.expireIfOverdue(now, this.deps.rules)) {
      return null;
    }
    const facts = await this.photos.factsFor(input.photoId);
    if (!facts) {
      throw new NotFoundError(
        'PHOTO_NOT_FOUND',
        'Photographie introuvable, privée ou sous une licence non autorisée.',
        { photoId: input.photoId },
      );
    }
    const report = this.judge.judge(session.terms.validation, facts);
    return session.submitAnswer({ photoId: input.photoId, report }, now, this.deps.rules);
  }
}

export class PauseSession extends SessionCommand<void, void> {
  protected async apply(session: GameSession, _input: void, now: Date): Promise<void> {
    session.pause(now, this.deps.rules);
  }
}

export class ResumeSession extends SessionCommand<void, void> {
  protected async apply(session: GameSession, _input: void, now: Date): Promise<void> {
    session.resume(now);
  }
}

export class AbandonSession extends SessionCommand<void, void> {
  protected async apply(session: GameSession, _input: void, now: Date): Promise<void> {
    session.abandon(now, this.deps.rules);
  }
}

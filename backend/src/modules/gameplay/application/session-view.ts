import type { CriterionOutcome, Hint, ReferencePhoto } from '../../challenges/public-api';
import { GameModeKind } from '../domain/game-mode';
import { GameSession } from '../domain/game-session';
import { ScoreBreakdown } from '../domain/scoring';
import { SessionStatus } from '../domain/session-states';

export interface AttemptView {
  readonly photoId: string;
  readonly submittedAt: string;
  readonly accepted: boolean;
  readonly outcomes: readonly CriterionOutcome[];
}

/** Vue d'une partie pour le joueur (écrans Jeu et Résultat). */
export interface SessionView {
  readonly id: string;
  readonly challengeId: string;
  readonly mode: GameModeKind;
  readonly status: SessionStatus;
  readonly isFinished: boolean;
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: string;
  readonly theme: string;
  readonly zoneLabel: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly elapsedMs: number;
  readonly deadline: string | null;
  readonly timeLimitSeconds: number | null;
  readonly allowsPause: boolean;
  readonly hints: {
    readonly total: number;
    readonly revealed: readonly Hint[];
    readonly nextCost: number | null;
  };
  readonly attempts: readonly AttemptView[];
  readonly attemptsLeft: number;
  readonly maxAttempts: number;
  /** Renseigné uniquement quand la partie est terminée (la réponse n'est révélée qu'à la fin). */
  readonly result: {
    readonly score: ScoreBreakdown | null;
    readonly points: number;
    readonly xp: number;
    readonly referencePhoto: ReferencePhoto | null;
  } | null;
}

export function toSessionView(session: GameSession, now: Date, referencePhoto: ReferencePhoto | null = null): SessionView {
  const terms = session.terms;
  const deadline = session.deadline();
  return {
    id: session.id,
    challengeId: session.challengeId,
    mode: session.mode,
    status: session.status,
    isFinished: session.isFinished,
    title: terms.challengeTitle,
    riddle: terms.riddle,
    difficulty: terms.difficulty,
    theme: terms.theme,
    zoneLabel: terms.zoneLabel,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    elapsedMs: session.elapsedMs(now),
    deadline: deadline ? deadline.toISOString() : null,
    timeLimitSeconds: terms.timeLimitSeconds,
    allowsPause: terms.allowsPause,
    hints: {
      total: terms.hints.length,
      revealed: session.revealedHints,
      nextCost: session.hintsUsed < terms.hints.length ? terms.hints[session.hintsUsed].cost : null,
    },
    attempts: session.attempts.map((attempt) => ({
      photoId: attempt.photoId,
      submittedAt: attempt.submittedAt.toISOString(),
      accepted: attempt.accepted,
      outcomes: attempt.outcomes,
    })),
    attemptsLeft: session.attemptsLeft,
    maxAttempts: terms.maxAttempts,
    result: session.isFinished
      ? { score: session.score, points: session.points, xp: session.xpAwarded, referencePhoto }
      : null,
  };
}

/** Résumé d'une partie pour l'historique (US-012, US-046). */
export interface SessionSummaryView {
  readonly id: string;
  readonly challengeId: string;
  readonly title: string;
  readonly mode: GameModeKind;
  readonly status: SessionStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly points: number;
  readonly xp: number;
  readonly hintsUsed: number;
  readonly attempts: number;
}

export function toSessionSummary(session: GameSession): SessionSummaryView {
  return {
    id: session.id,
    challengeId: session.challengeId,
    title: session.terms.challengeTitle,
    mode: session.mode,
    status: session.status,
    startedAt: session.startedAt.toISOString(),
    endedAt: session.endedAt ? session.endedAt.toISOString() : null,
    points: session.points,
    xp: session.xpAwarded,
    hintsUsed: session.hintsUsed,
    attempts: session.attempts.length,
  };
}

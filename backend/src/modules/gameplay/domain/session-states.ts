import { BusinessRuleViolation } from '../../../shared/domain/domain-error';
import type { CriterionOutcome, Hint, ValidationReport } from '../../challenges/public-api';
import { RewardRules, TerminalStatus } from './scoring';
import { SessionTerms } from './session-terms';

export type SessionStatus = 'IN_PROGRESS' | 'PAUSED' | TerminalStatus;

export interface Attempt {
  readonly photoId: string;
  readonly submittedAt: Date;
  readonly accepted: boolean;
  readonly outcomes: readonly CriterionOutcome[];
}

/** Réponse déjà jugée par le service de validation (le domaine ne parle pas au fournisseur de photos). */
export interface JudgedAnswer {
  readonly photoId: string;
  readonly report: ValidationReport;
}

/** Opérations internes qu'un état peut déclencher sur la partie (contexte du pattern State). */
export interface SessionMachine {
  readonly terms: SessionTerms;
  readonly hintsUsed: number;
  readonly attemptsCount: number;
  isOverdue(now: Date): boolean;
  hasAttempted(photoId: string): boolean;
  revealNextHint(): Hint;
  recordAttempt(attempt: Attempt): void;
  pauseClock(now: Date): void;
  resumeClock(now: Date): void;
  finish(status: TerminalStatus, now: Date, rules: RewardRules): void;
}

/**
 * État d'une partie (pattern State, cf. diagramme du §5.1).
 * Chaque état décide des transitions autorisées ; la partie délègue sans `switch` sur son statut.
 */
export interface SessionState {
  readonly status: SessionStatus;
  readonly isFinished: boolean;
  /** Retourne l'indice révélé, ou `null` si la partie vient d'expirer. */
  useHint(machine: SessionMachine, now: Date, rules: RewardRules): Hint | null;
  /** Retourne la tentative enregistrée, ou `null` si la partie vient d'expirer. */
  submit(machine: SessionMachine, answer: JudgedAnswer, now: Date, rules: RewardRules): Attempt | null;
  pause(machine: SessionMachine, now: Date, rules: RewardRules): void;
  resume(machine: SessionMachine, now: Date): void;
  abandon(machine: SessionMachine, now: Date, rules: RewardRules): void;
  expireIfOverdue(machine: SessionMachine, now: Date, rules: RewardRules): boolean;
}

class InProgressState implements SessionState {
  readonly status = 'IN_PROGRESS';
  readonly isFinished = false;

  useHint(machine: SessionMachine, now: Date, rules: RewardRules): Hint | null {
    if (this.expireIfOverdue(machine, now, rules)) {
      return null;
    }
    if (machine.hintsUsed >= machine.terms.hints.length) {
      throw new BusinessRuleViolation('NO_MORE_HINTS', "Tous les indices de ce défi ont déjà été révélés.");
    }
    return machine.revealNextHint();
  }

  submit(machine: SessionMachine, answer: JudgedAnswer, now: Date, rules: RewardRules): Attempt | null {
    if (this.expireIfOverdue(machine, now, rules)) {
      return null;
    }
    if (machine.hasAttempted(answer.photoId)) {
      throw new BusinessRuleViolation('PHOTO_ALREADY_SUBMITTED', 'Vous avez déjà proposé cette photographie.');
    }
    const attempt: Attempt = {
      photoId: answer.photoId,
      submittedAt: now,
      accepted: answer.report.accepted,
      outcomes: answer.report.outcomes,
    };
    machine.recordAttempt(attempt);
    if (attempt.accepted) {
      machine.finish('VALIDATED', now, rules);
    } else if (machine.attemptsCount >= machine.terms.maxAttempts) {
      machine.finish('FAILED', now, rules);
    }
    return attempt;
  }

  pause(machine: SessionMachine, now: Date, rules: RewardRules): void {
    if (!machine.terms.allowsPause) {
      throw new BusinessRuleViolation('PAUSE_NOT_ALLOWED', "Ce mode de jeu n'autorise pas la pause.");
    }
    if (!this.expireIfOverdue(machine, now, rules)) {
      machine.pauseClock(now);
    }
  }

  resume(): void {
    throw new BusinessRuleViolation('SESSION_ALREADY_RUNNING', 'La partie est déjà en cours.');
  }

  abandon(machine: SessionMachine, now: Date, rules: RewardRules): void {
    machine.finish('ABANDONED', now, rules);
  }

  expireIfOverdue(machine: SessionMachine, now: Date, rules: RewardRules): boolean {
    if (!machine.isOverdue(now)) {
      return false;
    }
    machine.finish('EXPIRED', now, rules);
    return true;
  }
}

class PausedState implements SessionState {
  readonly status = 'PAUSED';
  readonly isFinished = false;

  useHint(): Hint | null {
    throw PausedState.paused();
  }

  submit(): Attempt | null {
    throw PausedState.paused();
  }

  pause(): void {
    throw new BusinessRuleViolation('SESSION_ALREADY_PAUSED', 'La partie est déjà en pause.');
  }

  resume(machine: SessionMachine, now: Date): void {
    machine.resumeClock(now);
  }

  abandon(machine: SessionMachine, now: Date, rules: RewardRules): void {
    machine.finish('ABANDONED', now, rules);
  }

  /** Le chronomètre est arrêté pendant la pause : rien n'expire. */
  expireIfOverdue(): boolean {
    return false;
  }

  private static paused(): BusinessRuleViolation {
    return new BusinessRuleViolation('SESSION_PAUSED', 'Reprenez la partie avant de continuer.');
  }
}

class FinishedState implements SessionState {
  readonly isFinished = true;

  constructor(readonly status: TerminalStatus) {}

  useHint(): Hint | null {
    throw this.finished();
  }

  submit(): Attempt | null {
    throw this.finished();
  }

  pause(): void {
    throw this.finished();
  }

  resume(): void {
    throw this.finished();
  }

  abandon(): void {
    throw this.finished();
  }

  expireIfOverdue(): boolean {
    return false;
  }

  private finished(): BusinessRuleViolation {
    return new BusinessRuleViolation('SESSION_FINISHED', 'Cette partie est terminée.', { status: this.status });
  }
}

const STATES: Readonly<Record<SessionStatus, SessionState>> = {
  IN_PROGRESS: new InProgressState(),
  PAUSED: new PausedState(),
  VALIDATED: new FinishedState('VALIDATED'),
  FAILED: new FinishedState('FAILED'),
  EXPIRED: new FinishedState('EXPIRED'),
  ABANDONED: new FinishedState('ABANDONED'),
};

export function stateFor(status: SessionStatus): SessionState {
  return STATES[status];
}

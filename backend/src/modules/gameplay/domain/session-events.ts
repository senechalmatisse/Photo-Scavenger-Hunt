import { DomainEvent } from '../../../shared/domain/aggregate-root';
import { LocalDate } from '../../../shared/domain/local-date';
import { GameModeKind } from './game-mode';
import { TerminalStatus } from './scoring';

export class GameSessionStarted implements DomainEvent {
  static readonly TYPE = 'gameplay.session-started';
  readonly type = GameSessionStarted.TYPE;

  constructor(
    readonly sessionId: string,
    readonly playerId: string,
    readonly challengeId: string,
    readonly mode: GameModeKind,
    readonly occurredAt: Date,
  ) {}
}

export interface SessionFinishedPayload {
  readonly sessionId: string;
  readonly playerId: string;
  readonly challengeId: string;
  readonly mode: GameModeKind;
  readonly day: LocalDate;
  readonly status: TerminalStatus;
  readonly points: number;
  readonly xp: number;
  readonly hintsUsed: number;
  readonly attempts: number;
  readonly elapsedMs: number;
  readonly isGeographic: boolean;
  readonly isReplay: boolean;
}

/** Fait central consommé par la progression, les classements et (demain) les notifications. */
export class GameSessionFinished implements DomainEvent {
  static readonly TYPE = 'gameplay.session-finished';
  readonly type = GameSessionFinished.TYPE;

  constructor(
    readonly payload: SessionFinishedPayload,
    readonly occurredAt: Date,
  ) {}
}

import { AggregateRoot } from '../../../shared/domain/aggregate-root';
import { LocalDate } from '../../../shared/domain/local-date';
import type { Hint } from '../../challenges/public-api';
import { GameModeKind } from './game-mode';
import { RewardRules, ScoreBreakdown, TerminalStatus } from './scoring';
import { GameSessionFinished, GameSessionStarted } from './session-events';
import { Attempt, JudgedAnswer, SessionMachine, SessionState, SessionStatus, stateFor } from './session-states';
import { SessionTerms } from './session-terms';

/** Forme persistée d'une partie. */
export interface GameSessionSnapshot {
  readonly id: string;
  readonly version: number;
  readonly playerId: string;
  readonly challengeId: string;
  readonly mode: GameModeKind;
  readonly day: LocalDate;
  readonly status: SessionStatus;
  readonly terms: SessionTerms;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
  readonly activeElapsedMs: number;
  readonly runningSince: Date | null;
  readonly hintsUsed: number;
  readonly attempts: readonly Attempt[];
  readonly score: ScoreBreakdown | null;
  readonly xpAwarded: number;
}

type SessionProps = {
  -readonly [K in keyof Omit<GameSessionSnapshot, 'id' | 'version'>]: GameSessionSnapshot[K];
};

export interface StartSessionParams {
  readonly id: string;
  readonly playerId: string;
  readonly challengeId: string;
  readonly mode: GameModeKind;
  readonly day: LocalDate;
  readonly terms: SessionTerms;
  readonly now: Date;
}

/**
 * Agrégat Partie : la participation réelle d'un joueur à un défi.
 *
 * Les commandes délèguent à l'état courant (pattern State) ; le temps de jeu est mesuré en
 * « temps actif » (la pause arrête le chronomètre), ce qui sert au temps limite et au bonus de rapidité.
 */
export class GameSession extends AggregateRoot {
  private state: SessionState;
  private readonly machine: SessionMachine;

  private constructor(
    id: string,
    version: number,
    private readonly props: SessionProps,
  ) {
    super(id, version);
    this.state = stateFor(props.status);
    this.machine = this.createMachine();
  }

  static start(params: StartSessionParams): GameSession {
    const session = new GameSession(params.id, 0, {
      playerId: params.playerId,
      challengeId: params.challengeId,
      mode: params.mode,
      day: params.day,
      status: 'IN_PROGRESS',
      terms: params.terms,
      startedAt: params.now,
      endedAt: null,
      activeElapsedMs: 0,
      runningSince: params.now,
      hintsUsed: 0,
      attempts: [],
      score: null,
      xpAwarded: 0,
    });
    session.record(
      new GameSessionStarted(params.id, params.playerId, params.challengeId, params.mode, params.now),
    );
    return session;
  }

  static restore(snapshot: GameSessionSnapshot): GameSession {
    const { id, version, ...props } = snapshot;
    return new GameSession(id, version, { ...props, attempts: [...props.attempts] });
  }

  // --- Commandes ---------------------------------------------------------------------------

  useHint(now: Date, rules: RewardRules): Hint | null {
    return this.state.useHint(this.machine, now, rules);
  }

  submitAnswer(answer: JudgedAnswer, now: Date, rules: RewardRules): Attempt | null {
    return this.state.submit(this.machine, answer, now, rules);
  }

  pause(now: Date, rules: RewardRules): void {
    this.state.pause(this.machine, now, rules);
  }

  resume(now: Date): void {
    this.state.resume(this.machine, now);
  }

  abandon(now: Date, rules: RewardRules): void {
    this.state.abandon(this.machine, now, rules);
  }

  expireIfOverdue(now: Date, rules: RewardRules): boolean {
    return this.state.expireIfOverdue(this.machine, now, rules);
  }

  // --- Lecture -----------------------------------------------------------------------------

  isOwnedBy(playerId: string): boolean {
    return this.props.playerId === playerId;
  }

  get status(): SessionStatus {
    return this.state.status;
  }

  get isFinished(): boolean {
    return this.state.isFinished;
  }

  get playerId(): string {
    return this.props.playerId;
  }

  get challengeId(): string {
    return this.props.challengeId;
  }

  get mode(): GameModeKind {
    return this.props.mode;
  }

  get day(): LocalDate {
    return this.props.day;
  }

  get terms(): SessionTerms {
    return this.props.terms;
  }

  get startedAt(): Date {
    return this.props.startedAt;
  }

  get endedAt(): Date | null {
    return this.props.endedAt;
  }

  get attempts(): readonly Attempt[] {
    return this.props.attempts;
  }

  get hintsUsed(): number {
    return this.props.hintsUsed;
  }

  get revealedHints(): readonly Hint[] {
    return this.props.terms.hints.slice(0, this.props.hintsUsed);
  }

  get attemptsLeft(): number {
    return Math.max(0, this.props.terms.maxAttempts - this.props.attempts.length);
  }

  get score(): ScoreBreakdown | null {
    return this.props.score;
  }

  get points(): number {
    return this.props.score?.total ?? 0;
  }

  get xpAwarded(): number {
    return this.props.xpAwarded;
  }

  /** Temps de jeu actif (hors pauses), en millisecondes. */
  elapsedMs(now: Date): number {
    const running = this.props.runningSince ? Math.max(0, now.getTime() - this.props.runningSince.getTime()) : 0;
    return this.props.activeElapsedMs + running;
  }

  /** Prochaine échéance de la partie en cours (temps limite ou fin de journée), sinon `null`. */
  deadline(): Date | null {
    if (this.props.status !== 'IN_PROGRESS' || this.props.runningSince === null) {
      return null;
    }
    const candidates: number[] = [];
    const { timeLimitSeconds, expiresAt } = this.props.terms;
    if (timeLimitSeconds !== null) {
      candidates.push(this.props.runningSince.getTime() + timeLimitSeconds * 1000 - this.props.activeElapsedMs);
    }
    if (expiresAt !== null) {
      candidates.push(new Date(expiresAt).getTime());
    }
    return candidates.length > 0 ? new Date(Math.min(...candidates)) : null;
  }

  toSnapshot(): GameSessionSnapshot {
    return { id: this.id, version: this.version, ...this.props, attempts: [...this.props.attempts] };
  }

  // --- Contexte du pattern State -------------------------------------------------------------

  private createMachine(): SessionMachine {
    const props = this.props;
    return {
      get terms() {
        return props.terms;
      },
      get hintsUsed() {
        return props.hintsUsed;
      },
      get attemptsCount() {
        return props.attempts.length;
      },
      isOverdue: (now) => {
        const deadline = this.deadline();
        return deadline !== null && now.getTime() >= deadline.getTime();
      },
      hasAttempted: (photoId) => props.attempts.some((attempt) => attempt.photoId === photoId),
      revealNextHint: () => {
        const hint = props.terms.hints[props.hintsUsed];
        props.hintsUsed += 1;
        return hint;
      },
      recordAttempt: (attempt) => {
        props.attempts = [...props.attempts, attempt];
      },
      pauseClock: (now) => {
        this.stopClock(now);
        this.transitionTo('PAUSED');
      },
      resumeClock: (now) => {
        props.runningSince = now;
        this.transitionTo('IN_PROGRESS');
      },
      finish: (status, now, rules) => this.finish(status, now, rules),
    };
  }

  private finish(status: TerminalStatus, now: Date, rules: RewardRules): void {
    this.stopClock(now);
    this.props.endedAt = now;
    if (status === 'VALIDATED') {
      this.props.score = rules.scoring.score({
        terms: this.props.terms,
        mode: this.props.mode,
        hintsUsed: this.props.hintsUsed,
        attempts: this.props.attempts.length,
        elapsedMs: this.props.activeElapsedMs,
      });
    }
    this.props.xpAwarded = rules.xp.xpFor(status, this.props.terms);
    this.transitionTo(status);
    this.record(
      new GameSessionFinished(
        {
          sessionId: this.id,
          playerId: this.props.playerId,
          challengeId: this.props.challengeId,
          mode: this.props.mode,
          day: this.props.day,
          status,
          points: this.points,
          xp: this.props.xpAwarded,
          hintsUsed: this.props.hintsUsed,
          attempts: this.props.attempts.length,
          elapsedMs: this.props.activeElapsedMs,
          isGeographic: this.props.terms.isGeographic,
          isReplay: this.props.terms.isReplay,
        },
        now,
      ),
    );
  }

  private stopClock(now: Date): void {
    if (this.props.runningSince !== null) {
      this.props.activeElapsedMs += Math.max(0, now.getTime() - this.props.runningSince.getTime());
      this.props.runningSince = null;
    }
  }

  private transitionTo(status: SessionStatus): void {
    this.props.status = status;
    this.state = stateFor(status);
  }
}

import { ConflictError } from '../../../shared/domain/domain-error';
import { LocalDate } from '../../../shared/domain/local-date';
import { Page, PageRequest, Pages } from '../../../shared/domain/pagination';
import { InMemorySnapshotStore } from '../../../shared/infrastructure/persistence/in-memory-store';
import { GameSession, GameSessionSnapshot } from '../domain/game-session';
import { ChallengeStats, GameSessionRepository } from '../domain/game-session.repository';
import { SessionStatus } from '../domain/session-states';

const FINISHED: readonly SessionStatus[] = ['VALIDATED', 'FAILED', 'EXPIRED', 'ABANDONED'];

export class InMemoryGameSessionRepository implements GameSessionRepository {
  private readonly store = new InMemorySnapshotStore<GameSessionSnapshot>('La partie');

  async findById(id: string): Promise<GameSession | null> {
    const snapshot = this.store.get(id);
    return snapshot ? GameSession.restore(snapshot) : null;
  }

  async findActive(playerId: string, challengeId: string): Promise<GameSession | null> {
    return this.findOne((s) => s.playerId === playerId && s.challengeId === challengeId && !FINISHED.includes(s.status));
  }

  async findDaily(playerId: string, day: LocalDate): Promise<GameSession | null> {
    return this.findOne((s) => s.playerId === playerId && s.day === day && s.mode === 'DAILY');
  }

  async hasFinished(playerId: string, challengeId: string): Promise<boolean> {
    return this.store.all().some((s) => s.playerId === playerId && s.challengeId === challengeId && FINISHED.includes(s.status));
  }

  async findOverdue(now: Date, limit: number): Promise<GameSession[]> {
    return this.store
      .all()
      .map((snapshot) => GameSession.restore(snapshot))
      .filter((session) => {
        const deadline = session.deadline();
        return deadline !== null && deadline.getTime() <= now.getTime();
      })
      .slice(0, limit);
  }

  async historyOf(playerId: string, page: PageRequest): Promise<Page<GameSession>> {
    const sessions = this.store
      .all()
      .filter((s) => s.playerId === playerId)
      .sort((a, b) => b.startedAt.getTime() - a.startedAt.getTime())
      .map((snapshot) => GameSession.restore(snapshot));
    return Pages.slice(sessions, page);
  }

  async statsFor(challengeId: string): Promise<ChallengeStats> {
    const sessions = this.store.all().filter((s) => s.challengeId === challengeId);
    const count = (status: SessionStatus) => sessions.filter((s) => s.status === status).length;
    const average = (values: number[]) => (values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : 0);
    const validated = sessions.filter((s) => s.status === 'VALIDATED');
    return {
      plays: sessions.length,
      uniquePlayers: new Set(sessions.map((s) => s.playerId)).size,
      validated: validated.length,
      failed: count('FAILED'),
      expired: count('EXPIRED'),
      abandoned: count('ABANDONED'),
      inProgress: count('IN_PROGRESS') + count('PAUSED'),
      averageHints: average(sessions.map((s) => s.hintsUsed)),
      averageAttempts: average(sessions.map((s) => s.attempts.length)),
      averageDurationMs: validated.length ? average(validated.map((s) => s.activeElapsedMs)) : null,
    };
  }

  async save(session: GameSession): Promise<void> {
    const snapshot = session.toSnapshot();
    const others = this.store.all().filter((s) => s.id !== snapshot.id);
    if (
      !FINISHED.includes(snapshot.status) &&
      others.some((s) => s.playerId === snapshot.playerId && s.challengeId === snapshot.challengeId && !FINISHED.includes(s.status))
    ) {
      throw new ConflictError('SESSION_ALREADY_ACTIVE', 'Une partie est déjà en cours sur ce défi.');
    }
    if (snapshot.mode === 'DAILY' && others.some((s) => s.playerId === snapshot.playerId && s.day === snapshot.day && s.mode === 'DAILY')) {
      throw new ConflictError('DAILY_ALREADY_PLAYED', 'Vous avez déjà joué le défi du jour.');
    }
    session.commitVersion(this.store.put(snapshot.id, snapshot));
  }

  async deleteByPlayer(playerId: string): Promise<void> {
    this.store.deleteWhere((s) => s.playerId === playerId);
  }

  private async findOne(predicate: (snapshot: GameSessionSnapshot) => boolean): Promise<GameSession | null> {
    const snapshot = this.store.all().find(predicate);
    return snapshot ? GameSession.restore(snapshot) : null;
  }
}

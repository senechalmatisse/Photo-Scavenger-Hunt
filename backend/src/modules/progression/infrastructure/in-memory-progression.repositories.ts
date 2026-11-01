import { InMemorySnapshotStore } from '../../../shared/infrastructure/persistence/in-memory-store';
import { PlayerProgress, PlayerProgressSnapshot } from '../domain/player-progress';
import { PlayerProgressRepository, RewardLedger, RewardLedgerEntry } from '../domain/progression.repository';

export class InMemoryPlayerProgressRepository implements PlayerProgressRepository {
  private readonly store = new InMemorySnapshotStore<PlayerProgressSnapshot>('La progression');

  async findByPlayer(playerId: string): Promise<PlayerProgress | null> {
    const snapshot = this.store.get(playerId);
    return snapshot ? PlayerProgress.restore(snapshot) : null;
  }

  async save(progress: PlayerProgress): Promise<void> {
    progress.commitVersion(this.store.put(progress.playerId, progress.toSnapshot()));
  }

  async deleteByPlayer(playerId: string): Promise<void> {
    this.store.delete(playerId);
  }
}

export class InMemoryRewardLedger implements RewardLedger {
  private readonly entries = new Map<string, RewardLedgerEntry>();

  async append(entry: RewardLedgerEntry): Promise<boolean> {
    if (this.entries.has(entry.sessionId)) {
      return false;
    }
    this.entries.set(entry.sessionId, { ...entry });
    return true;
  }

  async deleteByPlayer(playerId: string): Promise<void> {
    for (const [sessionId, entry] of this.entries) {
      if (entry.playerId === playerId) {
        this.entries.delete(sessionId);
      }
    }
  }
}

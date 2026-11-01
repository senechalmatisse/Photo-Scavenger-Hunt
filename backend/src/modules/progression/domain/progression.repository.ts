import { LocalDate } from '../../../shared/domain/local-date';
import { PlayerProgress } from './player-progress';

export interface PlayerProgressRepository {
  findByPlayer(playerId: string): Promise<PlayerProgress | null>;
  save(progress: PlayerProgress): Promise<void>;
  deleteByPlayer(playerId: string): Promise<void>;
}

/** Écriture comptable d'une partie : source de vérité des points (reconstruction des classements). */
export interface RewardLedgerEntry {
  readonly sessionId: string;
  readonly playerId: string;
  readonly points: number;
  readonly xp: number;
  readonly day: LocalDate;
  readonly awardedAt: Date;
}

/** Registre idempotent : une partie n'est comptabilisée qu'une fois, même si l'événement est rejoué. */
export interface RewardLedger {
  /** Retourne `false` si la partie était déjà comptabilisée. */
  append(entry: RewardLedgerEntry): Promise<boolean>;
  deleteByPlayer(playerId: string): Promise<void>;
}

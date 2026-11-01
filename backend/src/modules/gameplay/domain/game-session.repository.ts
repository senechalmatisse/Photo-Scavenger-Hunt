import { LocalDate } from '../../../shared/domain/local-date';
import { Page, PageRequest } from '../../../shared/domain/pagination';
import { GameSession } from './game-session';

/** Statistiques de participation d'un défi (US-085). */
export interface ChallengeStats {
  readonly plays: number;
  readonly uniquePlayers: number;
  readonly validated: number;
  readonly failed: number;
  readonly expired: number;
  readonly abandoned: number;
  readonly inProgress: number;
  readonly averageHints: number;
  readonly averageAttempts: number;
  readonly averageDurationMs: number | null;
}

export interface GameSessionRepository {
  findById(id: string): Promise<GameSession | null>;
  /** Partie non terminée (en cours ou en pause) d'un joueur sur un défi. */
  findActive(playerId: string, challengeId: string): Promise<GameSession | null>;
  findDaily(playerId: string, day: LocalDate): Promise<GameSession | null>;
  hasFinished(playerId: string, challengeId: string): Promise<boolean>;
  /** Parties en cours dont l'échéance est dépassée (traitement périodique d'expiration). */
  findOverdue(now: Date, limit: number): Promise<GameSession[]>;
  historyOf(playerId: string, page: PageRequest): Promise<Page<GameSession>>;
  statsFor(challengeId: string): Promise<ChallengeStats>;
  save(session: GameSession): Promise<void>;
  deleteByPlayer(playerId: string): Promise<void>;
}

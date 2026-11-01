import { BoundingBox } from '../../../shared/domain/geo';
import { LocalDate } from '../../../shared/domain/local-date';
import { Page, PageRequest } from '../../../shared/domain/pagination';
import { Challenge, ChallengeStatus, Difficulty, Theme } from './challenge';

export interface CatalogFilter {
  readonly difficulty?: Difficulty;
  readonly theme?: Theme;
  /** Défis dont la zone publique intersecte ce rectangle (filtre « région »). */
  readonly area?: BoundingBox;
}

export interface ChallengeRepository {
  findById(id: string): Promise<Challenge | null>;
  save(challenge: Challenge): Promise<void>;
  /** Catalogue joueur : défis publiés et disponibles à l'instant donné. */
  findPlayable(filter: CatalogFilter, at: Date, page: PageRequest): Promise<Page<Challenge>>;
  /** Back-office : tous les défis, filtrables par statut. */
  findForAdmin(status: ChallengeStatus | undefined, page: PageRequest): Promise<Page<Challenge>>;
  /** Défis publiés et éligibles au défi quotidien à la date donnée. */
  findDailyCandidates(at: Date): Promise<Challenge[]>;
  /** Défis publiés (contrôle périodique de disponibilité des photos, US-084). */
  findPublished(): Promise<Challenge[]>;
}

/** Planning du défi quotidien : une entrée par journée de jeu. */
export interface DailyChallengeSchedule {
  challengeIdFor(day: LocalDate): Promise<string | null>;
  /** Affectation automatique, sans écraser une affectation concurrente (premier arrivé gagne). */
  assignIfAbsent(day: LocalDate, challengeId: string, at: Date): Promise<void>;
  /** Affectation qui remplace l'existante (programmation par un administrateur, ou remplacement). */
  assign(day: LocalDate, challengeId: string, at: Date, assignment?: 'MANUAL' | 'AUTO'): Promise<void>;
  challengeIdsBetween(from: LocalDate, to: LocalDate): Promise<string[]>;
}

/** Stratégie de choix du défi quotidien quand aucun n'a été programmé. */
export interface DailyChallengePicker {
  pick(day: LocalDate, candidateIds: readonly string[], recentlyUsed: ReadonlySet<string>): string | null;
}

/**
 * Choix déterministe : tous les serveurs (et tous les joueurs) obtiennent le même défi pour un jour donné,
 * en évitant autant que possible les défis déjà proposés récemment.
 */
export class DeterministicDailyPicker implements DailyChallengePicker {
  pick(day: LocalDate, candidateIds: readonly string[], recentlyUsed: ReadonlySet<string>): string | null {
    const all = [...candidateIds].sort();
    if (all.length === 0) {
      return null;
    }
    const fresh = all.filter((id) => !recentlyUsed.has(id));
    const pool = fresh.length > 0 ? fresh : all;
    return pool[fnv1a(day) % pool.length];
  }
}

function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

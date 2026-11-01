/** Statistiques personnelles d'un joueur (US-055). */
export interface PlayerStats {
  readonly missionsPlayed: number;
  readonly missionsWon: number;
  readonly missionsWonWithoutHint: number;
  readonly geoMissionsWon: number;
  readonly dailyCompleted: number;
  readonly hintsUsed: number;
  /** Photographies proposées en réponse (approximation de « photos découvertes »). */
  readonly photosSubmitted: number;
}

export const EMPTY_STATS: PlayerStats = {
  missionsPlayed: 0,
  missionsWon: 0,
  missionsWonWithoutHint: 0,
  geoMissionsWon: 0,
  dailyCompleted: 0,
  hintsUsed: 0,
  photosSubmitted: 0,
};

/** Ce qu'une règle de badge peut observer. */
export interface AchievementSubject {
  readonly stats: PlayerStats;
  readonly bestStreak: number;
  readonly level: number;
}

/** Définition d'un badge (pattern Specification). */
export interface AchievementDefinition {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  isSatisfiedBy(subject: AchievementSubject): boolean;
}

/** Spécification générique « une mesure atteint un seuil » : couvre la plupart des badges. */
export class ThresholdAchievement implements AchievementDefinition {
  constructor(
    readonly code: string,
    readonly name: string,
    readonly description: string,
    readonly icon: string,
    private readonly measure: (subject: AchievementSubject) => number,
    private readonly threshold: number,
  ) {}

  isSatisfiedBy(subject: AchievementSubject): boolean {
    return this.measure(subject) >= this.threshold;
  }
}

/** Badges d'exemple du cahier des charges (§3.6). Ajouter un badge = ajouter une entrée. */
export const DEFAULT_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  new ThresholdAchievement('EXPLORER', 'Explorateur', 'Terminer 10 missions géographiques.', 'compass', (s) => s.stats.geoMissionsWon, 10),
  new ThresholdAchievement('LIGHTNING', 'Éclair', 'Terminer 5 défis sans indice.', 'bolt', (s) => s.stats.missionsWonWithoutHint, 5),
  new ThresholdAchievement('PHOTOGRAPHER', 'Photographe', 'Découvrir 100 photographies.', 'camera', (s) => s.stats.photosSubmitted, 100),
  new ThresholdAchievement('REGULAR', 'Régulier', 'Participer 7 jours consécutifs.', 'calendar', (s) => s.bestStreak, 7),
];

export class AchievementCatalog {
  private readonly byCode: ReadonlyMap<string, AchievementDefinition>;

  constructor(readonly definitions: readonly AchievementDefinition[] = DEFAULT_ACHIEVEMENTS) {
    this.byCode = new Map(definitions.map((definition) => [definition.code, definition]));
  }

  find(code: string): AchievementDefinition | undefined {
    return this.byCode.get(code);
  }
}

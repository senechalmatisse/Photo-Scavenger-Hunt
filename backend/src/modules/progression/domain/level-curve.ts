export interface LevelProgress {
  readonly level: number;
  readonly xp: number;
  readonly currentLevelXp: number;
  readonly nextLevelXp: number;
  /** Avancement vers le niveau suivant, entre 0 et 1 (US-013). */
  readonly ratio: number;
}

/** Courbe de niveaux (pattern Strategy) : interchangeable sans toucher à la progression. */
export interface LevelCurve {
  xpForLevel(level: number): number;
  levelFor(xp: number): number;
}

/**
 * Courbe quadratique : XP cumulée pour atteindre le niveau L = step × L × (L − 1).
 * Avec step = 50 : niveau 2 à 100 XP, niveau 3 à 300 XP, niveau 5 à 1 000 XP, niveau 10 à 4 500 XP.
 */
export class QuadraticLevelCurve implements LevelCurve {
  constructor(private readonly step = 50) {}

  xpForLevel(level: number): number {
    return this.step * level * (level - 1);
  }

  levelFor(xp: number): number {
    let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (4 * Math.max(0, xp)) / this.step)) / 2));
    // Corrige d'éventuelles erreurs d'arrondi aux frontières de niveau.
    while (this.xpForLevel(level + 1) <= xp) {
      level += 1;
    }
    while (level > 1 && this.xpForLevel(level) > xp) {
      level -= 1;
    }
    return level;
  }
}

export function levelProgress(curve: LevelCurve, xp: number): LevelProgress {
  const level = curve.levelFor(xp);
  const currentLevelXp = curve.xpForLevel(level);
  const nextLevelXp = curve.xpForLevel(level + 1);
  return {
    level,
    xp,
    currentLevelXp,
    nextLevelXp,
    ratio: (xp - currentLevelXp) / (nextLevelXp - currentLevelXp),
  };
}

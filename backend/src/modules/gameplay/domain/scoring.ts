import { GameModeKind } from './game-mode';
import { SessionTerms } from './session-terms';

export interface ScoringContext {
  readonly terms: SessionTerms;
  readonly mode: GameModeKind;
  readonly hintsUsed: number;
  readonly attempts: number;
  readonly elapsedMs: number;
}

/** Ligne du détail de score, affichée sur l'écran de résultat (US-029, US-045). */
export interface ScoreLine {
  readonly code: string;
  readonly label: string;
  readonly points: number;
}

export interface ScoreBreakdown {
  readonly lines: readonly ScoreLine[];
  readonly total: number;
}

/** Règle de barème (pattern Strategy, composé en pipeline par ScoringPolicy). */
export interface ScoreRule {
  apply(context: ScoringContext, subtotal: number): ScoreLine | null;
}

/** Barème paramétrable (§5.2 : « indicatif, à équilibrer après les premiers tests »). */
export interface ScoringConfig {
  readonly noHintBonus: number;
  readonly speedBonus: number;
  readonly speedThresholdSeconds: number;
  readonly dailyBonus: number;
}

export const DEFAULT_SCORING: ScoringConfig = {
  noHintBonus: 50,
  speedBonus: 25,
  speedThresholdSeconds: 30,
  dailyBonus: 50,
};

export class BaseRewardRule implements ScoreRule {
  apply(context: ScoringContext): ScoreLine {
    return { code: 'BASE', label: 'Bonne réponse', points: context.terms.basePoints };
  }
}

export class NoHintBonusRule implements ScoreRule {
  constructor(private readonly bonus: number) {}

  apply(context: ScoringContext): ScoreLine | null {
    return context.hintsUsed === 0 ? { code: 'NO_HINT', label: 'Bonne réponse sans indice', points: this.bonus } : null;
  }
}

export class SpeedBonusRule implements ScoreRule {
  constructor(
    private readonly thresholdSeconds: number,
    private readonly bonus: number,
  ) {}

  apply(context: ScoringContext): ScoreLine | null {
    return context.elapsedMs < this.thresholdSeconds * 1000
      ? { code: 'SPEED', label: `Réponse en moins de ${this.thresholdSeconds} secondes`, points: this.bonus }
      : null;
  }
}

/** Chaque indice révélé coûte le prix fixé par l'administrateur (US-026, US-043). */
export class HintPenaltyRule implements ScoreRule {
  apply(context: ScoringContext): ScoreLine | null {
    const cost = context.terms.hints.slice(0, context.hintsUsed).reduce((sum, hint) => sum + hint.cost, 0);
    if (cost === 0) {
      return null;
    }
    const plural = context.hintsUsed > 1 ? 's' : '';
    return { code: 'HINTS', label: `${context.hintsUsed} indice${plural} utilisé${plural}`, points: -cost };
  }
}

export class DailyBonusRule implements ScoreRule {
  constructor(private readonly bonus: number) {}

  apply(context: ScoringContext): ScoreLine | null {
    return context.mode === 'DAILY' ? { code: 'DAILY', label: 'Défi quotidien terminé', points: this.bonus } : null;
  }
}

/** Une partie rejouée ne rapporte pas de points de classement (évite le « farming »). */
export class ReplayRule implements ScoreRule {
  apply(context: ScoringContext, subtotal: number): ScoreLine | null {
    return context.terms.isReplay && subtotal > 0
      ? { code: 'REPLAY', label: 'Partie rejouée : points non comptés au classement', points: -subtotal }
      : null;
  }
}

/** Politique de score : applique les règles dans l'ordre et borne le total à zéro. */
export class ScoringPolicy {
  constructor(private readonly rules: readonly ScoreRule[]) {}

  static standard(config: ScoringConfig = DEFAULT_SCORING): ScoringPolicy {
    return new ScoringPolicy([
      new BaseRewardRule(),
      new NoHintBonusRule(config.noHintBonus),
      new SpeedBonusRule(config.speedThresholdSeconds, config.speedBonus),
      new HintPenaltyRule(),
      new DailyBonusRule(config.dailyBonus),
      new ReplayRule(),
    ]);
  }

  score(context: ScoringContext): ScoreBreakdown {
    const lines: ScoreLine[] = [];
    let subtotal = 0;
    for (const rule of this.rules) {
      const line = rule.apply(context, Math.max(0, subtotal));
      if (line && line.points !== 0) {
        lines.push(line);
        subtotal += line.points;
      }
    }
    return { lines, total: Math.max(0, subtotal) };
  }
}

export type TerminalStatus = 'VALIDATED' | 'FAILED' | 'EXPIRED' | 'ABANDONED';

/** Expérience gagnée à chaque mission (US-050), distincte des points de classement (§5.2). */
export class XpPolicy {
  xpFor(status: TerminalStatus, terms: SessionTerms): number {
    switch (status) {
      case 'VALIDATED':
        return terms.isReplay ? terms.xpOnParticipation : terms.xpOnSuccess;
      case 'FAILED':
      case 'EXPIRED':
        return terms.xpOnParticipation;
      case 'ABANDONED':
        return 0;
    }
  }
}

/** Services de domaine nécessaires pour clore une partie. */
export interface RewardRules {
  readonly scoring: ScoringPolicy;
  readonly xp: XpPolicy;
}

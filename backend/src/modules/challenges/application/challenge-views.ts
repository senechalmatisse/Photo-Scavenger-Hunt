import { GeoAreaJson } from '../../../shared/domain/geo';
import { LocalDate } from '../../../shared/domain/local-date';
import {
  Challenge,
  ChallengeStatus,
  DEFAULT_MAX_ATTEMPTS,
  Difficulty,
  Hint,
  ReferencePhoto,
  Reward,
  Theme,
} from '../domain/challenge';
import { RuleSpec } from '../domain/validation/validation-rule';

/**
 * Vue joueur d'un défi. Ne contient NI les critères de validation NI la photo de référence
 * NI le texte des indices : rien qui permette de tricher avant la fin de la partie.
 */
export interface PublicChallengeView {
  readonly id: string;
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: Difficulty;
  readonly theme: Theme;
  readonly zoneLabel: string | null;
  readonly zone: GeoAreaJson | null;
  readonly period: { readonly from: LocalDate | null; readonly to: LocalDate | null; readonly label: string } | null;
  readonly hintCosts: readonly number[];
  readonly reward: Reward;
  readonly timeLimitSeconds: number | null;
  readonly maxAttempts: number;
  readonly replayable: boolean;
  readonly isGeographic: boolean;
  readonly playable: boolean;
  readonly availableTo: string | null;
}

/** Vue d'administration : contenu complet, y compris la réponse attendue. */
export interface AdminChallengeView extends PublicChallengeView {
  readonly status: ChallengeStatus;
  readonly hints: readonly Hint[];
  readonly maxAttemptsOverride: number | null;
  readonly validation: RuleSpec;
  readonly validationSummary: string;
  readonly referencePhoto: ReferencePhoto | null;
  readonly availableFrom: string | null;
  readonly dailyEligible: boolean;
  readonly disabledReason: string | null;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly version: number;
}

export const ChallengeViews = {
  public(challenge: Challenge, now: Date): PublicChallengeView {
    const c = challenge.content;
    return {
      id: challenge.id,
      title: c.title,
      riddle: c.riddle,
      difficulty: c.difficulty,
      theme: c.theme,
      zoneLabel: c.zoneLabel,
      zone: c.zone ? c.zone.toJSON() : null,
      period: c.period ? { from: c.period.from, to: c.period.to, label: c.period.describe() } : null,
      hintCosts: c.hints.map((hint) => hint.cost),
      reward: c.reward,
      timeLimitSeconds: c.timeLimitSeconds,
      maxAttempts: c.maxAttempts ?? DEFAULT_MAX_ATTEMPTS[c.difficulty],
      replayable: c.replayable,
      isGeographic: challenge.isGeographic,
      playable: challenge.isPlayableAt(now),
      availableTo: c.availableTo ? c.availableTo.toISOString() : null,
    };
  },

  admin(challenge: Challenge, now: Date): AdminChallengeView {
    const c = challenge.content;
    return {
      ...ChallengeViews.public(challenge, now),
      status: challenge.status,
      hints: c.hints,
      maxAttemptsOverride: c.maxAttempts,
      validation: c.validation.toSpec(),
      validationSummary: c.validation.describe(),
      referencePhoto: c.referencePhoto,
      availableFrom: c.availableFrom ? c.availableFrom.toISOString() : null,
      dailyEligible: c.dailyEligible,
      disabledReason: challenge.disabledReason,
      createdAt: challenge.createdAt.toISOString(),
      publishedAt: challenge.publishedAt ? challenge.publishedAt.toISOString() : null,
      version: challenge.version,
    };
  },
};

/**
 * API publique du module Défis.
 * Règle d'architecture : un autre module n'importe le module Défis QUE par ce fichier.
 */
export {
  DEFAULT_MAX_ATTEMPTS,
  DIFFICULTIES,
  THEMES,
  ChallengeDisabled,
  ChallengePublished,
} from './domain/challenge';
export type { ChallengeStatus, Difficulty, Hint, ReferencePhoto, Reward, Theme } from './domain/challenge';
export { ValidationRuleFactory } from './domain/validation/validation-rule-factory';
export type {
  CriterionOutcome,
  DateGranularity,
  PhotoFacts,
  RuleSpec,
  ValidationReport,
} from './domain/validation/validation-rule';
export { ChallengeCatalog } from './application/challenge-catalog';
export type { PlayableChallengeData } from './application/challenge-catalog';
export { BrowseCatalog } from './application/challenge-queries';
export { GetDailyChallenge } from './application/daily-challenge';
export type { DailyChallenge } from './application/daily-challenge';
export { ChallengeViews } from './application/challenge-views';
export type { PublicChallengeView } from './application/challenge-views';

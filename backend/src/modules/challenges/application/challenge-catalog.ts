import { Clock } from '../../../shared/domain/ports';
import { Difficulty, Hint, ReferencePhoto, Reward, Theme } from '../domain/challenge';
import { ChallengeRepository } from '../domain/challenge.repository';
import { RuleSpec } from '../domain/validation/validation-rule';
import { GetDailyChallenge } from './daily-challenge';

/** Données d'un défi jouable, publiées aux autres modules (langage publié du module Défis). */
export interface PlayableChallengeData {
  readonly id: string;
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: Difficulty;
  readonly theme: Theme;
  readonly zoneLabel: string | null;
  readonly reward: Reward;
  readonly hints: readonly Hint[];
  readonly timeLimitSeconds: number | null;
  readonly maxAttempts: number | null;
  readonly replayable: boolean;
  readonly isGeographic: boolean;
  readonly validation: RuleSpec;
}

/**
 * Façade de lecture offerte aux autres modules (Open Host Service) :
 * ils n'accèdent jamais à l'agrégat Challenge ni à son repository.
 */
export class ChallengeCatalog {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly daily: GetDailyChallenge,
    private readonly clock: Clock,
  ) {}

  async playable(challengeId: string): Promise<PlayableChallengeData | null> {
    const challenge = await this.challenges.findById(challengeId);
    if (!challenge || !challenge.isPlayableAt(this.clock.now())) {
      return null;
    }
    const c = challenge.content;
    return {
      id: challenge.id,
      title: c.title,
      riddle: c.riddle,
      difficulty: c.difficulty,
      theme: c.theme,
      zoneLabel: c.zoneLabel,
      reward: c.reward,
      hints: c.hints,
      timeLimitSeconds: c.timeLimitSeconds,
      maxAttempts: c.maxAttempts,
      replayable: c.replayable,
      isGeographic: challenge.isGeographic,
      validation: c.validation.toSpec(),
    };
  }

  async todaysDailyChallengeId(): Promise<string | null> {
    const daily = await this.daily.execute();
    return daily ? daily.challenge.id : null;
  }

  async referencePhoto(challengeId: string): Promise<ReferencePhoto | null> {
    const challenge = await this.challenges.findById(challengeId);
    return challenge ? challenge.content.referencePhoto : null;
  }
}

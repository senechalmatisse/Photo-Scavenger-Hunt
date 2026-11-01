import { ChallengeCatalog, ValidationRuleFactory } from '../../challenges/public-api';
import type { PhotoFacts, ReferencePhoto, RuleSpec, ValidationReport } from '../../challenges/public-api';
import { GetPhoto } from '../../photos/public-api';
import { AnswerJudge, ChallengeGateway, PhotoFactsGateway } from '../application/ports';
import { PlayableChallenge } from '../domain/session-terms';

/** Adaptateur : port ChallengeGateway → façade publique du module Défis. */
export class ChallengeCatalogGateway implements ChallengeGateway {
  constructor(private readonly catalog: ChallengeCatalog) {}

  findPlayable(challengeId: string): Promise<PlayableChallenge | null> {
    return this.catalog.playable(challengeId);
  }

  todaysDailyChallengeId(): Promise<string | null> {
    return this.catalog.todaysDailyChallengeId();
  }

  referencePhotoOf(challengeId: string): Promise<ReferencePhoto | null> {
    return this.catalog.referencePhoto(challengeId);
  }
}

/** Adaptateur : port PhotoFactsGateway → module Photos (licence vérifiée par GetPhoto). */
export class PhotoModuleFactsGateway implements PhotoFactsGateway {
  constructor(private readonly getPhoto: GetPhoto) {}

  async factsFor(photoId: string): Promise<PhotoFacts | null> {
    const photo = await this.getPhoto.execute(photoId);
    return photo
      ? {
          photoId: photo.id,
          takenOn: photo.takenOn,
          takenGranularity: photo.takenGranularity,
          location: photo.location,
          tags: photo.tags,
        }
      : null;
  }
}

/** Juge par règles : reconstruit les critères figés dans la partie et les évalue. */
export class RuleBasedAnswerJudge implements AnswerJudge {
  constructor(private readonly rules: ValidationRuleFactory) {}

  judge(validation: RuleSpec, facts: PhotoFacts): ValidationReport {
    return this.rules.create(validation).evaluate(facts);
  }
}

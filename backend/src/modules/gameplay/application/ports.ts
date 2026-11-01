import type { PhotoFacts, ReferencePhoto, RuleSpec, ValidationReport } from '../../challenges/public-api';
import { PlayableChallenge } from '../domain/session-terms';

/** Accès aux défis, vu depuis le module Gameplay (adapté vers la façade du module Défis). */
export interface ChallengeGateway {
  /** Défi jouable maintenant, sinon `null` (inexistant, brouillon, désactivé, hors fenêtre de disponibilité). */
  findPlayable(challengeId: string): Promise<PlayableChallenge | null>;
  todaysDailyChallengeId(): Promise<string | null>;
  referencePhotoOf(challengeId: string): Promise<ReferencePhoto | null>;
}

/** Faits vérifiables d'une photo, obtenus côté serveur (licence vérifiée). `null` si inutilisable. */
export interface PhotoFactsGateway {
  factsFor(photoId: string): Promise<PhotoFacts | null>;
}

/** Juge une réponse au regard des critères figés dans la partie. */
export interface AnswerJudge {
  judge(validation: RuleSpec, facts: PhotoFacts): ValidationReport;
}

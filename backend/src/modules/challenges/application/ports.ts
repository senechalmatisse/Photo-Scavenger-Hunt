import { ReferencePhoto } from '../domain/challenge';
import { PhotoFacts } from '../domain/validation/validation-rule';

export interface ResolvedReferencePhoto {
  readonly facts: PhotoFacts;
  readonly reference: ReferencePhoto;
}

/**
 * Port vers le catalogue de photographies, vu depuis le module Défis.
 * `null` : photo inexistante, devenue privée, ou sous une licence non autorisée par le jeu.
 */
export interface ReferencePhotoProvider {
  fetch(photoId: string): Promise<ResolvedReferencePhoto | null>;
}

import { AppLogger, EventBus } from '../../../shared/application/ports';
import { ServiceUnavailableError } from '../../../shared/domain/domain-error';
import { Clock } from '../../../shared/domain/ports';
import { ChallengeRepository } from '../domain/challenge.repository';
import { ReferencePhotoProvider } from './ports';

export interface VerificationReport {
  readonly checked: number;
  readonly disabled: readonly string[];
  /** Vérification interrompue car le fournisseur ne répondait pas (aucun défi désactivé à tort). */
  readonly interrupted: boolean;
}

/**
 * US-084 : désactive les défis dont la photo de référence a disparu, est devenue privée
 * ou a changé de licence (obligation des conditions d'utilisation de l'API Flickr).
 */
export class VerifyReferencePhotos {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly photos: ReferencePhotoProvider,
    private readonly bus: EventBus,
    private readonly clock: Clock,
    private readonly logger: AppLogger,
  ) {}

  async execute(): Promise<VerificationReport> {
    const published = await this.challenges.findPublished();
    const disabled: string[] = [];
    let checked = 0;
    for (const challenge of published) {
      const reference = challenge.content.referencePhoto;
      if (!reference) {
        continue;
      }
      try {
        const photo = await this.photos.fetch(reference.photoId);
        checked += 1;
        if (photo === null) {
          challenge.disable('Photographie de référence indisponible chez le fournisseur.', this.clock.now());
          await this.challenges.save(challenge);
          await this.bus.publish(challenge.pullEvents());
          disabled.push(challenge.id);
        }
      } catch (error) {
        if (error instanceof ServiceUnavailableError) {
          // Une panne du fournisseur ne doit jamais désactiver le catalogue.
          this.logger.warn('Vérification des photos interrompue : fournisseur indisponible', { checked });
          return { checked, disabled, interrupted: true };
        }
        throw error;
      }
    }
    if (disabled.length > 0) {
      this.logger.warn('Défis désactivés faute de photo de référence', { disabled });
    }
    return { checked, disabled, interrupted: false };
  }
}

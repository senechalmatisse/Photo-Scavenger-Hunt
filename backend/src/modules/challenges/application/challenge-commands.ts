import { EventBus } from '../../../shared/application/ports';
import { BusinessRuleViolation, NotFoundError } from '../../../shared/domain/domain-error';
import { Clock, IdGenerator } from '../../../shared/domain/ports';
import { Challenge } from '../domain/challenge';
import { ChallengeRepository } from '../domain/challenge.repository';
import { ChallengeDefinitionBuilder, ChallengeInput } from './challenge-definition-builder';
import { AdminChallengeView, ChallengeViews } from './challenge-views';
import { ReferencePhotoProvider } from './ports';

async function loadChallenge(challenges: ChallengeRepository, id: string): Promise<Challenge> {
  const challenge = await challenges.findById(id);
  if (!challenge) {
    throw new NotFoundError('CHALLENGE_NOT_FOUND', 'Défi introuvable.', { id });
  }
  return challenge;
}

/** US-080 / US-081 / US-082 : création d'un défi (toujours en brouillon). */
export class CreateChallenge {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly builder: ChallengeDefinitionBuilder,
    private readonly ids: IdGenerator,
    private readonly clock: Clock,
  ) {}

  async execute(input: ChallengeInput, adminId: string | null): Promise<AdminChallengeView> {
    const { definition } = await this.builder.build(input);
    const now = this.clock.now();
    const challenge = Challenge.create(this.ids.next(), definition, adminId, now);
    await this.challenges.save(challenge);
    return ChallengeViews.admin(challenge, now);
  }
}

export class UpdateChallenge {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly builder: ChallengeDefinitionBuilder,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, input: ChallengeInput): Promise<AdminChallengeView> {
    const challenge = await loadChallenge(this.challenges, id);
    const { definition, referenceFacts } = await this.builder.build(input);
    const solvability = referenceFacts ? definition.validation.evaluate(referenceFacts) : undefined;
    const now = this.clock.now();
    challenge.redefine(definition, now, solvability);
    await this.challenges.save(challenge);
    return ChallengeViews.admin(challenge, now);
  }
}

/** Publication : le défi doit être soluble avec sa photo de référence, vérifiée à l'instant auprès du fournisseur. */
export class PublishChallenge {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly photos: ReferencePhotoProvider,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<AdminChallengeView> {
    const challenge = await loadChallenge(this.challenges, id);
    const reference = challenge.content.referencePhoto;
    if (!reference) {
      throw new BusinessRuleViolation('REFERENCE_PHOTO_REQUIRED', 'Associez une photographie de référence avant de publier le défi.');
    }
    const resolved = await this.photos.fetch(reference.photoId);
    if (!resolved) {
      throw new BusinessRuleViolation(
        'REFERENCE_PHOTO_UNAVAILABLE',
        "La photographie de référence n'est plus disponible : choisissez-en une autre.",
      );
    }
    const now = this.clock.now();
    challenge.publish(challenge.content.validation.evaluate(resolved.facts), now);
    await this.challenges.save(challenge);
    await this.bus.publish(challenge.pullEvents());
    return ChallengeViews.admin(challenge, now);
  }
}

export class DisableChallenge {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly bus: EventBus,
    private readonly clock: Clock,
  ) {}

  async execute(id: string, reason: string): Promise<AdminChallengeView> {
    const challenge = await loadChallenge(this.challenges, id);
    const now = this.clock.now();
    challenge.disable(reason, now);
    await this.challenges.save(challenge);
    await this.bus.publish(challenge.pullEvents());
    return ChallengeViews.admin(challenge, now);
  }
}

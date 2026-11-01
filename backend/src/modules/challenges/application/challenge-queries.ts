import { NotFoundError, ValidationError } from '../../../shared/domain/domain-error';
import { BoundingBox } from '../../../shared/domain/geo';
import { Page, PageRequest, Pages } from '../../../shared/domain/pagination';
import { Clock } from '../../../shared/domain/ports';
import { ChallengeStatus, DIFFICULTIES, Difficulty, ReferencePhoto, THEMES, Theme } from '../domain/challenge';
import { ChallengeRepository } from '../domain/challenge.repository';
import { ValidationReport } from '../domain/validation/validation-rule';
import { ValidationRuleFactory } from '../domain/validation/validation-rule-factory';
import { AdminChallengeView, ChallengeViews, PublicChallengeView } from './challenge-views';
import { ReferencePhotoProvider } from './ports';

export interface CatalogQuery {
  readonly difficulty?: string;
  readonly theme?: string;
  /** Rectangle « minLon,minLat,maxLon,maxLat » (filtre par région). */
  readonly bbox?: string;
  readonly page?: number;
  readonly pageSize?: number;
}

/** US-020 à US-022 : catalogue filtrable des défis jouables. */
export class BrowseCatalog {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(query: CatalogQuery): Promise<Page<PublicChallengeView>> {
    if (query.difficulty && !(DIFFICULTIES as readonly string[]).includes(query.difficulty)) {
      throw new ValidationError('INVALID_FILTER', `Difficulté inconnue : ${query.difficulty}.`);
    }
    if (query.theme && !(THEMES as readonly string[]).includes(query.theme)) {
      throw new ValidationError('INVALID_FILTER', `Thématique inconnue : ${query.theme}.`);
    }
    const now = this.clock.now();
    const page = await this.challenges.findPlayable(
      {
        difficulty: query.difficulty as Difficulty | undefined,
        theme: query.theme as Theme | undefined,
        area: query.bbox ? BoundingBox.parse(query.bbox) : undefined,
      },
      now,
      Pages.request(query.page, query.pageSize),
    );
    return Pages.map(page, (challenge) => ChallengeViews.public(challenge, now));
  }
}

/** US-023 : détail d'un défi avant de commencer (les brouillons restent invisibles). */
export class GetChallengeDetails {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<PublicChallengeView> {
    const challenge = await this.challenges.findById(id);
    if (!challenge || challenge.status === 'DRAFT') {
      throw new NotFoundError('CHALLENGE_NOT_FOUND', 'Défi introuvable.', { id });
    }
    return ChallengeViews.public(challenge, this.clock.now());
  }
}

export class ListChallengesForAdmin {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(status: ChallengeStatus | undefined, page: PageRequest): Promise<Page<AdminChallengeView>> {
    const now = this.clock.now();
    const result = await this.challenges.findForAdmin(status, page);
    return Pages.map(result, (challenge) => ChallengeViews.admin(challenge, now));
  }
}

export class GetChallengeForAdmin {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly clock: Clock,
  ) {}

  async execute(id: string): Promise<AdminChallengeView> {
    const challenge = await this.challenges.findById(id);
    if (!challenge) {
      throw new NotFoundError('CHALLENGE_NOT_FOUND', 'Défi introuvable.', { id });
    }
    return ChallengeViews.admin(challenge, this.clock.now());
  }
}

export interface ValidationPreview {
  readonly decisive: boolean;
  readonly summary: string;
  readonly report: ValidationReport;
  readonly photo: ReferencePhoto;
}

/**
 * US-082 / US-083 : l'administrateur teste ses critères sur n'importe quelle photo avant publication
 * (évaluation « à blanc », rien n'est enregistré).
 */
export class PreviewValidation {
  constructor(
    private readonly rules: ValidationRuleFactory,
    private readonly photos: ReferencePhotoProvider,
  ) {}

  async execute(validation: unknown, photoId: string): Promise<ValidationPreview> {
    const rule = this.rules.create(validation, 'validation');
    const resolved = await this.photos.fetch(photoId);
    if (!resolved) {
      throw new NotFoundError('PHOTO_NOT_FOUND', 'Photographie introuvable, privée ou sous une licence non autorisée.');
    }
    return {
      decisive: rule.decisive,
      summary: rule.describe(),
      report: rule.evaluate(resolved.facts),
      photo: resolved.reference,
    };
  }
}

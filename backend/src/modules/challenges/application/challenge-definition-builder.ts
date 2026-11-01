import { ValidationError, ensure } from '../../../shared/domain/domain-error';
import { GeoAreas } from '../../../shared/domain/geo';
import { DayRange } from '../../../shared/domain/local-date';
import { ChallengeDefinition, DIFFICULTIES, Difficulty, ReferencePhoto, THEMES, Theme } from '../domain/challenge';
import { PhotoFacts } from '../domain/validation/validation-rule';
import { ValidationRuleFactory } from '../domain/validation/validation-rule-factory';
import { ReferencePhotoProvider } from './ports';

/** Saisie brute d'un administrateur (création ou modification d'un défi). */
export interface ChallengeInput {
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: string;
  readonly theme: string;
  readonly zoneLabel?: string | null;
  readonly zone?: unknown;
  readonly period?: { readonly from?: string | null; readonly to?: string | null } | null;
  readonly hints?: readonly { readonly text: string; readonly cost: number }[];
  readonly reward: { readonly points: number; readonly xp: number };
  readonly timeLimitSeconds?: number | null;
  readonly maxAttempts?: number | null;
  readonly validation: unknown;
  readonly referencePhotoId?: string | null;
  readonly availableFrom?: string | null;
  readonly availableTo?: string | null;
  readonly replayable?: boolean;
  readonly dailyEligible?: boolean;
}

export interface BuiltDefinition {
  readonly definition: ChallengeDefinition;
  /** Faits de la photo de référence, pour vérifier que le défi est soluble. */
  readonly referenceFacts: PhotoFacts | null;
}

/**
 * Construit une définition de défi valide à partir d'une saisie brute (pattern Builder).
 * Centralise le parsing des sous-objets (zone, période, critères) et la résolution de la photo de référence.
 */
export class ChallengeDefinitionBuilder {
  constructor(
    private readonly rules: ValidationRuleFactory,
    private readonly photos: ReferencePhotoProvider,
  ) {}

  async build(input: ChallengeInput): Promise<BuiltDefinition> {
    ensure((DIFFICULTIES as readonly string[]).includes(input.difficulty), 'CHALLENGE_INVALID_DIFFICULTY', 'Difficulté inconnue.');
    ensure((THEMES as readonly string[]).includes(input.theme), 'CHALLENGE_INVALID_THEME', 'Thématique inconnue.');

    const validation = this.rules.createDecisive(input.validation, 'validation');
    const zone = input.zone === undefined || input.zone === null ? null : GeoAreas.fromJSON(input.zone, 'zone');
    const period = input.period && (input.period.from || input.period.to) ? DayRange.of(input.period.from, input.period.to) : null;

    let referenceFacts: PhotoFacts | null = null;
    let referencePhoto: ReferencePhoto | null = null;
    if (input.referencePhotoId) {
      const resolved = await this.photos.fetch(input.referencePhotoId);
      if (!resolved) {
        throw new ValidationError(
          'REFERENCE_PHOTO_UNAVAILABLE',
          'Photographie de référence introuvable, privée ou sous une licence non autorisée par le jeu.',
          { photoId: input.referencePhotoId },
        );
      }
      referenceFacts = resolved.facts;
      referencePhoto = resolved.reference;
    }

    return {
      referenceFacts,
      definition: {
        title: input.title.trim(),
        riddle: input.riddle.trim(),
        difficulty: input.difficulty as Difficulty,
        theme: input.theme as Theme,
        zoneLabel: input.zoneLabel?.trim() || null,
        zone,
        period,
        hints: (input.hints ?? []).map((hint) => ({ text: hint.text.trim(), cost: hint.cost })),
        reward: { points: input.reward.points, xp: input.reward.xp },
        timeLimitSeconds: input.timeLimitSeconds ?? null,
        maxAttempts: input.maxAttempts ?? null,
        validation,
        referencePhoto,
        availableFrom: parseInstant(input.availableFrom, 'availableFrom'),
        availableTo: parseInstant(input.availableTo, 'availableTo'),
        replayable: input.replayable ?? true,
        dailyEligible: input.dailyEligible ?? true,
      },
    };
  }
}

function parseInstant(value: string | null | undefined, field: string): Date | null {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const instant = new Date(value);
  if (Number.isNaN(instant.getTime())) {
    throw new ValidationError('INVALID_DATE', `${field} : date ISO 8601 attendue.`, { field });
  }
  return instant;
}

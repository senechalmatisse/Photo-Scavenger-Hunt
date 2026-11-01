import { GeoArea, RuleSpec } from '../../core/api/models';

/**
 * Les trois modes de validation proposés à l'administrateur (§14), plus un mode avancé
 * qui donne accès à toute la grammaire de règles (composition ALL_OF / ANY_OF).
 */
export type ValidationMode = 'EXACT' | 'CRITERIA' | 'PLACE' | 'ADVANCED';

export interface ValidationDraft {
  readonly mode: ValidationMode;
  readonly tags: string;
  readonly tagMode: 'ANY' | 'ALL';
  readonly useZone: boolean;
  readonly usePeriod: boolean;
  readonly placeLat: number | null;
  readonly placeLon: number | null;
  readonly toleranceKm: number;
  readonly advanced: string;
}

export interface ValidationContext {
  readonly referencePhotoId: string | null;
  readonly zone: GeoArea | null;
  readonly period: { readonly from: string | null; readonly to: string | null } | null;
}

export class DraftError extends Error {}

/** Traduit le brouillon de l'éditeur en règle JSON (le backend vérifie la grammaire et la décisivité). */
export function buildValidation(draft: ValidationDraft, context: ValidationContext): RuleSpec {
  switch (draft.mode) {
    case 'EXACT':
      if (!context.referencePhotoId) {
        throw new DraftError('Choisissez d’abord la photo de référence : c’est elle que les joueurs devront retrouver.');
      }
      return { type: 'EXACT_PHOTO', photoId: context.referencePhotoId };
    case 'PLACE':
      if (draft.placeLat === null || draft.placeLon === null) {
        throw new DraftError('Indiquez la latitude et la longitude du lieu à retrouver.');
      }
      return { type: 'NEAR_POINT', lat: draft.placeLat, lon: draft.placeLon, toleranceKm: draft.toleranceKm };
    case 'CRITERIA': {
      const rules: RuleSpec[] = [];
      if (draft.useZone && context.zone) {
        rules.push({ type: 'IN_AREA', area: context.zone });
      }
      if (draft.usePeriod && context.period && (context.period.from || context.period.to)) {
        rules.push({ type: 'TAKEN_BETWEEN', from: context.period.from, to: context.period.to });
      }
      const tags = draft.tags
        .split(',')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0);
      if (tags.length > 0) {
        rules.push({ type: 'HAS_TAGS', tags, mode: draft.tagMode });
      }
      if (rules.length === 0) {
        throw new DraftError('Ajoutez au moins un critère : la zone du défi est indispensable en mode critères.');
      }
      return rules.length === 1 ? rules[0] : { type: 'ALL_OF', rules };
    }
    case 'ADVANCED':
      try {
        const parsed = JSON.parse(draft.advanced) as RuleSpec;
        if (typeof parsed !== 'object' || parsed === null || typeof parsed.type !== 'string') {
          throw new DraftError('Le JSON doit décrire une règle : { "type": ..., ... }.');
        }
        return parsed;
      } catch (error) {
        throw error instanceof DraftError ? error : new DraftError('JSON invalide : vérifiez les guillemets et les virgules.');
      }
  }
}

/** Retrouve le mode d'édition le plus simple capable de représenter une règle existante. */
export function draftFromValidation(spec: RuleSpec): Partial<ValidationDraft> {
  const advanced = { mode: 'ADVANCED' as const, advanced: JSON.stringify(spec, null, 2) };
  switch (spec.type) {
    case 'EXACT_PHOTO':
      return { mode: 'EXACT' };
    case 'NEAR_POINT':
      return {
        mode: 'PLACE',
        placeLat: Number(spec['lat']),
        placeLon: Number(spec['lon']),
        toleranceKm: Number(spec['toleranceKm']),
      };
    case 'IN_AREA':
    case 'TAKEN_BETWEEN':
    case 'HAS_TAGS':
    case 'ALL_OF': {
      const children = spec.type === 'ALL_OF' ? ((spec['rules'] as RuleSpec[]) ?? []) : [spec];
      const types = children.map((child) => child.type);
      const simple =
        types.every((type) => ['IN_AREA', 'TAKEN_BETWEEN', 'HAS_TAGS'].includes(type)) && new Set(types).size === types.length;
      if (!simple) {
        return advanced;
      }
      const tagRule = children.find((child) => child.type === 'HAS_TAGS');
      return {
        mode: 'CRITERIA',
        useZone: types.includes('IN_AREA'),
        usePeriod: types.includes('TAKEN_BETWEEN'),
        tags: tagRule ? ((tagRule['tags'] as string[]) ?? []).join(', ') : '',
        tagMode: tagRule?.['mode'] === 'ALL' ? 'ALL' : 'ANY',
      };
    }
    default:
      return advanced;
  }
}

import { ValidationError } from '../../../../shared/domain/domain-error';
import { GeoPoint } from '../../../../shared/domain/geo';
import { LocalDate } from '../../../../shared/domain/local-date';

export type DateGranularity = 'EXACT' | 'MONTH' | 'YEAR' | 'CIRCA';

/**
 * Faits vérifiables d'une photographie.
 * Ils sont TOUJOURS obtenus côté serveur auprès du fournisseur (jamais transmis par le client),
 * ce qui empêche un joueur de falsifier la date ou la position d'une photo.
 */
export interface PhotoFacts {
  readonly photoId: string;
  readonly takenOn: LocalDate | null;
  readonly takenGranularity: DateGranularity | null;
  readonly location: GeoPoint | null;
  readonly tags: readonly string[];
}

/** Résultat d'un critère, présenté tel quel au joueur (US-028, US-041). */
export interface CriterionOutcome {
  readonly criterion: string;
  readonly label: string;
  readonly satisfied: boolean;
  readonly explanation: string;
}

export interface ValidationReport {
  readonly accepted: boolean;
  readonly outcomes: readonly CriterionOutcome[];
}

/** Forme sérialisée (JSON) d'une règle : persistée avec le défi et figée dans chaque partie. */
export type RuleSpec = { readonly type: string } & Readonly<Record<string, unknown>>;

/**
 * Règle de validation d'une réponse (patterns Strategy + Composite).
 *
 * `decisive` : un critère décisif garantit à lui seul la pertinence de la réponse
 * (photo exacte, zone, lieu). Les mots-clés ou la période seuls ne le sont jamais :
 * le cahier des charges interdit de valider une photo sur un simple tag (§3.5).
 */
export interface ValidationRule {
  readonly type: string;
  readonly decisive: boolean;
  readonly children: readonly ValidationRule[];
  evaluate(photo: PhotoFacts): ValidationReport;
  toSpec(): RuleSpec;
  describe(): string;
}

export function leafReport(outcome: CriterionOutcome): ValidationReport {
  return { accepted: outcome.satisfied, outcomes: [outcome] };
}

/** Parcourt l'arbre de règles (utile pour connaître les types utilisés). */
export function collectRuleTypes(rule: ValidationRule): Set<string> {
  const types = new Set<string>([rule.type]);
  for (const child of rule.children) {
    for (const type of collectRuleTypes(child)) {
      types.add(type);
    }
  }
  return types;
}

/** Lecture défensive des champs d'une RuleSpec, avec messages localisés par chemin. */
export const SpecReader = {
  invalid(path: string, reason: string): ValidationError {
    return new ValidationError('INVALID_VALIDATION_SPEC', `${path} : ${reason}`, { path });
  },

  string(spec: RuleSpec, key: string, path: string, options: { max: number; pattern?: RegExp }): string {
    const value = spec[key];
    if (typeof value !== 'string' || value.trim().length === 0 || value.length > options.max) {
      throw SpecReader.invalid(`${path}.${key}`, `texte attendu (${options.max} caractères maximum).`);
    }
    if (options.pattern && !options.pattern.test(value)) {
      throw SpecReader.invalid(`${path}.${key}`, 'format invalide.');
    }
    return value.trim();
  },

  optionalString(spec: RuleSpec, key: string, path: string, max: number): string | null {
    return spec[key] === undefined || spec[key] === null ? null : SpecReader.string(spec, key, path, { max });
  },

  number(spec: RuleSpec, key: string, path: string, min: number, max: number): number {
    const value = spec[key];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) {
      throw SpecReader.invalid(`${path}.${key}`, `nombre attendu entre ${min} et ${max}.`);
    }
    return value;
  },

  array(spec: RuleSpec, key: string, path: string, minItems: number, maxItems: number): unknown[] {
    const value = spec[key];
    if (!Array.isArray(value) || value.length < minItems || value.length > maxItems) {
      throw SpecReader.invalid(`${path}.${key}`, `liste de ${minItems} à ${maxItems} éléments attendue.`);
    }
    return value;
  },
};

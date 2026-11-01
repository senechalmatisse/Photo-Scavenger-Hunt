import { GeoArea, GeoAreas, GeoPoint } from '../../../../shared/domain/geo';
import { DayRange, LocalDates } from '../../../../shared/domain/local-date';
import {
  DateGranularity,
  PhotoFacts,
  RuleSpec,
  SpecReader,
  ValidationReport,
  ValidationRule,
  leafReport,
} from './validation-rule';

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

export function formatDistance(km: number): string {
  if (km < 1) {
    return `${Math.round(km * 1000)} m`;
  }
  return km < 10 ? `${km.toFixed(1).replace('.', ',')} km` : `${Math.round(km)} km`;
}

/** Normalise un mot-clé comme Flickr : minuscules, sans accents ni ponctuation. */
export function normalizeTag(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

function describeTaken(day: string, granularity: DateGranularity | null): string {
  const [year, month] = day.split('-');
  switch (granularity) {
    case 'YEAR':
      return `en ${year}`;
    case 'MONTH':
      return `en ${MONTHS[Number(month) - 1]} ${year}`;
    default:
      return `le ${LocalDates.format(day)}`;
  }
}

/** Critère décisif : la photographie exacte de référence. */
export class ExactPhotoRule implements ValidationRule {
  static readonly TYPE = 'EXACT_PHOTO';
  readonly type = ExactPhotoRule.TYPE;
  readonly decisive = true;
  readonly children: readonly ValidationRule[] = [];

  constructor(readonly photoId: string) {}

  static parse(spec: RuleSpec, path: string): ExactPhotoRule {
    return new ExactPhotoRule(SpecReader.string(spec, 'photoId', path, { max: 64, pattern: /^[A-Za-z0-9_-]+$/ }));
  }

  evaluate(photo: PhotoFacts): ValidationReport {
    const satisfied = photo.photoId === this.photoId;
    return leafReport({
      criterion: this.type,
      label: 'Photographie de référence',
      satisfied,
      explanation: satisfied ? "C'est exactement la photographie recherchée." : "Ce n'est pas la photographie recherchée.",
    });
  }

  toSpec(): RuleSpec {
    return { type: this.type, photoId: this.photoId };
  }

  describe(): string {
    return `photo exacte n°${this.photoId}`;
  }
}

/** Critère décisif : photo géolocalisée dans une zone (rectangle ou cercle). */
export class InAreaRule implements ValidationRule {
  static readonly TYPE = 'IN_AREA';
  readonly type = InAreaRule.TYPE;
  readonly decisive = true;
  readonly children: readonly ValidationRule[] = [];

  constructor(
    readonly area: GeoArea,
    readonly label: string | null,
  ) {}

  static parse(spec: RuleSpec, path: string): InAreaRule {
    return new InAreaRule(GeoAreas.fromJSON(spec.area, `${path}.area`), SpecReader.optionalString(spec, 'label', path, 120));
  }

  evaluate(photo: PhotoFacts): ValidationReport {
    const where = this.label ? ` (${this.label})` : '';
    if (!photo.location) {
      return leafReport({
        criterion: this.type,
        label: 'Zone géographique',
        satisfied: false,
        explanation: "La photo n'est pas géolocalisée : impossible de vérifier la zone.",
      });
    }
    const satisfied = this.area.contains(photo.location);
    return leafReport({
      criterion: this.type,
      label: 'Zone géographique',
      satisfied,
      explanation: satisfied
        ? `La photo a été prise dans la zone attendue${where}.`
        : `La photo a été prise hors de la zone attendue${where}.`,
    });
  }

  toSpec(): RuleSpec {
    return { type: this.type, area: this.area.toJSON(), label: this.label };
  }

  describe(): string {
    return `dans la zone ${this.label ?? this.area.kind.toLowerCase()}`;
  }
}

/** Critère décisif « réponse géographique » : retrouver le lieu à une tolérance près. */
export class NearPointRule implements ValidationRule {
  static readonly TYPE = 'NEAR_POINT';
  static readonly MAX_TOLERANCE_KM = 500;
  readonly type = NearPointRule.TYPE;
  readonly decisive = true;
  readonly children: readonly ValidationRule[] = [];

  constructor(
    readonly target: GeoPoint,
    readonly toleranceKm: number,
    readonly label: string | null,
  ) {}

  static parse(spec: RuleSpec, path: string): NearPointRule {
    return new NearPointRule(
      GeoPoint.of(SpecReader.number(spec, 'lat', path, -90, 90), SpecReader.number(spec, 'lon', path, -180, 180)),
      SpecReader.number(spec, 'toleranceKm', path, 0.01, NearPointRule.MAX_TOLERANCE_KM),
      SpecReader.optionalString(spec, 'label', path, 120),
    );
  }

  evaluate(photo: PhotoFacts): ValidationReport {
    if (!photo.location) {
      return leafReport({
        criterion: this.type,
        label: 'Lieu',
        satisfied: false,
        explanation: "La photo n'est pas géolocalisée : impossible de vérifier le lieu.",
      });
    }
    const distance = this.target.distanceKmTo(photo.location);
    const satisfied = distance <= this.toleranceKm;
    return leafReport({
      criterion: this.type,
      label: 'Lieu',
      satisfied,
      explanation: satisfied
        ? `Lieu trouvé : la photo a été prise à ${formatDistance(distance)} du lieu recherché.`
        : `La photo a été prise à ${formatDistance(distance)} du lieu recherché (tolérance : ${formatDistance(this.toleranceKm)}).`,
    });
  }

  toSpec(): RuleSpec {
    return {
      type: this.type,
      lat: this.target.latitude,
      lon: this.target.longitude,
      toleranceKm: this.toleranceKm,
      label: this.label,
    };
  }

  describe(): string {
    return `à moins de ${formatDistance(this.toleranceKm)} de ${this.label ?? 'la cible'}`;
  }
}

/** Critère complémentaire : période de prise de vue. */
export class TakenBetweenRule implements ValidationRule {
  static readonly TYPE = 'TAKEN_BETWEEN';
  readonly type = TakenBetweenRule.TYPE;
  readonly decisive = false;
  readonly children: readonly ValidationRule[] = [];

  constructor(readonly range: DayRange) {}

  static parse(spec: RuleSpec, path: string): TakenBetweenRule {
    const read = (key: 'from' | 'to') => {
      const value = spec[key];
      if (value === undefined || value === null) {
        return null;
      }
      if (!LocalDates.isValid(value)) {
        throw SpecReader.invalid(`${path}.${key}`, 'date attendue au format AAAA-MM-JJ.');
      }
      return value;
    };
    return new TakenBetweenRule(DayRange.of(read('from'), read('to')));
  }

  evaluate(photo: PhotoFacts): ValidationReport {
    const label = 'Période de prise de vue';
    if (!photo.takenOn) {
      return leafReport({
        criterion: this.type,
        label,
        satisfied: false,
        explanation: 'Date de prise de vue inconnue : impossible de vérifier la période.',
      });
    }
    if (photo.takenGranularity === 'CIRCA') {
      return leafReport({
        criterion: this.type,
        label,
        satisfied: false,
        explanation: 'Date de prise de vue approximative : impossible de vérifier la période.',
      });
    }
    const satisfied = this.range.contains(photo.takenOn);
    return leafReport({
      criterion: this.type,
      label,
      satisfied,
      explanation: `Photo prise ${describeTaken(photo.takenOn, photo.takenGranularity)}, ${
        satisfied ? 'dans' : 'hors de'
      } la période attendue (${this.range.describe()}).`,
    });
  }

  toSpec(): RuleSpec {
    return { type: this.type, from: this.range.from, to: this.range.to };
  }

  describe(): string {
    return `prise ${this.range.describe()}`;
  }
}

/** Critère complémentaire : mots-clés. Jamais décisif à lui seul. */
export class HasTagsRule implements ValidationRule {
  static readonly TYPE = 'HAS_TAGS';
  readonly type = HasTagsRule.TYPE;
  readonly decisive = false;
  readonly children: readonly ValidationRule[] = [];

  constructor(
    readonly tags: readonly string[],
    readonly mode: 'ANY' | 'ALL',
  ) {}

  static parse(spec: RuleSpec, path: string): HasTagsRule {
    const raw = SpecReader.array(spec, 'tags', path, 1, 10);
    const tags = [...new Set(raw.map((tag) => (typeof tag === 'string' ? normalizeTag(tag) : '')))];
    if (tags.some((tag) => tag.length === 0 || tag.length > 50)) {
      throw SpecReader.invalid(`${path}.tags`, 'mots-clés non vides de 50 caractères maximum attendus.');
    }
    const mode = spec.mode ?? 'ANY';
    if (mode !== 'ANY' && mode !== 'ALL') {
      throw SpecReader.invalid(`${path}.mode`, 'valeur ANY ou ALL attendue.');
    }
    return new HasTagsRule(tags, mode);
  }

  evaluate(photo: PhotoFacts): ValidationReport {
    const photoTags = new Set(photo.tags.map(normalizeTag));
    const matched = this.tags.filter((tag) => photoTags.has(tag));
    const satisfied = this.mode === 'ANY' ? matched.length > 0 : matched.length === this.tags.length;
    let explanation: string;
    if (this.mode === 'ANY') {
      explanation = satisfied ? `Mot-clé présent : « ${matched[0]} ».` : 'La photo ne porte aucun des mots-clés attendus.';
    } else {
      explanation = satisfied
        ? 'Tous les mots-clés attendus sont présents.'
        : `Mots-clés attendus trouvés : ${matched.length} sur ${this.tags.length}.`;
    }
    return leafReport({ criterion: this.type, label: 'Mots-clés', satisfied, explanation });
  }

  toSpec(): RuleSpec {
    return { type: this.type, tags: [...this.tags], mode: this.mode };
  }

  describe(): string {
    return `${this.mode === 'ANY' ? "l'un des" : 'tous les'} mots-clés ${this.tags.join(', ')}`;
  }
}

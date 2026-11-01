import { AggregateRoot, DomainEvent } from '../../../shared/domain/aggregate-root';
import { BusinessRuleViolation, ensure } from '../../../shared/domain/domain-error';
import { GeoArea, GeoAreaJson, GeoAreas } from '../../../shared/domain/geo';
import { DayRange, LocalDate } from '../../../shared/domain/local-date';
import { InAreaRule, NearPointRule } from './validation/leaf-rules';
import { RuleSpec, ValidationReport, ValidationRule, collectRuleTypes } from './validation/validation-rule';
import { ValidationRuleFactory } from './validation/validation-rule-factory';

export const DIFFICULTIES = ['EASY', 'INTERMEDIATE', 'HARD', 'EXPERT'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];

export const THEMES = ['ARCHITECTURE', 'NATURE', 'HERITAGE', 'ANIMALS', 'COAST', 'MOUNTAIN', 'URBAN', 'CULTURE', 'OTHER'] as const;
export type Theme = (typeof THEMES)[number];

export type ChallengeStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED';

/** Nombre de tentatives par défaut selon la difficulté (surchargeable par défi). */
export const DEFAULT_MAX_ATTEMPTS: Readonly<Record<Difficulty, number>> = {
  EASY: 5,
  INTERMEDIATE: 3,
  HARD: 3,
  EXPERT: 2,
};

export interface Hint {
  readonly text: string;
  readonly cost: number;
}

export interface Reward {
  readonly points: number;
  readonly xp: number;
}

/** Instantané d'attribution de la photo de référence (affichée au joueur une fois la partie finie). */
export interface ReferencePhoto {
  readonly photoId: string;
  readonly title: string;
  readonly ownerName: string;
  readonly licenseCode: string;
  readonly licenseName: string;
  readonly licenseUrl: string | null;
  readonly imageUrl: string;
  readonly pageUrl: string;
}

/** Contenu saisi par l'administrateur (création ou modification). */
export interface ChallengeDefinition {
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: Difficulty;
  readonly theme: Theme;
  /** Indice public affiché au joueur (« Littoral français ») et vue initiale de la carte. */
  readonly zoneLabel: string | null;
  readonly zone: GeoArea | null;
  readonly period: DayRange | null;
  readonly hints: readonly Hint[];
  readonly reward: Reward;
  readonly timeLimitSeconds: number | null;
  readonly maxAttempts: number | null;
  /** Critères secrets : jamais exposés au joueur avant la fin de la partie. */
  readonly validation: ValidationRule;
  readonly referencePhoto: ReferencePhoto | null;
  readonly availableFrom: Date | null;
  readonly availableTo: Date | null;
  readonly replayable: boolean;
  readonly dailyEligible: boolean;
}

/** Forme persistée (repositories) : uniquement des types sérialisables. */
export interface ChallengeSnapshot {
  readonly id: string;
  readonly version: number;
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: Difficulty;
  readonly theme: Theme;
  readonly zoneLabel: string | null;
  readonly zone: GeoAreaJson | null;
  readonly periodFrom: LocalDate | null;
  readonly periodTo: LocalDate | null;
  readonly hints: readonly Hint[];
  readonly reward: Reward;
  readonly timeLimitSeconds: number | null;
  readonly maxAttempts: number | null;
  readonly validation: RuleSpec;
  readonly referencePhoto: ReferencePhoto | null;
  readonly status: ChallengeStatus;
  readonly availableFrom: Date | null;
  readonly availableTo: Date | null;
  readonly replayable: boolean;
  readonly dailyEligible: boolean;
  readonly disabledReason: string | null;
  readonly createdBy: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly publishedAt: Date | null;
}

interface ChallengeLifecycle {
  status: ChallengeStatus;
  disabledReason: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  publishedAt: Date | null;
}

export class ChallengePublished implements DomainEvent {
  static readonly TYPE = 'challenges.published';
  readonly type = ChallengePublished.TYPE;

  constructor(
    readonly challengeId: string,
    readonly title: string,
    readonly occurredAt: Date,
  ) {}
}

export class ChallengeDisabled implements DomainEvent {
  static readonly TYPE = 'challenges.disabled';
  readonly type = ChallengeDisabled.TYPE;

  constructor(
    readonly challengeId: string,
    readonly reason: string,
    readonly occurredAt: Date,
  ) {}
}

/**
 * Agrégat Défi : décrit une mission (et non une participation, cf. GameSession).
 * Il garantit ses invariants à chaque modification et ne peut être publié que s'il est soluble.
 */
export class Challenge extends AggregateRoot {
  private constructor(
    id: string,
    version: number,
    private definition: ChallengeDefinition,
    private lifecycle: ChallengeLifecycle,
  ) {
    super(id, version);
  }

  static create(id: string, definition: ChallengeDefinition, createdBy: string | null, now: Date): Challenge {
    Challenge.assertValid(definition);
    return new Challenge(id, 0, definition, {
      status: 'DRAFT',
      disabledReason: null,
      createdBy,
      createdAt: now,
      updatedAt: now,
      publishedAt: null,
    });
  }

  static restore(snapshot: ChallengeSnapshot, rules: ValidationRuleFactory): Challenge {
    return new Challenge(
      snapshot.id,
      snapshot.version,
      {
        title: snapshot.title,
        riddle: snapshot.riddle,
        difficulty: snapshot.difficulty,
        theme: snapshot.theme,
        zoneLabel: snapshot.zoneLabel,
        zone: snapshot.zone ? GeoAreas.fromJSON(snapshot.zone) : null,
        period:
          snapshot.periodFrom || snapshot.periodTo ? DayRange.of(snapshot.periodFrom, snapshot.periodTo) : null,
        hints: snapshot.hints,
        reward: snapshot.reward,
        timeLimitSeconds: snapshot.timeLimitSeconds,
        maxAttempts: snapshot.maxAttempts,
        validation: rules.create(snapshot.validation),
        referencePhoto: snapshot.referencePhoto,
        availableFrom: snapshot.availableFrom,
        availableTo: snapshot.availableTo,
        replayable: snapshot.replayable,
        dailyEligible: snapshot.dailyEligible,
      },
      {
        status: snapshot.status,
        disabledReason: snapshot.disabledReason,
        createdBy: snapshot.createdBy,
        createdAt: snapshot.createdAt,
        updatedAt: snapshot.updatedAt,
        publishedAt: snapshot.publishedAt,
      },
    );
  }

  /**
   * Remplace le contenu du défi. Si le défi est publié, la réponse doit rester valide :
   * le cas d'usage fournit alors le rapport de solvabilité de la nouvelle définition.
   */
  redefine(definition: ChallengeDefinition, now: Date, solvability?: ValidationReport): void {
    Challenge.assertValid(definition);
    if (this.lifecycle.status === 'PUBLISHED') {
      Challenge.assertSolvable(definition, solvability);
    }
    this.definition = definition;
    this.lifecycle.updatedAt = now;
  }

  /** Publie (ou réactive) le défi : il doit être soluble avec sa photo de référence. */
  publish(solvability: ValidationReport, now: Date): void {
    if (this.lifecycle.status === 'PUBLISHED') {
      return;
    }
    Challenge.assertSolvable(this.definition, solvability);
    this.lifecycle.status = 'PUBLISHED';
    this.lifecycle.publishedAt = now;
    this.lifecycle.disabledReason = null;
    this.lifecycle.updatedAt = now;
    this.record(new ChallengePublished(this.id, this.definition.title, now));
  }

  disable(reason: string, now: Date): void {
    ensure(reason.trim().length >= 3 && reason.length <= 500, 'CHALLENGE_INVALID_REASON', 'Motif de désactivation requis (3 à 500 caractères).');
    if (this.lifecycle.status === 'DISABLED') {
      return;
    }
    this.lifecycle.status = 'DISABLED';
    this.lifecycle.disabledReason = reason.trim();
    this.lifecycle.updatedAt = now;
    this.record(new ChallengeDisabled(this.id, reason.trim(), now));
  }

  isPlayableAt(now: Date): boolean {
    const { availableFrom, availableTo } = this.definition;
    return (
      this.lifecycle.status === 'PUBLISHED' &&
      (availableFrom === null || now >= availableFrom) &&
      (availableTo === null || now < availableTo)
    );
  }

  /** Mission « géographique » (badge Explorateur) : zone publique ou critère spatial. */
  get isGeographic(): boolean {
    const types = collectRuleTypes(this.definition.validation);
    return this.definition.zone !== null || types.has(InAreaRule.TYPE) || types.has(NearPointRule.TYPE);
  }

  get status(): ChallengeStatus {
    return this.lifecycle.status;
  }

  get content(): ChallengeDefinition {
    return this.definition;
  }

  get createdAt(): Date {
    return this.lifecycle.createdAt;
  }

  get publishedAt(): Date | null {
    return this.lifecycle.publishedAt;
  }

  get disabledReason(): string | null {
    return this.lifecycle.disabledReason;
  }

  toSnapshot(): ChallengeSnapshot {
    const d = this.definition;
    return {
      id: this.id,
      version: this.version,
      title: d.title,
      riddle: d.riddle,
      difficulty: d.difficulty,
      theme: d.theme,
      zoneLabel: d.zoneLabel,
      zone: d.zone ? d.zone.toJSON() : null,
      periodFrom: d.period ? d.period.from : null,
      periodTo: d.period ? d.period.to : null,
      hints: d.hints,
      reward: d.reward,
      timeLimitSeconds: d.timeLimitSeconds,
      maxAttempts: d.maxAttempts,
      validation: d.validation.toSpec(),
      referencePhoto: d.referencePhoto,
      status: this.lifecycle.status,
      availableFrom: d.availableFrom,
      availableTo: d.availableTo,
      replayable: d.replayable,
      dailyEligible: d.dailyEligible,
      disabledReason: this.lifecycle.disabledReason,
      createdBy: this.lifecycle.createdBy,
      createdAt: this.lifecycle.createdAt,
      updatedAt: this.lifecycle.updatedAt,
      publishedAt: this.lifecycle.publishedAt,
    };
  }

  private static assertSolvable(definition: ChallengeDefinition, solvability: ValidationReport | undefined): void {
    if (!definition.referencePhoto) {
      throw new BusinessRuleViolation(
        'REFERENCE_PHOTO_REQUIRED',
        'Associez une photographie de référence avant de publier le défi.',
      );
    }
    if (!solvability || !solvability.accepted) {
      throw new BusinessRuleViolation(
        'CHALLENGE_NOT_SOLVABLE',
        'La photographie de référence ne satisfait pas les critères de validation : le défi serait insoluble.',
        { outcomes: solvability?.outcomes ?? [] },
      );
    }
  }

  private static assertValid(d: ChallengeDefinition): void {
    const isInt = (value: number, min: number, max: number) => Number.isInteger(value) && value >= min && value <= max;
    ensure(d.title.trim().length >= 3 && d.title.length <= 120, 'CHALLENGE_INVALID_TITLE', 'Le titre doit contenir entre 3 et 120 caractères.');
    ensure(d.riddle.trim().length >= 10 && d.riddle.length <= 2000, 'CHALLENGE_INVALID_RIDDLE', "L'énigme doit contenir entre 10 et 2000 caractères.");
    ensure(DIFFICULTIES.includes(d.difficulty), 'CHALLENGE_INVALID_DIFFICULTY', 'Difficulté inconnue.');
    ensure(THEMES.includes(d.theme), 'CHALLENGE_INVALID_THEME', 'Thématique inconnue.');
    ensure(d.zoneLabel === null || (d.zoneLabel.trim().length > 0 && d.zoneLabel.length <= 120), 'CHALLENGE_INVALID_ZONE_LABEL', 'Libellé de zone de 120 caractères maximum.');
    ensure(d.hints.length <= 5, 'CHALLENGE_TOO_MANY_HINTS', 'Cinq indices au maximum.');
    for (const hint of d.hints) {
      ensure(hint.text.trim().length >= 3 && hint.text.length <= 500, 'CHALLENGE_INVALID_HINT', 'Chaque indice doit contenir entre 3 et 500 caractères.');
      ensure(isInt(hint.cost, 0, 1000), 'CHALLENGE_INVALID_HINT_COST', "Le coût d'un indice doit être un entier entre 0 et 1000.");
    }
    ensure(isInt(d.reward.points, 0, 10_000), 'CHALLENGE_INVALID_REWARD', 'Les points doivent être un entier entre 0 et 10 000.');
    ensure(isInt(d.reward.xp, 0, 10_000), 'CHALLENGE_INVALID_REWARD', "L'XP doit être un entier entre 0 et 10 000.");
    ensure(d.timeLimitSeconds === null || isInt(d.timeLimitSeconds, 30, 7200), 'CHALLENGE_INVALID_TIME_LIMIT', 'Le temps limite doit être compris entre 30 s et 2 h.');
    ensure(d.maxAttempts === null || isInt(d.maxAttempts, 1, 10), 'CHALLENGE_INVALID_MAX_ATTEMPTS', 'Le nombre de tentatives doit être compris entre 1 et 10.');
    ensure(
      d.availableFrom === null || d.availableTo === null || d.availableFrom < d.availableTo,
      'CHALLENGE_INVALID_AVAILABILITY',
      'La date de début de disponibilité doit précéder la date de fin.',
    );
    ensure(d.validation.decisive, 'VALIDATION_NOT_DECISIVE', 'Les critères de validation doivent être décisifs.');
  }
}

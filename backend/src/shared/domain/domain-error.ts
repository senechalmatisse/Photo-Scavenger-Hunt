/**
 * Hiérarchie des erreurs métier.
 *
 * Le domaine ne connaît pas HTTP : la couche présentation traduit chaque `kind`
 * en statut HTTP (cf. DomainExceptionFilter). Le `code` est stable et documenté,
 * le message est destiné à l'utilisateur final (français).
 */
export type DomainErrorKind =
  | 'VALIDATION'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'UNAUTHORIZED'
  | 'RULE_VIOLATION'
  | 'UNAVAILABLE';

export abstract class DomainError extends Error {
  abstract readonly kind: DomainErrorKind;

  constructor(
    readonly code: string,
    message: string,
    readonly details?: Readonly<Record<string, unknown>>,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** Donnée invalide (format, bornes, invariant de saisie). */
export class ValidationError extends DomainError {
  readonly kind = 'VALIDATION';
}

export class NotFoundError extends DomainError {
  readonly kind = 'NOT_FOUND';
}

export class ConflictError extends DomainError {
  readonly kind = 'CONFLICT';
}

export class ForbiddenError extends DomainError {
  readonly kind = 'FORBIDDEN';
}

export class UnauthorizedError extends DomainError {
  readonly kind = 'UNAUTHORIZED';
}

/** Opération valide en apparence mais interdite par une règle métier. */
export class BusinessRuleViolation extends DomainError {
  readonly kind = 'RULE_VIOLATION';
}

/** Dépendance externe indisponible (ex. Flickr) : l'appelant peut réessayer plus tard. */
export class ServiceUnavailableError extends DomainError {
  readonly kind = 'UNAVAILABLE';
}

/** Verrouillage optimiste : l'agrégat a été modifié par une autre requête. */
export class ConcurrencyError extends ConflictError {
  constructor(aggregate: string, id: string) {
    super('CONCURRENT_MODIFICATION', `${aggregate} ${id} a été modifié entre-temps, veuillez réessayer.`);
  }
}

/** Garde d'invariant : lève une ValidationError si la condition est fausse. */
export function ensure(
  condition: unknown,
  code: string,
  message: string,
  details?: Record<string, unknown>,
): asserts condition {
  if (!condition) {
    throw new ValidationError(code, message, details);
  }
}

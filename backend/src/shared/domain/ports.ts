/**
 * Ports techniques transverses du noyau partagé.
 * Le domaine ne lit jamais l'horloge système ni ne génère d'identifiant lui-même :
 * il les reçoit, ce qui rend chaque règle déterministe et testable.
 */
export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(): string;
}

/** Source d'aléa injectable (tirage d'un nom d'invité, etc.). */
export interface RandomSource {
  /** Entier dans [0, maxExclusive[. */
  nextInt(maxExclusive: number): number;
}

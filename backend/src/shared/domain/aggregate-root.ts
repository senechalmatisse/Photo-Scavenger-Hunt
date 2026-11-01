/** Événement métier : un fait passé, immuable, publié après la persistance de l'agrégat. */
export interface DomainEvent {
  readonly type: string;
  readonly occurredAt: Date;
}

/**
 * Racine d'agrégat : frontière de cohérence transactionnelle.
 *
 * - accumule les événements de domaine jusqu'à leur publication (`pullEvents`) ;
 * - porte la version utilisée pour le verrouillage optimiste par les repositories.
 */
export abstract class AggregateRoot<TId extends string = string> {
  private readonly pendingEvents: DomainEvent[] = [];

  protected constructor(
    readonly id: TId,
    private persistedVersion: number,
  ) {}

  /** Version connue en base (0 = jamais persisté). */
  get version(): number {
    return this.persistedVersion;
  }

  get isNew(): boolean {
    return this.persistedVersion === 0;
  }

  /** Retire et retourne les événements en attente de publication. */
  pullEvents(): DomainEvent[] {
    return this.pendingEvents.splice(0, this.pendingEvents.length);
  }

  /** Appelé par le repository une fois l'écriture validée. */
  commitVersion(version: number): void {
    this.persistedVersion = version;
  }

  protected record(event: DomainEvent): void {
    this.pendingEvents.push(event);
  }
}

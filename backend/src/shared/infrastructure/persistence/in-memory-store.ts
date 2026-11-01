import { UnitOfWork } from '../../application/ports';
import { ConcurrencyError } from '../../domain/domain-error';

/**
 * Stockage en mémoire de snapshots d'agrégats, avec verrouillage optimiste.
 * Utilisé par les adaptateurs « memory » (tests, démonstration, développement sans Docker).
 * Les snapshots sont copiés en profondeur : aucune référence partagée avec les agrégats.
 */
export class InMemorySnapshotStore<TSnapshot extends { readonly version: number }> {
  private readonly items = new Map<string, TSnapshot>();

  constructor(private readonly aggregateName: string) {}

  get(id: string): TSnapshot | null {
    const snapshot = this.items.get(id);
    return snapshot ? structuredClone(snapshot) : null;
  }

  all(): TSnapshot[] {
    return [...this.items.values()].map((snapshot) => structuredClone(snapshot));
  }

  /** Enregistre le snapshot et retourne la nouvelle version (lève ConcurrencyError si obsolète). */
  put(id: string, snapshot: TSnapshot): number {
    const current = this.items.get(id);
    if ((current?.version ?? 0) !== snapshot.version) {
      throw new ConcurrencyError(this.aggregateName, id);
    }
    const version = snapshot.version + 1;
    this.items.set(id, structuredClone({ ...snapshot, version }));
    return version;
  }

  delete(id: string): void {
    this.items.delete(id);
  }

  deleteWhere(predicate: (snapshot: TSnapshot) => boolean): void {
    for (const [id, snapshot] of this.items) {
      if (predicate(snapshot)) {
        this.items.delete(id);
      }
    }
  }
}

/** Unité de travail factice : la mémoire n'offre pas de retour arrière (acceptable hors production). */
export class InMemoryUnitOfWork implements UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T> {
    return work();
  }
}

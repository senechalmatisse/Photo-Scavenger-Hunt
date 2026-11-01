import { ConflictError } from '../../../shared/domain/domain-error';
import { InMemorySnapshotStore } from '../../../shared/infrastructure/persistence/in-memory-store';
import { UserRepository } from '../domain/ports';
import { User, UserSnapshot } from '../domain/user';

export class InMemoryUserRepository implements UserRepository {
  private readonly store = new InMemorySnapshotStore<UserSnapshot>('Le compte');

  async findById(id: string): Promise<User | null> {
    const snapshot = this.store.get(id);
    return snapshot ? User.restore(snapshot) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const snapshot = this.store.all().find((candidate) => candidate.email === email);
    return snapshot ? User.restore(snapshot) : null;
  }

  async findByIds(ids: readonly string[]): Promise<User[]> {
    const wanted = new Set(ids);
    return this.store.all().filter((snapshot) => wanted.has(snapshot.id)).map((snapshot) => User.restore(snapshot));
  }

  async save(user: User): Promise<void> {
    const snapshot = user.toSnapshot();
    if (snapshot.email && this.store.all().some((other) => other.email === snapshot.email && other.id !== snapshot.id)) {
      throw new ConflictError('EMAIL_TAKEN', 'Un compte existe déjà avec cette adresse e-mail.');
    }
    user.commitVersion(this.store.put(snapshot.id, snapshot));
  }

  async delete(id: string): Promise<void> {
    this.store.delete(id);
  }
}

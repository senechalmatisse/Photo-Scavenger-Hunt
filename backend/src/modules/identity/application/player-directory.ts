import { UserRepository } from '../domain/ports';

export interface PlayerProfile {
  readonly displayName: string;
  readonly avatar: string;
}

/** Annuaire en lecture seule publié aux autres modules (affichage des pseudonymes dans les classements). */
export interface PlayerDirectory {
  profiles(playerIds: readonly string[]): Promise<Map<string, PlayerProfile>>;
}

export class UserDirectory implements PlayerDirectory {
  constructor(private readonly users: UserRepository) {}

  async profiles(playerIds: readonly string[]): Promise<Map<string, PlayerProfile>> {
    const unique = [...new Set(playerIds)];
    if (unique.length === 0) {
      return new Map();
    }
    const users = await this.users.findByIds(unique);
    return new Map(users.map((user) => [user.id, { displayName: user.displayName, avatar: user.avatar }]));
  }
}

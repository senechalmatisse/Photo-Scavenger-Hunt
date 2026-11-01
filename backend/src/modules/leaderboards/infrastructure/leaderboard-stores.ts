import type Redis from 'ioredis';
import { LeaderboardStore, RankedScore } from '../domain/leaderboard';

/**
 * Classements dans des ensembles triés Redis (ZINCRBY / ZREVRANGE / ZREVRANK) :
 * lecture du haut de classement et du rang d'un joueur en O(log N).
 * Ces données sont une projection, reconstructible depuis la table reward_ledger.
 */
export class RedisLeaderboardStore implements LeaderboardStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'psh:lb:',
  ) {}

  async increment(boardKey: string, playerId: string, points: number): Promise<void> {
    await this.redis.zincrby(this.prefix + boardKey, points, playerId);
  }

  async top(boardKey: string, limit: number): Promise<RankedScore[]> {
    const flat = await this.redis.zrevrange(this.prefix + boardKey, 0, limit - 1, 'WITHSCORES');
    const entries: RankedScore[] = [];
    for (let index = 0; index < flat.length; index += 2) {
      entries.push({ playerId: flat[index], points: Number(flat[index + 1]), rank: index / 2 + 1 });
    }
    return entries;
  }

  async rankOf(boardKey: string, playerId: string): Promise<RankedScore | null> {
    const key = this.prefix + boardKey;
    const [rank, score] = await Promise.all([this.redis.zrevrank(key, playerId), this.redis.zscore(key, playerId)]);
    return rank === null || score === null ? null : { playerId, points: Number(score), rank: rank + 1 };
  }

  async removePlayer(playerId: string): Promise<void> {
    let cursor = '0';
    do {
      const [next, keys] = await this.redis.scan(cursor, 'MATCH', `${this.prefix}*`, 'COUNT', 200);
      cursor = next;
      if (keys.length > 0) {
        await Promise.all(keys.map((key) => this.redis.zrem(key, playerId)));
      }
    } while (cursor !== '0');
  }
}

export class InMemoryLeaderboardStore implements LeaderboardStore {
  private readonly boards = new Map<string, Map<string, number>>();

  async increment(boardKey: string, playerId: string, points: number): Promise<void> {
    const board = this.boards.get(boardKey) ?? new Map<string, number>();
    board.set(playerId, (board.get(playerId) ?? 0) + points);
    this.boards.set(boardKey, board);
  }

  async top(boardKey: string, limit: number): Promise<RankedScore[]> {
    return this.ranked(boardKey).slice(0, limit);
  }

  async rankOf(boardKey: string, playerId: string): Promise<RankedScore | null> {
    return this.ranked(boardKey).find((entry) => entry.playerId === playerId) ?? null;
  }

  async removePlayer(playerId: string): Promise<void> {
    for (const board of this.boards.values()) {
      board.delete(playerId);
    }
  }

  /** Même ordre que Redis : score décroissant, puis membre décroissant à égalité. */
  private ranked(boardKey: string): RankedScore[] {
    return [...(this.boards.get(boardKey) ?? new Map<string, number>()).entries()]
      .sort(([idA, a], [idB, b]) => b - a || idB.localeCompare(idA))
      .map(([playerId, points], index) => ({ playerId, points, rank: index + 1 }));
  }
}

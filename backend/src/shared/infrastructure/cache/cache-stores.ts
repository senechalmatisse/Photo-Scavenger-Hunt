import type Redis from 'ioredis';
import { CacheStore } from '../../application/ports';
import { Clock } from '../../domain/ports';

interface Entry {
  readonly value: string;
  readonly expiresAt: number;
}

/** Cache mémoire borné (éviction de l'entrée la plus ancienne), pour un seul processus. */
export class InMemoryCacheStore implements CacheStore {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly clock: Clock,
    private readonly maxEntries = 5000,
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (entry.expiresAt <= this.clock.now().getTime()) {
      this.entries.delete(key);
      return undefined;
    }
    return JSON.parse(entry.value) as T;
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (ttlSeconds <= 0) {
      return;
    }
    this.entries.delete(key);
    this.entries.set(key, { value: JSON.stringify(value), expiresAt: this.clock.now().getTime() + ttlSeconds * 1000 });
    if (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) {
        this.entries.delete(oldest);
      }
    }
  }

  async delete(key: string): Promise<void> {
    this.entries.delete(key);
  }
}

/** Cache partagé entre instances (Redis). */
export class RedisCacheStore implements CacheStore {
  constructor(
    private readonly redis: Redis,
    private readonly prefix = 'psh:cache:',
  ) {}

  async get<T>(key: string): Promise<T | undefined> {
    const raw = await this.redis.get(this.prefix + key);
    return raw === null ? undefined : (JSON.parse(raw) as T);
  }

  async set<T>(key: string, value: T, ttlSeconds: number): Promise<void> {
    if (ttlSeconds > 0) {
      await this.redis.set(this.prefix + key, JSON.stringify(value), 'EX', ttlSeconds);
    }
  }

  async delete(key: string): Promise<void> {
    await this.redis.del(this.prefix + key);
  }
}

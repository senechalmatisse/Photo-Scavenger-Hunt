import { DomainEvent } from '../domain/aggregate-root';

export type EventHandler<E extends DomainEvent = DomainEvent> = (event: E) => Promise<void>;

/**
 * Bus d'événements de domaine (pattern Observer).
 * Les modules réagissent aux faits des autres modules sans dépendre d'eux directement.
 */
export interface EventBus {
  publish(events: readonly DomainEvent[]): Promise<void>;
  subscribe<E extends DomainEvent>(type: string, subscriber: string, handler: EventHandler<E>): void;
}

/** Transaction applicative : tout ou rien sur les écritures des repositories. */
export interface UnitOfWork {
  run<T>(work: () => Promise<T>): Promise<T>;
}

/** Cache clé/valeur avec expiration (Redis en production, mémoire en développement). */
export interface CacheStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/** Journalisation applicative minimale, indépendante de Nest. */
export interface AppLogger {
  info(message: string, context?: Record<string, unknown>): void;
  warn(message: string, context?: Record<string, unknown>): void;
  error(message: string, context?: Record<string, unknown>): void;
}

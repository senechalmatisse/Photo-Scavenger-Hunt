import { createHash } from 'node:crypto';
import { AppLogger, CacheStore } from '../../../shared/application/ports';
import { GeoPoint } from '../../../shared/domain/geo';
import { Clock } from '../../../shared/domain/ports';
import { LICENSES } from '../domain/license';
import { Photo, PhotoCatalog, PhotoPage, PhotoProviderUnavailableError, PhotoSearchCriteria } from '../domain/photo';

/**
 * Décorateurs du port PhotoCatalog (pattern Decorator) : chaque préoccupation technique
 * s'ajoute autour de l'adaptateur Flickr sans le modifier, et l'ordre de composition est
 * décidé au point de montage (module Nest) :
 *
 *   CachingPhotoCatalog → ResilientPhotoCatalog → InstrumentedPhotoCatalog → FlickrPhotoCatalog
 */

// ---------------------------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------------------------

/** Forme sérialisable d'une photo (le cache stocke du JSON, pas des objets métier). */
interface CachedPhoto extends Omit<Photo, 'location'> {
  readonly location: { lat: number; lon: number } | null;
}

function serialize(photo: Photo): CachedPhoto {
  return { ...photo, location: photo.location ? photo.location.toJSON() : null };
}

function deserialize(cached: CachedPhoto): Photo {
  return {
    ...cached,
    license: LICENSES[cached.license.code],
    location: cached.location ? GeoPoint.of(cached.location.lat, cached.location.lon) : null,
  };
}

/**
 * Cache des recherches et des fiches photo. Durées courtes : les conditions de l'API Flickr
 * imposent de ne conserver les données que pour une durée raisonnable.
 */
export class CachingPhotoCatalog implements PhotoCatalog {
  constructor(
    private readonly inner: PhotoCatalog,
    private readonly cache: CacheStore,
    private readonly ttl: { readonly searchSeconds: number; readonly photoSeconds: number },
  ) {}

  async search(criteria: PhotoSearchCriteria): Promise<PhotoPage> {
    const key = `photos:search:${createHash('sha256').update(JSON.stringify(criteria)).digest('hex')}`;
    const cached = await this.cache.get<{ page: number; pages: number; total: number; items: CachedPhoto[] }>(key);
    if (cached) {
      return { ...cached, items: cached.items.map(deserialize) };
    }
    const page = await this.inner.search(criteria);
    await this.cache.set(key, { ...page, items: page.items.map(serialize) }, this.ttl.searchSeconds);
    return page;
  }

  async findById(photoId: string): Promise<Photo | null> {
    const key = `photos:item:${photoId}`;
    const cached = await this.cache.get<CachedPhoto | 'MISSING'>(key);
    if (cached === 'MISSING') {
      return null;
    }
    if (cached) {
      return deserialize(cached);
    }
    const photo = await this.inner.findById(photoId);
    await this.cache.set(key, photo ? serialize(photo) : 'MISSING', photo ? this.ttl.photoSeconds : 60);
    return photo;
  }
}

// ---------------------------------------------------------------------------------------------
// Résilience : nouvelles tentatives + disjoncteur
// ---------------------------------------------------------------------------------------------

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Disjoncteur : après N échecs consécutifs, les appels échouent immédiatement pendant une période
 * de refroidissement, puis un appel d'essai est autorisé (demi-ouvert).
 * Une panne de Flickr ne bloque ainsi ni les threads ni le reste de l'application.
 */
export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures = 0;
  private openedAt = 0;

  constructor(
    private readonly failureThreshold: number,
    private readonly cooldownMs: number,
    private readonly clock: Clock,
  ) {}

  get current(): CircuitState {
    return this.state;
  }

  allowRequest(): boolean {
    if (this.state === 'OPEN' && this.clock.now().getTime() - this.openedAt >= this.cooldownMs) {
      this.state = 'HALF_OPEN';
    }
    return this.state !== 'OPEN';
  }

  recordSuccess(): void {
    this.state = 'CLOSED';
    this.failures = 0;
  }

  recordFailure(): void {
    this.failures += 1;
    if (this.state === 'HALF_OPEN' || this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.openedAt = this.clock.now().getTime();
    }
  }
}

export interface RetryPolicy {
  readonly attempts: number;
  readonly baseDelayMs: number;
  /** Une erreur est-elle transitoire (donc réessayable) ? */
  isTransient(error: unknown): boolean;
}

export class ResilientPhotoCatalog implements PhotoCatalog {
  constructor(
    private readonly inner: PhotoCatalog,
    private readonly breaker: CircuitBreaker,
    private readonly retry: RetryPolicy,
    private readonly sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  search(criteria: PhotoSearchCriteria): Promise<PhotoPage> {
    return this.guard(() => this.inner.search(criteria));
  }

  findById(photoId: string): Promise<Photo | null> {
    return this.guard(() => this.inner.findById(photoId));
  }

  private async guard<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.breaker.allowRequest()) {
      throw new PhotoProviderUnavailableError('circuit ouvert');
    }
    for (let attempt = 0; ; attempt += 1) {
      try {
        const result = await operation();
        this.breaker.recordSuccess();
        return result;
      } catch (error) {
        if (!this.retry.isTransient(error)) {
          // Erreur fonctionnelle (paramètre invalide...) : ni nouvelle tentative ni impact sur le disjoncteur.
          throw error;
        }
        if (attempt >= this.retry.attempts) {
          this.breaker.recordFailure();
          throw new PhotoProviderUnavailableError(error instanceof Error ? error.message : String(error));
        }
        await this.sleep(this.retry.baseDelayMs * 2 ** attempt);
      }
    }
  }
}

// ---------------------------------------------------------------------------------------------
// Observabilité
// ---------------------------------------------------------------------------------------------

export interface PhotoProviderMetrics {
  readonly calls: number;
  readonly failures: number;
  readonly lastLatencyMs: number | null;
}

/** Journalise durée et résultat de chaque appel au fournisseur (surveillance des appels Flickr). */
export class InstrumentedPhotoCatalog implements PhotoCatalog {
  private calls = 0;
  private failures = 0;
  private lastLatencyMs: number | null = null;

  constructor(
    private readonly inner: PhotoCatalog,
    private readonly logger: AppLogger,
    private readonly provider: string,
  ) {}

  get metrics(): PhotoProviderMetrics {
    return { calls: this.calls, failures: this.failures, lastLatencyMs: this.lastLatencyMs };
  }

  search(criteria: PhotoSearchCriteria): Promise<PhotoPage> {
    return this.measure('search', () => this.inner.search(criteria));
  }

  findById(photoId: string): Promise<Photo | null> {
    return this.measure('findById', () => this.inner.findById(photoId));
  }

  private async measure<T>(operation: string, call: () => Promise<T>): Promise<T> {
    const started = performance.now();
    this.calls += 1;
    try {
      const result = await call();
      this.lastLatencyMs = Math.round(performance.now() - started);
      this.logger.info('Appel fournisseur de photos', { provider: this.provider, operation, durationMs: this.lastLatencyMs });
      return result;
    } catch (error) {
      this.failures += 1;
      this.lastLatencyMs = Math.round(performance.now() - started);
      this.logger.warn('Échec d\'appel au fournisseur de photos', {
        provider: this.provider,
        operation,
        durationMs: this.lastLatencyMs,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }
}

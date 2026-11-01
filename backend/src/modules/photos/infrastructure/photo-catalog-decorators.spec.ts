import { FixedClock } from '../../../shared/infrastructure/system';
import { InMemoryCacheStore } from '../../../shared/infrastructure/cache/cache-stores';
import { rejectionOf } from '../../../testing/expectations';
import { Photo, PhotoCatalog, PhotoPage, PhotoProviderUnavailableError, PhotoSearchCriteria } from '../domain/photo';
import { FixturePhotoCatalog } from './fixtures/fixture-photo-catalog';
import { CachingPhotoCatalog, CircuitBreaker, ResilientPhotoCatalog } from './photo-catalog-decorators';

class TransientError extends Error {}

/** Catalogue espion : compte les appels et peut échouer à la demande. */
class SpyCatalog implements PhotoCatalog {
  calls = 0;
  failuresToThrow = 0;
  error: Error = new TransientError('Flickr 105 : service indisponible');
  private readonly inner = new FixturePhotoCatalog();

  async search(criteria: PhotoSearchCriteria): Promise<PhotoPage> {
    this.calls += 1;
    this.maybeFail();
    return this.inner.search(criteria);
  }

  async findById(photoId: string): Promise<Photo | null> {
    this.calls += 1;
    this.maybeFail();
    return this.inner.findById(photoId);
  }

  private maybeFail(): void {
    if (this.failuresToThrow > 0) {
      this.failuresToThrow -= 1;
      throw this.error;
    }
  }
}

const criteria: PhotoSearchCriteria = { text: 'phare', licenses: ['CC-BY-4.0'], sort: 'RELEVANCE', page: 1, perPage: 10 };

describe('CachingPhotoCatalog', () => {
  it('sert les recherches et fiches répétées depuis le cache (photos géolocalisées comprises)', async () => {
    const spy = new SpyCatalog();
    const catalog = new CachingPhotoCatalog(spy, new InMemoryCacheStore(new FixedClock(new Date())), { searchSeconds: 60, photoSeconds: 60 });
    const first = await catalog.search(criteria);
    const second = await catalog.search(criteria);
    expect(spy.calls).toBe(1);
    expect(second.items.map((photo) => photo.id)).toEqual(first.items.map((photo) => photo.id));
    expect(second.items[0].location?.distanceKmTo(first.items[0].location!)).toBe(0);

    expect(await catalog.findById('inexistante')).toBeNull();
    expect(await catalog.findById('inexistante')).toBeNull();
    expect(spy.calls).toBe(2);
  });
});

describe('ResilientPhotoCatalog', () => {
  const retry = { attempts: 2, baseDelayMs: 1, isTransient: (error: unknown) => error instanceof TransientError };
  const noSleep = async () => undefined;

  it('réessaie une erreur transitoire puis réussit', async () => {
    const spy = new SpyCatalog();
    spy.failuresToThrow = 2;
    const catalog = new ResilientPhotoCatalog(spy, new CircuitBreaker(3, 30_000, new FixedClock(new Date())), retry, noSleep);
    expect(await catalog.findById('demo-goury-2018')).not.toBeNull();
    expect(spy.calls).toBe(3);
  });

  it('ouvre le disjoncteur après des échecs répétés, puis le referme après un essai réussi', async () => {
    const clock = new FixedClock(new Date('2026-11-02T10:00:00Z'));
    const breaker = new CircuitBreaker(2, 30_000, clock);
    const spy = new SpyCatalog();
    spy.failuresToThrow = 6;
    const catalog = new ResilientPhotoCatalog(spy, breaker, retry, noSleep);

    expect(await rejectionOf(catalog.findById('x'))).toBeInstanceOf(PhotoProviderUnavailableError);
    expect(await rejectionOf(catalog.findById('x'))).toBeInstanceOf(PhotoProviderUnavailableError);
    expect(breaker.current).toBe('OPEN');

    const callsWhenOpen = spy.calls;
    expect(await rejectionOf(catalog.findById('x'))).toMatchObject({ code: 'PHOTO_PROVIDER_UNAVAILABLE' });
    expect(spy.calls).toBe(callsWhenOpen);

    clock.advance(30_000);
    spy.failuresToThrow = 0;
    expect(await catalog.findById('demo-goury-2018')).not.toBeNull();
    expect(breaker.current).toBe('CLOSED');
  });

  it('laisse passer une erreur fonctionnelle sans réessayer ni ouvrir le disjoncteur', async () => {
    const breaker = new CircuitBreaker(1, 30_000, new FixedClock(new Date()));
    const spy = new SpyCatalog();
    spy.failuresToThrow = 1;
    spy.error = new Error('paramètre invalide');
    const catalog = new ResilientPhotoCatalog(spy, breaker, retry, noSleep);
    expect(await rejectionOf(catalog.search(criteria))).toMatchObject({ message: 'paramètre invalide' });
    expect(spy.calls).toBe(1);
    expect(breaker.current).toBe('CLOSED');
  });
});

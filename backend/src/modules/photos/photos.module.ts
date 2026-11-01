import { Module } from '@nestjs/common';
import { AppConfig } from '../../config/app-config';
import { AppLogger, CacheStore } from '../../shared/application/ports';
import { Clock } from '../../shared/domain/ports';
import { useCase } from '../../shared/infrastructure/providers';
import { APP_CONFIG, APP_LOGGER, CACHE_STORE, CLOCK } from '../../shared/infrastructure/tokens';
import { GetPhoto, SearchPhotos } from './application/photo-use-cases';
import { LicensePolicy } from './domain/license';
import { PhotoCatalog } from './domain/photo';
import { FixturePhotoCatalog } from './infrastructure/fixtures/fixture-photo-catalog';
import { FlickrApiClient, FlickrApiError, FlickrTransportError } from './infrastructure/flickr/flickr-api.client';
import { FlickrPhotoCatalog } from './infrastructure/flickr/flickr-photo-catalog';
import {
  CachingPhotoCatalog,
  CircuitBreaker,
  InstrumentedPhotoCatalog,
  ResilientPhotoCatalog,
} from './infrastructure/photo-catalog-decorators';
import { PhotosController } from './presentation/photos.controller';

export const PHOTO_CATALOG = Symbol('PhotoCatalog');
export const LICENSE_POLICY = Symbol('LicensePolicy');

/**
 * Composition du catalogue de photos (patterns Adapter + Decorator) :
 * Cache → Résilience (réessais + disjoncteur) → Instrumentation → Flickr (ou démonstration).
 */
function buildCatalog(config: AppConfig, cache: CacheStore, clock: Clock, logger: AppLogger): PhotoCatalog {
  const { photos } = config;
  const provider: PhotoCatalog =
    photos.provider === 'flickr'
      ? new FlickrPhotoCatalog(
          new FlickrApiClient({ apiKey: photos.flickrApiKey ?? '', baseUrl: photos.flickrBaseUrl, timeoutMs: photos.timeoutMs }),
        )
      : new FixturePhotoCatalog();
  const instrumented = new InstrumentedPhotoCatalog(provider, logger, photos.provider);
  const resilient = new ResilientPhotoCatalog(instrumented, new CircuitBreaker(photos.circuitFailureThreshold, photos.circuitCooldownMs, clock), {
    attempts: photos.retryAttempts,
    baseDelayMs: 200,
    isTransient: (error) =>
      (error instanceof FlickrTransportError || error instanceof FlickrApiError) && error.isTransient,
  });
  return new CachingPhotoCatalog(resilient, cache, {
    searchSeconds: config.cache.searchTtlSeconds,
    photoSeconds: config.cache.photoTtlSeconds,
  });
}

@Module({
  controllers: [PhotosController],
  providers: [
    {
      provide: PHOTO_CATALOG,
      useFactory: buildCatalog,
      inject: [APP_CONFIG, CACHE_STORE, CLOCK, APP_LOGGER],
    },
    {
      provide: LICENSE_POLICY,
      useFactory: (config: AppConfig) =>
        config.photos.allowedLicenses
          ? LicensePolicy.fromCodes(config.photos.allowedLicenses)
          : LicensePolicy.forProfile(config.photos.licenseProfile),
      inject: [APP_CONFIG],
    },
    useCase(SearchPhotos, (catalog: PhotoCatalog, policy: LicensePolicy) => new SearchPhotos(catalog, policy), [PHOTO_CATALOG, LICENSE_POLICY]),
    useCase(GetPhoto, (catalog: PhotoCatalog, policy: LicensePolicy) => new GetPhoto(catalog, policy), [PHOTO_CATALOG, LICENSE_POLICY]),
  ],
  exports: [GetPhoto, SearchPhotos],
})
export class PhotosModule {}

import { ServiceUnavailableError } from '../../../shared/domain/domain-error';
import { GeoArea, GeoPoint } from '../../../shared/domain/geo';
import { LocalDate } from '../../../shared/domain/local-date';
import { License, LicenseCode } from './license';

export type DateGranularity = 'EXACT' | 'MONTH' | 'YEAR' | 'CIRCA';

export interface PhotoImageUrls {
  readonly thumbnail: string;
  readonly medium: string;
  readonly large: string;
}

/** Photographie telle que le jeu la manipule, quel que soit le fournisseur. */
export interface Photo {
  readonly id: string;
  readonly title: string;
  readonly ownerId: string;
  readonly ownerName: string;
  readonly license: License;
  readonly takenOn: LocalDate | null;
  readonly takenGranularity: DateGranularity | null;
  readonly location: GeoPoint | null;
  readonly tags: readonly string[];
  readonly imageUrls: PhotoImageUrls;
  /** Page source chez le fournisseur : lien d'attribution obligatoire (US-036). */
  readonly pageUrl: string;
  readonly description: string | null;
  readonly placeName: string | null;
}

export type PhotoSort = 'RELEVANCE' | 'INTERESTINGNESS' | 'DATE_TAKEN_DESC';

export interface PhotoSearchCriteria {
  readonly text?: string;
  readonly tags?: readonly string[];
  readonly tagMode?: 'ANY' | 'ALL';
  readonly takenFrom?: LocalDate;
  readonly takenTo?: LocalDate;
  readonly area?: GeoArea;
  readonly geotaggedOnly?: boolean;
  readonly licenses: readonly LicenseCode[];
  readonly sort: PhotoSort;
  readonly page: number;
  readonly perPage: number;
}

export interface PhotoPage {
  readonly items: readonly Photo[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

/**
 * Port sortant vers le fournisseur de photographies (Flickr aujourd'hui).
 * Le domaine et les cas d'usage n'importent jamais l'API Flickr directement.
 */
export interface PhotoCatalog {
  search(criteria: PhotoSearchCriteria): Promise<PhotoPage>;
  /** `null` si la photo n'existe plus ou n'est plus publique. */
  findById(photoId: string): Promise<Photo | null>;
}

export class PhotoProviderUnavailableError extends ServiceUnavailableError {
  constructor(reason: string) {
    super(
      'PHOTO_PROVIDER_UNAVAILABLE',
      'Le service de photographies est momentanément indisponible. Le reste du jeu reste accessible : réessayez dans quelques instants.',
      { reason },
    );
  }
}

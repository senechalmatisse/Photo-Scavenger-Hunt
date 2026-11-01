import { ValidationError } from '../../../shared/domain/domain-error';
import { BoundingBox, CircleArea, GeoArea, GeoPoint } from '../../../shared/domain/geo';
import { LocalDates } from '../../../shared/domain/local-date';
import { LicensePolicy } from '../domain/license';
import { Photo, PhotoCatalog, PhotoPage, PhotoSort } from '../domain/photo';

/**
 * Les conditions d'utilisation de l'API Flickr interdisent d'afficher plus de 30 photos
 * d'utilisateurs par page : la limite est portée par le cas d'usage, pas par l'écran.
 */
export const MAX_PHOTOS_PER_PAGE = 30;

export interface PhotoSearchQuery {
  readonly text?: string;
  readonly tags?: string;
  readonly tagMode?: string;
  readonly takenFrom?: string;
  readonly takenTo?: string;
  readonly bbox?: string;
  readonly lat?: number;
  readonly lon?: number;
  readonly radiusKm?: number;
  readonly geotagged?: boolean;
  readonly sort?: string;
  readonly page?: number;
  readonly perPage?: number;
}

const SORTS: readonly PhotoSort[] = ['RELEVANCE', 'INTERESTINGNESS', 'DATE_TAKEN_DESC'];

/** US-030 à US-033 : recherche par mots-clés, tags, période et zone, filtrée par licence. */
export class SearchPhotos {
  constructor(
    private readonly catalog: PhotoCatalog,
    private readonly licenses: LicensePolicy,
  ) {}

  async execute(query: PhotoSearchQuery): Promise<PhotoPage> {
    const text = query.text?.trim() || undefined;
    const tags = query.tags
      ? query.tags.split(',').map((tag) => tag.trim()).filter((tag) => tag.length > 0).slice(0, 20)
      : undefined;
    const area = this.parseArea(query);
    if (!text && !tags?.length && !area) {
      throw new ValidationError('SEARCH_TOO_BROAD', 'Précisez au moins un mot-clé, un tag ou une zone géographique.');
    }
    const takenFrom = query.takenFrom ? LocalDates.parse(query.takenFrom, 'takenFrom') : undefined;
    const takenTo = query.takenTo ? LocalDates.parse(query.takenTo, 'takenTo') : undefined;
    if (takenFrom && takenTo && takenFrom > takenTo) {
      throw new ValidationError('INVALID_PERIOD', 'Le début de la période doit précéder sa fin.');
    }
    const sort = (query.sort?.toUpperCase() ?? 'RELEVANCE') as PhotoSort;
    if (!SORTS.includes(sort)) {
      throw new ValidationError('INVALID_SORT', `Tri inconnu : ${query.sort}.`);
    }
    const tagMode = query.tagMode?.toUpperCase() === 'ALL' ? 'ALL' : 'ANY';
    return this.catalog.search({
      text,
      tags,
      tagMode,
      takenFrom,
      takenTo,
      area,
      geotaggedOnly: query.geotagged ?? area !== undefined,
      licenses: this.licenses.allowedCodes(),
      sort,
      page: Math.max(1, Math.trunc(query.page ?? 1)),
      perPage: Math.min(MAX_PHOTOS_PER_PAGE, Math.max(1, Math.trunc(query.perPage ?? 24))),
    });
  }

  private parseArea(query: PhotoSearchQuery): GeoArea | undefined {
    if (query.bbox) {
      return BoundingBox.parse(query.bbox);
    }
    if (query.lat !== undefined && query.lon !== undefined) {
      return CircleArea.of(GeoPoint.of(query.lat, query.lon), query.radiusKm ?? 5);
    }
    return undefined;
  }
}

/**
 * US-034 : détail d'une photographie. Renvoie `null` si la photo n'existe plus, n'est plus publique,
 * ou si sa licence n'est pas autorisée par le jeu.
 */
export class GetPhoto {
  constructor(
    private readonly catalog: PhotoCatalog,
    private readonly licenses: LicensePolicy,
  ) {}

  async execute(photoId: string): Promise<Photo | null> {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(photoId)) {
      throw new ValidationError('INVALID_PHOTO_ID', 'Identifiant de photographie invalide.');
    }
    const photo = await this.catalog.findById(photoId);
    return photo && this.licenses.allows(photo.license.code) ? photo : null;
  }
}

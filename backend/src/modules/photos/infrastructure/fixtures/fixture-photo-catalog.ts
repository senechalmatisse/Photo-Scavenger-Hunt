import { GeoPoint } from '../../../../shared/domain/geo';
import { LicenseCode, LICENSES } from '../../domain/license';
import { DateGranularity, Photo, PhotoCatalog, PhotoPage, PhotoSearchCriteria } from '../../domain/photo';
import { FIXTURE_PHOTOS, FixturePhoto } from './fixture-photos';

/** Même normalisation que Flickr pour comparer textes et mots-clés. */
function normalize(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/** Vignette SVG générée : aucune image distante, utilisable hors ligne et sans droits tiers. */
function placeholder(photo: FixturePhoto, width: number, height: number): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 400 300">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${photo.sky}"/>` +
    `<stop offset="1" stop-color="${photo.ground}"/></linearGradient></defs>` +
    `<rect width="400" height="300" fill="url(#g)"/>` +
    `<circle cx="320" cy="70" r="28" fill="#fff6d5" opacity="0.85"/>` +
    `<path d="M0 230 Q100 200 200 225 T400 215 V300 H0Z" fill="#000" opacity="0.18"/>` +
    `<text x="24" y="270" font-family="Georgia, serif" font-size="26" fill="#fff">${photo.title.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</text>` +
    `<text x="24" y="40" font-family="Arial, sans-serif" font-size="14" fill="#fff" opacity="0.8">Photo de démonstration</text>` +
    `</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function toPhoto(fixture: FixturePhoto): Photo {
  return {
    id: fixture.id,
    title: fixture.title,
    ownerId: 'demo',
    ownerName: fixture.owner,
    license: LICENSES[fixture.license as LicenseCode],
    takenOn: fixture.takenOn,
    takenGranularity: (fixture.granularity ?? (fixture.takenOn ? 'EXACT' : null)) as DateGranularity | null,
    location: fixture.lat !== null && fixture.lon !== null ? GeoPoint.of(fixture.lat, fixture.lon) : null,
    tags: fixture.tags,
    imageUrls: {
      thumbnail: placeholder(fixture, 150, 150),
      medium: placeholder(fixture, 640, 480),
      large: placeholder(fixture, 1024, 768),
    },
    pageUrl: `https://example.org/demo-photos/${fixture.id}`,
    description: fixture.description,
    placeName: fixture.place,
  };
}

/**
 * Catalogue de démonstration (PHOTO_PROVIDER=fixtures) : le jeu complet fonctionne sans clé Flickr
 * ni réseau, pour le développement, les tests de bout en bout et les démonstrations.
 */
export class FixturePhotoCatalog implements PhotoCatalog {
  private readonly photos: readonly Photo[];

  constructor(fixtures: readonly FixturePhoto[] = FIXTURE_PHOTOS) {
    this.photos = fixtures.map(toPhoto);
  }

  async search(criteria: PhotoSearchCriteria): Promise<PhotoPage> {
    const words = criteria.text ? criteria.text.split(/\s+/).map(normalize).filter(Boolean) : [];
    const tags = (criteria.tags ?? []).map(normalize).filter(Boolean);
    const licenses = new Set(criteria.licenses);
    const matching = this.photos.filter((photo) => {
      const photoTags = photo.tags.map(normalize);
      const haystack = normalize(`${photo.title} ${photo.description ?? ''} ${photo.placeName ?? ''}`) + photoTags.join('');
      const textOk = words.every((word) => haystack.includes(word));
      const tagsOk =
        tags.length === 0 ||
        (criteria.tagMode === 'ALL' ? tags.every((tag) => photoTags.includes(tag)) : tags.some((tag) => photoTags.includes(tag)));
      const fromOk = !criteria.takenFrom || (photo.takenOn !== null && photo.takenOn >= criteria.takenFrom);
      const toOk = !criteria.takenTo || (photo.takenOn !== null && photo.takenOn <= criteria.takenTo);
      const areaOk = !criteria.area || (photo.location !== null && criteria.area.contains(photo.location));
      const geoOk = !criteria.geotaggedOnly || photo.location !== null;
      return licenses.has(photo.license.code) && textOk && tagsOk && fromOk && toOk && areaOk && geoOk;
    });
    if (criteria.sort === 'DATE_TAKEN_DESC') {
      matching.sort((a, b) => (b.takenOn ?? '').localeCompare(a.takenOn ?? ''));
    }
    const start = (criteria.page - 1) * criteria.perPage;
    return {
      items: matching.slice(start, start + criteria.perPage),
      page: criteria.page,
      pages: Math.max(1, Math.ceil(matching.length / criteria.perPage)),
      total: matching.length,
    };
  }

  async findById(photoId: string): Promise<Photo | null> {
    return this.photos.find((photo) => photo.id === photoId) ?? null;
  }
}

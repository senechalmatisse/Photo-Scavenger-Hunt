import { GeoArea, GeoPoint } from '../../../../shared/domain/geo';
import { LicenseCode, LICENSES } from '../../domain/license';
import { DateGranularity, Photo, PhotoCatalog, PhotoPage, PhotoSearchCriteria, PhotoSort } from '../../domain/photo';
import { FlickrApiClient, FlickrApiError } from './flickr-api.client';

/** Correspondance identifiants Flickr ↔ codes de licence du domaine (flickr.photos.licenses.getInfo). */
export const FLICKR_LICENSE_IDS: Readonly<Record<string, LicenseCode>> = {
  '0': 'ARR',
  '1': 'CC-BY-NC-SA-2.0',
  '2': 'CC-BY-NC-2.0',
  '3': 'CC-BY-NC-ND-2.0',
  '4': 'CC-BY-2.0',
  '5': 'CC-BY-SA-2.0',
  '6': 'CC-BY-ND-2.0',
  '7': 'NO-KNOWN-RESTRICTIONS',
  '8': 'US-GOV',
  '9': 'CC0-1.0',
  '10': 'PDM-1.0',
  '11': 'CC-BY-4.0',
  '12': 'CC-BY-SA-4.0',
  '13': 'CC-BY-ND-4.0',
  '14': 'CC-BY-NC-4.0',
  '15': 'CC-BY-NC-SA-4.0',
  '16': 'CC-BY-NC-ND-4.0',
};

const FLICKR_ID_BY_LICENSE = new Map(Object.entries(FLICKR_LICENSE_IDS).map(([id, code]) => [code, id]));

const SORTS: Readonly<Record<PhotoSort, string>> = {
  RELEVANCE: 'relevance',
  INTERESTINGNESS: 'interestingness-desc',
  DATE_TAKEN_DESC: 'date-taken-desc',
};

/** Granularité Flickr de `datetaken` : 0 exacte, 4 mois, 6 année, 8 « vers ». */
const GRANULARITY: Readonly<Record<string, DateGranularity>> = { '0': 'EXACT', '4': 'MONTH', '6': 'YEAR', '8': 'CIRCA' };

/** Flickr limite les recherches circulaires à un rayon inférieur à 32 km. */
const MAX_RADIUS_KM = 32;
/** « Agent limitant » requis par Flickr pour une recherche purement géographique. */
const GEO_LIMITING_MIN_UPLOAD = 946_684_800; // 2000-01-01

const SEARCH_EXTRAS = 'date_taken,geo,owner_name,license,tags,url_q,url_z,url_b,path_alias';

interface FlickrSearchPhoto {
  id: string;
  owner: string;
  secret: string;
  server: string;
  title: string;
  license: string | number;
  datetaken?: string;
  datetakengranularity?: string | number;
  datetakenunknown?: string | number;
  ownername?: string;
  pathalias?: string | null;
  latitude?: string | number;
  longitude?: string | number;
  tags?: string;
  url_q?: string;
  url_z?: string;
  url_b?: string;
}

interface FlickrSearchResponse {
  photos: { page: number | string; pages: number | string; total: number | string; photo: FlickrSearchPhoto[] };
}

interface FlickrInfoResponse {
  photo: {
    id: string;
    secret: string;
    server: string;
    license: string | number;
    owner: { nsid: string; username?: string; realname?: string; path_alias?: string | null };
    title: { _content: string };
    description?: { _content: string };
    visibility?: { ispublic: number | string };
    dates?: { taken?: string; takengranularity?: string | number; takenunknown?: string | number };
    tags?: { tag: { _content: string }[] };
    location?: {
      latitude: string | number;
      longitude: string | number;
      locality?: { _content: string };
      region?: { _content: string };
      country?: { _content: string };
    };
    urls?: { url: { type: string; _content: string }[] };
  };
}

/**
 * Adaptateur Flickr du port PhotoCatalog : couche anti-corruption.
 * Traduit les critères du domaine en paramètres Flickr et les réponses Flickr en `Photo`,
 * en absorbant les irrégularités du format (nombres en chaînes, coordonnées à 0 si non géolocalisée...).
 */
export class FlickrPhotoCatalog implements PhotoCatalog {
  constructor(private readonly client: FlickrApiClient) {}

  async search(criteria: PhotoSearchCriteria): Promise<PhotoPage> {
    const response = await this.client.call<FlickrSearchResponse>('flickr.photos.search', this.toParams(criteria));
    const items = response.photos.photo
      .map((raw) => this.fromSearch(raw))
      .filter((photo): photo is Photo => photo !== null);
    return {
      items,
      page: Number(response.photos.page),
      pages: Number(response.photos.pages),
      total: Number(response.photos.total),
    };
  }

  async findById(photoId: string): Promise<Photo | null> {
    try {
      const { photo } = await this.client.call<FlickrInfoResponse>('flickr.photos.getInfo', { photo_id: photoId });
      if (photo.visibility && Number(photo.visibility.ispublic) !== 1) {
        return null;
      }
      return this.fromInfo(photo);
    } catch (error) {
      if (error instanceof FlickrApiError && error.isNotFound) {
        return null;
      }
      throw error;
    }
  }

  toParams(criteria: PhotoSearchCriteria): Record<string, string | number | undefined> {
    const params: Record<string, string | number | undefined> = {
      text: criteria.text,
      tags: criteria.tags?.join(','),
      tag_mode: criteria.tags?.length ? criteria.tagMode?.toLowerCase() ?? 'any' : undefined,
      min_taken_date: criteria.takenFrom ? `${criteria.takenFrom} 00:00:00` : undefined,
      max_taken_date: criteria.takenTo ? `${criteria.takenTo} 23:59:59` : undefined,
      license: criteria.licenses
        .map((code) => FLICKR_ID_BY_LICENSE.get(code))
        .filter((id): id is string => id !== undefined)
        .join(','),
      has_geo: criteria.geotaggedOnly ? 1 : undefined,
      safe_search: 1,
      content_types: '0',
      media: 'photos',
      sort: SORTS[criteria.sort],
      extras: SEARCH_EXTRAS,
      per_page: criteria.perPage,
      page: criteria.page,
    };
    if (criteria.area) {
      Object.assign(params, this.geoParams(criteria.area));
      const hasLimitingAgent = Boolean(criteria.text || criteria.tags?.length || criteria.takenFrom || criteria.takenTo);
      if (!hasLimitingAgent) {
        params.min_upload_date = GEO_LIMITING_MIN_UPLOAD;
      }
    }
    return params;
  }

  private geoParams(area: GeoArea): Record<string, string | number> {
    const json = area.toJSON();
    if (json.kind === 'CIRCLE' && json.radiusKm < MAX_RADIUS_KM) {
      return { lat: json.lat, lon: json.lon, radius: json.radiusKm, radius_units: 'km' };
    }
    const box = area.boundingBox();
    return { bbox: [box.minLon, box.minLat, box.maxLon, box.maxLat].join(',') };
  }

  private fromSearch(raw: FlickrSearchPhoto): Photo | null {
    const license = FLICKR_LICENSE_IDS[String(raw.license)];
    if (!license) {
      return null;
    }
    const base = imageBase(raw.server, raw.id, raw.secret);
    return {
      id: raw.id,
      title: raw.title?.trim() || 'Sans titre',
      ownerId: raw.owner,
      ownerName: raw.ownername || raw.owner,
      license: LICENSES[license],
      ...takenDate(raw.datetaken, raw.datetakengranularity, raw.datetakenunknown),
      location: toPoint(raw.latitude, raw.longitude),
      tags: raw.tags ? raw.tags.split(' ').filter(Boolean) : [],
      imageUrls: {
        thumbnail: raw.url_q ?? `${base}_q.jpg`,
        medium: raw.url_z ?? `${base}_z.jpg`,
        large: raw.url_b ?? `${base}_b.jpg`,
      },
      pageUrl: `https://www.flickr.com/photos/${raw.pathalias || raw.owner}/${raw.id}/`,
      description: null,
      placeName: null,
    };
  }

  private fromInfo(raw: FlickrInfoResponse['photo']): Photo | null {
    const license = FLICKR_LICENSE_IDS[String(raw.license)];
    if (!license) {
      return null;
    }
    const base = imageBase(raw.server, raw.id, raw.secret);
    const place = raw.location
      ? [raw.location.locality?._content, raw.location.region?._content, raw.location.country?._content].filter(Boolean).join(', ')
      : '';
    const pageUrl =
      raw.urls?.url.find((url) => url.type === 'photopage')?._content ??
      `https://www.flickr.com/photos/${raw.owner.path_alias || raw.owner.nsid}/${raw.id}/`;
    return {
      id: raw.id,
      title: raw.title._content?.trim() || 'Sans titre',
      ownerId: raw.owner.nsid,
      ownerName: raw.owner.realname?.trim() || raw.owner.username || raw.owner.nsid,
      license: LICENSES[license],
      ...takenDate(raw.dates?.taken, raw.dates?.takengranularity, raw.dates?.takenunknown),
      location: raw.location ? toPoint(raw.location.latitude, raw.location.longitude) : null,
      tags: raw.tags?.tag.map((tag) => tag._content) ?? [],
      imageUrls: { thumbnail: `${base}_q.jpg`, medium: `${base}_z.jpg`, large: `${base}_b.jpg` },
      pageUrl,
      description: raw.description?._content?.trim() || null,
      placeName: place || null,
    };
  }
}

function imageBase(server: string, id: string, secret: string): string {
  return `https://live.staticflickr.com/${server}/${id}_${secret}`;
}

/** Flickr renvoie 0/0 pour une photo non géolocalisée. */
function toPoint(latitude: string | number | undefined, longitude: string | number | undefined): GeoPoint | null {
  const lat = Number(latitude);
  const lon = Number(longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || (lat === 0 && lon === 0)) {
    return null;
  }
  try {
    return GeoPoint.of(lat, lon);
  } catch {
    return null;
  }
}

function takenDate(
  taken: string | undefined,
  granularity: string | number | undefined,
  unknown: string | number | undefined,
): { takenOn: string | null; takenGranularity: DateGranularity | null } {
  if (!taken || Number(unknown) === 1 || !/^\d{4}-\d{2}-\d{2}/.test(taken)) {
    return { takenOn: null, takenGranularity: null };
  }
  return { takenOn: taken.slice(0, 10), takenGranularity: GRANULARITY[String(granularity ?? 0)] ?? 'EXACT' };
}

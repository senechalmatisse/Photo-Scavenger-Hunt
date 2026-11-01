import { BoundingBox, CircleArea, GeoPoint } from '../../../../shared/domain/geo';
import { rejectionOf } from '../../../../testing/expectations';
import { PhotoSearchCriteria } from '../../domain/photo';
import { FlickrApiClient, FlickrTransportError } from './flickr-api.client';
import { FlickrPhotoCatalog } from './flickr-photo-catalog';

const API_KEY = 'secret-api-key';

/** Faux `fetch` : mémorise les URL appelées et rejoue des réponses préparées. */
function fakeFetch(...responses: Array<{ status?: number; body: unknown }>) {
  const calls: URL[] = [];
  const fetchFn = (async (input: string | URL | Request) => {
    calls.push(new URL(String(input)));
    const next = responses.shift() ?? { body: { stat: 'ok' } };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { calls, fetchFn };
}

function catalogWith(fetchFn: typeof fetch): FlickrPhotoCatalog {
  return new FlickrPhotoCatalog(new FlickrApiClient({ apiKey: API_KEY, baseUrl: 'https://api.flickr.com/services/rest/', timeoutMs: 1000, fetchFn }));
}

const criteria = (overrides: Partial<PhotoSearchCriteria> = {}): PhotoSearchCriteria => ({
  licenses: ['CC-BY-4.0', 'CC0-1.0'],
  sort: 'RELEVANCE',
  page: 1,
  perPage: 24,
  ...overrides,
});

describe('FlickrPhotoCatalog - traduction des critères', () => {
  const catalog = catalogWith(fakeFetch().fetchFn);

  it('traduit licences, période, tri et filtres de sécurité', () => {
    const params = catalog.toParams(criteria({ text: 'phare', tags: ['phare', 'lighthouse'], tagMode: 'ALL', takenFrom: '2015-01-01', takenTo: '2024-12-31' }));
    expect(params).toMatchObject({
      text: 'phare',
      tags: 'phare,lighthouse',
      tag_mode: 'all',
      min_taken_date: '2015-01-01 00:00:00',
      max_taken_date: '2024-12-31 23:59:59',
      license: '11,9',
      safe_search: 1,
      content_types: '0',
      sort: 'relevance',
      per_page: 24,
    });
  });

  it('ajoute l’« agent limitant » exigé par Flickr pour une recherche purement géographique', () => {
    const params = catalog.toParams(criteria({ area: BoundingBox.of(48.8, 2.2, 48.95, 2.5), geotaggedOnly: true }));
    expect(params).toMatchObject({ bbox: '2.2,48.8,2.5,48.95', has_geo: 1, min_upload_date: 946_684_800 });
  });

  it('utilise la recherche par rayon sous 32 km, sinon un rectangle englobant', () => {
    expect(catalog.toParams(criteria({ text: 'x', area: CircleArea.of(GeoPoint.of(48.85, 2.35), 10) }))).toMatchObject({
      lat: 48.85,
      lon: 2.35,
      radius: 10,
      radius_units: 'km',
    });
    const wide = catalog.toParams(criteria({ text: 'x', area: CircleArea.of(GeoPoint.of(48.85, 2.35), 50) }));
    expect(wide.bbox).toBeDefined();
    expect(wide.radius).toBeUndefined();
  });
});

describe('FlickrPhotoCatalog - traduction des réponses', () => {
  it('normalise une page de résultats (coordonnées 0/0, date inconnue, licence inconnue)', async () => {
    const { calls, fetchFn } = fakeFetch({
      body: {
        stat: 'ok',
        photos: {
          page: 1,
          pages: '3',
          total: '61',
          photo: [
            {
              id: '101', owner: '12@N01', secret: 'abc', server: '65535', title: 'Phare de Goury', license: '4',
              datetaken: '2018-07-14 19:02:11', datetakengranularity: '0', datetakenunknown: '0', ownername: 'Alice',
              latitude: '49.7153', longitude: '-1.9467', tags: 'phare lighthouse', url_z: 'https://live.staticflickr.com/z.jpg',
            },
            {
              id: '102', owner: '13@N01', secret: 'def', server: '65535', title: '', license: 11, datetaken: '2015-01-01 00:00:00',
              datetakengranularity: 6, datetakenunknown: '1', latitude: 0, longitude: 0, tags: '',
            },
            { id: '103', owner: '14@N01', secret: 'ghi', server: '1', title: 'Inconnue', license: '99' },
          ],
        },
      },
    });
    const page = await catalogWith(fetchFn).search(criteria({ text: 'phare' }));
    expect(calls[0].searchParams.get('method')).toBe('flickr.photos.search');
    expect(page).toMatchObject({ page: 1, pages: 3, total: 61 });
    expect(page.items).toHaveLength(2);
    expect(page.items[0]).toMatchObject({
      id: '101',
      ownerName: 'Alice',
      license: { code: 'CC-BY-2.0' },
      takenOn: '2018-07-14',
      takenGranularity: 'EXACT',
      tags: ['phare', 'lighthouse'],
      pageUrl: 'https://www.flickr.com/photos/12@N01/101/',
      imageUrls: { medium: 'https://live.staticflickr.com/z.jpg', thumbnail: 'https://live.staticflickr.com/65535/101_abc_q.jpg' },
    });
    expect(page.items[0].location?.toJSON()).toEqual({ lat: 49.7153, lon: -1.9467 });
    expect(page.items[1]).toMatchObject({ title: 'Sans titre', location: null, takenOn: null, license: { code: 'CC-BY-4.0' } });
  });

  it('lit la fiche détaillée d’une photo publique', async () => {
    const { fetchFn } = fakeFetch({
      body: {
        stat: 'ok',
        photo: {
          id: '101', secret: 'abc', server: '65535', license: '12',
          owner: { nsid: '12@N01', username: 'alice', realname: 'Alice Martin' },
          title: { _content: 'Phare de Goury' }, description: { _content: 'Au couchant' }, visibility: { ispublic: 1 },
          dates: { taken: '2018-07-00 00:00:00', takengranularity: '4', takenunknown: '0' },
          tags: { tag: [{ _content: 'phare' }, { _content: 'normandie' }] },
          location: { latitude: '49.7153', longitude: '-1.9467', locality: { _content: 'Auderville' }, country: { _content: 'France' } },
          urls: { url: [{ type: 'photopage', _content: 'https://www.flickr.com/photos/alice/101/' }] },
        },
      },
    });
    expect(await catalogWith(fetchFn).findById('101')).toMatchObject({
      ownerName: 'Alice Martin',
      license: { code: 'CC-BY-SA-4.0' },
      takenGranularity: 'MONTH',
      tags: ['phare', 'normandie'],
      placeName: 'Auderville, France',
      pageUrl: 'https://www.flickr.com/photos/alice/101/',
      description: 'Au couchant',
    });
  });

  it('considère comme indisponible une photo supprimée ou devenue privée', async () => {
    const deleted = fakeFetch({ body: { stat: 'fail', code: 1, message: 'Photo "1" not found (invalid ID)' } });
    expect(await catalogWith(deleted.fetchFn).findById('1')).toBeNull();
    const privatePhoto = fakeFetch({
      body: { stat: 'ok', photo: { id: '2', secret: 's', server: '1', license: '4', owner: { nsid: 'n' }, title: { _content: 't' }, visibility: { ispublic: 0 } } },
    });
    expect(await catalogWith(privatePhoto.fetchFn).findById('2')).toBeNull();
  });

  it('signale une panne de transport comme transitoire, sans divulguer la clé d’API', async () => {
    const { fetchFn } = fakeFetch({ status: 503, body: {} });
    const error = await rejectionOf(catalogWith(fetchFn).search(criteria({ text: 'phare' })));
    expect(error).toBeInstanceOf(FlickrTransportError);
    expect((error as FlickrTransportError).isTransient).toBe(true);
    expect((error as Error).message).not.toContain(API_KEY);
  });
});

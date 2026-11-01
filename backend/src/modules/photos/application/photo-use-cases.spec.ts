import { rejectionOf } from '../../../testing/expectations';
import { LicensePolicy } from '../domain/license';
import { PhotoCatalog, PhotoPage, PhotoSearchCriteria } from '../domain/photo';
import { FixturePhotoCatalog } from '../infrastructure/fixtures/fixture-photo-catalog';
import { GetPhoto, MAX_PHOTOS_PER_PAGE, SearchPhotos } from './photo-use-cases';

class CapturingCatalog extends FixturePhotoCatalog implements PhotoCatalog {
  last: PhotoSearchCriteria | null = null;

  override async search(criteria: PhotoSearchCriteria): Promise<PhotoPage> {
    this.last = criteria;
    return super.search(criteria);
  }
}

describe('SearchPhotos', () => {
  const policy = LicensePolicy.forProfile('non-commercial');

  it('refuse une recherche sans aucun critère (US-030)', async () => {
    expect(await rejectionOf(new SearchPhotos(new FixturePhotoCatalog(), policy).execute({}))).toMatchObject({ code: 'SEARCH_TOO_BROAD' });
  });

  it('plafonne la taille de page à 30 (conditions de l’API Flickr) et transmet la politique de licences', async () => {
    const catalog = new CapturingCatalog();
    await new SearchPhotos(catalog, policy).execute({ text: 'phare', perPage: 200 });
    expect(catalog.last?.perPage).toBe(MAX_PHOTOS_PER_PAGE);
    expect(catalog.last?.licenses).not.toContain('ARR');
  });

  it('n’affiche jamais une photo « tous droits réservés »', async () => {
    const page = await new SearchPhotos(new FixturePhotoCatalog(), policy).execute({ tags: 'phare' });
    expect(page.items.map((photo) => photo.id)).not.toContain('demo-petitminou-2020');
    expect(page.items.length).toBeGreaterThan(3);
  });

  it('filtre par zone : seules les photos géolocalisées dans la zone sont proposées (US-033)', async () => {
    const page = await new SearchPhotos(new FixturePhotoCatalog(), policy).execute({ bbox: '2.2,48.8,2.5,48.95' });
    expect(page.items.map((photo) => photo.id).sort()).toEqual(['demo-eiffel-2017', 'demo-eiffel-2023']);
  });

  it('profil commercial : exclut aussi les licences « pas d’utilisation commerciale »', async () => {
    const page = await new SearchPhotos(new FixturePhotoCatalog(), LicensePolicy.forProfile('commercial')).execute({ tags: 'phare' });
    expect(page.items.map((photo) => photo.id)).not.toContain('demo-baleines-2022');
  });
});

describe('GetPhoto', () => {
  it('ne renvoie pas une photo dont la licence n’est pas autorisée', async () => {
    const getPhoto = new GetPhoto(new FixturePhotoCatalog(), LicensePolicy.forProfile('non-commercial'));
    expect(await getPhoto.execute('demo-petitminou-2020')).toBeNull();
    expect(await getPhoto.execute('demo-goury-2018')).toMatchObject({ title: 'Phare de Goury au couchant' });
    expect(await rejectionOf(getPhoto.execute('../etc/passwd'))).toMatchObject({ code: 'INVALID_PHOTO_ID' });
  });
});

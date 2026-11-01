import { GetPhoto } from '../../photos/public-api';
import { ReferencePhotoProvider, ResolvedReferencePhoto } from '../application/ports';

/** Adaptateur : port ReferencePhotoProvider → module Photos (licence vérifiée par GetPhoto). */
export class PhotoModuleReferenceProvider implements ReferencePhotoProvider {
  constructor(private readonly getPhoto: GetPhoto) {}

  async fetch(photoId: string): Promise<ResolvedReferencePhoto | null> {
    const photo = await this.getPhoto.execute(photoId);
    if (!photo) {
      return null;
    }
    return {
      facts: {
        photoId: photo.id,
        takenOn: photo.takenOn,
        takenGranularity: photo.takenGranularity,
        location: photo.location,
        tags: photo.tags,
      },
      reference: {
        photoId: photo.id,
        title: photo.title,
        ownerName: photo.ownerName,
        licenseCode: photo.license.code,
        licenseName: photo.license.name,
        licenseUrl: photo.license.url,
        imageUrl: photo.imageUrls.medium,
        pageUrl: photo.pageUrl,
      },
    };
  }
}

import { Controller, Get, NotFoundException, Param, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { GetPhoto, MAX_PHOTOS_PER_PAGE, SearchPhotos } from '../application/photo-use-cases';
import { Photo, PhotoPage } from '../domain/photo';

export class PhotoSearchQueryDto {
  @IsOptional() @IsString() @MaxLength(200) text?: string;
  @IsOptional() @IsString() @MaxLength(400) tags?: string;
  @IsOptional() @IsIn(['any', 'all', 'ANY', 'ALL']) tagMode?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) takenFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) takenTo?: string;
  @IsOptional() @IsString() @MaxLength(100) bbox?: string;
  @IsOptional() @Type(() => Number) @IsNumber() lat?: number;
  @IsOptional() @Type(() => Number) @IsNumber() lon?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.1) @Max(2000) radiusKm?: number;
  @IsOptional() @Transform(({ value }) => value === true || value === 'true') @IsBoolean() geotagged?: boolean;
  @IsOptional() @IsIn(['relevance', 'interestingness', 'date_taken_desc', 'RELEVANCE', 'INTERESTINGNESS', 'DATE_TAKEN_DESC']) sort?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(MAX_PHOTOS_PER_PAGE) perPage?: number;
}

/** Vue d'une photo : toujours accompagnée de son attribution et d'un lien vers sa source (US-036). */
export interface PhotoView {
  readonly id: string;
  readonly title: string;
  readonly ownerName: string;
  readonly license: { readonly code: string; readonly name: string; readonly url: string | null };
  readonly takenOn: string | null;
  readonly takenGranularity: string | null;
  readonly location: { readonly lat: number; readonly lon: number } | null;
  readonly tags: readonly string[];
  readonly imageUrls: Photo['imageUrls'];
  readonly pageUrl: string;
  readonly description: string | null;
  readonly placeName: string | null;
}

export function toPhotoView(photo: Photo): PhotoView {
  return {
    id: photo.id,
    title: photo.title,
    ownerName: photo.ownerName,
    license: { code: photo.license.code, name: photo.license.name, url: photo.license.url },
    takenOn: photo.takenOn,
    takenGranularity: photo.takenGranularity,
    location: photo.location ? photo.location.toJSON() : null,
    tags: photo.tags,
    imageUrls: photo.imageUrls,
    pageUrl: photo.pageUrl,
    description: photo.description,
    placeName: photo.placeName,
  };
}

@ApiTags('Photographies')
@ApiBearerAuth()
@Controller('photos')
export class PhotosController {
  constructor(
    private readonly searchPhotos: SearchPhotos,
    private readonly getPhoto: GetPhoto,
  ) {}

  /** US-030 à US-033 : recherche paginée (30 photos maximum par page). */
  @Get()
  async search(@Query() query: PhotoSearchQueryDto): Promise<Omit<PhotoPage, 'items'> & { items: PhotoView[] }> {
    const page = await this.searchPhotos.execute(query);
    return { ...page, items: page.items.map(toPhotoView) };
  }

  /** US-034 : informations détaillées d'une photographie. */
  @Get(':id')
  async findOne(@Param('id') id: string): Promise<PhotoView> {
    const photo = await this.getPhoto.execute(id);
    if (!photo) {
      throw new NotFoundException('Photographie introuvable, privée ou sous une licence non autorisée.');
    }
    return toPhotoView(photo);
  }
}

import { ValidationError } from './domain-error';

const EARTH_RADIUS_KM = 6371.0088;
const toRadians = (degrees: number) => (degrees * Math.PI) / 180;
const toDegrees = (radians: number) => (radians * 180) / Math.PI;

export interface GeoPointJson {
  lat: number;
  lon: number;
}

/** Point WGS 84 (EPSG:4326). */
export class GeoPoint {
  private constructor(
    readonly latitude: number,
    readonly longitude: number,
  ) {}

  static of(latitude: number, longitude: number): GeoPoint {
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90) {
      throw new ValidationError('GEO_INVALID_LATITUDE', `Latitude invalide : ${latitude}.`);
    }
    if (!Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
      throw new ValidationError('GEO_INVALID_LONGITUDE', `Longitude invalide : ${longitude}.`);
    }
    return new GeoPoint(latitude, longitude);
  }

  /** Distance orthodromique (formule de haversine), en kilomètres. */
  distanceKmTo(other: GeoPoint): number {
    const deltaLat = toRadians(other.latitude - this.latitude);
    const deltaLon = toRadians(other.longitude - this.longitude);
    const a =
      Math.sin(deltaLat / 2) ** 2 +
      Math.cos(toRadians(this.latitude)) * Math.cos(toRadians(other.latitude)) * Math.sin(deltaLon / 2) ** 2;
    return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
  }

  /** Point atteint depuis ce point selon un cap (en degrés) et une distance (en km). */
  destination(bearingDegrees: number, distanceKm: number): GeoPoint {
    const angular = distanceKm / EARTH_RADIUS_KM;
    const bearing = toRadians(bearingDegrees);
    const lat1 = toRadians(this.latitude);
    const lon1 = toRadians(this.longitude);
    const lat2 = Math.asin(
      Math.sin(lat1) * Math.cos(angular) + Math.cos(lat1) * Math.sin(angular) * Math.cos(bearing),
    );
    const lon2 =
      lon1 +
      Math.atan2(
        Math.sin(bearing) * Math.sin(angular) * Math.cos(lat1),
        Math.cos(angular) - Math.sin(lat1) * Math.sin(lat2),
      );
    const normalizedLon = ((toDegrees(lon2) + 540) % 360) - 180;
    return GeoPoint.of(Math.max(-90, Math.min(90, toDegrees(lat2))), normalizedLon);
  }

  toJSON(): GeoPointJson {
    return { lat: this.latitude, lon: this.longitude };
  }
}

export type GeoAreaJson =
  | { kind: 'BOX'; minLat: number; minLon: number; maxLat: number; maxLon: number }
  | { kind: 'CIRCLE'; lat: number; lon: number; radiusKm: number };

/** Zone géographique : rectangle ou cercle (pattern Strategy via polymorphisme). */
export interface GeoArea {
  readonly kind: GeoAreaJson['kind'];
  contains(point: GeoPoint): boolean;
  center(): GeoPoint;
  boundingBox(): BoundingBox;
  intersects(box: BoundingBox): boolean;
  /** Anneau fermé (premier point = dernier point), pour la persistance PostGIS. */
  toRing(): GeoPoint[];
  toJSON(): GeoAreaJson;
}

/** Rectangle aligné sur les méridiens (ne traverse pas l'antiméridien). */
export class BoundingBox implements GeoArea {
  readonly kind = 'BOX';

  private constructor(
    readonly minLat: number,
    readonly minLon: number,
    readonly maxLat: number,
    readonly maxLon: number,
  ) {}

  static of(minLat: number, minLon: number, maxLat: number, maxLon: number): BoundingBox {
    GeoPoint.of(minLat, minLon);
    GeoPoint.of(maxLat, maxLon);
    if (minLat > maxLat || minLon > maxLon) {
      throw new ValidationError('GEO_INVALID_BOX', 'Rectangle invalide : les minimums doivent précéder les maximums.');
    }
    return new BoundingBox(minLat, minLon, maxLat, maxLon);
  }

  /** Format « minLon,minLat,maxLon,maxLat » (ordre Flickr / GeoJSON). */
  static parse(text: string): BoundingBox {
    const values = text.split(',').map((value) => Number(value.trim()));
    if (values.length !== 4 || values.some((value) => !Number.isFinite(value))) {
      throw new ValidationError('GEO_INVALID_BOX', 'Rectangle attendu au format minLon,minLat,maxLon,maxLat.');
    }
    const [minLon, minLat, maxLon, maxLat] = values;
    return BoundingBox.of(minLat, minLon, maxLat, maxLon);
  }

  contains(point: GeoPoint): boolean {
    return (
      point.latitude >= this.minLat &&
      point.latitude <= this.maxLat &&
      point.longitude >= this.minLon &&
      point.longitude <= this.maxLon
    );
  }

  center(): GeoPoint {
    return GeoPoint.of((this.minLat + this.maxLat) / 2, (this.minLon + this.maxLon) / 2);
  }

  boundingBox(): BoundingBox {
    return this;
  }

  intersects(box: BoundingBox): boolean {
    return !(
      box.minLon > this.maxLon ||
      box.maxLon < this.minLon ||
      box.minLat > this.maxLat ||
      box.maxLat < this.minLat
    );
  }

  toRing(): GeoPoint[] {
    return [
      GeoPoint.of(this.minLat, this.minLon),
      GeoPoint.of(this.minLat, this.maxLon),
      GeoPoint.of(this.maxLat, this.maxLon),
      GeoPoint.of(this.maxLat, this.minLon),
      GeoPoint.of(this.minLat, this.minLon),
    ];
  }

  toJSON(): GeoAreaJson {
    return { kind: 'BOX', minLat: this.minLat, minLon: this.minLon, maxLat: this.maxLat, maxLon: this.maxLon };
  }
}

/** Disque géodésique (centre + rayon en km). */
export class CircleArea implements GeoArea {
  static readonly MAX_RADIUS_KM = 2000;
  readonly kind = 'CIRCLE';

  private constructor(
    readonly origin: GeoPoint,
    readonly radiusKm: number,
  ) {}

  static of(origin: GeoPoint, radiusKm: number): CircleArea {
    if (!Number.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > CircleArea.MAX_RADIUS_KM) {
      throw new ValidationError(
        'GEO_INVALID_RADIUS',
        `Le rayon doit être compris entre 0 et ${CircleArea.MAX_RADIUS_KM} km.`,
      );
    }
    return new CircleArea(origin, radiusKm);
  }

  contains(point: GeoPoint): boolean {
    return this.origin.distanceKmTo(point) <= this.radiusKm;
  }

  center(): GeoPoint {
    return this.origin;
  }

  boundingBox(): BoundingBox {
    const north = this.origin.destination(0, this.radiusKm);
    const south = this.origin.destination(180, this.radiusKm);
    const east = this.origin.destination(90, this.radiusKm);
    const west = this.origin.destination(270, this.radiusKm);
    const crossesAntimeridian = west.longitude > east.longitude;
    return BoundingBox.of(
      south.latitude,
      crossesAntimeridian ? -180 : west.longitude,
      north.latitude,
      crossesAntimeridian ? 180 : east.longitude,
    );
  }

  intersects(box: BoundingBox): boolean {
    return this.boundingBox().intersects(box);
  }

  toRing(segments = 32): GeoPoint[] {
    const ring = Array.from({ length: segments }, (_, index) =>
      this.origin.destination((360 / segments) * index, this.radiusKm),
    );
    return [...ring, ring[0]];
  }

  toJSON(): GeoAreaJson {
    return { kind: 'CIRCLE', lat: this.origin.latitude, lon: this.origin.longitude, radiusKm: this.radiusKm };
  }
}

export const GeoAreas = {
  /** Reconstruit une zone depuis sa forme JSON en validant chaque champ. */
  fromJSON(raw: unknown, path = 'zone'): GeoArea {
    const invalid = (reason: string) =>
      new ValidationError('GEO_INVALID_AREA', `${path} : ${reason}`, { path });
    if (typeof raw !== 'object' || raw === null) {
      throw invalid('objet attendu ({ kind: "BOX" | "CIRCLE", ... }).');
    }
    const value = raw as Record<string, unknown>;
    const num = (key: string): number => {
      if (typeof value[key] !== 'number') {
        throw invalid(`le champ « ${key} » doit être un nombre.`);
      }
      return value[key] as number;
    };
    switch (value.kind) {
      case 'BOX':
        return BoundingBox.of(num('minLat'), num('minLon'), num('maxLat'), num('maxLon'));
      case 'CIRCLE':
        return CircleArea.of(GeoPoint.of(num('lat'), num('lon')), num('radiusKm'));
      default:
        throw invalid('« kind » doit valoir BOX ou CIRCLE.');
    }
  },
};

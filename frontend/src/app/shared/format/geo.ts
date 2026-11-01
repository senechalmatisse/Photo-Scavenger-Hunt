import { GeoArea } from '../../core/api/models';

/** Rectangle englobant d'une zone, au format attendu par l'API (minLon,minLat,maxLon,maxLat). */
export function areaToBbox(area: GeoArea): string {
  if (area.kind === 'BOX') {
    return [area.minLon, area.minLat, area.maxLon, area.maxLat].join(',');
  }
  const latDelta = area.radiusKm / 111.32;
  const lonDelta = area.radiusKm / (111.32 * Math.max(0.01, Math.cos((area.lat * Math.PI) / 180)));
  const clamp = (value: number, limit: number) => Math.max(-limit, Math.min(limit, value));
  return [
    clamp(area.lon - lonDelta, 180),
    clamp(area.lat - latDelta, 90),
    clamp(area.lon + lonDelta, 180),
    clamp(area.lat + latDelta, 90),
  ]
    .map((value) => value.toFixed(4))
    .join(',');
}

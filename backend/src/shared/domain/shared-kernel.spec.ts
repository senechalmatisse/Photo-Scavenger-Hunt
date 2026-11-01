import { thrownBy } from '../../testing/expectations';
import { GameCalendar } from './game-calendar';
import { BoundingBox, CircleArea, GeoAreas, GeoPoint } from './geo';
import { DayRange, LocalDates } from './local-date';

describe('GeoPoint', () => {
  it('calcule la distance orthodromique (Paris → Londres ≈ 344 km)', () => {
    const paris = GeoPoint.of(48.8566, 2.3522);
    const london = GeoPoint.of(51.5074, -0.1278);
    expect(paris.distanceKmTo(london)).toBeCloseTo(343.6, 0);
  });

  it('refuse des coordonnées hors bornes', () => {
    expect(thrownBy(() => GeoPoint.of(91, 0))).toMatchObject({ code: 'GEO_INVALID_LATITUDE' });
    expect(thrownBy(() => GeoPoint.of(0, -181))).toMatchObject({ code: 'GEO_INVALID_LONGITUDE' });
  });
});

describe('Zones géographiques', () => {
  const france = BoundingBox.of(41.3, -5.3, 51.1, 9.6);

  it('teste l’appartenance à un rectangle et lit le format minLon,minLat,maxLon,maxLat', () => {
    expect(france.contains(GeoPoint.of(48.4594, -5.129))).toBe(true);
    expect(france.contains(GeoPoint.of(51.5074, -0.1278))).toBe(false);
    expect(BoundingBox.parse('2.2,48.8,2.5,48.95').toJSON()).toEqual({ kind: 'BOX', minLat: 48.8, minLon: 2.2, maxLat: 48.95, maxLon: 2.5 });
  });

  it('teste l’appartenance à un cercle et calcule son rectangle englobant', () => {
    const paris = CircleArea.of(GeoPoint.of(48.8566, 2.3522), 15);
    expect(paris.contains(GeoPoint.of(48.8584, 2.2945))).toBe(true);
    expect(paris.contains(GeoPoint.of(49.7153, -1.9467))).toBe(false);
    const box = paris.boundingBox();
    expect(box.minLat).toBeLessThan(48.8566);
    expect(box.maxLon).toBeGreaterThan(2.3522);
    expect(paris.toRing()).toHaveLength(33);
  });

  it('reconstruit une zone depuis JSON et signale le chemin en erreur', () => {
    expect(GeoAreas.fromJSON({ kind: 'CIRCLE', lat: 48, lon: 2, radiusKm: 10 }).kind).toBe('CIRCLE');
    expect(thrownBy(() => GeoAreas.fromJSON({ kind: 'TRIANGLE' }, 'validation.area'))).toMatchObject({
      code: 'GEO_INVALID_AREA',
      details: { path: 'validation.area' },
    });
  });
});

describe('Dates locales', () => {
  it('calcule la semaine ISO, y compris aux changements d’année', () => {
    expect(LocalDates.isoWeekKey('2026-11-02')).toBe('2026-W45');
    expect(LocalDates.isoWeekKey('2021-01-03')).toBe('2020-W53');
    expect(LocalDates.isoWeekKey('2026-12-31')).toBe('2026-W53');
    expect(LocalDates.isoWeekKey('2027-01-01')).toBe('2026-W53');
  });

  it('valide les dates calendaires', () => {
    expect(LocalDates.isValid('2024-02-29')).toBe(true);
    expect(LocalDates.isValid('2023-02-29')).toBe(false);
    expect(LocalDates.addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  it('décrit une période en années pleines ou en dates', () => {
    expect(DayRange.of('2015-01-01', '2024-12-31').describe()).toBe('2015–2024');
    expect(DayRange.of('2018-06-01', null).describe()).toBe('à partir de 01/06/2018');
    expect(thrownBy(() => DayRange.of('2024-01-01', '2015-01-01'))).toMatchObject({ code: 'INVALID_PERIOD' });
  });
});

describe('GameCalendar', () => {
  const calendar = new GameCalendar('Europe/Paris');

  it('détermine la journée de jeu dans le fuseau du jeu', () => {
    expect(calendar.dayOf(new Date('2026-11-01T22:30:00Z'))).toBe('2026-11-01');
    expect(calendar.dayOf(new Date('2026-11-01T23:30:00Z'))).toBe('2026-11-02');
  });

  it('calcule minuit heure locale, y compris autour du passage à l’heure d’été', () => {
    expect(calendar.endOfDay('2026-11-01').toISOString()).toBe('2026-11-01T23:00:00.000Z');
    expect(calendar.endOfDay('2026-03-28').toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(calendar.endOfDay('2026-03-29').toISOString()).toBe('2026-03-29T22:00:00.000Z');
  });
});

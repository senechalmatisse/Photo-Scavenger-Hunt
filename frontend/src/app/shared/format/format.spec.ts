import { areaToBbox } from './geo';
import { formatCountdown, formatDuration, formatTaken } from './labels';

describe('formats', () => {
  it('affiche le compte à rebours en minutes et secondes, puis en heures', () => {
    expect(formatCountdown(65_000)).toBe('01:05');
    expect(formatCountdown(3_725_000)).toBe('1:02:05');
    expect(formatCountdown(-5)).toBe('00:00');
  });

  it('décrit une durée de partie', () => {
    expect(formatDuration(40_000)).toBe('0 min 40 s');
  });

  it('respecte la précision de la date de prise de vue', () => {
    expect(formatTaken('2018-07-14', 'EXACT')).toBe('14/07/2018');
    expect(formatTaken('2018-05-01', 'MONTH')).toBe('mai 2018');
    expect(formatTaken('1995-01-01', 'CIRCA')).toBe('vers 1995');
    expect(formatTaken(null, null)).toBe('Date inconnue');
  });

  it('convertit une zone en rectangle de recherche', () => {
    expect(areaToBbox({ kind: 'BOX', minLat: 48.8, minLon: 2.2, maxLat: 48.95, maxLon: 2.5 })).toBe('2.2,48.8,2.5,48.95');
    const [minLon, minLat, maxLon, maxLat] = areaToBbox({ kind: 'CIRCLE', lat: 48.85, lon: 2.35, radiusKm: 10 }).split(',').map(Number);
    expect(maxLat - minLat).toBeCloseTo(0.18, 2);
    expect(minLon).toBeLessThan(2.35);
    expect(maxLon).toBeGreaterThan(2.35);
  });
});

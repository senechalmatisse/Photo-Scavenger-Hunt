import { DraftError, ValidationDraft, buildValidation, draftFromValidation } from './validation-draft';

const draft = (overrides: Partial<ValidationDraft> = {}): ValidationDraft => ({
  mode: 'CRITERIA',
  tags: '',
  tagMode: 'ANY',
  useZone: true,
  usePeriod: true,
  placeLat: null,
  placeLon: null,
  toleranceKm: 2,
  advanced: '',
  ...overrides,
});

const zone = { kind: 'BOX', minLat: 41.3, minLon: -5.3, maxLat: 51.1, maxLon: 9.6 } as const;

describe('buildValidation', () => {
  it('mode critères : compose zone, période et mots-clés', () => {
    const spec = buildValidation(draft({ tags: 'phare, lighthouse' }), {
      referencePhotoId: null,
      zone,
      period: { from: '2015-01-01', to: '2024-12-31' },
    });
    expect(spec).toEqual({
      type: 'ALL_OF',
      rules: [
        { type: 'IN_AREA', area: zone },
        { type: 'TAKEN_BETWEEN', from: '2015-01-01', to: '2024-12-31' },
        { type: 'HAS_TAGS', tags: ['phare', 'lighthouse'], mode: 'ANY' },
      ],
    });
  });

  it('mode critères : une règle unique n’est pas enveloppée', () => {
    expect(buildValidation(draft({ usePeriod: false }), { referencePhotoId: null, zone, period: null })).toEqual({ type: 'IN_AREA', area: zone });
  });

  it('photo exacte : exige une photo de référence', () => {
    expect(() => buildValidation(draft({ mode: 'EXACT' }), { referencePhotoId: null, zone: null, period: null })).toThrow(DraftError);
    expect(buildValidation(draft({ mode: 'EXACT' }), { referencePhotoId: '42', zone: null, period: null })).toEqual({
      type: 'EXACT_PHOTO',
      photoId: '42',
    });
  });

  it('lieu : exige des coordonnées', () => {
    expect(() => buildValidation(draft({ mode: 'PLACE' }), { referencePhotoId: null, zone: null, period: null })).toThrow(DraftError);
    expect(buildValidation(draft({ mode: 'PLACE', placeLat: 48.6, placeLon: -1.5, toleranceKm: 3 }), { referencePhotoId: null, zone: null, period: null })).toEqual({
      type: 'NEAR_POINT',
      lat: 48.6,
      lon: -1.5,
      toleranceKm: 3,
    });
  });

  it('avancé : signale un JSON invalide', () => {
    expect(() => buildValidation(draft({ mode: 'ADVANCED', advanced: '{ type: ' }), { referencePhotoId: null, zone: null, period: null })).toThrow(
      'JSON invalide',
    );
  });
});

describe('draftFromValidation', () => {
  it('retrouve le mode le plus simple pour une règle existante', () => {
    expect(draftFromValidation({ type: 'EXACT_PHOTO', photoId: '1' })).toEqual({ mode: 'EXACT' });
    expect(draftFromValidation({ type: 'ALL_OF', rules: [{ type: 'IN_AREA', area: zone }, { type: 'HAS_TAGS', tags: ['phare'], mode: 'ALL' }] })).toEqual({
      mode: 'CRITERIA',
      useZone: true,
      usePeriod: false,
      tags: 'phare',
      tagMode: 'ALL',
    });
  });

  it('bascule en mode avancé pour une composition non représentable', () => {
    const spec = { type: 'ANY_OF', rules: [{ type: 'EXACT_PHOTO', photoId: '1' }, { type: 'NEAR_POINT', lat: 1, lon: 2, toleranceKm: 1 }] };
    expect(draftFromValidation(spec).mode).toBe('ADVANCED');
  });
});

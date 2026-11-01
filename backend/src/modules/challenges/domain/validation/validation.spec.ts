import { GeoPoint } from '../../../../shared/domain/geo';
import { thrownBy } from '../../../../testing/expectations';
import { PhotoFacts, RuleSpec, ValidationRule, leafReport } from './validation-rule';
import { ValidationRuleFactory } from './validation-rule-factory';

const FRANCE = { kind: 'BOX', minLat: 41.3, minLon: -5.3, maxLat: 51.1, maxLon: 9.6 };

function photo(overrides: Partial<PhotoFacts> = {}): PhotoFacts {
  return {
    photoId: 'goury-2018',
    takenOn: '2018-07-14',
    takenGranularity: 'EXACT',
    location: GeoPoint.of(49.7153, -1.9467),
    tags: ['Phare', 'lighthouse', 'Château'],
    ...overrides,
  };
}

describe('Règles de validation', () => {
  const factory = ValidationRuleFactory.withDefaults();
  const evaluate = (spec: unknown, facts: PhotoFacts) => factory.create(spec).evaluate(facts);

  it('photo exacte : accepte la photo de référence et refuse les autres', () => {
    const spec = { type: 'EXACT_PHOTO', photoId: 'goury-2018' };
    expect(evaluate(spec, photo()).accepted).toBe(true);
    expect(evaluate(spec, photo({ photoId: 'autre' }))).toEqual({
      accepted: false,
      outcomes: [
        { criterion: 'EXACT_PHOTO', label: 'Photographie de référence', satisfied: false, explanation: "Ce n'est pas la photographie recherchée." },
      ],
    });
  });

  it('zone : vérifie la position et explique une photo non géolocalisée', () => {
    const spec = { type: 'IN_AREA', area: FRANCE, label: 'France' };
    expect(evaluate(spec, photo()).accepted).toBe(true);
    expect(evaluate(spec, photo({ location: GeoPoint.of(51.5074, -0.1278) })).outcomes[0].explanation).toBe(
      'La photo a été prise hors de la zone attendue (France).',
    );
    expect(evaluate(spec, photo({ location: null })).outcomes[0].explanation).toContain("n'est pas géolocalisée");
  });

  it('lieu : donne la distance au lieu recherché (effet « chaud / froid »)', () => {
    const spec = { type: 'NEAR_POINT', lat: 48.6361, lon: -1.5115, toleranceKm: 2 };
    const fromGenets = evaluate(spec, photo({ location: GeoPoint.of(48.6833, -1.4833) }));
    expect(fromGenets.accepted).toBe(false);
    expect(fromGenets.outcomes[0].explanation).toMatch(/^La photo a été prise à 5,\d km du lieu recherché \(tolérance : 2,0 km\)\.$/);
    expect(evaluate(spec, photo({ location: GeoPoint.of(48.6365, -1.512) })).accepted).toBe(true);
  });

  it('période : tient compte de la précision de la date', () => {
    const spec = { type: 'TAKEN_BETWEEN', from: '2015-01-01', to: '2024-12-31' };
    expect(evaluate(spec, photo()).accepted).toBe(true);
    expect(evaluate(spec, photo({ takenOn: '2009-11-02' })).outcomes[0].explanation).toBe(
      'Photo prise le 02/11/2009, hors de la période attendue (2015–2024).',
    );
    expect(evaluate(spec, photo({ takenOn: '2018-01-01', takenGranularity: 'YEAR' })).outcomes[0].explanation).toContain('en 2018');
    expect(evaluate(spec, photo({ takenGranularity: 'CIRCA' })).accepted).toBe(false);
    expect(evaluate(spec, photo({ takenOn: null, takenGranularity: null })).accepted).toBe(false);
  });

  it('mots-clés : compare des mots-clés normalisés (casse, accents)', () => {
    expect(evaluate({ type: 'HAS_TAGS', tags: ['LIGHTHOUSE'] }, photo()).accepted).toBe(true);
    expect(evaluate({ type: 'HAS_TAGS', tags: ['chateau', 'phare'], mode: 'ALL' }, photo()).accepted).toBe(true);
    expect(evaluate({ type: 'HAS_TAGS', tags: ['phare', 'moulin'], mode: 'ALL' }, photo()).outcomes[0].explanation).toBe(
      'Mots-clés attendus trouvés : 1 sur 2.',
    );
  });

  it('conjonction : accepte si tous les critères sont satisfaits et les explique tous', () => {
    const spec = {
      type: 'ALL_OF',
      rules: [
        { type: 'IN_AREA', area: FRANCE },
        { type: 'TAKEN_BETWEEN', from: '2015-01-01', to: '2024-12-31' },
        { type: 'HAS_TAGS', tags: ['phare', 'lighthouse'] },
      ],
    };
    expect(evaluate(spec, photo()).accepted).toBe(true);
    const report = evaluate(spec, photo({ takenOn: '2009-11-02' }));
    expect(report.accepted).toBe(false);
    expect(report.outcomes.map((outcome) => [outcome.criterion, outcome.satisfied])).toEqual([
      ['IN_AREA', true],
      ['TAKEN_BETWEEN', false],
      ['HAS_TAGS', true],
    ]);
  });

  it('disjonction : explique la branche acceptée, ou la plus proche du succès', () => {
    const spec = {
      type: 'ANY_OF',
      rules: [
        { type: 'EXACT_PHOTO', photoId: 'reference' },
        {
          type: 'ALL_OF',
          rules: [
            { type: 'NEAR_POINT', lat: 49.7153, lon: -1.9467, toleranceKm: 1 },
            { type: 'TAKEN_BETWEEN', from: '2020-01-01' },
          ],
        },
      ],
    };
    expect(evaluate(spec, photo({ photoId: 'reference' })).outcomes).toHaveLength(1);
    const rejected = evaluate(spec, photo());
    expect(rejected.accepted).toBe(false);
    expect(rejected.outcomes.map((outcome) => outcome.criterion)).toEqual(['NEAR_POINT', 'TAKEN_BETWEEN']);
  });

  it('exige des critères décisifs : un tag ou une période seuls ne valident jamais une réponse', () => {
    expect(thrownBy(() => factory.createDecisive({ type: 'HAS_TAGS', tags: ['phare'] }))).toMatchObject({ code: 'VALIDATION_NOT_DECISIVE' });
    expect(
      thrownBy(() =>
        factory.createDecisive({ type: 'ALL_OF', rules: [{ type: 'HAS_TAGS', tags: ['phare'] }, { type: 'TAKEN_BETWEEN', from: '2015-01-01' }] }),
      ),
    ).toMatchObject({ code: 'VALIDATION_NOT_DECISIVE' });
    expect(
      thrownBy(() =>
        factory.createDecisive({ type: 'ANY_OF', rules: [{ type: 'EXACT_PHOTO', photoId: 'x' }, { type: 'HAS_TAGS', tags: ['phare'] }] }),
      ),
    ).toMatchObject({ code: 'VALIDATION_NOT_DECISIVE' });
    expect(factory.createDecisive({ type: 'ALL_OF', rules: [{ type: 'IN_AREA', area: FRANCE }, { type: 'HAS_TAGS', tags: ['phare'] }] }).decisive).toBe(true);
  });

  it('localise précisément les erreurs de saisie des critères', () => {
    expect(thrownBy(() => factory.create({ type: 'ALL_OF', rules: [{ type: 'IN_AREA', area: FRANCE }, { type: 'MAGIC' }] }))).toMatchObject({
      code: 'INVALID_VALIDATION_SPEC',
      details: { path: 'validation.rules[1]' },
    });
    expect(thrownBy(() => factory.create({ type: 'NEAR_POINT', lat: 48, lon: 2, toleranceKm: 9999 }))).toMatchObject({
      details: { path: 'validation.toleranceKm' },
    });
    const deep = { type: 'ALL_OF', rules: [{ type: 'ALL_OF', rules: [{ type: 'ALL_OF', rules: [{ type: 'ALL_OF', rules: [{ type: 'ALL_OF', rules: [{ type: 'EXACT_PHOTO', photoId: 'x' }] }] }] }] }] };
    expect(thrownBy(() => factory.create(deep))).toMatchObject({ code: 'INVALID_VALIDATION_SPEC' });
  });

  it('sérialise sans perte : une règle reconstruite depuis sa forme JSON juge à l’identique', () => {
    const rule = factory.create({
      type: 'ALL_OF',
      rules: [
        { type: 'IN_AREA', area: { kind: 'CIRCLE', lat: 49.7, lon: -1.9, radiusKm: 20 }, label: 'Cotentin' },
        { type: 'HAS_TAGS', tags: ['Phare'], mode: 'ANY' },
      ],
    });
    const rebuilt = factory.create(rule.toSpec());
    expect(rebuilt.toSpec()).toEqual(rule.toSpec());
    expect(rebuilt.evaluate(photo())).toEqual(rule.evaluate(photo()));
  });

  it('est ouverte à l’extension : un nouveau type de critère s’enregistre sans modifier l’existant', () => {
    class OddPhotoIdRule implements ValidationRule {
      readonly type = 'ODD_ID';
      readonly decisive = true;
      readonly children: readonly ValidationRule[] = [];
      evaluate(facts: PhotoFacts) {
        const satisfied = facts.photoId.length % 2 === 1;
        return leafReport({ criterion: this.type, label: 'Identifiant impair', satisfied, explanation: '' });
      }
      toSpec(): RuleSpec {
        return { type: this.type };
      }
      describe() {
        return 'identifiant impair';
      }
    }
    const extended = ValidationRuleFactory.withDefaults().register('ODD_ID', () => new OddPhotoIdRule());
    expect(extended.create({ type: 'ODD_ID' }).evaluate(photo({ photoId: 'abc' })).accepted).toBe(true);
  });
});

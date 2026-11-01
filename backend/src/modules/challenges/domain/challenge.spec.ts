import { thrownBy } from '../../../testing/expectations';
import { Challenge, ChallengeDefinition, ChallengePublished } from './challenge';
import { DeterministicDailyPicker } from './challenge.repository';
import { ValidationReport } from './validation/validation-rule';
import { ValidationRuleFactory } from './validation/validation-rule-factory';

const rules = ValidationRuleFactory.withDefaults();
const now = new Date('2026-11-02T09:00:00Z');
const accepted: ValidationReport = { accepted: true, outcomes: [] };
const rejected: ValidationReport = { accepted: false, outcomes: [] };

function definition(overrides: Partial<ChallengeDefinition> = {}): ChallengeDefinition {
  return {
    title: 'Le gardien des côtes',
    riddle: "Trouve une photographie d'un phare situé sur le littoral français.",
    difficulty: 'INTERMEDIATE',
    theme: 'COAST',
    zoneLabel: 'Littoral français',
    zone: null,
    period: null,
    hints: [{ text: 'Cherche « phare ».', cost: 20 }],
    reward: { points: 250, xp: 100 },
    timeLimitSeconds: null,
    maxAttempts: null,
    validation: rules.create({ type: 'EXACT_PHOTO', photoId: 'goury' }),
    referencePhoto: {
      photoId: 'goury',
      title: 'Phare de Goury',
      ownerName: 'Démo',
      licenseCode: 'CC-BY-4.0',
      licenseName: 'CC BY 4.0',
      licenseUrl: 'https://creativecommons.org/licenses/by/4.0/',
      imageUrl: 'https://example.org/goury.jpg',
      pageUrl: 'https://example.org/goury',
    },
    availableFrom: null,
    availableTo: null,
    replayable: true,
    dailyEligible: true,
    ...overrides,
  };
}

describe('Agrégat Challenge', () => {
  it('est créé en brouillon et n’est pas jouable', () => {
    const challenge = Challenge.create('c1', definition(), 'admin', now);
    expect(challenge.status).toBe('DRAFT');
    expect(challenge.isPlayableAt(now)).toBe(false);
  });

  it('protège ses invariants de saisie', () => {
    expect(thrownBy(() => Challenge.create('c1', definition({ title: 'ab' }), null, now))).toMatchObject({ code: 'CHALLENGE_INVALID_TITLE' });
    expect(thrownBy(() => Challenge.create('c1', definition({ timeLimitSeconds: 5 }), null, now))).toMatchObject({
      code: 'CHALLENGE_INVALID_TIME_LIMIT',
    });
    expect(
      thrownBy(() => Challenge.create('c1', definition({ hints: Array.from({ length: 6 }, () => ({ text: 'Indice', cost: 10 })) }), null, now)),
    ).toMatchObject({ code: 'CHALLENGE_TOO_MANY_HINTS' });
    expect(thrownBy(() => Challenge.create('c1', definition({ validation: rules.create({ type: 'HAS_TAGS', tags: ['phare'] }) }), null, now))).toMatchObject({
      code: 'VALIDATION_NOT_DECISIVE',
    });
  });

  it('ne se publie que s’il est soluble avec sa photo de référence', () => {
    const withoutReference = Challenge.create('c1', definition({ referencePhoto: null }), null, now);
    expect(thrownBy(() => withoutReference.publish(accepted, now))).toMatchObject({ code: 'REFERENCE_PHOTO_REQUIRED' });

    const challenge = Challenge.create('c2', definition(), null, now);
    expect(thrownBy(() => challenge.publish(rejected, now))).toMatchObject({ code: 'CHALLENGE_NOT_SOLVABLE' });

    challenge.publish(accepted, now);
    expect(challenge.status).toBe('PUBLISHED');
    expect(challenge.isPlayableAt(now)).toBe(true);
    expect(challenge.pullEvents()).toEqual([expect.any(ChallengePublished)]);
  });

  it('respecte sa fenêtre de disponibilité', () => {
    const challenge = Challenge.create('c1', definition({ availableFrom: new Date('2026-12-01T00:00:00Z') }), null, now);
    challenge.publish(accepted, now);
    expect(challenge.isPlayableAt(now)).toBe(false);
    expect(challenge.isPlayableAt(new Date('2026-12-02T00:00:00Z'))).toBe(true);
  });

  it('peut être désactivé avec un motif, puis republié', () => {
    const challenge = Challenge.create('c1', definition(), null, now);
    challenge.publish(accepted, now);
    challenge.disable('Photographie retirée', now);
    expect(challenge.isPlayableAt(now)).toBe(false);
    expect(challenge.disabledReason).toBe('Photographie retirée');
    challenge.publish(accepted, now);
    expect(challenge.status).toBe('PUBLISHED');
  });

  it('exige la solvabilité quand on modifie un défi publié', () => {
    const challenge = Challenge.create('c1', definition(), null, now);
    challenge.publish(accepted, now);
    expect(thrownBy(() => challenge.redefine(definition({ title: 'Nouveau titre' }), now, rejected))).toMatchObject({
      code: 'CHALLENGE_NOT_SOLVABLE',
    });
    challenge.redefine(definition({ title: 'Nouveau titre' }), now, accepted);
    expect(challenge.content.title).toBe('Nouveau titre');
  });

  it('se reconstruit à l’identique depuis son instantané de persistance', () => {
    const challenge = Challenge.create('c1', definition(), 'admin', now);
    const restored = Challenge.restore(challenge.toSnapshot(), rules);
    expect(restored.toSnapshot()).toEqual(challenge.toSnapshot());
    expect(restored.isGeographic).toBe(false);
  });
});

describe('DeterministicDailyPicker', () => {
  const picker = new DeterministicDailyPicker();

  it('donne le même défi pour un jour donné, quel que soit l’ordre des candidats', () => {
    const day = '2026-11-02';
    expect(picker.pick(day, ['a', 'b', 'c'], new Set())).toBe(picker.pick(day, ['c', 'a', 'b'], new Set()));
  });

  it('évite les défis récents tant que possible', () => {
    expect(picker.pick('2026-11-02', ['a', 'b'], new Set(['a']))).toBe('b');
    expect(picker.pick('2026-11-02', ['a'], new Set(['a']))).toBe('a');
    expect(picker.pick('2026-11-02', [], new Set())).toBeNull();
  });
});

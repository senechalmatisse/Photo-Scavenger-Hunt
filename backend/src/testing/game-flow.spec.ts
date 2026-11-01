import { ChallengeInput } from '../modules/challenges/application/challenge-definition-builder';
import { VerifyReferencePhotos } from '../modules/challenges/application/verify-reference-photos';
import { DEMO_CHALLENGES } from '../modules/challenges/infrastructure/demo-seed';
import { PhotoProviderUnavailableError } from '../modules/photos/domain/photo';
import { rejectionOf } from './expectations';
import { InMemoryApp, createInMemoryApp } from './in-memory-app';

/**
 * Scénarios de bout en bout au niveau applicatif (sans HTTP) : ils suivent le parcours MVP du §12
 * et les critères d'acceptation Given/When/Then du §11.
 */
describe('Parcours MVP complet', () => {
  let app: InMemoryApp;
  const challengeId = async (title: string) =>
    (await app.challenges.browse.execute({ pageSize: 50 })).items.find((challenge) => challenge.title === title)!.id;

  beforeEach(async () => {
    app = createInMemoryApp(new Date('2026-11-02T09:00:00.000Z'));
    await app.seeder.seed(null);
    // Défi du jour fixé pour rendre les autres scénarios déterministes (mode catalogue).
    await app.challenges.schedule.execute('2026-11-02', await challengeId('Le gardien des côtes'));
  });

  it('catalogue : défis publiés, filtres par difficulté et par région (US-020 à US-022)', async () => {
    expect((await app.challenges.browse.execute({})).total).toBe(DEMO_CHALLENGES.length);
    const easy = await app.challenges.browse.execute({ difficulty: 'EASY' });
    expect(easy.items.map((challenge) => challenge.title).sort()).toEqual(['Dame de fer', 'La merveille de l’Occident']);
    const aroundParis = await app.challenges.browse.execute({ bbox: '2.2,48.8,2.5,48.95' });
    expect(aroundParis.items.map((challenge) => challenge.title).sort()).toEqual(['Dame de fer', 'Le gardien des côtes']);
    expect(Object.keys(easy.items[0])).not.toContain('validation');
  });

  it('défi du jour : identique pour tous et stable dans la journée (US-011)', async () => {
    const first = await app.challenges.daily.execute();
    const second = await app.challenges.daily.execute();
    expect(first?.challenge.id).toBeDefined();
    expect(second?.challenge.id).toBe(first?.challenge.id);
    expect(first?.day).toBe('2026-11-02');
  });

  it('invité → défi du jour → indice → mauvaise puis bonne réponse → score, XP, classement, tableau de bord', async () => {
    const guest = await app.identity.guest.execute();
    expect(guest.user).toMatchObject({ isGuest: true, displayName: 'Invité 0042' });
    const playerId = guest.user.id;
    const gardien = await challengeId('Le gardien des côtes');
    await app.challenges.schedule.execute('2026-11-02', gardien);

    // Given un utilisateur authentifié et un défi disponible / When il démarre
    const { session } = await app.gameplay.start.execute(playerId, gardien);
    expect(session).toMatchObject({ status: 'IN_PROGRESS', mode: 'DAILY', allowsPause: false, maxAttempts: 3, result: null });

    const hint = await app.gameplay.hint.execute(playerId, session.id, undefined);
    expect(hint.result?.text).toBe('Cherche le mot-clé « phare » ou « lighthouse ».');

    const photos = await app.photos.search.execute({ tags: 'phare,lighthouse', takenFrom: '2015-01-01', takenTo: '2024-12-31' });
    expect(photos.items.map((photo) => photo.id)).not.toContain('demo-goury-2009');

    // Mauvaise réponse : refusée, tentative enregistrée, retour explicatif
    const miss = await app.gameplay.submit.execute(playerId, session.id, { photoId: 'demo-goury-2009' });
    expect(miss.result?.accepted).toBe(false);
    expect(miss.session.attemptsLeft).toBe(2);
    expect(miss.result?.outcomes.find((outcome) => !outcome.satisfied)?.explanation).toBe(
      'Photo prise le 02/11/2009, hors de la période attendue (2015–2024).',
    );

    // Bonne réponse : validée, score calculé, partie terminée, réponse de référence révélée
    app.clock.advance(40_000);
    const hit = await app.gameplay.submit.execute(playerId, session.id, { photoId: 'demo-creach-2021' });
    expect(hit.session.status).toBe('VALIDATED');
    expect(hit.session.result).toMatchObject({
      points: 280,
      xp: 100,
      referencePhoto: { photoId: 'demo-goury-2018' },
      score: {
        lines: [
          { code: 'BASE', points: 250 },
          { code: 'HINTS', points: -20 },
          { code: 'DAILY', points: 50 },
        ],
      },
    });

    // Progression (réaction à l'événement GameSessionFinished)
    const progress = await app.progression.get.execute(playerId);
    expect(progress).toMatchObject({
      points: 280,
      level: { level: 2, xp: 100 },
      currentStreak: 1,
      stats: { missionsWon: 1, geoMissionsWon: 1, dailyCompleted: 1, photosSubmitted: 2, hintsUsed: 1 },
    });

    // Classement hebdomadaire (US-061, US-063)
    const weekly = await app.leaderboards.get.execute('WEEKLY', playerId);
    expect(weekly.entries[0]).toMatchObject({ rank: 1, points: 280, displayName: 'Invité 0042', isMe: true });

    // Une seule participation au défi du jour
    expect(await rejectionOf(app.gameplay.start.execute(playerId, gardien))).toMatchObject({ code: 'DAILY_ALREADY_PLAYED' });

    // Tableau de bord (US-010 à US-013)
    const dashboard = await app.dashboard.execute(playerId);
    expect(dashboard.daily?.challenge.id).toBe(gardien);
    expect(dashboard.daily?.mySession?.status).toBe('VALIDATED');
    expect(dashboard.recentSessions).toHaveLength(1);
    expect(dashboard.weeklyLeaderboard.me?.points).toBe(280);
  });

  it('photo exacte en catalogue, puis partie rejouée sans points de classement', async () => {
    const { user } = await app.identity.guest.execute();
    const dame = await challengeId('Dame de fer');

    const first = await app.gameplay.start.execute(user.id, dame);
    expect(first.session.mode).toBe('CATALOG');
    const miss = await app.gameplay.submit.execute(user.id, first.session.id, { photoId: 'demo-eiffel-2023' });
    expect(miss.result?.outcomes[0].explanation).toBe("Ce n'est pas la photographie recherchée.");
    app.clock.advance(10_000);
    const hit = await app.gameplay.submit.execute(user.id, first.session.id, { photoId: 'demo-eiffel-2017' });
    expect(hit.session.result?.points).toBe(175);

    const replay = await app.gameplay.start.execute(user.id, dame);
    const replayed = await app.gameplay.submit.execute(user.id, replay.session.id, { photoId: 'demo-eiffel-2017' });
    expect(replayed.session.result).toMatchObject({ points: 0, xp: 10 });
    expect((await app.leaderboards.get.execute('ALL_TIME', user.id)).me?.points).toBe(175);
  });

  it('reprend la partie en cours au lieu d’en créer une seconde, et protège les parties des autres joueurs', async () => {
    const alice = (await app.identity.guest.execute()).user.id;
    const bob = (await app.identity.guest.execute()).user.id;
    const msm = await challengeId('La merveille de l’Occident');
    const started = await app.gameplay.start.execute(alice, msm);
    const again = await app.gameplay.start.execute(alice, msm);
    expect(again).toMatchObject({ resumed: true, session: { id: started.session.id } });
    expect(await rejectionOf(app.gameplay.get.execute(bob, started.session.id))).toMatchObject({ code: 'SESSION_NOT_FOUND' });
  });

  it('expire les parties dont le temps limite est écoulé (traitement périodique)', async () => {
    const { user } = await app.identity.guest.execute();
    const ouessant = await challengeId('Sentinelle d’Ouessant');
    const { session } = await app.gameplay.start.execute(user.id, ouessant);
    expect(session.deadline).toBe('2026-11-02T09:05:00.000Z');
    app.clock.advance(301_000);
    expect(await app.gameplay.expire.execute()).toBe(1);
    expect((await app.gameplay.get.execute(user.id, session.id)).status).toBe('EXPIRED');
    expect((await app.progression.get.execute(user.id)).level.xp).toBe(10);
  });

  it('défi désactivé : message d’indisponibilité et aucune partie créée (US-024)', async () => {
    const { user } = await app.identity.guest.execute();
    const pilat = await challengeId('La dune qui avance');
    await app.challenges.disable.execute(pilat, 'Photographie retirée par son auteur');
    expect(await rejectionOf(app.gameplay.start.execute(user.id, pilat))).toMatchObject({ code: 'CHALLENGE_UNAVAILABLE' });
    expect((await app.gameplay.history.execute(user.id, { page: 1, pageSize: 10 })).total).toBe(0);
  });

  it('conversion d’un invité en compte : même identifiant, progression conservée, puis effacement complet', async () => {
    const guest = await app.identity.guest.execute();
    const dame = await challengeId('Dame de fer');
    const { session } = await app.gameplay.start.execute(guest.user.id, dame);
    await app.gameplay.submit.execute(guest.user.id, session.id, { photoId: 'demo-eiffel-2017' });

    const registered = await app.identity.register.execute(
      { email: 'Alice@Example.org', password: 'motdepasse-solide', displayName: 'Alice' },
      guest.user.id,
    );
    expect(registered.user).toMatchObject({ id: guest.user.id, isGuest: false, email: 'alice@example.org' });
    expect((await app.progression.get.execute(guest.user.id)).points).toBe(175);

    expect(await rejectionOf(app.identity.login.execute({ email: 'alice@example.org', password: 'mauvais-mot-de-passe' }))).toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect((await app.identity.login.execute({ email: 'ALICE@example.org', password: 'motdepasse-solide' })).user.id).toBe(guest.user.id);
    expect(
      await rejectionOf(app.identity.register.execute({ email: 'alice@example.org', password: 'autre-mot-de-passe', displayName: 'Alice2' })),
    ).toMatchObject({ code: 'EMAIL_TAKEN' });

    await app.identity.deleteAccount.execute(guest.user.id);
    expect((await app.progression.get.execute(guest.user.id)).points).toBe(0);
    expect((await app.gameplay.history.execute(guest.user.id, { page: 1, pageSize: 10 })).total).toBe(0);
    expect((await app.leaderboards.get.execute('ALL_TIME', guest.user.id)).me).toBeNull();
  });
});

describe('Administration des défis', () => {
  let app: InMemoryApp;
  const base: ChallengeInput = {
    title: 'Phares de Bretagne',
    riddle: 'Trouve un phare breton photographié depuis 2020.',
    difficulty: 'HARD',
    theme: 'COAST',
    reward: { points: 300, xp: 150 },
    validation: {
      type: 'ALL_OF',
      rules: [
        { type: 'IN_AREA', area: { kind: 'BOX', minLat: 47.2, minLon: -5.2, maxLat: 48.9, maxLon: -1 } },
        { type: 'TAKEN_BETWEEN', from: '2020-01-01' },
      ],
    },
  };

  beforeEach(() => {
    app = createInMemoryApp();
  });

  it('refuse des critères non décisifs (§3.5 : jamais un simple tag)', async () => {
    const tagsOnly = { ...base, validation: { type: 'HAS_TAGS', tags: ['phare'] } };
    expect(await rejectionOf(app.challenges.create.execute(tagsOnly, null))).toMatchObject({ code: 'VALIDATION_NOT_DECISIVE' });
  });

  it('crée un brouillon, prévisualise les critères, refuse une publication insoluble puis publie (US-080 à US-083)', async () => {
    const draft = await app.challenges.create.execute(base, null);
    expect(draft.status).toBe('DRAFT');
    expect(await rejectionOf(app.challenges.publish.execute(draft.id))).toMatchObject({ code: 'REFERENCE_PHOTO_REQUIRED' });

    const preview = await app.challenges.preview.execute(base.validation, 'demo-eckmuhl-2016');
    expect(preview).toMatchObject({ decisive: true, report: { accepted: false } });

    const insoluble = await app.challenges.update.execute(draft.id, { ...base, referencePhotoId: 'demo-eckmuhl-2016' });
    expect(insoluble.referencePhoto?.photoId).toBe('demo-eckmuhl-2016');
    expect(await rejectionOf(app.challenges.publish.execute(draft.id))).toMatchObject({ code: 'CHALLENGE_NOT_SOLVABLE' });

    await app.challenges.update.execute(draft.id, { ...base, referencePhotoId: 'demo-creach-2021' });
    expect((await app.challenges.publish.execute(draft.id)).status).toBe('PUBLISHED');
    expect((await app.challenges.browse.execute({})).total).toBe(1);
  });

  it('refuse une photo de référence sous licence non autorisée', async () => {
    expect(await rejectionOf(app.challenges.create.execute({ ...base, referencePhotoId: 'demo-petitminou-2020' }, null))).toMatchObject({
      code: 'REFERENCE_PHOTO_UNAVAILABLE',
    });
  });
});

describe('VerifyReferencePhotos (US-084)', () => {
  it('désactive un défi dont la photo a disparu, mais jamais pendant une panne du fournisseur', async () => {
    const app = createInMemoryApp();
    await app.seeder.seed(null);
    const verifyWith = (fetch: (photoId: string) => Promise<null>) =>
      new VerifyReferencePhotos(app.repositories.challenges, { fetch }, { publish: async () => undefined, subscribe: () => undefined }, app.clock, app.logger);

    const outage = await verifyWith(async () => {
      throw new PhotoProviderUnavailableError('panne');
    }).execute();
    expect(outage).toMatchObject({ interrupted: true, disabled: [] });

    const gone = await verifyWith(async () => null).execute();
    expect(gone.disabled).toHaveLength(DEMO_CHALLENGES.length);
    expect((await app.challenges.browse.execute({})).total).toBe(0);
  });
});

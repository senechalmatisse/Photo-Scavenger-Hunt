import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { loadConfig } from '../src/config/app-config';

/**
 * Tests de bout en bout HTTP : application Nest complète, pilotes « memory » et catalogue de démonstration.
 * Aucun service externe n'est nécessaire (ni PostgreSQL, ni Redis, ni Flickr).
 */
describe('API Photo Scavenger Hunt (e2e)', () => {
  let app: INestApplication;
  let server: Parameters<typeof request>[0];

  beforeAll(async () => {
    const config = loadConfig({
      NODE_ENV: 'test',
      PERSISTENCE_DRIVER: 'memory',
      CACHE_DRIVER: 'memory',
      LEADERBOARD_DRIVER: 'memory',
      PHOTO_PROVIDER: 'fixtures',
      SEED_DEMO: 'true',
      PASSWORD_HASH_COST: '10',
      ADMIN_EMAIL: 'admin@example.org',
      ADMIN_PASSWORD: 'admin-password-123',
      SESSION_EXPIRY_INTERVAL_MS: '0',
      PHOTO_CHECK_INTERVAL_MS: '0',
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule.forRoot(config)] }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app, config);
    await app.init();
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  it('protège les routes par défaut et répond aux sondes', async () => {
    await request(server).get('/api/health').expect(200, { status: 'ok' });
    const denied = await request(server).get('/api/me').expect(401);
    expect(denied.body).toMatchObject({ statusCode: 401 });
  });

  it('parcours invité : défi du jour, recherche, réponse, score et tableau de bord', async () => {
    const guest = await request(server).post('/api/auth/guest').expect(201);
    const auth = bearer(guest.body.accessToken);

    const daily = await request(server).get('/api/challenges/daily').set(auth).expect(200);
    expect(daily.body.challenge).toBeDefined();
    expect(daily.body.challenge.validation).toBeUndefined();

    const catalog = await request(server).get('/api/challenges').query({ difficulty: 'EASY' }).set(auth).expect(200);
    const dame = catalog.body.items.find((challenge: { title: string }) => challenge.title === 'Dame de fer');

    const started = await request(server).post('/api/game-sessions').set(auth).send({ challengeId: dame.id });
    expect([200, 201]).toContain(started.status);
    const sessionId = started.body.session.id;

    const photos = await request(server).get('/api/photos').query({ tags: 'toureiffel' }).set(auth).expect(200);
    expect(photos.body.items.length).toBeGreaterThan(0);
    expect(photos.body.items[0]).toHaveProperty('pageUrl');

    const miss = await request(server).post(`/api/game-sessions/${sessionId}/attempts`).set(auth).send({ photoId: 'demo-eiffel-2023' }).expect(200);
    expect(miss.body.attempt.accepted).toBe(false);

    const hit = await request(server).post(`/api/game-sessions/${sessionId}/attempts`).set(auth).send({ photoId: 'demo-eiffel-2017' }).expect(200);
    expect(hit.body.session.status).toBe('VALIDATED');
    expect(hit.body.session.result.referencePhoto.photoId).toBe('demo-eiffel-2017');

    const dashboard = await request(server).get('/api/me/dashboard').set(auth).expect(200);
    expect(dashboard.body.progress.points).toBeGreaterThan(0);
    expect(dashboard.body.recentSessions).toHaveLength(1);
  });

  it('valide les entrées et traduit les erreurs métier en statuts HTTP', async () => {
    const guest = await request(server).post('/api/auth/guest').expect(201);
    const auth = bearer(guest.body.accessToken);
    await request(server).post('/api/game-sessions').set(auth).send({ challengeId: 'pas-un-uuid' }).expect(400);
    const unavailable = await request(server)
      .post('/api/game-sessions')
      .set(auth)
      .send({ challengeId: '00000000-0000-4000-8000-000000000000' })
      .expect(422);
    expect(unavailable.body.code).toBe('CHALLENGE_UNAVAILABLE');
  });

  it('réserve l’administration au rôle ADMIN', async () => {
    const guest = await request(server).post('/api/auth/guest').expect(201);
    await request(server).get('/api/admin/challenges').set(bearer(guest.body.accessToken)).expect(403);

    const admin = await request(server).post('/api/auth/login').send({ email: 'admin@example.org', password: 'admin-password-123' }).expect(200);
    const list = await request(server).get('/api/admin/challenges').set(bearer(admin.body.accessToken)).expect(200);
    expect(list.body.items[0].validation).toBeDefined();
  });
});

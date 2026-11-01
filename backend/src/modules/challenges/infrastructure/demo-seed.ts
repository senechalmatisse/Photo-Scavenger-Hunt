import { AppLogger } from '../../../shared/application/ports';
import { ChallengeInput } from '../application/challenge-definition-builder';
import { CreateChallenge, PublishChallenge } from '../application/challenge-commands';
import { ChallengeRepository } from '../domain/challenge.repository';

const FRANCE = { kind: 'BOX', minLat: 41.3, minLon: -5.3, maxLat: 51.1, maxLon: 9.6 } as const;

/**
 * Défis de démonstration, adossés aux photos fictives du catalogue « fixtures ».
 * Ils illustrent les trois modes de validation : critères, photo exacte et lieu.
 */
export const DEMO_CHALLENGES: readonly ChallengeInput[] = [
  {
    title: 'Le gardien des côtes',
    riddle: "Trouve une photographie d'un phare situé sur le littoral français, prise entre 2015 et 2024.",
    difficulty: 'INTERMEDIATE',
    theme: 'COAST',
    zoneLabel: 'Littoral français',
    zone: FRANCE,
    period: { from: '2015-01-01', to: '2024-12-31' },
    hints: [
      { text: 'Cherche le mot-clé « phare » ou « lighthouse ».', cost: 20 },
      { text: 'La pointe de la Hague, dans le Cotentin, en abrite un célèbre.', cost: 20 },
    ],
    reward: { points: 250, xp: 100 },
    validation: {
      type: 'ALL_OF',
      rules: [
        { type: 'IN_AREA', area: FRANCE, label: 'France' },
        { type: 'TAKEN_BETWEEN', from: '2015-01-01', to: '2024-12-31' },
        { type: 'HAS_TAGS', tags: ['phare', 'lighthouse'], mode: 'ANY' },
      ],
    },
    referencePhotoId: 'demo-goury-2018',
  },
  {
    title: 'La merveille de l’Occident',
    riddle: "Retrouve le lieu de cette abbaye perchée sur un îlot que la marée encercle deux fois par jour.",
    difficulty: 'EASY',
    theme: 'HERITAGE',
    zoneLabel: 'Normandie',
    zone: { kind: 'BOX', minLat: 48.3, minLon: -1.9, maxLat: 49.8, maxLon: 1.8 },
    hints: [{ text: "C'est un site classé au patrimoine mondial de l'UNESCO depuis 1979.", cost: 20 }],
    reward: { points: 150, xp: 50 },
    validation: { type: 'NEAR_POINT', lat: 48.6361, lon: -1.5115, toleranceKm: 2, label: 'le Mont-Saint-Michel' },
    referencePhotoId: 'demo-msm-2019',
  },
  {
    title: 'Dame de fer',
    riddle: 'Une seule photo est la bonne : la tour de 330 mètres, au printemps 2017, vue du Champ-de-Mars.',
    difficulty: 'EASY',
    theme: 'ARCHITECTURE',
    zoneLabel: 'Paris',
    zone: { kind: 'CIRCLE', lat: 48.8566, lon: 2.3522, radiusKm: 15 },
    period: { from: '2017-01-01', to: '2017-12-31' },
    hints: [{ text: 'Filtre sur le mot-clé « toureiffel ».', cost: 10 }],
    reward: { points: 100, xp: 50 },
    validation: { type: 'EXACT_PHOTO', photoId: 'demo-eiffel-2017' },
    referencePhotoId: 'demo-eiffel-2017',
  },
  {
    title: 'Le pont des Romains',
    riddle: "Trouve cet aqueduc à trois rangs d'arches, photographié depuis 2018.",
    difficulty: 'INTERMEDIATE',
    theme: 'HERITAGE',
    zoneLabel: 'Occitanie',
    zone: { kind: 'BOX', minLat: 42.3, minLon: 0.3, maxLat: 45.1, maxLon: 4.9 },
    period: { from: '2018-01-01', to: null },
    hints: [
      { text: 'Il enjambe le Gardon.', cost: 20 },
      { text: 'Mot-clé utile : « aqueduc ».', cost: 30 },
    ],
    reward: { points: 200, xp: 100 },
    validation: {
      type: 'ANY_OF',
      rules: [
        { type: 'EXACT_PHOTO', photoId: 'demo-pontdugard-2020' },
        {
          type: 'ALL_OF',
          rules: [
            { type: 'NEAR_POINT', lat: 43.9475, lon: 4.535, toleranceKm: 3, label: 'le Pont du Gard' },
            { type: 'TAKEN_BETWEEN', from: '2018-01-01' },
          ],
        },
      ],
    },
    referencePhotoId: 'demo-pontdugard-2020',
  },
  {
    title: 'Sentinelle d’Ouessant',
    riddle: "Au bout du bout de la Bretagne, une tour rayée de noir et de blanc veille sur le rail d'Ouessant.",
    difficulty: 'HARD',
    theme: 'COAST',
    zoneLabel: 'Mer d’Iroise',
    zone: { kind: 'CIRCLE', lat: 48.4, lon: -4.9, radiusKm: 40 },
    hints: [{ text: "C'est l'un des phares les plus puissants d'Europe.", cost: 40 }],
    reward: { points: 300, xp: 150 },
    timeLimitSeconds: 300,
    validation: { type: 'NEAR_POINT', lat: 48.4594, lon: -5.129, toleranceKm: 1.5, label: 'le phare du Créac’h' },
    referencePhotoId: 'demo-creach-2021',
  },
  {
    title: 'La dune qui avance',
    riddle: "Elle recule de plusieurs mètres par an face à l'océan. Trouve-la, photographiée entre 2020 et 2023.",
    difficulty: 'EXPERT',
    theme: 'NATURE',
    zoneLabel: 'Nouvelle-Aquitaine',
    period: { from: '2020-01-01', to: '2023-12-31' },
    hints: [{ text: 'Bassin d’Arcachon.', cost: 50 }],
    reward: { points: 400, xp: 200 },
    timeLimitSeconds: 180,
    maxAttempts: 2,
    validation: {
      type: 'ALL_OF',
      rules: [
        { type: 'NEAR_POINT', lat: 44.5889, lon: -1.2133, toleranceKm: 2, label: 'la dune du Pilat' },
        { type: 'TAKEN_BETWEEN', from: '2020-01-01', to: '2023-12-31' },
      ],
    },
    referencePhotoId: 'demo-pilat-2021',
  },
];

/** Alimente un catalogue vide avec les défis de démonstration (via les vrais cas d'usage). */
export class DemoChallengeSeeder {
  constructor(
    private readonly challenges: ChallengeRepository,
    private readonly create: CreateChallenge,
    private readonly publish: PublishChallenge,
    private readonly logger: AppLogger,
  ) {}

  async seed(adminId: string | null): Promise<number> {
    const existing = await this.challenges.findForAdmin(undefined, { page: 1, pageSize: 1 });
    if (existing.total > 0) {
      return 0;
    }
    for (const input of DEMO_CHALLENGES) {
      const created = await this.create.execute(input, adminId);
      await this.publish.execute(created.id);
    }
    this.logger.info('Défis de démonstration créés', { count: DEMO_CHALLENGES.length });
    return DEMO_CHALLENGES.length;
  }
}

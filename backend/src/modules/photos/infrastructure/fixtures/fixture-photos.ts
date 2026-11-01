/**
 * Photographies FICTIVES de démonstration (aucune n'est une vraie photo Flickr).
 * Elles couvrent les cas de validation : bonne réponse, mauvaise période, mauvais lieu,
 * photo non géolocalisée, date approximative, licence non autorisée.
 */
export interface FixturePhoto {
  readonly id: string;
  readonly title: string;
  readonly owner: string;
  readonly license: string;
  readonly takenOn: string | null;
  readonly granularity?: 'EXACT' | 'MONTH' | 'YEAR' | 'CIRCA';
  readonly lat: number | null;
  readonly lon: number | null;
  readonly tags: readonly string[];
  readonly place: string | null;
  readonly description: string | null;
  readonly sky: string;
  readonly ground: string;
}

const OWNER = 'Photothèque de démonstration';

export const FIXTURE_PHOTOS: readonly FixturePhoto[] = [
  {
    id: 'demo-goury-2018', title: 'Phare de Goury au couchant', owner: OWNER, license: 'CC-BY-4.0',
    takenOn: '2018-07-14', lat: 49.7153, lon: -1.9467, tags: ['phare', 'lighthouse', 'normandie', 'cotentin', 'hague', 'mer'],
    place: 'La Hague, Normandie, France', description: 'Le phare octogonal face au raz Blanchard.', sky: '#f4a259', ground: '#2b4162',
  },
  {
    id: 'demo-goury-2009', title: 'Phare de Goury sous la pluie', owner: OWNER, license: 'CC-BY-2.0',
    takenOn: '2009-11-02', lat: 49.7149, lon: -1.9459, tags: ['phare', 'lighthouse', 'normandie', 'tempete'],
    place: 'La Hague, Normandie, France', description: 'Coup de vent sur la pointe de la Hague.', sky: '#5c677d', ground: '#1b263b',
  },
  {
    id: 'demo-creach-2021', title: 'Le Créac’h, sentinelle d’Ouessant', owner: OWNER, license: 'CC-BY-SA-4.0',
    takenOn: '2021-08-03', lat: 48.4594, lon: -5.129, tags: ['phare', 'lighthouse', 'bretagne', 'ouessant', 'finistere'],
    place: 'Ouessant, Bretagne, France', description: 'Tour rayée noir et blanc à l’extrémité ouest de l’île.', sky: '#8ecae6', ground: '#023047',
  },
  {
    id: 'demo-cordouan-2019', title: 'Cordouan, le roi des phares', owner: OWNER, license: 'CC-BY-2.0',
    takenOn: '2019-06-21', lat: 45.5864, lon: -1.1739, tags: ['phare', 'lighthouse', 'gironde', 'estuaire', 'unesco'],
    place: 'Estuaire de la Gironde, France', description: 'Phare Renaissance en pleine mer.', sky: '#a8dadc', ground: '#1d3557',
  },
  {
    id: 'demo-eckmuhl-2016', title: 'Phare d’Eckmühl', owner: OWNER, license: 'CC0-1.0',
    takenOn: '2016-09-10', lat: 47.7983, lon: -4.3722, tags: ['phare', 'lighthouse', 'penmarch', 'finistere'],
    place: 'Penmarc’h, Bretagne, France', description: 'Granite et 307 marches.', sky: '#bde0fe', ground: '#3a5a40',
  },
  {
    id: 'demo-baleines-2022', title: 'Phare des Baleines', owner: OWNER, license: 'CC-BY-NC-4.0',
    takenOn: '2022-05-01', lat: 46.2453, lon: -1.5614, tags: ['phare', 'lighthouse', 'iledere', 'charentemaritime'],
    place: 'Île de Ré, France', description: null, sky: '#ffd6a5', ground: '#457b9d',
  },
  {
    id: 'demo-petitminou-2020', title: 'Phare du Petit Minou', owner: OWNER, license: 'ARR',
    takenOn: '2020-03-15', lat: 48.3375, lon: -4.615, tags: ['phare', 'lighthouse', 'brest', 'goulet'],
    place: 'Plouzané, Bretagne, France', description: 'Tous droits réservés : jamais proposée par le jeu.', sky: '#cdb4db', ground: '#264653',
  },
  {
    id: 'demo-eiffel-2017', title: 'La Dame de fer au printemps', owner: OWNER, license: 'CC-BY-SA-2.0',
    takenOn: '2017-04-02', lat: 48.8584, lon: 2.2945, tags: ['toureiffel', 'eiffeltower', 'paris', 'architecture'],
    place: 'Paris, France', description: 'Vue depuis le Champ-de-Mars.', sky: '#cfe8ef', ground: '#6b705c',
  },
  {
    id: 'demo-eiffel-2023', title: 'Tour Eiffel, nuit du réveillon', owner: OWNER, license: 'CC-BY-4.0',
    takenOn: '2023-12-31', lat: 48.8578, lon: 2.295, tags: ['toureiffel', 'paris', 'nuit', 'feuxdartifice'],
    place: 'Paris, France', description: null, sky: '#14213d', ground: '#000000',
  },
  {
    id: 'demo-msm-2019', title: 'Le Mont-Saint-Michel à marée haute', owner: OWNER, license: 'CC-BY-4.0',
    takenOn: '2019-10-12', lat: 48.6361, lon: -1.5115, tags: ['montsaintmichel', 'abbaye', 'normandie', 'unesco'],
    place: 'Le Mont-Saint-Michel, France', description: 'La merveille de l’Occident cernée par la mer.', sky: '#e9c46a', ground: '#2a9d8f',
  },
  {
    id: 'demo-msm-baie-2015', title: 'La baie vue de Genêts', owner: OWNER, license: 'CC-BY-SA-2.0',
    takenOn: '2015-08-20', lat: 48.6833, lon: -1.4833, tags: ['montsaintmichel', 'baie', 'genets', 'normandie'],
    place: 'Genêts, Normandie, France', description: 'Le Mont au loin, depuis l’autre rive.', sky: '#f1faee', ground: '#a8a29e',
  },
  {
    id: 'demo-pontdugard-2014', title: 'Pont du Gard en été', owner: OWNER, license: 'CC-BY-2.0',
    takenOn: '2014-08-15', lat: 43.9475, lon: 4.535, tags: ['pontdugard', 'aqueduc', 'romain', 'gard'],
    place: 'Vers-Pont-du-Gard, France', description: null, sky: '#ffb703', ground: '#606c38',
  },
  {
    id: 'demo-pontdugard-2020', title: 'L’aqueduc romain au petit matin', owner: OWNER, license: 'CC-BY-SA-4.0',
    takenOn: '2020-07-07', lat: 43.9472, lon: 4.5353, tags: ['pontdugard', 'aqueduc', 'romain', 'unesco'],
    place: 'Vers-Pont-du-Gard, France', description: 'Trois rangs d’arches au-dessus du Gardon.', sky: '#fefae0', ground: '#bc6c25',
  },
  {
    id: 'demo-pilat-2021', title: 'Sur la crête de la dune du Pilat', owner: OWNER, license: 'CC-BY-4.0',
    takenOn: '2021-09-05', lat: 44.5889, lon: -1.2133, tags: ['dune', 'pilat', 'arcachon', 'nature'],
    place: 'La Teste-de-Buch, France', description: 'Plus haute dune d’Europe.', sky: '#90e0ef', ground: '#e9d8a6',
  },
  {
    id: 'demo-pilat-1995', title: 'La dune autrefois', owner: OWNER, license: 'PDM-1.0',
    takenOn: '1995-01-01', granularity: 'CIRCA', lat: 44.5895, lon: -1.2141, tags: ['dune', 'pilat', 'archive'],
    place: 'La Teste-de-Buch, France', description: 'Tirage ancien, date approximative.', sky: '#ddb892', ground: '#7f5539',
  },
  {
    id: 'demo-chambord-2018', title: 'Château de Chambord', owner: OWNER, license: 'PDM-1.0',
    takenOn: '2018-05-20', lat: 47.6162, lon: 1.517, tags: ['chateau', 'chambord', 'loire', 'renaissance'],
    place: 'Chambord, France', description: null, sky: '#caf0f8', ground: '#52796f',
  },
  {
    id: 'demo-calanques-2017', title: 'Calanque d’En-Vau', owner: OWNER, license: 'CC-BY-4.0',
    takenOn: '2017-06-11', lat: null, lon: null, tags: ['calanques', 'marseille', 'mer', 'nature'],
    place: null, description: 'Photo non géolocalisée.', sky: '#00b4d8', ground: '#f2cc8f',
  },
];

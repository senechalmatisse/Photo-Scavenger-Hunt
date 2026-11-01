import { Difficulty, SessionStatus, Theme } from '../../core/api/models';

/** Libellés français des codes de l'API (un seul endroit à traduire). */
export const DIFFICULTY_LABELS: Readonly<Record<Difficulty, string>> = {
  EASY: 'Facile',
  INTERMEDIATE: 'Intermédiaire',
  HARD: 'Difficile',
  EXPERT: 'Expert',
};

export const DIFFICULTY_LEVEL: Readonly<Record<Difficulty, number>> = { EASY: 1, INTERMEDIATE: 2, HARD: 3, EXPERT: 4 };

export const THEME_LABELS: Readonly<Record<Theme, string>> = {
  ARCHITECTURE: 'Architecture',
  NATURE: 'Nature',
  HERITAGE: 'Patrimoine',
  ANIMALS: 'Animaux',
  COAST: 'Littoral',
  MOUNTAIN: 'Montagne',
  URBAN: 'Ville',
  CULTURE: 'Culture',
  OTHER: 'Divers',
};

export const STATUS_LABELS: Readonly<Record<SessionStatus, string>> = {
  IN_PROGRESS: 'En cours',
  PAUSED: 'En pause',
  VALIDATED: 'Réussie',
  FAILED: 'Échouée',
  EXPIRED: 'Temps écoulé',
  ABANDONED: 'Abandonnée',
};

export const AVATAR_SYMBOLS: Readonly<Record<string, string>> = {
  fox: '🦊',
  owl: '🦉',
  lighthouse: '🗼',
  camera: '📷',
  compass: '🧭',
  mountain: '⛰️',
  wave: '🌊',
  tree: '🌲',
};

export const ACHIEVEMENT_SYMBOLS: Readonly<Record<string, string>> = {
  compass: '🧭',
  bolt: '⚡',
  camera: '📷',
  calendar: '📅',
};

/** Régions proposées pour filtrer le catalogue (rectangles minLon,minLat,maxLon,maxLat). */
export const REGIONS: readonly { readonly label: string; readonly bbox: string }[] = [
  { label: 'France métropolitaine', bbox: '-5.3,41.3,9.6,51.1' },
  { label: 'Bretagne', bbox: '-5.2,47.2,-1,48.9' },
  { label: 'Normandie', bbox: '-1.95,48.3,1.8,50.1' },
  { label: 'Île-de-France', bbox: '1.4,48.1,3.6,49.25' },
  { label: 'Nouvelle-Aquitaine', bbox: '-1.8,42.75,2.65,47.2' },
  { label: 'Occitanie', bbox: '-0.35,42.3,4.85,45.05' },
  { label: 'Provence-Alpes-Côte d’Azur', bbox: '4.2,42.95,7.75,45.15' },
];

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes} min ${String(seconds).padStart(2, '0')} s`;
}

export function formatCountdown(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Date de prise de vue selon sa précision (« en 2018 », « en mai 2018 », « 14/07/2018 »). */
export function formatTaken(day: string | null, granularity: string | null): string {
  if (!day) {
    return 'Date inconnue';
  }
  const [year, month, date] = day.split('-');
  const months = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
  switch (granularity) {
    case 'YEAR':
      return year;
    case 'MONTH':
      return `${months[Number(month) - 1]} ${year}`;
    case 'CIRCA':
      return `vers ${year}`;
    default:
      return `${date}/${month}/${year}`;
  }
}

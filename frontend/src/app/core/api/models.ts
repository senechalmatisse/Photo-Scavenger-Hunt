/**
 * Contrats de l'API REST (miroir des vues du backend).
 * Évolution prévue : génération depuis le document OpenAPI exposé sur /api/docs.
 */

export type Role = 'PLAYER' | 'ADMIN';
export type Difficulty = 'EASY' | 'INTERMEDIATE' | 'HARD' | 'EXPERT';
export type Theme = 'ARCHITECTURE' | 'NATURE' | 'HERITAGE' | 'ANIMALS' | 'COAST' | 'MOUNTAIN' | 'URBAN' | 'CULTURE' | 'OTHER';
export type ChallengeStatus = 'DRAFT' | 'PUBLISHED' | 'DISABLED';
export type GameMode = 'DAILY' | 'CATALOG';
export type SessionStatus = 'IN_PROGRESS' | 'PAUSED' | 'VALIDATED' | 'FAILED' | 'EXPIRED' | 'ABANDONED';
export type LeaderboardPeriod = 'ALL_TIME' | 'WEEKLY' | 'MONTHLY';

export interface Page<T> {
  readonly items: T[];
  readonly page: number;
  readonly pageSize: number;
  readonly total: number;
}

export interface ApiErrorBody {
  readonly statusCode: number;
  readonly code: string;
  readonly message: string;
  readonly details?: unknown;
}

// --- Identité ---------------------------------------------------------------------------------

export interface Profile {
  readonly id: string;
  readonly email: string | null;
  readonly displayName: string;
  readonly avatar: string;
  readonly role: Role;
  readonly isGuest: boolean;
  readonly createdAt: string;
  readonly lastLoginAt: string | null;
}

export interface AuthResult {
  readonly accessToken: string;
  readonly expiresIn: number;
  readonly user: Profile;
}

// --- Défis ------------------------------------------------------------------------------------

export type GeoArea =
  | { readonly kind: 'BOX'; readonly minLat: number; readonly minLon: number; readonly maxLat: number; readonly maxLon: number }
  | { readonly kind: 'CIRCLE'; readonly lat: number; readonly lon: number; readonly radiusKm: number };

export interface Hint {
  readonly text: string;
  readonly cost: number;
}

export interface Reward {
  readonly points: number;
  readonly xp: number;
}

export interface ReferencePhoto {
  readonly photoId: string;
  readonly title: string;
  readonly ownerName: string;
  readonly licenseCode: string;
  readonly licenseName: string;
  readonly licenseUrl: string | null;
  readonly imageUrl: string;
  readonly pageUrl: string;
}

export interface PublicChallenge {
  readonly id: string;
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: Difficulty;
  readonly theme: Theme;
  readonly zoneLabel: string | null;
  readonly zone: GeoArea | null;
  readonly period: { readonly from: string | null; readonly to: string | null; readonly label: string } | null;
  readonly hintCosts: number[];
  readonly reward: Reward;
  readonly timeLimitSeconds: number | null;
  readonly maxAttempts: number;
  readonly replayable: boolean;
  readonly isGeographic: boolean;
  readonly playable: boolean;
  readonly availableTo: string | null;
}

export type RuleSpec = { readonly type: string } & Readonly<Record<string, unknown>>;

export interface AdminChallenge extends PublicChallenge {
  readonly status: ChallengeStatus;
  readonly hints: Hint[];
  readonly maxAttemptsOverride: number | null;
  readonly validation: RuleSpec;
  readonly validationSummary: string;
  readonly referencePhoto: ReferencePhoto | null;
  readonly availableFrom: string | null;
  readonly dailyEligible: boolean;
  readonly disabledReason: string | null;
  readonly createdAt: string;
  readonly publishedAt: string | null;
  readonly version: number;
}

export interface ChallengeInput {
  title: string;
  riddle: string;
  difficulty: Difficulty;
  theme: Theme;
  zoneLabel: string | null;
  zone: GeoArea | null;
  period: { from: string | null; to: string | null } | null;
  hints: Hint[];
  reward: Reward;
  timeLimitSeconds: number | null;
  maxAttempts: number | null;
  validation: RuleSpec;
  referencePhotoId: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  replayable: boolean;
  dailyEligible: boolean;
}

export interface CriterionOutcome {
  readonly criterion: string;
  readonly label: string;
  readonly satisfied: boolean;
  readonly explanation: string;
}

export interface ValidationReport {
  readonly accepted: boolean;
  readonly outcomes: CriterionOutcome[];
}

export interface ValidationPreview {
  readonly decisive: boolean;
  readonly summary: string;
  readonly report: ValidationReport;
  readonly photo: ReferencePhoto;
}

export interface ChallengeStats {
  readonly plays: number;
  readonly uniquePlayers: number;
  readonly validated: number;
  readonly failed: number;
  readonly expired: number;
  readonly abandoned: number;
  readonly inProgress: number;
  readonly averageHints: number;
  readonly averageAttempts: number;
  readonly averageDurationMs: number | null;
  readonly successRate: number | null;
}

// --- Parties ----------------------------------------------------------------------------------

export interface ScoreLine {
  readonly code: string;
  readonly label: string;
  readonly points: number;
}

export interface ScoreBreakdown {
  readonly lines: ScoreLine[];
  readonly total: number;
}

export interface AttemptView {
  readonly photoId: string;
  readonly submittedAt: string;
  readonly accepted: boolean;
  readonly outcomes: CriterionOutcome[];
}

export interface SessionView {
  readonly id: string;
  readonly challengeId: string;
  readonly mode: GameMode;
  readonly status: SessionStatus;
  readonly isFinished: boolean;
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: Difficulty;
  readonly theme: Theme;
  readonly zoneLabel: string | null;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly elapsedMs: number;
  readonly deadline: string | null;
  readonly timeLimitSeconds: number | null;
  readonly allowsPause: boolean;
  readonly hints: { readonly total: number; readonly revealed: Hint[]; readonly nextCost: number | null };
  readonly attempts: AttemptView[];
  readonly attemptsLeft: number;
  readonly maxAttempts: number;
  readonly result: {
    readonly score: ScoreBreakdown | null;
    readonly points: number;
    readonly xp: number;
    readonly referencePhoto: ReferencePhoto | null;
  } | null;
}

export interface StartedSession {
  readonly session: SessionView;
  readonly resumed: boolean;
}

export interface SessionSummary {
  readonly id: string;
  readonly challengeId: string;
  readonly title: string;
  readonly mode: GameMode;
  readonly status: SessionStatus;
  readonly startedAt: string;
  readonly endedAt: string | null;
  readonly points: number;
  readonly xp: number;
  readonly hintsUsed: number;
  readonly attempts: number;
}

// --- Photos -----------------------------------------------------------------------------------

export interface Photo {
  readonly id: string;
  readonly title: string;
  readonly ownerName: string;
  readonly license: { readonly code: string; readonly name: string; readonly url: string | null };
  readonly takenOn: string | null;
  readonly takenGranularity: 'EXACT' | 'MONTH' | 'YEAR' | 'CIRCA' | null;
  readonly location: { readonly lat: number; readonly lon: number } | null;
  readonly tags: string[];
  readonly imageUrls: { readonly thumbnail: string; readonly medium: string; readonly large: string };
  readonly pageUrl: string;
  readonly description: string | null;
  readonly placeName: string | null;
}

export interface PhotoPage {
  readonly items: Photo[];
  readonly page: number;
  readonly pages: number;
  readonly total: number;
}

export interface PhotoQuery {
  text?: string;
  tags?: string;
  tagMode?: 'any' | 'all';
  takenFrom?: string;
  takenTo?: string;
  bbox?: string;
  geotagged?: boolean;
  sort?: 'relevance' | 'interestingness' | 'date_taken_desc';
  page?: number;
  perPage?: number;
}

// --- Progression, classements, tableau de bord --------------------------------------------------

export interface LevelProgress {
  readonly level: number;
  readonly xp: number;
  readonly currentLevelXp: number;
  readonly nextLevelXp: number;
  readonly ratio: number;
}

export interface PlayerStats {
  readonly missionsPlayed: number;
  readonly missionsWon: number;
  readonly missionsWonWithoutHint: number;
  readonly geoMissionsWon: number;
  readonly dailyCompleted: number;
  readonly hintsUsed: number;
  readonly photosSubmitted: number;
}

export interface Achievement {
  readonly code: string;
  readonly name: string;
  readonly description: string;
  readonly icon: string;
  readonly unlockedAt: string | null;
}

export interface ProgressView {
  readonly playerId: string;
  readonly level: LevelProgress;
  readonly points: number;
  readonly stats: PlayerStats;
  readonly currentStreak: number;
  readonly bestStreak: number;
  readonly achievements: Achievement[];
}

export interface LeaderboardEntry {
  readonly rank: number;
  readonly playerId: string;
  readonly displayName: string;
  readonly avatar: string;
  readonly points: number;
  readonly isMe: boolean;
}

export interface LeaderboardView {
  readonly period: LeaderboardPeriod;
  readonly board: string;
  readonly entries: LeaderboardEntry[];
  readonly me: LeaderboardEntry | null;
}

export interface DashboardView {
  readonly daily: { readonly challenge: PublicChallenge; readonly mySession: SessionSummary | null } | null;
  readonly progress: ProgressView;
  readonly recentSessions: SessionSummary[];
  readonly availableChallenges: PublicChallenge[];
  readonly weeklyLeaderboard: LeaderboardView;
  readonly recentAchievements: Achievement[];
}

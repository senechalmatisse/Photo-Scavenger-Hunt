import { DEFAULT_MAX_ATTEMPTS } from '../../challenges/public-api';
import type { Difficulty, Hint, Reward, RuleSpec } from '../../challenges/public-api';
import { GameModePolicy, ModeContext } from './game-mode';

/**
 * Conditions de jeu figées au démarrage d'une partie (instantané).
 * Un administrateur peut modifier le défi ensuite sans changer les règles d'une partie en cours.
 */
export interface SessionTerms {
  readonly challengeTitle: string;
  readonly riddle: string;
  readonly difficulty: Difficulty;
  readonly theme: string;
  readonly zoneLabel: string | null;
  readonly basePoints: number;
  readonly xpOnSuccess: number;
  readonly xpOnParticipation: number;
  readonly hints: readonly Hint[];
  readonly timeLimitSeconds: number | null;
  /** Échéance absolue (ISO 8601) imposée par le mode, ex. minuit pour le défi quotidien. */
  readonly expiresAt: string | null;
  readonly maxAttempts: number;
  readonly allowsPause: boolean;
  readonly isReplay: boolean;
  readonly isGeographic: boolean;
  readonly validation: RuleSpec;
}

/** Données du défi nécessaires pour démarrer une partie. */
export interface PlayableChallenge {
  readonly id: string;
  readonly title: string;
  readonly riddle: string;
  readonly difficulty: Difficulty;
  readonly theme: string;
  readonly zoneLabel: string | null;
  readonly reward: Reward;
  readonly hints: readonly Hint[];
  readonly timeLimitSeconds: number | null;
  readonly maxAttempts: number | null;
  readonly replayable: boolean;
  readonly isGeographic: boolean;
  readonly validation: RuleSpec;
}

/** Fabrique des conditions de jeu : combine le défi et la politique du mode. */
export function buildSessionTerms(
  challenge: PlayableChallenge,
  mode: GameModePolicy,
  options: { isReplay: boolean; participationXp: number; context: ModeContext },
): SessionTerms {
  const expiresAt = mode.expiresAt(options.context);
  return {
    challengeTitle: challenge.title,
    riddle: challenge.riddle,
    difficulty: challenge.difficulty,
    theme: challenge.theme,
    zoneLabel: challenge.zoneLabel,
    basePoints: challenge.reward.points,
    xpOnSuccess: challenge.reward.xp,
    xpOnParticipation: options.participationXp,
    hints: challenge.hints.map((hint) => ({ ...hint })),
    timeLimitSeconds: challenge.timeLimitSeconds,
    expiresAt: expiresAt ? expiresAt.toISOString() : null,
    maxAttempts: challenge.maxAttempts ?? DEFAULT_MAX_ATTEMPTS[challenge.difficulty],
    allowsPause: mode.allowsPause,
    isReplay: options.isReplay,
    isGeographic: challenge.isGeographic,
    validation: challenge.validation,
  };
}

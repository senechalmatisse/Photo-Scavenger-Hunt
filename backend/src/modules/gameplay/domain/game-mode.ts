import { NotFoundError } from '../../../shared/domain/domain-error';

export type GameModeKind = 'DAILY' | 'CATALOG';

export interface ModeContext {
  readonly startedAt: Date;
  /** Fin de la journée de jeu en cours (fuseau du jeu). */
  readonly endOfGameDay: Date;
}

/**
 * Règles propres à un mode de jeu (pattern Strategy).
 * Ajouter un mode (exploration libre, duel...) = ajouter une politique et l'enregistrer dans le registre.
 */
export interface GameModePolicy {
  readonly kind: GameModeKind;
  readonly label: string;
  readonly allowsPause: boolean;
  /** Une seule partie par joueur et par journée de jeu. */
  readonly oncePerDay: boolean;
  /** Un défi déjà terminé peut-il être rejoué dans ce mode ? */
  readonly allowsReplay: boolean;
  /** Échéance absolue de la partie, indépendamment du temps limite du défi. */
  expiresAt(context: ModeContext): Date | null;
}

/** Défi quotidien : commun à tous, sans pause, à terminer avant minuit (heure du jeu). */
export class DailyMode implements GameModePolicy {
  readonly kind = 'DAILY';
  readonly label = 'Défi quotidien';
  readonly allowsPause = false;
  readonly oncePerDay = true;
  readonly allowsReplay = false;

  expiresAt(context: ModeContext): Date | null {
    return context.endOfGameDay;
  }
}

/** Catalogue : missions à la carte, pause autorisée, rejouables si le défi le permet. */
export class CatalogMode implements GameModePolicy {
  readonly kind = 'CATALOG';
  readonly label = 'Catalogue';
  readonly allowsPause = true;
  readonly oncePerDay = false;
  readonly allowsReplay = true;

  expiresAt(): Date | null {
    return null;
  }
}

export class GameModeRegistry {
  private readonly policies = new Map<GameModeKind, GameModePolicy>();

  constructor(policies: readonly GameModePolicy[]) {
    for (const policy of policies) {
      this.policies.set(policy.kind, policy);
    }
  }

  static standard(): GameModeRegistry {
    return new GameModeRegistry([new DailyMode(), new CatalogMode()]);
  }

  get(kind: GameModeKind): GameModePolicy {
    const policy = this.policies.get(kind);
    if (!policy) {
      throw new NotFoundError('GAME_MODE_UNKNOWN', `Mode de jeu inconnu : ${kind}`);
    }
    return policy;
  }
}

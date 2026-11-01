import { ConcurrencyError } from '../../../shared/domain/domain-error';
import { LocalDate } from '../../../shared/domain/local-date';
import { PgDatabase, json } from '../../../shared/infrastructure/persistence/pg-database';
import { EMPTY_STATS, PlayerStats } from '../domain/achievements';
import { PlayerProgress } from '../domain/player-progress';
import { PlayerProgressRepository, RewardLedger, RewardLedgerEntry } from '../domain/progression.repository';

// ---------------------------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------------------------

const PROGRESS_COLUMNS = `player_id,
  xp,
  points,
  stats,
  current_streak,
  best_streak,
  last_daily_day,
  achievements,
  updated_at,
  version`;

/** Lecture de la progression d'un joueur. */
const SELECT_PROGRESS = `
SELECT ${PROGRESS_COLUMNS}
FROM player_progress
WHERE player_id = $1`;

/** Creation de la progression d'un joueur. */
const INSERT_PROGRESS = `
INSERT INTO player_progress
(
  ${PROGRESS_COLUMNS}
)
VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7::date, $8::jsonb, $9, $10)`;

/** Mise a jour de la progression avec verrouillage optimiste sur la version. */
const UPDATE_PROGRESS = `
UPDATE player_progress
SET xp = $2,
  points = $3,
  stats = $4::jsonb,
  current_streak = $5,
  best_streak = $6,
  last_daily_day = $7::date,
  achievements = $8::jsonb,
  updated_at = $9,
  version = $10
WHERE player_id = $1
  AND version = $11`;

/** Suppression de la progression d'un joueur. */
const DELETE_PROGRESS = `
DELETE FROM player_progress
WHERE player_id = $1`;

/** Ecriture idempotente au registre : une partie n'est comptabilisee qu'une fois. */
const INSERT_LEDGER = `
INSERT INTO reward_ledger
(
  session_id,
  player_id,
  points,
  xp,
  game_day,
  awarded_at
)
VALUES ($1, $2, $3, $4, $5::date, $6)
ON CONFLICT (session_id) DO NOTHING`;

/** Suppression des ecritures d'un joueur. */
const DELETE_LEDGER = `
DELETE FROM reward_ledger
WHERE player_id = $1`;

interface ProgressRow {
  player_id: string;
  xp: number;
  points: number;
  stats: PlayerStats;
  current_streak: number;
  best_streak: number;
  last_daily_day: LocalDate | null;
  achievements: { code: string; unlockedAt: string }[];
  updated_at: Date;
  version: number;
}

export class PgPlayerProgressRepository implements PlayerProgressRepository {
  constructor(private readonly db: PgDatabase) {}

  async findByPlayer(playerId: string): Promise<PlayerProgress | null> {
    const [row] = await this.db.query<ProgressRow>(SELECT_PROGRESS, [playerId]);
    if (!row) {
      return null;
    }
    return PlayerProgress.restore({
      playerId: row.player_id,
      version: row.version,
      xp: row.xp,
      points: row.points,
      // Une statistique ajoutée après coup vaut zéro pour les progressions déjà enregistrées.
      stats: { ...EMPTY_STATS, ...row.stats },
      currentStreak: row.current_streak,
      bestStreak: row.best_streak,
      lastDailyDay: row.last_daily_day,
      achievements: row.achievements.map((achievement) => ({ code: achievement.code, unlockedAt: new Date(achievement.unlockedAt) })),
      updatedAt: row.updated_at,
    });
  }

  async save(progress: PlayerProgress): Promise<void> {
    const s = progress.toSnapshot();
    const next = s.version + 1;
    const values = [s.xp, s.points, json(s.stats), s.currentStreak, s.bestStreak, s.lastDailyDay, json(s.achievements), s.updatedAt, next];
    if (progress.isNew) {
      await this.db.execute(INSERT_PROGRESS, [s.playerId, ...values]);
    } else if ((await this.db.execute(UPDATE_PROGRESS, [s.playerId, ...values, s.version])) === 0) {
      throw new ConcurrencyError('La progression', s.playerId);
    }
    progress.commitVersion(next);
  }

  async deleteByPlayer(playerId: string): Promise<void> {
    await this.db.execute(DELETE_PROGRESS, [playerId]);
  }
}

export class PgRewardLedger implements RewardLedger {
  constructor(private readonly db: PgDatabase) {}

  async append(entry: RewardLedgerEntry): Promise<boolean> {
    const inserted = await this.db.execute(INSERT_LEDGER, [
      entry.sessionId, entry.playerId, entry.points, entry.xp, entry.day, entry.awardedAt,
    ]);
    return inserted === 1;
  }

  async deleteByPlayer(playerId: string): Promise<void> {
    await this.db.execute(DELETE_LEDGER, [playerId]);
  }
}

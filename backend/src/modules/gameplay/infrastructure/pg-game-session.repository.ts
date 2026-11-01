import { ConcurrencyError, ConflictError } from '../../../shared/domain/domain-error';
import { LocalDate } from '../../../shared/domain/local-date';
import { Page, PageRequest, Pages } from '../../../shared/domain/pagination';
import { PgDatabase, isUniqueViolation, json } from '../../../shared/infrastructure/persistence/pg-database';
import { GameModeKind } from '../domain/game-mode';
import { GameSession } from '../domain/game-session';
import { ChallengeStats, GameSessionRepository } from '../domain/game-session.repository';
import { ScoreBreakdown } from '../domain/scoring';
import { Attempt, SessionStatus } from '../domain/session-states';
import { SessionTerms } from '../domain/session-terms';

function duplicateSession(error: unknown): ConflictError | null {
  if (isUniqueViolation(error, 'game_sessions_active_uk')) {
    return new ConflictError('SESSION_ALREADY_ACTIVE', 'Une partie est déjà en cours sur ce défi.');
  }
  if (isUniqueViolation(error, 'game_sessions_daily_uk')) {
    return new ConflictError('DAILY_ALREADY_PLAYED', 'Vous avez déjà joué le défi du jour.');
  }
  return null;
}

// ---------------------------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------------------------

const SESSION_COLUMNS = `id,
  player_id,
  challenge_id,
  mode,
  game_day,
  status,
  terms,
  started_at,
  ended_at,
  active_elapsed_ms,
  running_since,
  deadline_at,
  hints_used,
  attempts,
  score,
  points,
  xp_awarded,
  version`;

/** Lecture d'une partie par identifiant. */
const SELECT_BY_ID = `
SELECT ${SESSION_COLUMNS}
FROM game_sessions
WHERE id = $1`;

/** Partie non terminee d'un joueur sur un defi. */
const SELECT_ACTIVE = `
SELECT ${SESSION_COLUMNS}
FROM game_sessions
WHERE player_id = $1
  AND challenge_id = $2
  AND status IN ('IN_PROGRESS', 'PAUSED')`;

/** Defi quotidien d'un joueur pour une journee de jeu. */
const SELECT_DAILY = `
SELECT ${SESSION_COLUMNS}
FROM game_sessions
WHERE player_id = $1
  AND game_day = $2::date
  AND mode = 'DAILY'`;

/** Existence d'une partie terminee (detection d'une partie rejouee). */
const SELECT_HAS_FINISHED = `
SELECT EXISTS (SELECT gs.id
  FROM game_sessions gs
  WHERE gs.player_id = $1
    AND gs.challenge_id = $2
    AND gs.status IN ('VALIDATED', 'FAILED', 'EXPIRED', 'ABANDONED')) AS found`;

/** Parties en cours dont l'echeance est depassee. */
const SELECT_OVERDUE = `
SELECT ${SESSION_COLUMNS}
FROM game_sessions
WHERE status = 'IN_PROGRESS'
  AND deadline_at <= $1
ORDER BY deadline_at
LIMIT $2`;

/** Historique pagine d'un joueur, du plus recent au plus ancien. */
const SELECT_HISTORY = `
SELECT ${SESSION_COLUMNS}
FROM game_sessions
WHERE player_id = $1
ORDER BY started_at DESC
LIMIT $2 OFFSET $3`;

/** Nombre total de parties d'un joueur. */
const COUNT_HISTORY = `
SELECT COUNT(id) AS total
FROM game_sessions
WHERE player_id = $1`;

/** Statistiques de participation d'un defi. */
const SELECT_STATS = `
SELECT COUNT(id) AS plays,
  COUNT(DISTINCT player_id) AS unique_players,
  COUNT(id) FILTER (WHERE status = 'VALIDATED') AS validated,
  COUNT(id) FILTER (WHERE status = 'FAILED') AS failed,
  COUNT(id) FILTER (WHERE status = 'EXPIRED') AS expired,
  COUNT(id) FILTER (WHERE status = 'ABANDONED') AS abandoned,
  COUNT(id) FILTER (WHERE status IN ('IN_PROGRESS', 'PAUSED')) AS in_progress,
  CAST(COALESCE(AVG(hints_used), 0) AS DOUBLE PRECISION) AS average_hints,
  CAST(COALESCE(AVG(JSONB_ARRAY_LENGTH(attempts)), 0) AS DOUBLE PRECISION) AS average_attempts,
  CAST(AVG(active_elapsed_ms) FILTER (WHERE status = 'VALIDATED') AS DOUBLE PRECISION) AS average_duration_ms
FROM game_sessions
WHERE challenge_id = $1`;

/** Creation d'une partie. */
const INSERT_SESSION = `
INSERT INTO game_sessions
(
  ${SESSION_COLUMNS}
)
VALUES ($1, $2, $3, $4, $5::date, $6, $7::jsonb, $8, $9, $10, $11, $12, $13, $14::jsonb, $15::jsonb, $16, $17, $18)`;

/** Mise a jour d'une partie avec verrouillage optimiste sur la version. */
const UPDATE_SESSION = `
UPDATE game_sessions
SET status = $2,
  ended_at = $3,
  active_elapsed_ms = $4,
  running_since = $5,
  deadline_at = $6,
  hints_used = $7,
  attempts = $8::jsonb,
  score = $9::jsonb,
  points = $10,
  xp_awarded = $11,
  version = $12
WHERE id = $1
  AND version = $13`;

/** Suppression des parties d'un joueur (droit a l'effacement). */
const DELETE_BY_PLAYER = `
DELETE FROM game_sessions
WHERE player_id = $1`;

interface SessionRow {
  id: string;
  player_id: string;
  challenge_id: string;
  mode: string;
  game_day: string;
  status: string;
  terms: SessionTerms;
  started_at: Date;
  ended_at: Date | null;
  active_elapsed_ms: number;
  running_since: Date | null;
  deadline_at: Date | null;
  hints_used: number;
  attempts: (Omit<Attempt, 'submittedAt'> & { submittedAt: string })[];
  score: ScoreBreakdown | null;
  points: number;
  xp_awarded: number;
  version: number;
}

function toDomain(row: SessionRow): GameSession {
  return GameSession.restore({
    id: row.id,
    version: row.version,
    playerId: row.player_id,
    challengeId: row.challenge_id,
    mode: row.mode as GameModeKind,
    day: row.game_day,
    status: row.status as SessionStatus,
    terms: row.terms,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    activeElapsedMs: row.active_elapsed_ms,
    runningSince: row.running_since,
    hintsUsed: row.hints_used,
    attempts: row.attempts.map((attempt) => ({ ...attempt, submittedAt: new Date(attempt.submittedAt) })),
    score: row.score,
    xpAwarded: row.xp_awarded,
  });
}

export class PgGameSessionRepository implements GameSessionRepository {
  constructor(private readonly db: PgDatabase) {}

  async findById(id: string): Promise<GameSession | null> {
    const [row] = await this.db.query<SessionRow>(SELECT_BY_ID, [id]);
    return row ? toDomain(row) : null;
  }

  async findActive(playerId: string, challengeId: string): Promise<GameSession | null> {
    const [row] = await this.db.query<SessionRow>(SELECT_ACTIVE, [playerId, challengeId]);
    return row ? toDomain(row) : null;
  }

  async findDaily(playerId: string, day: LocalDate): Promise<GameSession | null> {
    const [row] = await this.db.query<SessionRow>(SELECT_DAILY, [playerId, day]);
    return row ? toDomain(row) : null;
  }

  async hasFinished(playerId: string, challengeId: string): Promise<boolean> {
    const [row] = await this.db.query<{ found: boolean }>(SELECT_HAS_FINISHED, [playerId, challengeId]);
    return row.found;
  }

  async findOverdue(now: Date, limit: number): Promise<GameSession[]> {
    return (await this.db.query<SessionRow>(SELECT_OVERDUE, [now, limit])).map(toDomain);
  }

  async historyOf(playerId: string, page: PageRequest): Promise<Page<GameSession>> {
    const rows = await this.db.query<SessionRow>(SELECT_HISTORY, [playerId, page.pageSize, Pages.offset(page)]);
    const [count] = await this.db.query<{ total: number }>(COUNT_HISTORY, [playerId]);
    return { items: rows.map(toDomain), page: page.page, pageSize: page.pageSize, total: count.total };
  }

  async statsFor(challengeId: string): Promise<ChallengeStats> {
    const [row] = await this.db.query<{
      plays: number;
      unique_players: number;
      validated: number;
      failed: number;
      expired: number;
      abandoned: number;
      in_progress: number;
      average_hints: number;
      average_attempts: number;
      average_duration_ms: number | null;
    }>(SELECT_STATS, [challengeId]);
    return {
      plays: row.plays,
      uniquePlayers: row.unique_players,
      validated: row.validated,
      failed: row.failed,
      expired: row.expired,
      abandoned: row.abandoned,
      inProgress: row.in_progress,
      averageHints: row.average_hints,
      averageAttempts: row.average_attempts,
      averageDurationMs: row.average_duration_ms,
    };
  }

  async save(session: GameSession): Promise<void> {
    const s = session.toSnapshot();
    const next = s.version + 1;
    const deadline = session.deadline();
    try {
      if (session.isNew) {
        await this.db.execute(INSERT_SESSION, [
          s.id, s.playerId, s.challengeId, s.mode, s.day, s.status, json(s.terms), s.startedAt, s.endedAt,
          s.activeElapsedMs, s.runningSince, deadline, s.hintsUsed, json(s.attempts), json(s.score), session.points,
          s.xpAwarded, next,
        ]);
      } else {
        const updated = await this.db.execute(UPDATE_SESSION, [
          s.id, s.status, s.endedAt, s.activeElapsedMs, s.runningSince, deadline, s.hintsUsed, json(s.attempts),
          json(s.score), session.points, s.xpAwarded, next, s.version,
        ]);
        if (updated === 0) {
          throw new ConcurrencyError('La partie', s.id);
        }
      }
    } catch (error) {
      throw duplicateSession(error) ?? error;
    }
    session.commitVersion(next);
  }

  async deleteByPlayer(playerId: string): Promise<void> {
    await this.db.execute(DELETE_BY_PLAYER, [playerId]);
  }
}

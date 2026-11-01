import { ConcurrencyError } from '../../../shared/domain/domain-error';
import { GeoAreaJson, GeoAreas } from '../../../shared/domain/geo';
import { LocalDate } from '../../../shared/domain/local-date';
import { Page, PageRequest, Pages } from '../../../shared/domain/pagination';
import { PgDatabase, json } from '../../../shared/infrastructure/persistence/pg-database';
import { Challenge, ChallengeSnapshot, ChallengeStatus, Difficulty, Hint, ReferencePhoto, Reward, Theme } from '../domain/challenge';
import { CatalogFilter, ChallengeRepository, DailyChallengeSchedule } from '../domain/challenge.repository';
import { RuleSpec } from '../domain/validation/validation-rule';
import { ValidationRuleFactory } from '../domain/validation/validation-rule-factory';

// ---------------------------------------------------------------------------------------------
// PostgreSQL / PostGIS
// ---------------------------------------------------------------------------------------------

const CHALLENGE_COLUMNS = `id,
  title,
  riddle,
  difficulty,
  theme,
  zone_label,
  zone,
  period_from,
  period_to,
  hints,
  reward_points,
  reward_xp,
  time_limit_seconds,
  max_attempts,
  validation_spec,
  reference_photo,
  status,
  available_from,
  available_to,
  replayable,
  daily_eligible,
  disabled_reason,
  created_by,
  created_at,
  updated_at,
  published_at,
  version`;

/** Lecture d'un defi par identifiant. */
const SELECT_BY_ID = `
SELECT ${CHALLENGE_COLUMNS}
FROM challenges
WHERE id = $1`;

/** Creation d'un defi ; la zone publique est aussi stockee en geographie PostGIS (EWKT). */
const INSERT_CHALLENGE = `
INSERT INTO challenges
(
  ${CHALLENGE_COLUMNS},
  zone_area
)
VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::date, $9::date, $10::jsonb, $11, $12, $13, $14, $15::jsonb, $16::jsonb,
  $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, ST_GeogFromText($28))`;

/** Mise a jour d'un defi avec verrouillage optimiste sur la version. */
const UPDATE_CHALLENGE = `
UPDATE challenges
SET title = $2,
  riddle = $3,
  difficulty = $4,
  theme = $5,
  zone_label = $6,
  zone = $7::jsonb,
  period_from = $8::date,
  period_to = $9::date,
  hints = $10::jsonb,
  reward_points = $11,
  reward_xp = $12,
  time_limit_seconds = $13,
  max_attempts = $14,
  validation_spec = $15::jsonb,
  reference_photo = $16::jsonb,
  status = $17,
  available_from = $18,
  available_to = $19,
  replayable = $20,
  daily_eligible = $21,
  disabled_reason = $22,
  updated_at = $23,
  published_at = $24,
  version = $25,
  zone_area = ST_GeogFromText($26)
WHERE id = $1
  AND version = $27`;

/** Clause commune : defi publie et dans sa fenetre de disponibilite a l'instant $1. */
const PLAYABLE_CLAUSE = `status = 'PUBLISHED'
  AND ((available_from IS NULL) OR (available_from <= $1))
  AND ((available_to IS NULL) OR (available_to > $1))`;

/** Lecture du planning du defi quotidien pour une journee. */
const SELECT_DAILY = `
SELECT challenge_id
FROM daily_challenges
WHERE game_day = $1::date`;

/** Affectation automatique, sans ecraser une affectation concurrente. */
const INSERT_DAILY_IF_ABSENT = `
INSERT INTO daily_challenges
(
  game_day,
  challenge_id,
  assignment,
  assigned_at
)
VALUES ($1::date, $2, 'AUTO', $3)
ON CONFLICT (game_day) DO NOTHING`;

/** Affectation qui remplace l'existante. */
const UPSERT_DAILY = `
INSERT INTO daily_challenges
(
  game_day,
  challenge_id,
  assignment,
  assigned_at
)
VALUES ($1::date, $2, $4, $3)
ON CONFLICT (game_day) DO UPDATE
SET challenge_id = EXCLUDED.challenge_id,
  assignment = EXCLUDED.assignment,
  assigned_at = EXCLUDED.assigned_at`;

/** Defis proposes en defi quotidien sur une periode (pour eviter les repetitions). */
const SELECT_DAILY_BETWEEN = `
SELECT challenge_id
FROM daily_challenges
WHERE game_day BETWEEN $1::date AND $2::date`;

interface ChallengeRow {
  id: string;
  title: string;
  riddle: string;
  difficulty: string;
  theme: string;
  zone_label: string | null;
  zone: GeoAreaJson | null;
  period_from: string | null;
  period_to: string | null;
  hints: Hint[];
  reward_points: number;
  reward_xp: number;
  time_limit_seconds: number | null;
  max_attempts: number | null;
  validation_spec: RuleSpec;
  reference_photo: ReferencePhoto | null;
  status: string;
  available_from: Date | null;
  available_to: Date | null;
  replayable: boolean;
  daily_eligible: boolean;
  disabled_reason: string | null;
  created_by: string | null;
  created_at: Date;
  updated_at: Date;
  published_at: Date | null;
  version: number;
}

function toSnapshot(row: ChallengeRow): ChallengeSnapshot {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    riddle: row.riddle,
    difficulty: row.difficulty as Difficulty,
    theme: row.theme as Theme,
    zoneLabel: row.zone_label,
    zone: row.zone,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    hints: row.hints,
    reward: { points: row.reward_points, xp: row.reward_xp } satisfies Reward,
    timeLimitSeconds: row.time_limit_seconds,
    maxAttempts: row.max_attempts,
    validation: row.validation_spec,
    referencePhoto: row.reference_photo,
    status: row.status as ChallengeStatus,
    availableFrom: row.available_from,
    availableTo: row.available_to,
    replayable: row.replayable,
    dailyEligible: row.daily_eligible,
    disabledReason: row.disabled_reason,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at,
  };
}

/** Zone publique au format EWKT pour PostGIS (`SRID=4326;POLYGON((lon lat, ...))`). */
function zoneToEwkt(zone: GeoAreaJson | null): string | null {
  if (!zone) {
    return null;
  }
  const ring = GeoAreas.fromJSON(zone).toRing();
  return `SRID=4326;POLYGON((${ring.map((point) => `${point.longitude} ${point.latitude}`).join(', ')}))`;
}

export class PgChallengeRepository implements ChallengeRepository, DailyChallengeSchedule {
  constructor(
    private readonly db: PgDatabase,
    private readonly rules: ValidationRuleFactory,
  ) {}

  async findById(id: string): Promise<Challenge | null> {
    const [row] = await this.db.query<ChallengeRow>(SELECT_BY_ID, [id]);
    return row ? this.restore(row) : null;
  }

  async save(challenge: Challenge): Promise<void> {
    const s = challenge.toSnapshot();
    const next = s.version + 1;
    const common = [
      s.title, s.riddle, s.difficulty, s.theme, s.zoneLabel, json(s.zone), s.periodFrom, s.periodTo, json(s.hints),
      s.reward.points, s.reward.xp, s.timeLimitSeconds, s.maxAttempts, json(s.validation), json(s.referencePhoto),
      s.status, s.availableFrom, s.availableTo, s.replayable, s.dailyEligible, s.disabledReason,
    ];
    if (challenge.isNew) {
      await this.db.execute(INSERT_CHALLENGE, [
        s.id, ...common, s.createdBy, s.createdAt, s.updatedAt, s.publishedAt, next, zoneToEwkt(s.zone),
      ]);
    } else {
      const updated = await this.db.execute(UPDATE_CHALLENGE, [
        s.id, ...common, s.updatedAt, s.publishedAt, next, zoneToEwkt(s.zone), s.version,
      ]);
      if (updated === 0) {
        throw new ConcurrencyError('Le défi', s.id);
      }
    }
    challenge.commitVersion(next);
  }

  async findPlayable(filter: CatalogFilter, at: Date, page: PageRequest): Promise<Page<Challenge>> {
    const params: unknown[] = [at];
    const conditions = [PLAYABLE_CLAUSE];
    if (filter.difficulty) {
      params.push(filter.difficulty);
      conditions.push(`difficulty = $${params.length}`);
    }
    if (filter.theme) {
      params.push(filter.theme);
      conditions.push(`theme = $${params.length}`);
    }
    if (filter.area) {
      const { minLon, minLat, maxLon, maxLat } = filter.area;
      params.push(minLon, minLat, maxLon, maxLat);
      const n = params.length;
      conditions.push(`ST_Intersects(zone_area, ST_MakeEnvelope($${n - 3}, $${n - 2}, $${n - 1}, $${n}, 4326)::geography)`);
    }
    return this.page(conditions.join('\n  AND '), params, 'published_at DESC, id', page);
  }

  async findForAdmin(status: ChallengeStatus | undefined, page: PageRequest): Promise<Page<Challenge>> {
    return status
      ? this.page('status = $1', [status], 'updated_at DESC, id', page)
      : this.page('id IS NOT NULL', [], 'updated_at DESC, id', page);
  }

  async findDailyCandidates(at: Date): Promise<Challenge[]> {
    const rows = await this.db.query<ChallengeRow>(
      `
SELECT ${CHALLENGE_COLUMNS}
FROM challenges
WHERE ${PLAYABLE_CLAUSE}
  AND daily_eligible = TRUE`,
      [at],
    );
    return rows.map((row) => this.restore(row));
  }

  async findPublished(): Promise<Challenge[]> {
    const rows = await this.db.query<ChallengeRow>(
      `
SELECT ${CHALLENGE_COLUMNS}
FROM challenges
WHERE status = 'PUBLISHED'`,
    );
    return rows.map((row) => this.restore(row));
  }

  // --- Planning du défi quotidien ---

  async challengeIdFor(day: LocalDate): Promise<string | null> {
    const [row] = await this.db.query<{ challenge_id: string }>(SELECT_DAILY, [day]);
    return row ? row.challenge_id : null;
  }

  async assignIfAbsent(day: LocalDate, challengeId: string, at: Date): Promise<void> {
    await this.db.execute(INSERT_DAILY_IF_ABSENT, [day, challengeId, at]);
  }

  async assign(day: LocalDate, challengeId: string, at: Date, assignment: 'MANUAL' | 'AUTO' = 'MANUAL'): Promise<void> {
    await this.db.execute(UPSERT_DAILY, [day, challengeId, at, assignment]);
  }

  async challengeIdsBetween(from: LocalDate, to: LocalDate): Promise<string[]> {
    return (await this.db.query<{ challenge_id: string }>(SELECT_DAILY_BETWEEN, [from, to])).map((row) => row.challenge_id);
  }

  private async page(where: string, params: unknown[], orderBy: string, page: PageRequest): Promise<Page<Challenge>> {
    const limit = params.length + 1;
    const rows = await this.db.query<ChallengeRow>(
      `
SELECT ${CHALLENGE_COLUMNS}
FROM challenges
WHERE ${where}
ORDER BY ${orderBy}
LIMIT $${limit} OFFSET $${limit + 1}`,
      [...params, page.pageSize, Pages.offset(page)],
    );
    const [count] = await this.db.query<{ total: number }>(
      `
SELECT COUNT(id) AS total
FROM challenges
WHERE ${where}`,
      params,
    );
    return { items: rows.map((row) => this.restore(row)), page: page.page, pageSize: page.pageSize, total: count.total };
  }

  private restore(row: ChallengeRow): Challenge {
    return Challenge.restore(toSnapshot(row), this.rules);
  }
}

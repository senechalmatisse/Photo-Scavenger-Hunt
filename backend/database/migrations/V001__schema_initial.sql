--
-- $Author$
--
-- $RCSfile$
--
-- $Date$
--
-- FONCTION: Creation du schema initial de Photo Scavenger Hunt
--           (utilisateurs, defis, planning du defi quotidien, parties,
--           progression des joueurs et registre des recompenses)
--
-- PARAMETRES : Ce programme ne prend pas de parametre
--
-- EXECUTION : par le lanceur de migrations du backend (npm run migrate),
--             dans une transaction unique : arret et annulation au premier
--             echec (equivalent PostgreSQL de WHENEVER SQLERROR EXIT 1)
--
-- NOTE : pas de cle etrangere entre tables de modules differents
--        (cf. docs/adr/0005) ; l'effacement d'un joueur est propage par
--        l'evenement de domaine UserDeleted
--

-- Activation de PostGIS (zones geographiques des defis, filtre par region)
CREATE EXTENSION IF NOT EXISTS postgis;

-- ---------------------------------------------------------------------------
-- Module Identite
-- ---------------------------------------------------------------------------

-- Comptes : joueurs, invites (sans identifiants) et administrateurs
CREATE TABLE users
(
  id UUID NOT NULL,
  email VARCHAR(254),
  password_hash VARCHAR(255),
  display_name VARCHAR(30) NOT NULL,
  avatar VARCHAR(30) NOT NULL,
  role VARCHAR(10) NOT NULL,
  is_guest BOOLEAN NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  last_login_at TIMESTAMPTZ,
  version INTEGER NOT NULL,
  CONSTRAINT users_pk PRIMARY KEY (id),
  CONSTRAINT users_role_ck CHECK (role IN ('PLAYER', 'ADMIN')),
  CONSTRAINT users_credentials_ck CHECK ((is_guest = TRUE) OR ((email IS NOT NULL) AND (password_hash IS NOT NULL)))
);

-- Unicite de l'adresse e-mail (stockee en minuscules par le domaine)
CREATE UNIQUE INDEX users_email_uk ON users (email);

COMMENT ON TABLE users IS 'Comptes joueurs, invites et administrateurs';

-- ---------------------------------------------------------------------------
-- Module Defis
-- ---------------------------------------------------------------------------

-- Definition des missions (la reponse attendue est dans validation_spec)
CREATE TABLE challenges
(
  id UUID NOT NULL,
  title VARCHAR(120) NOT NULL,
  riddle VARCHAR(2000) NOT NULL,
  difficulty VARCHAR(20) NOT NULL,
  theme VARCHAR(20) NOT NULL,
  zone_label VARCHAR(120),
  zone JSONB,
  zone_area GEOGRAPHY(POLYGON, 4326),
  period_from DATE,
  period_to DATE,
  hints JSONB NOT NULL,
  reward_points INTEGER NOT NULL,
  reward_xp INTEGER NOT NULL,
  time_limit_seconds INTEGER,
  max_attempts INTEGER,
  validation_spec JSONB NOT NULL,
  reference_photo JSONB,
  status VARCHAR(10) NOT NULL,
  available_from TIMESTAMPTZ,
  available_to TIMESTAMPTZ,
  replayable BOOLEAN NOT NULL,
  daily_eligible BOOLEAN NOT NULL,
  disabled_reason VARCHAR(500),
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  published_at TIMESTAMPTZ,
  version INTEGER NOT NULL,
  CONSTRAINT challenges_pk PRIMARY KEY (id),
  CONSTRAINT challenges_status_ck CHECK (status IN ('DRAFT', 'PUBLISHED', 'DISABLED')),
  CONSTRAINT challenges_difficulty_ck CHECK (difficulty IN ('EASY', 'INTERMEDIATE', 'HARD', 'EXPERT')),
  CONSTRAINT challenges_reward_ck CHECK ((reward_points >= 0) AND (reward_xp >= 0)),
  CONSTRAINT challenges_period_ck CHECK ((period_from IS NULL) OR (period_to IS NULL) OR (period_from <= period_to)),
  CONSTRAINT challenges_availability_ck CHECK ((available_from IS NULL) OR (available_to IS NULL) OR (available_from < available_to))
);

-- Catalogue joueur : filtre sur statut, difficulte et thematique
CREATE INDEX challenges_catalog_ix ON challenges (status, difficulty, theme);

-- Filtre par region : intersection spatiale de la zone publique
CREATE INDEX challenges_zone_area_gix ON challenges USING GIST (zone_area);

COMMENT ON COLUMN challenges.validation_spec IS 'Criteres de validation secrets (arbre de regles JSON)';
COMMENT ON COLUMN challenges.zone_area IS 'Zone publique en geographie PostGIS, calculee depuis zone';

-- Planning du defi quotidien : un defi par journee de jeu
CREATE TABLE daily_challenges
(
  game_day DATE NOT NULL,
  challenge_id UUID NOT NULL,
  assignment VARCHAR(10) NOT NULL,
  assigned_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT daily_challenges_pk PRIMARY KEY (game_day),
  CONSTRAINT daily_challenges_challenge_fk FOREIGN KEY (challenge_id) REFERENCES challenges (id),
  CONSTRAINT daily_challenges_assignment_ck CHECK (assignment IN ('MANUAL', 'AUTO'))
);

-- ---------------------------------------------------------------------------
-- Module Gameplay
-- ---------------------------------------------------------------------------

-- Parties : participation d'un joueur a un defi (conditions figees dans terms)
CREATE TABLE game_sessions
(
  id UUID NOT NULL,
  player_id UUID NOT NULL,
  challenge_id UUID NOT NULL,
  mode VARCHAR(10) NOT NULL,
  game_day DATE NOT NULL,
  status VARCHAR(12) NOT NULL,
  terms JSONB NOT NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  active_elapsed_ms BIGINT NOT NULL,
  running_since TIMESTAMPTZ,
  deadline_at TIMESTAMPTZ,
  hints_used INTEGER NOT NULL,
  attempts JSONB NOT NULL,
  score JSONB,
  points INTEGER NOT NULL,
  xp_awarded INTEGER NOT NULL,
  version INTEGER NOT NULL,
  CONSTRAINT game_sessions_pk PRIMARY KEY (id),
  CONSTRAINT game_sessions_mode_ck CHECK (mode IN ('DAILY', 'CATALOG')),
  CONSTRAINT game_sessions_status_ck CHECK (status IN ('IN_PROGRESS', 'PAUSED', 'VALIDATED', 'FAILED', 'EXPIRED', 'ABANDONED'))
);

-- Une seule partie active par joueur et par defi
CREATE UNIQUE INDEX game_sessions_active_uk ON game_sessions (player_id, challenge_id) WHERE (status IN ('IN_PROGRESS', 'PAUSED'));

-- Un seul defi quotidien par joueur et par journee de jeu
CREATE UNIQUE INDEX game_sessions_daily_uk ON game_sessions (player_id, game_day) WHERE (mode = 'DAILY');

-- Historique des parties d'un joueur
CREATE INDEX game_sessions_history_ix ON game_sessions (player_id, started_at DESC);

-- Recherche des parties a expirer par le traitement periodique
CREATE INDEX game_sessions_deadline_ix ON game_sessions (deadline_at) WHERE (status = 'IN_PROGRESS');

-- Statistiques de participation par defi
CREATE INDEX game_sessions_challenge_ix ON game_sessions (challenge_id, status);

-- ---------------------------------------------------------------------------
-- Module Progression
-- ---------------------------------------------------------------------------

-- Progression : XP, points, statistiques, serie quotidienne et badges
CREATE TABLE player_progress
(
  player_id UUID NOT NULL,
  xp INTEGER NOT NULL,
  points INTEGER NOT NULL,
  stats JSONB NOT NULL,
  current_streak INTEGER NOT NULL,
  best_streak INTEGER NOT NULL,
  last_daily_day DATE,
  achievements JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  version INTEGER NOT NULL,
  CONSTRAINT player_progress_pk PRIMARY KEY (player_id)
);

-- Registre des recompenses : une ligne par partie comptabilisee (idempotence)
CREATE TABLE reward_ledger
(
  session_id UUID NOT NULL,
  player_id UUID NOT NULL,
  points INTEGER NOT NULL,
  xp INTEGER NOT NULL,
  game_day DATE NOT NULL,
  awarded_at TIMESTAMPTZ NOT NULL,
  CONSTRAINT reward_ledger_pk PRIMARY KEY (session_id)
);

-- Reconstruction des classements par joueur et par periode
CREATE INDEX reward_ledger_player_ix ON reward_ledger (player_id, game_day);

COMMENT ON TABLE reward_ledger IS 'Source de verite des points ; les classements Redis en sont une projection';

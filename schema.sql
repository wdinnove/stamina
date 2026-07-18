-- ================================================================
-- STAMINA — Schéma Supabase
-- ================================================================
--
-- Structure :
--   1.  Enums
--   2.  Fonction utilitaire updated_at
--   3.  Organizations
--   4.  Teams
--   5.  Seasons
--   6.  Profiles  (+ trigger handle_new_user)
--   7.  Staff
--   8.  Players
--   9.  Player Season
--   10. Training Sessions
--   11. Session Blocks
--   12. RPE Entries
--   13. Wellness Entries
--   14. Medical Records  (+ vue medical_records_full)
--   15. Player Actions
--   16. Matches
--   17. Match Stats
--   17b. Opponent Match Stats
--   18. Team Match Stats  (+ vue team_match_stats_full)
--   19. Staff Meetings
--   20. Training Attendance
--   20b. Session Documents
--   21. Notifications
--   21b. Exercises
--   22. Row Level Security
--   22b. Storage — Buckets (player-photos, session-documents, exercises)
--   23. Fonctions SECURITY DEFINER
--   MIGRATION — commandes pour bases existantes
--
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ────────────────────────────────────────────────────────────────

CREATE TYPE player_status       AS ENUM ('active', 'injured', 'limited', 'suspended', 'unavailable');
CREATE TYPE basketball_position AS ENUM ('Meneur', 'Arrière', 'Ailier', 'Ailier Fort', 'Pivot');
CREATE TYPE session_type        AS ENUM ('training', 'match', 'gym', 'rest');
CREATE TYPE block_intensity     AS ENUM ('basse', 'moyenne', 'haute', 'très élevée');
CREATE TYPE medical_type        AS ENUM ('injury', 'checkup', 'treatment');
CREATE TYPE medical_severity    AS ENUM ('mild', 'moderate', 'severe');
CREATE TYPE medical_status      AS ENUM ('active', 'resolved');
CREATE TYPE action_status       AS ENUM ('todo', 'in_progress', 'waiting', 'done');
CREATE TYPE action_priority     AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE action_category     AS ENUM (
  'medical', 'physical', 'mental', 'tactical',
  'administrative', 'interview', 'video', 'discussion'
);
CREATE TYPE home_away           AS ENUM ('home', 'away');
CREATE TYPE match_result        AS ENUM ('win', 'loss');


-- ────────────────────────────────────────────────────────────────
-- 2. FONCTION UTILITAIRE updated_at
--    Réutilisée par tous les triggers BEFORE UPDATE
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 3. ORGANIZATIONS
--    Niveau club (ex : "AL Meyzieu")
-- ────────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  address    TEXT,
  city       TEXT,
  phone      TEXT,
  email      TEXT,
  website    TEXT,
  logo_url   TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────
-- 4. TEAMS
-- ────────────────────────────────────────────────────────────────

CREATE TABLE teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID    NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT    NOT NULL,
  category        TEXT    NOT NULL,  -- 'NF2', 'U21', 'U18'
  color           TEXT    NOT NULL DEFAULT '#3B82F6',
  description     TEXT,
  load_light_max     INTEGER  NOT NULL DEFAULT 2750,
  load_normal_max    INTEGER  NOT NULL DEFAULT 4250,
  sessions_per_week  SMALLINT NOT NULL DEFAULT 3,
  eval_t_orange   NUMERIC NOT NULL DEFAULT 0,
  eval_t_blue     NUMERIC NOT NULL DEFAULT 5,
  eval_t_green    NUMERIC NOT NULL DEFAULT 10,
  ortg_t_amber    NUMERIC NOT NULL DEFAULT 60,
  ortg_t_green    NUMERIC NOT NULL DEFAULT 90,
  drtg_t_amber    NUMERIC NOT NULL DEFAULT 100,
  drtg_t_red      NUMERIC NOT NULL DEFAULT 115,
  default_wellness_method TEXT NOT NULL DEFAULT 'detailed'
                    CHECK (default_wellness_method IN ('detailed', 'emoji', 'single')),
  public_wellness_method  TEXT NOT NULL DEFAULT 'detailed'
                    CHECK (public_wellness_method  IN ('detailed', 'emoji', 'single')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────
-- 5. SEASONS
--    Entité indépendante avec bornes de date ; rattachée à une équipe
-- ────────────────────────────────────────────────────────────────

CREATE TABLE seasons (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID     NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  label       TEXT     NOT NULL,     -- '2025/2026'
  start_date  DATE     NOT NULL,
  end_date    DATE     NOT NULL,
  total_games SMALLINT,              -- nb de journées au calendrier
  is_current  BOOLEAN  NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (team_id, label),
  CONSTRAINT season_dates_valid CHECK (end_date > start_date)
);

-- Une seule saison courante par équipe
CREATE UNIQUE INDEX one_current_season_per_team
  ON seasons (team_id)
  WHERE is_current = TRUE;


-- ────────────────────────────────────────────────────────────────
-- 6. PROFILES
--    Extension de auth.users — comptes staff de l'application
--    org_role : rôle dans l'organisation
--      'admin'  → accès total (dont configuration club)
--      'editor' → accès standard (sans configuration club)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'staff'   -- 'admin' | 'coach' | 'staff' | 'medical'
                    CHECK (role IN ('admin', 'coach', 'staff', 'medical')),
  org_role        TEXT NOT NULL DEFAULT 'editor'  -- 'admin' | 'editor'
                    CHECK (org_role IN ('admin', 'editor')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Création automatique du profil à l'inscription Supabase Auth
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, organization_id, first_name, last_name, role, org_role)
  VALUES (
    NEW.id,
    (NEW.raw_user_meta_data->>'organization_id')::UUID,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',  ''),
    COALESCE(NEW.raw_user_meta_data->>'role',     'staff'),
    COALESCE(NEW.raw_user_meta_data->>'org_role', 'editor')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ────────────────────────────────────────────────────────────────
-- 7. STAFF
--    Intervenants ; peut exister sans compte app (profile_id NULL)
--    role : 'coach' | 'kine' | 'medecin' | 'prep_physique' | 'assistant' | 'autre'
-- ────────────────────────────────────────────────────────────────

CREATE TABLE staff (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  first_name TEXT NOT NULL,
  last_name  TEXT NOT NULL,
  role       TEXT NOT NULL
               CHECK (role IN ('coach', 'kine', 'medecin', 'prep_physique', 'assistant', 'autre')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON staff (team_id);


-- ────────────────────────────────────────────────────────────────
-- 8. PLAYERS
--    Rattachés à l'organisation (pas directement à une équipe)
--    L'affectation à une saison passe par player_season
-- ────────────────────────────────────────────────────────────────

CREATE TABLE players (
  id                 UUID               PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID               NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name         TEXT               NOT NULL,
  last_name          TEXT               NOT NULL,
  number             SMALLINT           NOT NULL,
  position           basketball_position NOT NULL,
  secondary_position basketball_position,
  status             player_status      NOT NULL DEFAULT 'active',
  nationality        CHAR(2)            NOT NULL DEFAULT 'FR',
  birth_date         DATE               NOT NULL,
  height_cm          SMALLINT           CHECK (height_cm BETWEEN 140 AND 230),
  weight_kg          SMALLINT           CHECK (weight_kg BETWEEN 40  AND 150),
  hand               TEXT               NOT NULL DEFAULT 'right'
                       CHECK (hand IN ('right', 'left', 'both')),
  contract_end       DATE,
  avatar_url         TEXT,
  email              TEXT,
  photo_url          TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON players (organization_id);

CREATE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────
-- 9. PLAYER SEASON
--    Inscription d'une joueuse à une saison
--    Contrainte d'unicité : une joueuse par saison max
-- ────────────────────────────────────────────────────────────────

CREATE TABLE player_season (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  season_id  UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (player_id, season_id)
);

CREATE INDEX ON player_season (season_id);


-- ────────────────────────────────────────────────────────────────
-- 10. TRAINING SESSIONS
--     Entité centrale du RPE : le coach crée UNE session,
--     chaque joueuse y soumet son RPE individuellement
-- ────────────────────────────────────────────────────────────────

CREATE TABLE training_sessions (
  id               UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID         NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id        UUID         NOT NULL REFERENCES seasons(id),
  date             DATE         NOT NULL,
  session_type     session_type NOT NULL,
  planned_duration SMALLINT     NOT NULL CHECK (planned_duration BETWEEN 1 AND 300),
  notes            TEXT,
  partner_count    SMALLINT     NOT NULL DEFAULT 0,
  partner_names    TEXT,
  created_by       UUID         REFERENCES profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX ON training_sessions (team_id, date DESC);


-- ────────────────────────────────────────────────────────────────
-- 11. SESSION BLOCKS
--     Contenu structuré d'une séance (blocs d'exercices)
--     load_ua GENERATED : durée × coefficient d'intensité
--     drill_id : FK nullable, réservée à la future table drills
-- ────────────────────────────────────────────────────────────────

CREATE TABLE session_blocks (
  id         UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID            NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  position   SMALLINT        NOT NULL DEFAULT 1,
  duration   SMALLINT        NOT NULL CHECK (duration > 0),  -- minutes
  category   TEXT            NOT NULL,  -- 'Échauffement', 'Jeu réduit'…
  intensity  block_intensity NOT NULL DEFAULT 'moyenne',
  label       TEXT            NOT NULL,  -- nom de l'exercice
  description TEXT            NULL,      -- description propre à cette occurrence (copiée depuis la bibliothèque si liée, modifiable sans impact)
  consignes   TEXT            NULL,      -- instructions spécifiques à cette occurrence du bloc dans la séance
  drill_id    UUID            NULL,      -- FK future : REFERENCES drills(id)
  -- Charge UA = durée × valeur intensité (basse=2, moyenne=5, haute=7, très élevée=9)
  load_ua    SMALLINT GENERATED ALWAYS AS (
    duration * CASE intensity
      WHEN 'basse'       THEN 2
      WHEN 'moyenne'     THEN 5
      WHEN 'haute'       THEN 7
      WHEN 'très élevée' THEN 9
      ELSE 5
    END
  ) STORED,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON session_blocks (session_id, position);


-- ────────────────────────────────────────────────────────────────
-- 11b. SESSION TEAMS
--      Répartition ad-hoc de l'effectif en équipes pour des jeux
--      réduits / sparrings lors d'une séance. Plusieurs blocs possibles
--      par séance (ex. "Bloc 1" en 3x3, "Bloc 2" en 5x5), chacun avec
--      son propre découpage en équipes. Un joueur peut donc être dans
--      des équipes différentes selon le bloc, mais une seule équipe
--      au sein d'un même bloc. À l'enregistrement, l'existant est
--      remplacé (delete + insert), pas d'historique de versions.
-- ────────────────────────────────────────────────────────────────

CREATE TABLE session_team_blocks (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  label      TEXT NOT NULL DEFAULT 'Bloc 1',
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON session_team_blocks (session_id, position);

CREATE TABLE session_teams (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id   UUID NOT NULL REFERENCES session_team_blocks(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,  -- dénormalisé pour simplifier les policies RLS
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON session_teams (block_id, position);

CREATE TABLE session_team_players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  block_id        UUID NOT NULL REFERENCES session_team_blocks(id) ON DELETE CASCADE,
  session_id      UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  session_team_id UUID NOT NULL REFERENCES session_teams(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (block_id, player_id)  -- un joueur n'appartient qu'à une seule équipe au sein d'un même bloc
);

CREATE INDEX ON session_team_players (session_team_id);


-- ────────────────────────────────────────────────────────────────
-- 12. RPE ENTRIES
--     UNIQUE (session_id, player_id) : une entrée par joueuse par session
--     Absence = absence de ligne (pas de valeur NULL)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE rpe_entries (
  id              UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID     NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  player_id       UUID     NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rpe             SMALLINT NOT NULL CHECK (rpe BETWEEN 1 AND 10),
  actual_duration SMALLINT          CHECK (actual_duration BETWEEN 1 AND 300),
  notes           TEXT,
  created_by      UUID     REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (session_id, player_id)
);

CREATE INDEX ON rpe_entries (player_id, created_at DESC);
CREATE INDEX ON rpe_entries (session_id);


-- ────────────────────────────────────────────────────────────────
-- 13. WELLNESS ENTRIES
--     score GENERATED : fatigue / stress / soreness sont des
--     métriques INVERSÉES (8 de fatigue = mauvais → score bas)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE wellness_entries (
  id         UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id  UUID     NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date       DATE     NOT NULL,
  fatigue    SMALLINT NOT NULL CHECK (fatigue    BETWEEN 1 AND 10),
  mood       SMALLINT NOT NULL CHECK (mood       BETWEEN 1 AND 10),
  stress     SMALLINT NOT NULL CHECK (stress     BETWEEN 1 AND 10),
  motivation SMALLINT NOT NULL CHECK (motivation BETWEEN 1 AND 10),
  sleep      SMALLINT NOT NULL CHECK (sleep      BETWEEN 1 AND 10),
  soreness   SMALLINT NOT NULL CHECK (soreness   BETWEEN 1 AND 10),

  -- Score 0–10 : métriques inversées (11 - v) pour rester cohérent avec la coloration client (wellnessDimColor)
  score      NUMERIC(3,1) GENERATED ALWAYS AS (
    ROUND(
      ((11 - fatigue) + mood + (11 - stress) + motivation + sleep + (11 - soreness))::NUMERIC / 6,
      1
    )
  ) STORED,

  notes      TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (player_id, date)
);

CREATE INDEX ON wellness_entries (player_id, date DESC);


-- ────────────────────────────────────────────────────────────────
-- 14. MEDICAL RECORDS
--     resolved_date remplace days_absent (calculable : resolved_date - date)
--     Contrainte : un dossier resolved doit avoir une resolved_date
-- ────────────────────────────────────────────────────────────────

CREATE TABLE medical_records (
  id            UUID             PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID             NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date          DATE             NOT NULL,
  type          medical_type     NOT NULL,
  description   TEXT             NOT NULL,
  location      TEXT,
  severity      medical_severity,
  status        medical_status   NOT NULL DEFAULT 'active',
  rtp_date      DATE,
  resolved_date DATE,
  rtp_step      SMALLINT DEFAULT 0 CHECK (rtp_step  >= 0),
  rtp_total     SMALLINT DEFAULT 6 CHECK (rtp_total  > 0),
  treatment     TEXT,
  created_by    UUID REFERENCES staff(id) ON DELETE SET NULL,
  updated_by    UUID REFERENCES staff(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rtp_step_valid      CHECK (rtp_step IS NULL OR rtp_total IS NULL OR rtp_step <= rtp_total),
  CONSTRAINT resolved_needs_date CHECK (status != 'resolved' OR resolved_date IS NOT NULL)
);

CREATE INDEX ON medical_records (player_id, status, date DESC);
CREATE INDEX ON medical_records (status) WHERE status = 'active';

CREATE TRIGGER trg_medical_records_updated_at
  BEFORE UPDATE ON medical_records
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vue utilitaire : jours d'absence calculés depuis les dates
CREATE VIEW medical_records_full AS
SELECT
  *,
  CASE
    WHEN type = 'injury' AND resolved_date IS NOT NULL THEN resolved_date - date
    WHEN type = 'injury' AND rtp_date      IS NOT NULL THEN rtp_date      - date
    ELSE NULL
  END AS days_absent
FROM medical_records;


-- ────────────────────────────────────────────────────────────────
-- 15. PLAYER ACTIONS
--     assigned_to → staff (supporte les intervenants sans compte app)
--     completed_at : renseigné automatiquement par trigger
-- ────────────────────────────────────────────────────────────────

CREATE TABLE player_actions (
  id           UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID            REFERENCES players(id) ON DELETE CASCADE,
  title        TEXT            NOT NULL,
  description  TEXT,
  category     action_category,
  priority     action_priority NOT NULL DEFAULT 'normal',
  due_date     DATE            NOT NULL,
  assigned_to  UUID            REFERENCES staff(id) ON DELETE SET NULL,
  status       action_status   NOT NULL DEFAULT 'todo',
  completed_at TIMESTAMPTZ,
  created_by   UUID            REFERENCES profiles(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX ON player_actions (player_id, status, due_date);
CREATE INDEX ON player_actions (assigned_to, status);
CREATE INDEX ON player_actions (due_date) WHERE status != 'done';

CREATE TRIGGER trg_player_actions_updated_at
  BEFORE UPDATE ON player_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- completed_at automatique via trigger
CREATE OR REPLACE FUNCTION set_action_completed_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status = 'done' AND (OLD.status IS DISTINCT FROM 'done') THEN
    NEW.completed_at = NOW();
  ELSIF NEW.status != 'done' THEN
    NEW.completed_at = NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_action_completed_at
  BEFORE UPDATE ON player_actions
  FOR EACH ROW EXECUTE FUNCTION set_action_completed_at();


-- ────────────────────────────────────────────────────────────────
-- 16. MATCHES
--     Source de vérité : date / adversaire / résultat / score
--     game_number = numéro de journée (J14, J13…)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE matches (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID         NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id   UUID         NOT NULL REFERENCES seasons(id),
  game_number SMALLINT,
  date        DATE         NOT NULL,
  opponent    TEXT         NOT NULL,
  home_away   home_away    NOT NULL DEFAULT 'home',
  competition TEXT         NOT NULL DEFAULT 'NF2',
  result      match_result NOT NULL,
  score_us       SMALLINT     NOT NULL CHECK (score_us   >= 0),
  score_them     SMALLINT     NOT NULL CHECK (score_them >= 0),
  quarter_scores JSONB,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),

  UNIQUE (team_id, date, opponent)
);

CREATE INDEX ON matches (team_id, season_id, date DESC);

CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────
-- 17. MATCH STATS (statistiques individuelles)
--     pts : GENERATED (fg2m×2 + fg3m×3 + ftm)
--     intercepts : renommé depuis int (mot-clé PostgreSQL réservé)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE match_stats (
  id          UUID     PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID     NOT NULL REFERENCES matches(id)  ON DELETE CASCADE,
  player_id   UUID     NOT NULL REFERENCES players(id)  ON DELETE CASCADE,
  date        DATE     NOT NULL,
  opponent    TEXT     NOT NULL,
  home_away   TEXT     NOT NULL CHECK (home_away IN ('home', 'away')),
  competition TEXT,
  result      TEXT     CHECK (result IN ('win', 'loss')),
  score_us    SMALLINT,
  score_them  SMALLINT,
  starter     BOOLEAN  NOT NULL DEFAULT FALSE,
  min         NUMERIC(4,1) NOT NULL DEFAULT 0,

  fg2m       SMALLINT NOT NULL DEFAULT 0,
  fg2a       SMALLINT NOT NULL DEFAULT 0,
  fg3m       SMALLINT NOT NULL DEFAULT 0,
  fg3a       SMALLINT NOT NULL DEFAULT 0,
  ftm        SMALLINT NOT NULL DEFAULT 0,
  fta        SMALLINT NOT NULL DEFAULT 0,

  pts        SMALLINT GENERATED ALWAYS AS (fg2m * 2 + fg3m * 3 + ftm) STORED,

  ro         SMALLINT NOT NULL DEFAULT 0,
  rd         SMALLINT NOT NULL DEFAULT 0,

  pd         SMALLINT NOT NULL DEFAULT 0,
  ct         SMALLINT NOT NULL DEFAULT 0,
  intercepts SMALLINT NOT NULL DEFAULT 0,
  bp         SMALLINT NOT NULL DEFAULT 0,

  fpr        SMALLINT NOT NULL DEFAULT 0,  -- fautes commises
  fte        SMALLINT NOT NULL DEFAULT 0,  -- fautes reçues

  eval       SMALLINT,
  plus_minus SMALLINT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (match_id, player_id),
  CONSTRAINT fg2_coherent CHECK (fg2m <= fg2a),
  CONSTRAINT fg3_coherent CHECK (fg3m <= fg3a),
  CONSTRAINT ft_coherent  CHECK (ftm  <= fta)
);

CREATE INDEX ON match_stats (player_id, match_id);
CREATE INDEX ON match_stats (match_id);

CREATE TRIGGER trg_match_stats_updated_at
  BEFORE UPDATE ON match_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────
-- 17b. OPPONENT MATCH STATS (statistiques adverses individuelles)
--      Saisie manuelle des stats des joueuses adverses par match
-- ────────────────────────────────────────────────────────────────

CREATE TABLE opponent_match_stats (
  id          UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id    UUID         NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_name TEXT         NOT NULL,
  min         NUMERIC(4,1) NOT NULL DEFAULT 0,

  fg2m       SMALLINT NOT NULL DEFAULT 0,
  fg2a       SMALLINT NOT NULL DEFAULT 0,
  fg3m       SMALLINT NOT NULL DEFAULT 0,
  fg3a       SMALLINT NOT NULL DEFAULT 0,
  ftm        SMALLINT NOT NULL DEFAULT 0,
  fta        SMALLINT NOT NULL DEFAULT 0,

  pts        SMALLINT GENERATED ALWAYS AS (fg2m * 2 + fg3m * 3 + ftm) STORED,

  ro         SMALLINT NOT NULL DEFAULT 0,
  rd         SMALLINT NOT NULL DEFAULT 0,
  pd         SMALLINT NOT NULL DEFAULT 0,
  ct         SMALLINT NOT NULL DEFAULT 0,
  intercepts SMALLINT NOT NULL DEFAULT 0,
  bp         SMALLINT NOT NULL DEFAULT 0,
  fte        SMALLINT NOT NULL DEFAULT 0,
  fpr        SMALLINT NOT NULL DEFAULT 0,

  eval       SMALLINT,
  plus_minus SMALLINT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT opp_fg2_coherent CHECK (fg2m <= fg2a),
  CONSTRAINT opp_fg3_coherent CHECK (fg3m <= fg3a),
  CONSTRAINT opp_ft_coherent  CHECK (ftm  <= fta)
);

CREATE INDEX ON opponent_match_stats (match_id);


-- ────────────────────────────────────────────────────────────────
-- 18. TEAM MATCH STATS (statistiques collectives)
--     1:1 avec matches (UNIQUE match_id)
--     Métriques avancées : toutes GENERATED depuis stats brutes
--     off_rating / def_rating : dans la VIEW (nécessite score matches)
--     intercepts / opp_intercepts : renommés depuis int / opp_int
-- ────────────────────────────────────────────────────────────────

CREATE TABLE team_match_stats (
  id       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE UNIQUE,

  fg2m       SMALLINT NOT NULL DEFAULT 0,
  fg2a       SMALLINT NOT NULL DEFAULT 0,
  fg3m       SMALLINT NOT NULL DEFAULT 0,
  fg3a       SMALLINT NOT NULL DEFAULT 0,
  ftm        SMALLINT NOT NULL DEFAULT 0,
  fta        SMALLINT NOT NULL DEFAULT 0,
  ro         SMALLINT NOT NULL DEFAULT 0,
  rd         SMALLINT NOT NULL DEFAULT 0,
  rt         SMALLINT GENERATED ALWAYS AS (ro + rd) STORED,
  pd         SMALLINT NOT NULL DEFAULT 0,
  ct         SMALLINT NOT NULL DEFAULT 0,
  intercepts SMALLINT NOT NULL DEFAULT 0,
  bp         SMALLINT NOT NULL DEFAULT 0,
  fte        SMALLINT NOT NULL DEFAULT 0,
  fpr        SMALLINT NOT NULL DEFAULT 0,

  possessions     NUMERIC(5,1) NOT NULL DEFAULT 0,
  opp_possessions NUMERIC(5,1),

  opp_fg2m       SMALLINT NOT NULL DEFAULT 0,
  opp_fg2a       SMALLINT NOT NULL DEFAULT 0,
  opp_fg3m       SMALLINT NOT NULL DEFAULT 0,
  opp_fg3a       SMALLINT NOT NULL DEFAULT 0,
  opp_ftm        SMALLINT NOT NULL DEFAULT 0,
  opp_fta        SMALLINT NOT NULL DEFAULT 0,
  opp_ro         SMALLINT NOT NULL DEFAULT 0,
  opp_rd         SMALLINT NOT NULL DEFAULT 0,
  opp_rt         SMALLINT GENERATED ALWAYS AS (opp_ro + opp_rd) STORED,
  opp_pd         SMALLINT NOT NULL DEFAULT 0,
  opp_ct         SMALLINT NOT NULL DEFAULT 0,
  opp_intercepts SMALLINT NOT NULL DEFAULT 0,
  opp_bp         SMALLINT NOT NULL DEFAULT 0,
  opp_fte        SMALLINT NOT NULL DEFAULT 0,
  opp_fpr        SMALLINT NOT NULL DEFAULT 0,

  efg_pct      NUMERIC(4,1) GENERATED ALWAYS AS (
    CASE WHEN (fg2a + fg3a) > 0
    THEN ROUND((fg2m + fg3m * 1.5)::NUMERIC / (fg2a + fg3a) * 100, 1)
    ELSE NULL END
  ) STORED,

  ft_rate      NUMERIC(4,2) GENERATED ALWAYS AS (
    CASE WHEN (fg2a + fg3a) > 0
    THEN ROUND(fta::NUMERIC / (fg2a + fg3a), 2)
    ELSE NULL END
  ) STORED,

  to_pct       NUMERIC(4,1) GENERATED ALWAYS AS (
    CASE WHEN possessions > 0
    THEN ROUND(bp::NUMERIC / possessions * 100, 1)
    ELSE NULL END
  ) STORED,

  oreb_pct     NUMERIC(4,1) GENERATED ALWAYS AS (
    CASE WHEN (ro + opp_rd) > 0
    THEN ROUND(ro::NUMERIC / (ro + opp_rd) * 100, 1)
    ELSE NULL END
  ) STORED,

  dreb_pct     NUMERIC(4,1) GENERATED ALWAYS AS (
    CASE WHEN (rd + opp_ro) > 0
    THEN ROUND(rd::NUMERIC / (rd + opp_ro) * 100, 1)
    ELSE NULL END
  ) STORED,

  opp_efg_pct  NUMERIC(4,1) GENERATED ALWAYS AS (
    CASE WHEN (opp_fg2a + opp_fg3a) > 0
    THEN ROUND((opp_fg2m + opp_fg3m * 1.5)::NUMERIC / (opp_fg2a + opp_fg3a) * 100, 1)
    ELSE NULL END
  ) STORED,

  opp_to_pct   NUMERIC(4,1) GENERATED ALWAYS AS (
    CASE WHEN opp_possessions > 0
    THEN ROUND(opp_bp::NUMERIC / opp_possessions * 100, 1)
    ELSE NULL END
  ) STORED,

  opp_oreb_pct NUMERIC(4,1) GENERATED ALWAYS AS (
    CASE WHEN (opp_ro + rd) > 0
    THEN ROUND(opp_ro::NUMERIC / (opp_ro + rd) * 100, 1)
    ELSE NULL END
  ) STORED,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_team_match_stats_updated_at
  BEFORE UPDATE ON team_match_stats
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Vue : ajoute off_rating / def_rating (nécessite le score de matches)
CREATE VIEW team_match_stats_full AS
SELECT
  tms.*,
  m.score_us,
  m.score_them,
  m.date,
  m.opponent,
  m.home_away,
  m.competition,
  m.result,
  m.game_number,
  m.team_id,
  m.season_id,
  CASE WHEN tms.possessions > 0
    THEN ROUND(m.score_us::NUMERIC   / tms.possessions * 100, 1)
    ELSE NULL END AS off_rating,
  CASE WHEN tms.possessions > 0
    THEN ROUND(m.score_them::NUMERIC / tms.possessions * 100, 1)
    ELSE NULL END AS def_rating
FROM team_match_stats tms
JOIN matches m ON m.id = tms.match_id;


-- ────────────────────────────────────────────────────────────────
-- 19. STAFF MEETINGS
-- ────────────────────────────────────────────────────────────────

CREATE TABLE staff_meetings (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  date       DATE NOT NULL,
  time       TIME NOT NULL,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────
-- 20. TRAINING ATTENDANCE
-- ────────────────────────────────────────────────────────────────

CREATE TABLE training_attendance (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id)           ON DELETE CASCADE,
  status     TEXT NOT NULL CHECK (status IN ('present', 'absent', 'late')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (session_id, player_id)
);


-- ────────────────────────────────────────────────────────────────
-- 20b. SESSION DOCUMENTS
--      Fichiers attachés à une séance (vidéo, PDF, image…)
--      Stockés dans le bucket Supabase Storage 'session-documents'
-- ────────────────────────────────────────────────────────────────

CREATE TABLE session_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  name         TEXT NOT NULL,
  mime_type    TEXT,
  size         INTEGER,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON session_documents (session_id);


-- ────────────────────────────────────────────────────────────────
-- 21. NOTIFICATIONS
--     Centre de notifications par user ; temps réel via Supabase Realtime
-- ────────────────────────────────────────────────────────────────

CREATE TABLE notifications (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id         UUID NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  created_by      UUID REFERENCES auth.users(id),
  type            TEXT NOT NULL,  -- ex : 'player_added', 'medical_resolved'
  title           TEXT NOT NULL,
  body            TEXT,
  entity_type     TEXT,           -- ex : 'player', 'medical_record', 'session'
  entity_id       UUID,
  read_at         TIMESTAMPTZ,    -- NULL = non lu
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_notifications_user_created ON notifications (user_id, created_at DESC);
CREATE INDEX idx_notifications_unread       ON notifications (user_id) WHERE read_at IS NULL;

ALTER PUBLICATION supabase_realtime ADD TABLE notifications;


-- ────────────────────────────────────────────────────────────────
-- 21b. EXERCISES
--      Bibliothèque d'exercices de l'équipe
--      Images stockées dans le bucket Supabase Storage 'exercises'
-- ────────────────────────────────────────────────────────────────

CREATE TABLE exercise_categories (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  color      TEXT NOT NULL,
  position   SMALLINT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, name)
);

CREATE INDEX ON exercise_categories (team_id);

CREATE TABLE exercises (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       UUID REFERENCES teams(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT,
  consignes     TEXT,  -- consignes par défaut, copiées dans le bloc de séance à l'ajout (modifiables sans impacter la bibliothèque)
  category_id   UUID REFERENCES exercise_categories(id) ON DELETE SET NULL,
  document_url  TEXT,
  document_name TEXT,
  video_url     TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON exercises (team_id);

CREATE TABLE exercise_images (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  url         TEXT NOT NULL,
  position    SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON exercise_images (exercise_id);


-- ────────────────────────────────────────────────────────────────
-- 22. ROW LEVEL SECURITY
--     Cloisonnement par équipe / organisation (données de santé RGPD)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE players               ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_season         ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_blocks        ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_team_blocks   ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_team_players  ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpe_entries           ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellness_entries      ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records       ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_actions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches               ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_stats           ENABLE ROW LEVEL SECURITY;
ALTER TABLE opponent_match_stats  ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_match_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_meetings        ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_attendance   ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercises             ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_images       ENABLE ROW LEVEL SECURITY;
ALTER TABLE exercise_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications         ENABLE ROW LEVEL SECURITY;

-- ── Policies ─────────────────────────────────────────────────────

-- Profil : chaque utilisateur gère uniquement le sien
CREATE POLICY "own_profile" ON profiles
  FOR ALL TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Organisations : lecture pour tous les membres, écriture pour les admins uniquement
CREATE POLICY "org_access" ON organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_update" ON organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND org_role = 'admin'
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND org_role = 'admin'
    )
  );

-- Équipes : accès limité aux équipes de l'organisation
CREATE POLICY "team_access" ON teams
  FOR ALL TO authenticated
  USING (id IN (SELECT * FROM accessible_team_ids()))
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
  );

-- Saisons : suivent les équipes
CREATE POLICY "season_access" ON seasons
  FOR ALL TO authenticated
  USING    (team_id IN (SELECT * FROM accessible_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM accessible_team_ids()));

-- Joueuses : cloisonnement par organisation
CREATE POLICY "player_access" ON players
  FOR ALL TO authenticated
  USING    (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Inscription joueuse/saison
CREATE POLICY "player_season_access" ON player_season
  FOR ALL TO authenticated
  USING (
    season_id IN (SELECT id FROM seasons WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  )
  WITH CHECK (
    season_id IN (SELECT id FROM seasons WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

-- Sessions d'entraînement
CREATE POLICY "training_session_access" ON training_sessions
  FOR ALL TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

-- Blocs de séance
CREATE POLICY "session_blocks_access" ON session_blocks
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

-- Équipes du jour (sparring)
CREATE POLICY "session_team_blocks_access" ON session_team_blocks
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

CREATE POLICY "session_teams_access" ON session_teams
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

CREATE POLICY "session_team_players_access" ON session_team_players
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

-- RPE
CREATE POLICY "rpe_access" ON rpe_entries
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Wellness
CREATE POLICY "wellness_access" ON wellness_entries
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Dossiers médicaux
CREATE POLICY "medical_access" ON medical_records
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Actions joueurs (player_id et team_id sont tous deux optionnels : l'accès est
-- autorisé si l'un OU l'autre pointe vers l'organisation/équipe de l'utilisateur)
CREATE POLICY "action_access" ON player_actions
  FOR ALL TO authenticated
  USING (
    (player_id IS NOT NULL AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM accessible_team_ids()))
  )
  WITH CHECK (
    (player_id IS NOT NULL AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM accessible_team_ids()))
  );

-- Matches
CREATE POLICY "match_access" ON matches
  FOR ALL TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

-- Stats individuelles
CREATE POLICY "match_stats_access" ON match_stats
  FOR ALL TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

-- Stats collectives
CREATE POLICY "team_match_stats_access" ON team_match_stats
  FOR ALL TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

-- Staff
CREATE POLICY "staff_access" ON staff
  FOR ALL TO authenticated
  USING    (team_id IN (SELECT * FROM accessible_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM accessible_team_ids()));

-- Réunions staff
CREATE POLICY "staff_meetings_access" ON staff_meetings
  FOR ALL TO authenticated
  USING    (team_id IN (SELECT * FROM accessible_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM accessible_team_ids()));

-- Présences aux entraînements
CREATE POLICY "training_attendance_access" ON training_attendance
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

-- Notifications : chaque user accède uniquement aux siennes
CREATE POLICY "notifications_user_own" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Stats adverses
CREATE POLICY "opponent_match_stats_access" ON opponent_match_stats
  FOR ALL TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

-- Documents de séance
CREATE POLICY "session_documents_access" ON session_documents
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

-- Exercices
CREATE POLICY "exercises_access" ON exercises
  FOR ALL TO authenticated
  USING    (team_id IN (SELECT * FROM accessible_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM accessible_team_ids()));

-- Catégories d'exercices : par équipe
CREATE POLICY "exercise_categories_access" ON exercise_categories
  FOR ALL TO authenticated
  USING    (team_id IN (SELECT * FROM accessible_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM accessible_team_ids()));

-- Images d'exercices : suivent l'exercice parent
CREATE POLICY "exercise_images_access" ON exercise_images
  FOR ALL TO authenticated
  USING (
    exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  )
  WITH CHECK (
    exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );


-- ────────────────────────────────────────────────────────────────
-- 22b. STORAGE — Buckets
--      3 buckets : player-photos (public), session-documents (privé),
--                  exercises (public)
--      Créer chaque bucket via Dashboard Storage avant les policies
-- ────────────────────────────────────────────────────────────────

-- ── player-photos (public) ───────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('player-photos', 'player-photos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "player_photos_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'player-photos');

CREATE POLICY "player_photos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'player-photos');

CREATE POLICY "player_photos_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'player-photos');

CREATE POLICY "player_photos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'player-photos');

-- ── session-documents (privé — accès via URL signée) ─────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('session-documents', 'session-documents', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "session_documents_storage_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'session-documents');

CREATE POLICY "session_documents_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'session-documents');

CREATE POLICY "session_documents_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'session-documents');

-- ── exercises (public) ───────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('exercises', 'exercises', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "exercises_storage_select"
  ON storage.objects FOR SELECT TO public
  USING (bucket_id = 'exercises');

CREATE POLICY "exercises_storage_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'exercises');

CREATE POLICY "exercises_storage_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'exercises');

CREATE POLICY "exercises_storage_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'exercises');


-- ────────────────────────────────────────────────────────────────
-- 23. FONCTIONS SECURITY DEFINER
-- ────────────────────────────────────────────────────────────────

-- Helper RLS : équipes accessibles pour l'utilisateur courant
CREATE OR REPLACE FUNCTION accessible_team_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT t.id
  FROM   teams         t
  JOIN   organizations o ON o.id = t.organization_id
  JOIN   profiles      p ON p.organization_id = o.id
  WHERE  p.id = auth.uid()
$$;

-- Création de profil pour un nouveau compte staff
-- (SECURITY DEFINER contourne la RLS own_profile lors de l'invitation)
CREATE OR REPLACE FUNCTION upsert_staff_profile(
  p_id              UUID,
  p_organization_id UUID,
  p_first_name      TEXT,
  p_last_name       TEXT,
  p_role            TEXT
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, organization_id, first_name, last_name, role)
  VALUES (p_id, p_organization_id, p_first_name, p_last_name, p_role)
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- Changement de rôle organisation : réservé aux admins
-- Appel client : supabase.rpc('set_user_org_role', { p_user_id, p_org_role })
CREATE OR REPLACE FUNCTION set_user_org_role(p_user_id UUID, p_org_role TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_org  UUID;
  v_caller_role TEXT;
  v_target_org  UUID;
BEGIN
  SELECT organization_id, org_role INTO v_caller_org, v_caller_role
    FROM profiles WHERE id = auth.uid();

  IF v_caller_role != 'admin' THEN
    RAISE EXCEPTION 'Permission refusée : seul un admin peut modifier les rôles';
  END IF;

  SELECT organization_id INTO v_target_org
    FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable : %', p_user_id;
  END IF;

  IF v_caller_org IS DISTINCT FROM v_target_org THEN
    RAISE EXCEPTION 'Permission refusée : utilisateur hors de votre organisation';
  END IF;

  IF p_org_role NOT IN ('admin', 'editor') THEN
    RAISE EXCEPTION 'Rôle invalide : admin ou editor attendu';
  END IF;

  UPDATE profiles SET org_role = p_org_role WHERE id = p_user_id;
END;
$$;

-- Notification à tous les membres d'une organisation (sauf l'émetteur)
CREATE OR REPLACE FUNCTION notify_organization(
  p_organization_id UUID,
  p_created_by      UUID,
  p_type            TEXT,
  p_title           TEXT,
  p_body            TEXT DEFAULT NULL,
  p_entity_type     TEXT DEFAULT NULL,
  p_entity_id       UUID DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO notifications
    (organization_id, user_id, created_by, type, title, body, entity_type, entity_id)
  SELECT
    p_organization_id, p.id, p_created_by,
    p_type, p_title, p_body, p_entity_type, p_entity_id
  FROM profiles p
  WHERE p.organization_id = p_organization_id
    AND p.id != p_created_by;
END;
$$;

-- Infos publiques d'un joueur — accessible sans authentification (anon)
-- Inclut la méthode de saisie bien-être par défaut de son équipe (saison en cours)
CREATE OR REPLACE FUNCTION get_player_public_info(p_player_id UUID)
RETURNS TABLE(first_name TEXT, last_name TEXT, public_wellness_method TEXT)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT p.first_name, p.last_name, COALESCE(t.public_wellness_method, 'detailed')
  FROM players p
  LEFT JOIN player_season ps ON ps.player_id = p.id
  LEFT JOIN seasons s        ON s.id = ps.season_id AND s.is_current = TRUE
  LEFT JOIN teams t          ON t.id = s.team_id
  WHERE p.id = p_player_id
  LIMIT 1;
$$;
GRANT EXECUTE ON FUNCTION get_player_public_info(UUID) TO anon;

-- Soumission bien-être sans auth, avec limite de 10 entrées par semaine ISO
CREATE OR REPLACE FUNCTION submit_wellness_public(
  p_player_id  UUID,
  p_date       DATE,
  p_fatigue    INT,
  p_mood       INT,
  p_stress     INT,
  p_motivation INT,
  p_sleep      INT,
  p_soreness   INT,
  p_notes      TEXT DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_count INT;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM players WHERE id = p_player_id) THEN
    RAISE EXCEPTION 'Joueur introuvable';
  END IF;

  IF p_fatigue    NOT BETWEEN 1 AND 10 OR p_mood       NOT BETWEEN 1 AND 10 OR
     p_stress     NOT BETWEEN 1 AND 10 OR p_motivation NOT BETWEEN 1 AND 10 OR
     p_sleep      NOT BETWEEN 1 AND 10 OR p_soreness   NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'Valeurs invalides : chaque dimension doit être entre 1 et 10';
  END IF;

  IF p_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'La date ne peut pas être dans le futur';
  END IF;
  IF p_date < CURRENT_DATE - INTERVAL '6 days' THEN
    RAISE EXCEPTION 'La date est trop ancienne (max 7 jours)';
  END IF;

  -- Compte les entrées de la semaine ISO en cours (lundi → dimanche)
  SELECT COUNT(*) INTO v_count
    FROM wellness_entries
    WHERE player_id = p_player_id
      AND date >= date_trunc('week', CURRENT_DATE)::DATE
      AND date <  date_trunc('week', CURRENT_DATE)::DATE + 7;

  IF v_count >= 10 THEN
    RAISE EXCEPTION 'Limite hebdomadaire atteinte : 10 entrées maximum par semaine';
  END IF;

  INSERT INTO wellness_entries (player_id, date, fatigue, mood, stress, motivation, sleep, soreness, notes)
  VALUES (p_player_id, p_date, p_fatigue, p_mood, p_stress, p_motivation, p_sleep, p_soreness, p_notes);
END;
$$;
GRANT EXECUTE ON FUNCTION submit_wellness_public(UUID, DATE, INT, INT, INT, INT, INT, INT, TEXT) TO anon;


-- ================================================================
-- MIGRATION — Sur une base existante antérieure à ce schéma
-- Décommentez et exécutez les blocs nécessaires dans Supabase SQL Editor
-- ================================================================

-- Colonnes organizations (adresse, contact)
-- ALTER TABLE organizations
--   ADD COLUMN IF NOT EXISTS address  TEXT,
--   ADD COLUMN IF NOT EXISTS city     TEXT,
--   ADD COLUMN IF NOT EXISTS phone    TEXT,
--   ADD COLUMN IF NOT EXISTS email    TEXT,
--   ADD COLUMN IF NOT EXISTS website  TEXT,
--   ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- Seuils de charge sur les équipes
-- ALTER TABLE teams
--   ADD COLUMN IF NOT EXISTS load_light_max  INTEGER NOT NULL DEFAULT 2750,
--   ADD COLUMN IF NOT EXISTS load_normal_max INTEGER NOT NULL DEFAULT 4250;

-- Rôles organisation (admin / editor)
-- ALTER TABLE profiles
--   ADD COLUMN IF NOT EXISTS org_role TEXT NOT NULL DEFAULT 'editor'
--   CHECK (org_role IN ('admin', 'editor'));
--
-- DROP POLICY IF EXISTS "org_update" ON organizations;
-- CREATE POLICY "org_update" ON organizations
--   FOR UPDATE TO authenticated
--   USING (
--     id IN (
--       SELECT organization_id FROM profiles
--       WHERE id = auth.uid() AND org_role = 'admin'
--     )
--   )
--   WITH CHECK (
--     id IN (
--       SELECT organization_id FROM profiles
--       WHERE id = auth.uid() AND org_role = 'admin'
--     )
--   );
--
-- Promouvoir un utilisateur existant en admin :
-- UPDATE profiles SET org_role = 'admin' WHERE id = '<uuid>';

-- Colonnes séance : partenaires d'entraînement
-- ALTER TABLE training_sessions
--   ADD COLUMN IF NOT EXISTS partner_count SMALLINT NOT NULL DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS partner_names TEXT;

-- Nouvelles tables (créer depuis le schéma principal ci-dessus) :
--   opponent_match_stats, session_documents, exercises

-- Seuils statistiques (éval, ORtg, DRtg) sur les équipes
-- ALTER TABLE teams
--   ADD COLUMN IF NOT EXISTS eval_t_orange NUMERIC NOT NULL DEFAULT 0,
--   ADD COLUMN IF NOT EXISTS eval_t_blue   NUMERIC NOT NULL DEFAULT 5,
--   ADD COLUMN IF NOT EXISTS eval_t_green  NUMERIC NOT NULL DEFAULT 10,
--   ADD COLUMN IF NOT EXISTS ortg_t_amber  NUMERIC NOT NULL DEFAULT 60,
--   ADD COLUMN IF NOT EXISTS ortg_t_green  NUMERIC NOT NULL DEFAULT 90,
--   ADD COLUMN IF NOT EXISTS drtg_t_amber  NUMERIC NOT NULL DEFAULT 100,
--   ADD COLUMN IF NOT EXISTS drtg_t_red    NUMERIC NOT NULL DEFAULT 115;

-- Exercices : galerie d'images multiples, document PDF, lien vidéo réseaux sociaux
-- CREATE TABLE IF NOT EXISTS exercise_images (
--   id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   exercise_id UUID NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
--   url         TEXT NOT NULL,
--   position    SMALLINT NOT NULL DEFAULT 0,
--   created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS exercise_images_exercise_id_idx ON exercise_images (exercise_id);
--
-- ALTER TABLE exercise_images ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "exercise_images_access" ON exercise_images
--   FOR ALL TO authenticated
--   USING (
--     exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM accessible_team_ids()))
--   )
--   WITH CHECK (
--     exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM accessible_team_ids()))
--   );
--
-- ALTER TABLE exercises
--   ADD COLUMN IF NOT EXISTS document_url  TEXT,
--   ADD COLUMN IF NOT EXISTS document_name TEXT,
--   ADD COLUMN IF NOT EXISTS video_url     TEXT;
--
-- -- Backfill : reprendre les images existantes dans la nouvelle table galerie
-- INSERT INTO exercise_images (exercise_id, url, position)
-- SELECT id, image_url, 0 FROM exercises WHERE image_url IS NOT NULL;
--
-- -- Une fois le backfill vérifié en prod, supprimer l'ancienne colonne :
-- ALTER TABLE exercises DROP COLUMN IF EXISTS image_url;

-- Exercices : catégories personnalisables par équipe
-- CREATE TABLE IF NOT EXISTS exercise_categories (
--   id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   team_id    UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
--   name       TEXT NOT NULL,
--   color      TEXT NOT NULL,
--   position   SMALLINT NOT NULL DEFAULT 0,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   UNIQUE (team_id, name)
-- );
-- CREATE INDEX IF NOT EXISTS exercise_categories_team_id_idx ON exercise_categories (team_id);
--
-- ALTER TABLE exercise_categories ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "exercise_categories_access" ON exercise_categories
--   FOR ALL TO authenticated
--   USING    (team_id IN (SELECT * FROM accessible_team_ids()))
--   WITH CHECK (team_id IN (SELECT * FROM accessible_team_ids()));
--
-- ALTER TABLE exercises
--   ADD COLUMN IF NOT EXISTS category_id UUID REFERENCES exercise_categories(id) ON DELETE SET NULL;
--
-- -- Seed des 8 catégories par défaut pour chaque équipe existante
-- INSERT INTO exercise_categories (team_id, name, color, position)
-- SELECT t.id, c.name, c.color, c.position
-- FROM teams t
-- CROSS JOIN (VALUES
--   ('Warmup', '#F59E0B', 0), ('Jeu réduit', '#3B82F6', 1), ('Jeu rapide', '#06B6D4', 2),
--   ('Collectif', '#8B5CF6', 3), ('Shooting', '#EC4899', 4), ('Technique', '#00E5A0', 5),
--   ('Physique', '#EF4444', 6), ('Fun', '#F97316', 7)
-- ) AS c(name, color, position)
-- ON CONFLICT (team_id, name) DO NOTHING;
--
-- -- Backfill : relier chaque exercice existant à la catégorie de son équipe portant le même nom
-- UPDATE exercises e SET category_id = ec.id
-- FROM exercise_categories ec
-- WHERE ec.team_id = e.team_id AND ec.name = e.category;
--
-- -- Une fois vérifié, supprimer l'ancienne colonne texte :
-- ALTER TABLE exercises DROP COLUMN IF EXISTS category;

-- Wellness : formule du score corrigée pour utiliser (11 - v) au lieu de (10 - v) sur les
-- métriques inversées (fatigue/stress/soreness), pour rester cohérent avec la coloration
-- client (wellnessDimColor, src/utils/wellness.ts) qui inverse déjà avec 11 - v.
-- Un GENERATED ALWAYS AS ne peut pas être modifié en place : on le supprime et on le recrée
-- (Postgres recalcule automatiquement la colonne pour toutes les lignes existantes).
-- ALTER TABLE wellness_entries DROP COLUMN score;
-- ALTER TABLE wellness_entries ADD COLUMN score NUMERIC(3,1) GENERATED ALWAYS AS (
--   ROUND(
--     ((11 - fatigue) + mood + (11 - stress) + motivation + sleep + (11 - soreness))::NUMERIC / 6,
--     1
--   )
-- ) STORED;

-- Séances : équipes du jour (sparring), plusieurs blocs possibles par séance
-- -- Si la version précédente (un seul bloc implicite) a déjà été exécutée, on repart de zéro :
-- DROP TABLE IF EXISTS session_team_players CASCADE;
-- DROP TABLE IF EXISTS session_teams CASCADE;
--
-- CREATE TABLE IF NOT EXISTS session_team_blocks (
--   id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
--   label      TEXT NOT NULL DEFAULT 'Bloc 1',
--   position   SMALLINT NOT NULL DEFAULT 0,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS session_team_blocks_session_id_idx ON session_team_blocks (session_id, position);
--
-- CREATE TABLE IF NOT EXISTS session_teams (
--   id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   block_id   UUID NOT NULL REFERENCES session_team_blocks(id) ON DELETE CASCADE,
--   session_id UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
--   name       TEXT NOT NULL,
--   color      TEXT NOT NULL,
--   position   SMALLINT NOT NULL DEFAULT 0,
--   created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
-- );
-- CREATE INDEX IF NOT EXISTS session_teams_block_id_idx ON session_teams (block_id, position);
--
-- CREATE TABLE IF NOT EXISTS session_team_players (
--   id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
--   block_id        UUID NOT NULL REFERENCES session_team_blocks(id) ON DELETE CASCADE,
--   session_id      UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
--   session_team_id UUID NOT NULL REFERENCES session_teams(id) ON DELETE CASCADE,
--   player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
--   created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
--   UNIQUE (block_id, player_id)
-- );
-- CREATE INDEX IF NOT EXISTS session_team_players_team_id_idx ON session_team_players (session_team_id);
--
-- ALTER TABLE session_team_blocks  ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE session_teams        ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE session_team_players ENABLE ROW LEVEL SECURITY;
--
-- CREATE POLICY "session_team_blocks_access" ON session_team_blocks
--   FOR ALL TO authenticated
--   USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())))
--   WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));
--
-- CREATE POLICY "session_teams_access" ON session_teams
--   FOR ALL TO authenticated
--   USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())))
--   WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));
--
-- CREATE POLICY "session_team_players_access" ON session_team_players
--   FOR ALL TO authenticated
--   USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())))
--   WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));

-- Blocs de séance : consignes libres par occurrence de bloc
-- ALTER TABLE session_blocks ADD COLUMN IF NOT EXISTS consignes TEXT;

-- Description propre à l'occurrence du bloc (utile en ajout manuel, sans exercice de bibliothèque lié)
-- ALTER TABLE session_blocks ADD COLUMN IF NOT EXISTS description TEXT;

-- Bibliothèque d'exercices : consignes par défaut, en plus de la description
-- ALTER TABLE exercises ADD COLUMN IF NOT EXISTS consignes TEXT;

-- Nombre de séances/semaine par équipe : sert à dériver un seuil de charge "par séance"
-- à partir des seuils hebdomadaires (au lieu d'un /3 en dur)
-- ALTER TABLE teams ADD COLUMN IF NOT EXISTS sessions_per_week SMALLINT NOT NULL DEFAULT 3;

-- Bien-être : méthode de saisie par défaut par équipe (interne = staff, public = lien joueur)
-- ALTER TABLE teams ADD COLUMN IF NOT EXISTS default_wellness_method TEXT NOT NULL DEFAULT 'detailed'
--   CHECK (default_wellness_method IN ('detailed', 'emoji', 'single'));
-- ALTER TABLE teams ADD COLUMN IF NOT EXISTS public_wellness_method TEXT NOT NULL DEFAULT 'detailed'
--   CHECK (public_wellness_method IN ('detailed', 'emoji', 'single'));
--
-- -- get_player_public_info change de type de retour (ajout de public_wellness_method) :
-- -- CREATE OR REPLACE ne suffit pas, Postgres exige un DROP préalable (erreur 42P13).
-- -- DROP FUNCTION IF EXISTS get_player_public_info(UUID);
-- CREATE FUNCTION get_player_public_info(p_player_id UUID)
-- RETURNS TABLE(first_name TEXT, last_name TEXT, public_wellness_method TEXT)
-- LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
--   SELECT p.first_name, p.last_name, COALESCE(t.public_wellness_method, 'detailed')
--   FROM players p
--   LEFT JOIN player_season ps ON ps.player_id = p.id
--   LEFT JOIN seasons s        ON s.id = ps.season_id AND s.is_current = TRUE
--   LEFT JOIN teams t          ON t.id = s.team_id
--   WHERE p.id = p_player_id
--   LIMIT 1;
-- $$;
-- GRANT EXECUTE ON FUNCTION get_player_public_info(UUID) TO anon;

-- Notifications Push Web (VAPID / Web Push API) — un utilisateur peut avoir plusieurs appareils.
-- Écrite/lue depuis les fonctions serverless api/push/* via la service role key (RLS quand même
-- posée en défense en profondeur, au cas où un accès direct depuis le client serait ajouté plus tard).
CREATE TABLE push_subscriptions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions (user_id);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "push_subscriptions_user_own" ON push_subscriptions
  FOR ALL TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- match_stats duplique (date, opponent, home_away, competition, result, score_us, score_them)
-- depuis matches au moment de la saisie des stats — sans trigger, corriger un match après coup
-- (ex: mauvaise date) ne se répercutait jamais sur les match_stats déjà enregistrées, d'où des
-- dates périmées affichées sur Performance individuelle.
CREATE OR REPLACE FUNCTION sync_match_stats_from_match()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.date, NEW.opponent, NEW.home_away, NEW.competition, NEW.result, NEW.score_us, NEW.score_them)
     IS DISTINCT FROM
     (OLD.date, OLD.opponent, OLD.home_away, OLD.competition, OLD.result, OLD.score_us, OLD.score_them) THEN
    UPDATE match_stats SET
      date        = NEW.date,
      opponent    = NEW.opponent,
      home_away   = NEW.home_away::TEXT,
      competition = NEW.competition,
      result      = NEW.result::TEXT,
      score_us    = NEW.score_us,
      score_them  = NEW.score_them
    WHERE match_id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_matches_sync_match_stats
  AFTER UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION sync_match_stats_from_match();

-- Correction ponctuelle des match_stats déjà désynchronisées (à exécuter une seule fois)
UPDATE match_stats ms
SET date        = m.date,
    opponent    = m.opponent,
    home_away   = m.home_away::TEXT,
    competition = m.competition,
    result      = m.result::TEXT,
    score_us    = m.score_us,
    score_them  = m.score_them
FROM matches m
WHERE ms.match_id = m.id
  AND (ms.date        IS DISTINCT FROM m.date
    OR ms.opponent    IS DISTINCT FROM m.opponent
    OR ms.home_away   IS DISTINCT FROM m.home_away::TEXT
    OR ms.competition IS DISTINCT FROM m.competition
    OR ms.result      IS DISTINCT FROM m.result::TEXT
    OR ms.score_us    IS DISTINCT FROM m.score_us
    OR ms.score_them  IS DISTINCT FROM m.score_them);

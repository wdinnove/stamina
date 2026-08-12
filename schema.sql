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
--   6b. Team Roles (droits par équipe : admin/editor/viewer)
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
--      'superadmin' → accès total sur l'organisation (config club, création
--                     d'équipes, assignation des rôles sur toutes les équipes,
--                     accès total aux données de toutes les équipes)
--      'member'     → aucun droit propre ; les droits viennent uniquement des
--                     lignes team_roles (admin/editor/viewer par équipe, cf. 6b)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  role            TEXT NOT NULL DEFAULT 'staff'   -- 'admin' | 'staff' | valeurs du poste (cf. staff.role)
                    CHECK (role IN ('admin', 'coach', 'staff', 'medical', 'kine', 'medecin', 'prep_physique', 'assistant', 'autre')),
  org_role        TEXT NOT NULL DEFAULT 'member'  -- 'superadmin' | 'member'
                    CHECK (org_role IN ('superadmin', 'member')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- own_profile (plus bas) autorise chaque utilisateur à modifier sa propre ligne
-- en écriture directe — sans ce garde-fou, n'importe qui pourrait s'auto-promouvoir
-- superadmin via un simple update() côté client, en contournant set_user_org_role().
-- org_role/organization_id ne sont donc modifiables QUE via set_user_org_role()
-- (qui lève le drapeau de session le temps de son propre UPDATE).
CREATE OR REPLACE FUNCTION protect_profile_privileged_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.org_role IS DISTINCT FROM OLD.org_role OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)
     AND current_setting('app.bypass_profile_role_guard', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'org_role et organization_id ne peuvent être modifiés que via set_user_org_role()';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_privileged_columns();

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
    COALESCE(NEW.raw_user_meta_data->>'org_role', 'member')
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
-- 6b. TEAM ROLES
--     Droits par équipe : 'admin' | 'editor' | 'viewer'
--     profile_id référence n'importe quel profil de l'organisation
--     (pas besoin d'une ligne staff correspondante). Seul un profil
--     org_role = 'superadmin' peut créer/modifier/supprimer ces lignes
--     (cf. policies "team_roles_write" plus bas) — l'admin d'une équipe
--     peut les consulter mais jamais les modifier.
-- ────────────────────────────────────────────────────────────────

CREATE TABLE team_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (team_id, profile_id)
);

CREATE INDEX ON team_roles (team_id);
CREATE INDEX ON team_roles (profile_id);

CREATE TRIGGER trg_team_roles_updated_at
  BEFORE UPDATE ON team_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


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
  team_id      UUID            REFERENCES teams(id) ON DELETE CASCADE,
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
CREATE INDEX ON player_actions (team_id, status, due_date);
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
-- OBJECTIFS (joueur ou équipe)
--     Seuil attendu sur un indicateur du registre INDICATORS (front),
--     avec un niveau d'importance pour la mise en évidence visuelle.
--     player_id et team_id sont indépendants (jamais de cascade entre eux) —
--     même logique que player_actions.
-- ────────────────────────────────────────────────────────────────

CREATE TYPE objective_importance AS ENUM ('major', 'normal', 'minor');
CREATE TYPE objective_comparator AS ENUM ('gte', 'lte', 'eq');

CREATE TABLE objectives (
  id              UUID                 PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID                 REFERENCES teams(id)   ON DELETE CASCADE,
  player_id       UUID                 REFERENCES players(id) ON DELETE CASCADE,
  indicator_key   TEXT                 NOT NULL,
  importance      objective_importance NOT NULL DEFAULT 'normal',
  comparator      objective_comparator NOT NULL,
  threshold_value NUMERIC              NOT NULL,
  active          BOOLEAN              NOT NULL DEFAULT TRUE,
  created_by      UUID                 REFERENCES profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ          NOT NULL DEFAULT NOW(),

  CONSTRAINT objective_subject_required CHECK (team_id IS NOT NULL OR player_id IS NOT NULL)
);

CREATE INDEX ON objectives (player_id, indicator_key) WHERE active;
CREATE INDEX ON objectives (team_id, indicator_key)   WHERE active;

CREATE TRIGGER trg_objectives_updated_at
  BEFORE UPDATE ON objectives
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────
-- 22. ROW LEVEL SECURITY
--     Cloisonnement par équipe / organisation (données de santé RGPD)
-- ────────────────────────────────────────────────────────────────

ALTER TABLE organizations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons               ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_roles            ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE objectives            ENABLE ROW LEVEL SECURITY;
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

-- Profils : lecture des autres membres de l'organisation (noms affichés dans
-- l'assignation des rôles par équipe et la liste des superadmins) — écriture
-- toujours restreinte à own_profile ci-dessus.
CREATE POLICY "profiles_org_visible" ON profiles
  FOR SELECT TO authenticated
  USING (organization_id = my_organization_id());

-- Organisations : lecture pour tous les membres, écriture pour les admins uniquement
CREATE POLICY "org_access" ON organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

CREATE POLICY "org_update" ON organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND org_role = 'superadmin'
    )
  )
  WITH CHECK (
    id IN (
      SELECT organization_id FROM profiles
      WHERE id = auth.uid() AND org_role = 'superadmin'
    )
  );

-- Rôles par équipe : lecture ouverte à quiconque a un rôle sur l'équipe
-- (admin d'équipe inclus), écriture réservée au superadmin uniquement.
CREATE POLICY "team_roles_select" ON team_roles
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "team_roles_write" ON team_roles
  FOR ALL TO authenticated
  USING      (is_superadmin())
  WITH CHECK (is_superadmin());

-- Équipes : lecture = équipes accessibles ; création/suppression = superadmin
-- uniquement ; modification (seuils, nom...) = admin d'équipe ou superadmin.
CREATE POLICY "teams_select" ON teams
  FOR SELECT TO authenticated
  USING (id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "teams_insert" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND is_superadmin()
  );

CREATE POLICY "teams_update" ON teams
  FOR UPDATE TO authenticated
  USING      (id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (id IN (SELECT * FROM admin_team_ids()));

CREATE POLICY "teams_delete" ON teams
  FOR DELETE TO authenticated
  USING (is_superadmin() AND id IN (SELECT * FROM accessible_team_ids()));

-- Saisons : suivent les équipes ; écriture réservée à l'admin d'équipe (config)
CREATE POLICY "season_select" ON seasons
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "season_write" ON seasons
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM admin_team_ids()));

-- Joueuses : cloisonnement par organisation (traitement par équipe : cf. plan, phase 8)
CREATE POLICY "player_access" ON players
  FOR ALL TO authenticated
  USING    (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Inscription joueuse/saison : lecture = équipes accessibles, écriture = editor+
CREATE POLICY "player_season_select" ON player_season
  FOR SELECT TO authenticated
  USING (
    season_id IN (SELECT id FROM seasons WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

CREATE POLICY "player_season_write" ON player_season
  FOR ALL TO authenticated
  USING (
    season_id IN (SELECT id FROM seasons WHERE team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    season_id IN (SELECT id FROM seasons WHERE team_id IN (SELECT * FROM writable_team_ids()))
  );

-- Sessions d'entraînement : lecture = équipes accessibles, écriture = editor+
CREATE POLICY "training_session_select" ON training_sessions
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "training_session_write" ON training_sessions
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

-- Blocs de séance
CREATE POLICY "session_blocks_select" ON session_blocks
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

CREATE POLICY "session_blocks_write" ON session_blocks
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  );

-- Équipes du jour (sparring)
CREATE POLICY "session_team_blocks_select" ON session_team_blocks
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

CREATE POLICY "session_team_blocks_write" ON session_team_blocks
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  );

CREATE POLICY "session_teams_select" ON session_teams
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

CREATE POLICY "session_teams_write" ON session_teams
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  );

CREATE POLICY "session_team_players_select" ON session_team_players
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

CREATE POLICY "session_team_players_write" ON session_team_players
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
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
-- autorisé si l'un OU l'autre pointe vers l'organisation/équipe de l'utilisateur).
-- Branche player_id : org-scoped inchangée (cf. plan, phase 8). Branche team_id :
-- lecture = équipes accessibles, écriture = editor+.
CREATE POLICY "action_select" ON player_actions
  FOR SELECT TO authenticated
  USING (
    (player_id IS NOT NULL AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM accessible_team_ids()))
  );

CREATE POLICY "action_write" ON player_actions
  FOR ALL TO authenticated
  USING (
    (player_id IS NOT NULL AND is_editor_anywhere() AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    (player_id IS NOT NULL AND is_editor_anywhere() AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM writable_team_ids()))
  );

-- Objectifs (player_id et team_id sont tous deux optionnels, même logique que player_actions)
CREATE POLICY "objective_select" ON objectives
  FOR SELECT TO authenticated
  USING (
    (player_id IS NOT NULL AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM accessible_team_ids()))
  );

CREATE POLICY "objective_write" ON objectives
  FOR ALL TO authenticated
  USING (
    (player_id IS NOT NULL AND is_editor_anywhere() AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    (player_id IS NOT NULL AND is_editor_anywhere() AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM writable_team_ids()))
  );

-- Matches
CREATE POLICY "match_select" ON matches
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "match_write" ON matches
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

-- Stats individuelles
CREATE POLICY "match_stats_select" ON match_stats
  FOR SELECT TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

CREATE POLICY "match_stats_write" ON match_stats
  FOR ALL TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids()))
  );

-- Stats collectives
CREATE POLICY "team_match_stats_select" ON team_match_stats
  FOR SELECT TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

CREATE POLICY "team_match_stats_write" ON team_match_stats
  FOR ALL TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids()))
  );

-- Staff : consultable par tous les rôles de l'équipe, géré par l'admin d'équipe
CREATE POLICY "staff_select" ON staff
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "staff_write" ON staff
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM admin_team_ids()));

-- Réunions staff
CREATE POLICY "staff_meetings_select" ON staff_meetings
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "staff_meetings_write" ON staff_meetings
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

-- Présences aux entraînements
CREATE POLICY "training_attendance_select" ON training_attendance
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

CREATE POLICY "training_attendance_write" ON training_attendance
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  );

-- Notifications : chaque user accède uniquement aux siennes
CREATE POLICY "notifications_user_own" ON notifications
  FOR ALL USING (user_id = auth.uid());

-- Stats adverses
CREATE POLICY "opponent_match_stats_select" ON opponent_match_stats
  FOR SELECT TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

CREATE POLICY "opponent_match_stats_write" ON opponent_match_stats
  FOR ALL TO authenticated
  USING (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids()))
  );

-- Documents de séance
CREATE POLICY "session_documents_select" ON session_documents
  FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

CREATE POLICY "session_documents_write" ON session_documents
  FOR ALL TO authenticated
  USING (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  )
  WITH CHECK (
    session_id IN (
      SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())
    )
  );

-- Exercices : bibliothèque éditable par editor+
CREATE POLICY "exercises_select" ON exercises
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "exercises_write" ON exercises
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

-- Catégories d'exercices : par équipe, config réservée à l'admin d'équipe
CREATE POLICY "exercise_categories_select" ON exercise_categories
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "exercise_categories_write" ON exercise_categories
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM admin_team_ids()));

-- Images d'exercices : suivent l'exercice parent
CREATE POLICY "exercise_images_select" ON exercise_images
  FOR SELECT TO authenticated
  USING (
    exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM accessible_team_ids()))
  );

CREATE POLICY "exercise_images_write" ON exercise_images
  FOR ALL TO authenticated
  USING (
    exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM writable_team_ids()))
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

-- Helper RLS : organisation de l'utilisateur courant (évite la récursion RLS
-- d'une sous-requête directe sur profiles dans une policy de profiles)
CREATE OR REPLACE FUNCTION my_organization_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

-- Helper RLS : l'utilisateur courant est-il superadmin de son organisation ?
CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND org_role = 'superadmin'
  )
$$;

-- Helper RLS : équipes accessibles en LECTURE (superadmin → toutes les équipes
-- de l'org, sinon → équipes où l'utilisateur a une ligne team_roles, quel que
-- soit le rôle admin/editor/viewer)
CREATE OR REPLACE FUNCTION accessible_team_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id
  FROM   teams         t
  JOIN   organizations o ON o.id = t.organization_id
  JOIN   profiles      p ON p.organization_id = o.id
  WHERE  p.id = auth.uid()
    AND (
      p.org_role = 'superadmin'
      OR EXISTS (SELECT 1 FROM team_roles tr WHERE tr.team_id = t.id AND tr.profile_id = p.id)
    )
$$;

-- Helper RLS : équipes accessibles en ÉCRITURE OPÉRATIONNELLE (séances, matchs,
-- présences, tactique...) — superadmin, ou rôle admin/editor sur l'équipe
CREATE OR REPLACE FUNCTION writable_team_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id
  FROM   teams         t
  JOIN   organizations o ON o.id = t.organization_id
  JOIN   profiles      p ON p.organization_id = o.id
  WHERE  p.id = auth.uid()
    AND (
      p.org_role = 'superadmin'
      OR EXISTS (
        SELECT 1 FROM team_roles tr
        WHERE tr.team_id = t.id AND tr.profile_id = p.id AND tr.role IN ('admin', 'editor')
      )
    )
$$;

-- Helper RLS : équipes accessibles en CONFIGURATION (seuils, staff, catégories,
-- assignation des rôles) — superadmin, ou rôle admin sur l'équipe
CREATE OR REPLACE FUNCTION admin_team_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id
  FROM   teams         t
  JOIN   organizations o ON o.id = t.organization_id
  JOIN   profiles      p ON p.organization_id = o.id
  WHERE  p.id = auth.uid()
    AND (
      p.org_role = 'superadmin'
      OR EXISTS (
        SELECT 1 FROM team_roles tr
        WHERE tr.team_id = t.id AND tr.profile_id = p.id AND tr.role = 'admin'
      )
    )
$$;

-- Helper RLS : le profil courant a-t-il un rôle admin/editor sur AU MOINS UNE
-- équipe (ou est superadmin) ? Utilisé pour fermer le contournement de la branche
-- player_id de action_write/objective_write : sans ce garde-fou, un Viewer (ou un
-- profil sans aucune ligne team_roles) pouvait écrire des actions/objectifs
-- "joueur" librement, car cette branche reste org-wide (players non rattachés à
-- une équipe unique — cf. phase 8). Contrôle plus grossier qu'un vrai rattachement
-- par joueur, mais exclut correctement les Viewers et les comptes sans rôle.
CREATE OR REPLACE FUNCTION is_editor_anywhere()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_superadmin() OR EXISTS (
    SELECT 1 FROM team_roles WHERE profile_id = auth.uid() AND role IN ('admin', 'editor')
  )
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

-- Changement de rôle organisation (superadmin/member) : réservé aux superadmins
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

  IF v_caller_role != 'superadmin' THEN
    RAISE EXCEPTION 'Permission refusée : seul un superadmin peut modifier les rôles';
  END IF;

  SELECT organization_id INTO v_target_org
    FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable : %', p_user_id;
  END IF;

  IF v_caller_org IS DISTINCT FROM v_target_org THEN
    RAISE EXCEPTION 'Permission refusée : utilisateur hors de votre organisation';
  END IF;

  IF p_org_role NOT IN ('superadmin', 'member') THEN
    RAISE EXCEPTION 'Rôle invalide : superadmin ou member attendu';
  END IF;

  -- Lève le drapeau de session (scope transaction) pour passer le garde-fou
  -- trg_protect_profile_privileged_columns le temps de cet UPDATE.
  PERFORM set_config('app.bypass_profile_role_guard', 'on', true);
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

-- ─────────────────────────────────────────────────────────────────────────────
-- DONNÉES TACTIQUES (import CSV du logiciel vidéo)
--
-- Format CSV : une ligne "Category: <nom>", une ligne d'en-tête listant des
-- dimensions nommées par l'équipe (ex. Valeur, Temps fort, Forme de jeu,
-- Finalité — le nombre et les noms varient librement par catégorie), puis des
-- lignes de données où chaque cellule contient directement le libellé choisi
-- (pas un flag binaire). Catégories et dimensions sont auto-créées à l'import
-- (retrouvées par nom normalisé pour éviter les doublons d'une saison/casse à
-- l'autre) ; les options de chaque dimension sont du texte libre, jamais
-- cataloguées à part.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE tactical_categories (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sort_order      SMALLINT NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (team_id, normalized_name)
);

CREATE TABLE tactical_dimensions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id         UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,      -- dénormalisé (RLS)
  category_id     UUID NOT NULL REFERENCES tactical_categories(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  sort_order      SMALLINT NOT NULL DEFAULT 0,   -- ordre de colonne dans le CSV de cette catégorie
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (category_id, normalized_name)
);

-- Un événement = une ligne de données du CSV, pour une catégorie d'un match.
CREATE TABLE tactical_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id        UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  category_id     UUID NOT NULL REFERENCES tactical_categories(id),   -- pas de CASCADE : protège l'historique
  sequence_number SMALLINT NOT NULL,   -- position de la ligne dans le bloc de la catégorie
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (match_id, category_id, sequence_number)
);
CREATE INDEX ON tactical_events (match_id);

-- La valeur texte d'une dimension pour un événement (libre, pas de catalogue d'options).
CREATE TABLE tactical_event_values (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id     UUID NOT NULL REFERENCES tactical_events(id) ON DELETE CASCADE,
  match_id     UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,   -- dénormalisé (RLS)
  dimension_id UUID NOT NULL REFERENCES tactical_dimensions(id),
  label        TEXT NOT NULL,   -- valeur brute de la cellule CSV (ex. "Handoff", "Swing", "3")
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (event_id, dimension_id)
);
CREATE INDEX ON tactical_event_values (match_id);
CREATE INDEX ON tactical_event_values (dimension_id, label);

ALTER TABLE tactical_categories   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_dimensions   ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE tactical_event_values ENABLE ROW LEVEL SECURITY;

-- Taxonomie et événements tactiques : auto-créés à l'import CSV (cf. commentaire plus
-- haut) par quiconque saisit un match, donc écriture = editor+ (pas admin_team_ids).
CREATE POLICY "tactical_categories_select" ON tactical_categories
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "tactical_categories_write" ON tactical_categories
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

CREATE POLICY "tactical_dimensions_select" ON tactical_dimensions
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "tactical_dimensions_write" ON tactical_dimensions
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

CREATE POLICY "tactical_events_select" ON tactical_events
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));

CREATE POLICY "tactical_events_write" ON tactical_events
  FOR ALL TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));

CREATE POLICY "tactical_event_values_select" ON tactical_event_values
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));

CREATE POLICY "tactical_event_values_write" ON tactical_event_values
  FOR ALL TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));

-- ─────────────────────────────────────────────────────────────────────────────
-- TABLEAU DE BORD TACTIQUE (blocs configurables par l'équipe, en plus du
-- rapport automatique par catégorie/dimension) — config flexible en JSONB
-- selon le type de bloc plutôt que 5 tables différentes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE tactical_dashboard_widgets (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('dimension_table', 'evolution_chart', 'cross_matrix', 'pie_chart', 'period_comparison')),
  category_id UUID NOT NULL REFERENCES tactical_categories(id) ON DELETE CASCADE,
  title       TEXT,               -- libellé personnalisé optionnel (sinon généré depuis catégorie/dimension)
  config      JSONB NOT NULL DEFAULT '{}',  -- ex. dimension_table: {dimensionId}, cross_matrix: {dimensionIdX, dimensionIdY}
  sort_order  SMALLINT NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX ON tactical_dashboard_widgets (team_id, sort_order);

ALTER TABLE tactical_dashboard_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tactical_dashboard_widgets_select" ON tactical_dashboard_widgets
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "tactical_dashboard_widgets_write" ON tactical_dashboard_widgets
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

-- Seuils de couleur de la rentabilité, par catégorie (l'échelle est liée à SA dimension
-- "Valeur" — un seuil par dimension serait incohérent, une seule échelle par catégorie).
ALTER TABLE tactical_categories
  ADD COLUMN rentabilite_seuil_vert  NUMERIC NOT NULL DEFAULT 1,
  ADD COLUMN rentabilite_seuil_bleu  NUMERIC NOT NULL DEFAULT 0.6,
  ADD COLUMN rentabilite_seuil_ambre NUMERIC NOT NULL DEFAULT 0.3;

-- Options attendues d'une dimension — curées à la main, JAMAIS auto-créées par l'import
-- (contrairement aux catégories/dimensions) : sert (a) à afficher des lignes à 0 pour ce
-- qui n'apparaît pas dans le match/la période, (b) à détecter à l'import les valeurs
-- inattendues (sans jamais bloquer ni perdre de données).
CREATE TABLE tactical_dimension_options (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,   -- dénormalisé (RLS)
  dimension_id     UUID NOT NULL REFERENCES tactical_dimensions(id) ON DELETE CASCADE,
  label            TEXT NOT NULL,
  normalized_label TEXT NOT NULL,
  sort_order       SMALLINT NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (dimension_id, normalized_label)
);
CREATE INDEX ON tactical_dimension_options (team_id);

ALTER TABLE tactical_dimension_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "tactical_dimension_options_select" ON tactical_dimension_options
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

CREATE POLICY "tactical_dimension_options_write" ON tactical_dimension_options
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

-- Couleur d'accent par catégorie (choisie librement dans la config), pour distinguer visuellement
-- les blocs catégorie du rapport tactique.
ALTER TABLE tactical_categories ADD COLUMN color TEXT NOT NULL DEFAULT '#3B82F6';

-- Sens de la rentabilité par catégorie : par défaut plus haut = meilleur (attaque, on veut
-- marquer). Une catégorie défensive concède des points plutôt que d'en marquer — plus bas y est
-- meilleur — d'où ce booléen qui inverse la comparaison aux seuils dans rentabiliteColor.
ALTER TABLE tactical_categories ADD COLUMN rentabilite_inversee BOOLEAN NOT NULL DEFAULT false;


-- ================================================================
-- MIGRATION — Gestion des droits par équipe (superadmin/admin/editor/viewer)
-- Sur une base existante antérieure à cette fonctionnalité.
-- Script exécutable directement dans Supabase SQL Editor, tel quel.
-- La section 16 (RLS tactique) ne s'applique que si les tables tactical_*
-- existent déjà dans votre base (fonctionnalité tactique déjà déployée) ;
-- sinon commentez/supprimez cette section avant d'exécuter.
-- ================================================================

-- 1. Nouvelle table team_roles
CREATE TABLE IF NOT EXISTS team_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  profile_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role        TEXT NOT NULL CHECK (role IN ('admin', 'editor', 'viewer')),
  assigned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (team_id, profile_id)
);

CREATE INDEX IF NOT EXISTS team_roles_team_id_idx    ON team_roles (team_id);
CREATE INDEX IF NOT EXISTS team_roles_profile_id_idx ON team_roles (profile_id);

DROP TRIGGER IF EXISTS trg_team_roles_updated_at ON team_roles;
CREATE TRIGGER trg_team_roles_updated_at
  BEFORE UPDATE ON team_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2. profiles.org_role : 'admin'/'editor' → 'superadmin'/'member'
--    (les droits opérationnels viennent désormais de team_roles, pas de org_role)
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_org_role_check;

UPDATE profiles SET org_role = 'superadmin' WHERE org_role = 'admin';
UPDATE profiles SET org_role = 'member'     WHERE org_role = 'editor';

ALTER TABLE profiles ALTER COLUMN org_role SET DEFAULT 'member';
ALTER TABLE profiles ADD CONSTRAINT profiles_org_role_check
  CHECK (org_role IN ('superadmin', 'member'));

-- 1b. Garde-fou critique : own_profile (déjà en place) autorise chaque utilisateur
--     à modifier sa propre ligne en écriture directe, y compris org_role — donc
--     n'importe qui pouvait s'auto-promouvoir superadmin via un simple update()
--     côté client, en contournant set_user_org_role(). org_role/organization_id
--     ne sont désormais modifiables QUE via cette fonction.
CREATE OR REPLACE FUNCTION protect_profile_privileged_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.org_role IS DISTINCT FROM OLD.org_role OR NEW.organization_id IS DISTINCT FROM OLD.organization_id)
     AND current_setting('app.bypass_profile_role_guard', true) IS DISTINCT FROM 'on' THEN
    RAISE EXCEPTION 'org_role et organization_id ne peuvent être modifiés que via set_user_org_role()';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_privileged_columns ON profiles;
CREATE TRIGGER trg_protect_profile_privileged_columns
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION protect_profile_privileged_columns();

-- 2a. handle_new_user() : le trigger de création de compte insérait encore
--     org_role = 'editor' par défaut (ancienne valeur), ce qui viole désormais
--     la contrainte ci-dessus et fait échouer TOUTE création de compte
--     ("Database error saving new user").
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
    COALESCE(NEW.raw_user_meta_data->>'org_role', 'member')
  );
  RETURN NEW;
END;
$$;

-- 2b. profiles.role (intitulé de poste) : bug préexistant, la contrainte n'acceptait
--     pas les valeurs de staff.role (kine/medecin/prep_physique/assistant/autre),
--     ce qui fait échouer la création de compte pour un membre du staff non-coach.
ALTER TABLE profiles DROP CONSTRAINT IF EXISTS profiles_role_check;
ALTER TABLE profiles ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'coach', 'staff', 'medical', 'kine', 'medecin', 'prep_physique', 'assistant', 'autre'));

-- 3. Backfill : les anciens 'editor' déjà rattachés à une équipe via staff
--    récupèrent le rôle 'editor' sur cette équipe (pas de perte d'accès au déploiement)
INSERT INTO team_roles (team_id, profile_id, role)
SELECT DISTINCT s.team_id, s.profile_id, 'editor'
FROM staff s
JOIN profiles p ON p.id = s.profile_id
WHERE p.org_role = 'member'
ON CONFLICT (team_id, profile_id) DO NOTHING;

-- 4. Fonctions SECURITY DEFINER (CREATE OR REPLACE, sans risque)
CREATE OR REPLACE FUNCTION my_organization_id()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT organization_id FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION is_superadmin()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND org_role = 'superadmin'
  )
$$;

CREATE OR REPLACE FUNCTION accessible_team_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id
  FROM   teams         t
  JOIN   organizations o ON o.id = t.organization_id
  JOIN   profiles      p ON p.organization_id = o.id
  WHERE  p.id = auth.uid()
    AND (
      p.org_role = 'superadmin'
      OR EXISTS (SELECT 1 FROM team_roles tr WHERE tr.team_id = t.id AND tr.profile_id = p.id)
    )
$$;

CREATE OR REPLACE FUNCTION writable_team_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id
  FROM   teams         t
  JOIN   organizations o ON o.id = t.organization_id
  JOIN   profiles      p ON p.organization_id = o.id
  WHERE  p.id = auth.uid()
    AND (
      p.org_role = 'superadmin'
      OR EXISTS (
        SELECT 1 FROM team_roles tr
        WHERE tr.team_id = t.id AND tr.profile_id = p.id AND tr.role IN ('admin', 'editor')
      )
    )
$$;

CREATE OR REPLACE FUNCTION admin_team_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id
  FROM   teams         t
  JOIN   organizations o ON o.id = t.organization_id
  JOIN   profiles      p ON p.organization_id = o.id
  WHERE  p.id = auth.uid()
    AND (
      p.org_role = 'superadmin'
      OR EXISTS (
        SELECT 1 FROM team_roles tr
        WHERE tr.team_id = t.id AND tr.profile_id = p.id AND tr.role = 'admin'
      )
    )
$$;

-- Helper RLS : le profil courant a-t-il un rôle admin/editor sur AU MOINS UNE
-- équipe (ou est superadmin) ? Utilisé pour fermer le contournement de la branche
-- player_id de action_write/objective_write : sans ce garde-fou, un Viewer (ou un
-- profil sans aucune ligne team_roles) pouvait écrire des actions/objectifs
-- "joueur" librement, car cette branche reste org-wide (players non rattachés à
-- une équipe unique — cf. phase 8). Contrôle plus grossier qu'un vrai rattachement
-- par joueur, mais exclut correctement les Viewers et les comptes sans rôle.
CREATE OR REPLACE FUNCTION is_editor_anywhere()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT is_superadmin() OR EXISTS (
    SELECT 1 FROM team_roles WHERE profile_id = auth.uid() AND role IN ('admin', 'editor')
  )
$$;

-- Changement de rôle organisation (superadmin/member) : réservé aux superadmins
CREATE OR REPLACE FUNCTION set_user_org_role(p_user_id UUID, p_org_role TEXT)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_caller_org  UUID;
  v_caller_role TEXT;
  v_target_org  UUID;
BEGIN
  SELECT organization_id, org_role INTO v_caller_org, v_caller_role
    FROM profiles WHERE id = auth.uid();

  IF v_caller_role != 'superadmin' THEN
    RAISE EXCEPTION 'Permission refusée : seul un superadmin peut modifier les rôles';
  END IF;

  SELECT organization_id INTO v_target_org
    FROM profiles WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Utilisateur introuvable : %', p_user_id;
  END IF;

  IF v_caller_org IS DISTINCT FROM v_target_org THEN
    RAISE EXCEPTION 'Permission refusée : utilisateur hors de votre organisation';
  END IF;

  IF p_org_role NOT IN ('superadmin', 'member') THEN
    RAISE EXCEPTION 'Rôle invalide : superadmin ou member attendu';
  END IF;

  -- Lève le drapeau de session (scope transaction) pour passer le garde-fou
  -- trg_protect_profile_privileged_columns le temps de cet UPDATE.
  PERFORM set_config('app.bypass_profile_role_guard', 'on', true);
  UPDATE profiles SET org_role = p_org_role WHERE id = p_user_id;
END;
$$;

-- 4b. RLS : profiles — lecture des autres membres de l'organisation (sinon
--     les noms n'apparaissent pas dans l'assignation des rôles par équipe)
DROP POLICY IF EXISTS "profiles_org_visible" ON profiles;
CREATE POLICY "profiles_org_visible" ON profiles
  FOR SELECT TO authenticated
  USING (organization_id = my_organization_id());

-- 5. RLS : team_roles (nouvelle table)
ALTER TABLE team_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_roles_select" ON team_roles;
CREATE POLICY "team_roles_select" ON team_roles
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

DROP POLICY IF EXISTS "team_roles_write" ON team_roles;
CREATE POLICY "team_roles_write" ON team_roles
  FOR ALL TO authenticated
  USING      (is_superadmin())
  WITH CHECK (is_superadmin());

-- 6. RLS : organizations (org_update passe à superadmin)
DROP POLICY IF EXISTS "org_update" ON organizations;
CREATE POLICY "org_update" ON organizations
  FOR UPDATE TO authenticated
  USING (
    id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND org_role = 'superadmin')
  )
  WITH CHECK (
    id IN (SELECT organization_id FROM profiles WHERE id = auth.uid() AND org_role = 'superadmin')
  );

-- 7. RLS : teams (split select/insert/update/delete)
DROP POLICY IF EXISTS "team_access" ON teams;

DROP POLICY IF EXISTS "teams_select" ON teams;
CREATE POLICY "teams_select" ON teams
  FOR SELECT TO authenticated
  USING (id IN (SELECT * FROM accessible_team_ids()));

DROP POLICY IF EXISTS "teams_insert" ON teams;
CREATE POLICY "teams_insert" ON teams
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = (SELECT organization_id FROM profiles WHERE id = auth.uid())
    AND is_superadmin()
  );

DROP POLICY IF EXISTS "teams_update" ON teams;
CREATE POLICY "teams_update" ON teams
  FOR UPDATE TO authenticated
  USING      (id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (id IN (SELECT * FROM admin_team_ids()));

DROP POLICY IF EXISTS "teams_delete" ON teams;
CREATE POLICY "teams_delete" ON teams
  FOR DELETE TO authenticated
  USING (is_superadmin() AND id IN (SELECT * FROM accessible_team_ids()));

-- 8. RLS : seasons
DROP POLICY IF EXISTS "season_access" ON seasons;

DROP POLICY IF EXISTS "season_select" ON seasons;
CREATE POLICY "season_select" ON seasons
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

DROP POLICY IF EXISTS "season_write" ON seasons;
CREATE POLICY "season_write" ON seasons
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM admin_team_ids()));

-- 9. RLS : player_season
DROP POLICY IF EXISTS "player_season_access" ON player_season;

DROP POLICY IF EXISTS "player_season_select" ON player_season;
CREATE POLICY "player_season_select" ON player_season
  FOR SELECT TO authenticated
  USING (season_id IN (SELECT id FROM seasons WHERE team_id IN (SELECT * FROM accessible_team_ids())));

DROP POLICY IF EXISTS "player_season_write" ON player_season;
CREATE POLICY "player_season_write" ON player_season
  FOR ALL TO authenticated
  USING      (season_id IN (SELECT id FROM seasons WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (season_id IN (SELECT id FROM seasons WHERE team_id IN (SELECT * FROM writable_team_ids())));

-- 10. RLS : training_sessions
DROP POLICY IF EXISTS "training_session_access" ON training_sessions;

DROP POLICY IF EXISTS "training_session_select" ON training_sessions;
CREATE POLICY "training_session_select" ON training_sessions
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

DROP POLICY IF EXISTS "training_session_write" ON training_sessions;
CREATE POLICY "training_session_write" ON training_sessions
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

-- 11. RLS : session_blocks / session_team_blocks / session_teams / session_team_players
DROP POLICY IF EXISTS "session_blocks_access" ON session_blocks;
DROP POLICY IF EXISTS "session_blocks_select" ON session_blocks;
CREATE POLICY "session_blocks_select" ON session_blocks
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "session_blocks_write" ON session_blocks;
CREATE POLICY "session_blocks_write" ON session_blocks
  FOR ALL TO authenticated
  USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())));

DROP POLICY IF EXISTS "session_team_blocks_access" ON session_team_blocks;
DROP POLICY IF EXISTS "session_team_blocks_select" ON session_team_blocks;
CREATE POLICY "session_team_blocks_select" ON session_team_blocks
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "session_team_blocks_write" ON session_team_blocks;
CREATE POLICY "session_team_blocks_write" ON session_team_blocks
  FOR ALL TO authenticated
  USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())));

DROP POLICY IF EXISTS "session_teams_access" ON session_teams;
DROP POLICY IF EXISTS "session_teams_select" ON session_teams;
CREATE POLICY "session_teams_select" ON session_teams
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "session_teams_write" ON session_teams;
CREATE POLICY "session_teams_write" ON session_teams
  FOR ALL TO authenticated
  USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())));

DROP POLICY IF EXISTS "session_team_players_access" ON session_team_players;
DROP POLICY IF EXISTS "session_team_players_select" ON session_team_players;
CREATE POLICY "session_team_players_select" ON session_team_players
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "session_team_players_write" ON session_team_players;
CREATE POLICY "session_team_players_write" ON session_team_players
  FOR ALL TO authenticated
  USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())));

-- 11b. player_actions.team_id manquait dans le CREATE TABLE canonique (dérive de
--      doc préexistante, non causée par ce chantier) — sans impact si la colonne
--      existe déjà chez vous (ajoutée hors-bande), sinon nécessaire pour les
--      policies ci-dessous.
ALTER TABLE player_actions ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS player_actions_team_id_idx ON player_actions (team_id, status, due_date);

-- 12. RLS : player_actions / objectives (branche team_id → writable_team_ids ;
--     branche player_id fermée aux profils sans rôle admin/editor nulle part
--     via is_editor_anywhere() — cf. plan phase 8 pour le rattachement précis
--     par équipe via player_season, traité séparément)
DROP POLICY IF EXISTS "action_access" ON player_actions;

DROP POLICY IF EXISTS "action_select" ON player_actions;
CREATE POLICY "action_select" ON player_actions
  FOR SELECT TO authenticated
  USING (
    (player_id IS NOT NULL AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM accessible_team_ids()))
  );

DROP POLICY IF EXISTS "action_write" ON player_actions;
CREATE POLICY "action_write" ON player_actions
  FOR ALL TO authenticated
  USING (
    (player_id IS NOT NULL AND is_editor_anywhere() AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    (player_id IS NOT NULL AND is_editor_anywhere() AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM writable_team_ids()))
  );

DROP POLICY IF EXISTS "objective_access" ON objectives;

DROP POLICY IF EXISTS "objective_select" ON objectives;
CREATE POLICY "objective_select" ON objectives
  FOR SELECT TO authenticated
  USING (
    (player_id IS NOT NULL AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM accessible_team_ids()))
  );

DROP POLICY IF EXISTS "objective_write" ON objectives;
CREATE POLICY "objective_write" ON objectives
  FOR ALL TO authenticated
  USING (
    (player_id IS NOT NULL AND is_editor_anywhere() AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM writable_team_ids()))
  )
  WITH CHECK (
    (player_id IS NOT NULL AND is_editor_anywhere() AND player_id IN (
      SELECT id FROM players WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    ))
    OR (team_id IS NOT NULL AND team_id IN (SELECT * FROM writable_team_ids()))
  );

-- 13. RLS : matches / match_stats / team_match_stats / opponent_match_stats
DROP POLICY IF EXISTS "match_access" ON matches;
DROP POLICY IF EXISTS "match_select" ON matches;
CREATE POLICY "match_select" ON matches
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "match_write" ON matches;
CREATE POLICY "match_write" ON matches
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

DROP POLICY IF EXISTS "match_stats_access" ON match_stats;
DROP POLICY IF EXISTS "match_stats_select" ON match_stats;
CREATE POLICY "match_stats_select" ON match_stats
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "match_stats_write" ON match_stats;
CREATE POLICY "match_stats_write" ON match_stats
  FOR ALL TO authenticated
  USING      (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));

DROP POLICY IF EXISTS "team_match_stats_access" ON team_match_stats;
DROP POLICY IF EXISTS "team_match_stats_select" ON team_match_stats;
CREATE POLICY "team_match_stats_select" ON team_match_stats
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "team_match_stats_write" ON team_match_stats;
CREATE POLICY "team_match_stats_write" ON team_match_stats
  FOR ALL TO authenticated
  USING      (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));

DROP POLICY IF EXISTS "opponent_match_stats_access" ON opponent_match_stats;
DROP POLICY IF EXISTS "opponent_match_stats_select" ON opponent_match_stats;
CREATE POLICY "opponent_match_stats_select" ON opponent_match_stats
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "opponent_match_stats_write" ON opponent_match_stats;
CREATE POLICY "opponent_match_stats_write" ON opponent_match_stats
  FOR ALL TO authenticated
  USING      (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));

-- 14. RLS : staff / staff_meetings / training_attendance / session_documents
DROP POLICY IF EXISTS "staff_access" ON staff;
DROP POLICY IF EXISTS "staff_select" ON staff;
CREATE POLICY "staff_select" ON staff
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "staff_write" ON staff;
CREATE POLICY "staff_write" ON staff
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM admin_team_ids()));

DROP POLICY IF EXISTS "staff_meetings_access" ON staff_meetings;
DROP POLICY IF EXISTS "staff_meetings_select" ON staff_meetings;
CREATE POLICY "staff_meetings_select" ON staff_meetings
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "staff_meetings_write" ON staff_meetings;
CREATE POLICY "staff_meetings_write" ON staff_meetings
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

DROP POLICY IF EXISTS "training_attendance_access" ON training_attendance;
DROP POLICY IF EXISTS "training_attendance_select" ON training_attendance;
CREATE POLICY "training_attendance_select" ON training_attendance
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "training_attendance_write" ON training_attendance;
CREATE POLICY "training_attendance_write" ON training_attendance
  FOR ALL TO authenticated
  USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())));

DROP POLICY IF EXISTS "session_documents_access" ON session_documents;
DROP POLICY IF EXISTS "session_documents_select" ON session_documents;
CREATE POLICY "session_documents_select" ON session_documents
  FOR SELECT TO authenticated
  USING (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "session_documents_write" ON session_documents;
CREATE POLICY "session_documents_write" ON session_documents
  FOR ALL TO authenticated
  USING      (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (session_id IN (SELECT id FROM training_sessions WHERE team_id IN (SELECT * FROM writable_team_ids())));

-- 15. RLS : exercises / exercise_categories / exercise_images
DROP POLICY IF EXISTS "exercises_access" ON exercises;
DROP POLICY IF EXISTS "exercises_select" ON exercises;
CREATE POLICY "exercises_select" ON exercises
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "exercises_write" ON exercises;
CREATE POLICY "exercises_write" ON exercises
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

DROP POLICY IF EXISTS "exercise_categories_access" ON exercise_categories;
DROP POLICY IF EXISTS "exercise_categories_select" ON exercise_categories;
CREATE POLICY "exercise_categories_select" ON exercise_categories
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "exercise_categories_write" ON exercise_categories;
CREATE POLICY "exercise_categories_write" ON exercise_categories
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM admin_team_ids()));

DROP POLICY IF EXISTS "exercise_images_access" ON exercise_images;
DROP POLICY IF EXISTS "exercise_images_select" ON exercise_images;
CREATE POLICY "exercise_images_select" ON exercise_images
  FOR SELECT TO authenticated
  USING (exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "exercise_images_write" ON exercise_images;
CREATE POLICY "exercise_images_write" ON exercise_images
  FOR ALL TO authenticated
  USING      (exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM writable_team_ids())))
  WITH CHECK (exercise_id IN (SELECT id FROM exercises WHERE team_id IN (SELECT * FROM writable_team_ids())));

-- 16. RLS TACTIQUE — n'exécutez cette section QUE SI vous avez déjà les tables
--     tactical_categories / tactical_dimensions / tactical_events /
--     tactical_event_values / tactical_dashboard_widgets / tactical_dimension_options
--     dans votre base (fonctionnalité tactique déjà déployée). Sinon, supprimez-la.
DROP POLICY IF EXISTS "tactical_categories_access" ON tactical_categories;
DROP POLICY IF EXISTS "tactical_categories_select" ON tactical_categories;
CREATE POLICY "tactical_categories_select" ON tactical_categories
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "tactical_categories_write" ON tactical_categories;
CREATE POLICY "tactical_categories_write" ON tactical_categories
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

DROP POLICY IF EXISTS "tactical_dimensions_access" ON tactical_dimensions;
DROP POLICY IF EXISTS "tactical_dimensions_select" ON tactical_dimensions;
CREATE POLICY "tactical_dimensions_select" ON tactical_dimensions
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "tactical_dimensions_write" ON tactical_dimensions;
CREATE POLICY "tactical_dimensions_write" ON tactical_dimensions
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

DROP POLICY IF EXISTS "tactical_events_access" ON tactical_events;
DROP POLICY IF EXISTS "tactical_events_select" ON tactical_events;
CREATE POLICY "tactical_events_select" ON tactical_events
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "tactical_events_write" ON tactical_events;
CREATE POLICY "tactical_events_write" ON tactical_events
  FOR ALL TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));

DROP POLICY IF EXISTS "tactical_event_values_access" ON tactical_event_values;
DROP POLICY IF EXISTS "tactical_event_values_select" ON tactical_event_values;
CREATE POLICY "tactical_event_values_select" ON tactical_event_values
  FOR SELECT TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())));
DROP POLICY IF EXISTS "tactical_event_values_write" ON tactical_event_values;
CREATE POLICY "tactical_event_values_write" ON tactical_event_values
  FOR ALL TO authenticated
  USING (match_id IN (SELECT id FROM matches WHERE team_id IN (SELECT * FROM writable_team_ids())));

DROP POLICY IF EXISTS "tactical_dashboard_widgets_access" ON tactical_dashboard_widgets;
DROP POLICY IF EXISTS "tactical_dashboard_widgets_select" ON tactical_dashboard_widgets;
CREATE POLICY "tactical_dashboard_widgets_select" ON tactical_dashboard_widgets
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "tactical_dashboard_widgets_write" ON tactical_dashboard_widgets;
CREATE POLICY "tactical_dashboard_widgets_write" ON tactical_dashboard_widgets
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

DROP POLICY IF EXISTS "tactical_dimension_options_access" ON tactical_dimension_options;
DROP POLICY IF EXISTS "tactical_dimension_options_select" ON tactical_dimension_options;
CREATE POLICY "tactical_dimension_options_select" ON tactical_dimension_options
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));
DROP POLICY IF EXISTS "tactical_dimension_options_write" ON tactical_dimension_options;
CREATE POLICY "tactical_dimension_options_write" ON tactical_dimension_options
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM writable_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM writable_team_ids()));

-- 17. Vérifications suggérées après exécution :
--   SELECT id, org_role FROM profiles;                    -- doit être 'superadmin'/'member'
--   SELECT * FROM team_roles;                              -- backfill des anciens editors
--   SELECT * FROM pg_policies WHERE tablename = 'teams';   -- 4 policies : select/insert/update/delete
--
-- players, wellness_entries, medical_records, rpe_entries restent INCHANGÉS
-- (cloisonnement par organisation) — cf. plan, phase 8, traité séparément.

-- ─────────────────────────────────────────────────────────────────────────────
-- 18. Bloc tableau de bord "Tableau personnalisé" (type = 'custom_table') :
--     compose librement chaque ligne à partir d'options choisies par l'utilisateur
--     (catégorie/dimension/option), y compris de catégories différentes, avec
--     fusion de plusieurs options en une ligne sommée. category_id devient
--     nullable (NULL pour ce type — les catégories réelles utilisées sont
--     listées dans config.rows[].refs[].categoryId, cf. tacticalWidgetRenderer.tsx).
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tactical_dashboard_widgets ALTER COLUMN category_id DROP NOT NULL;
ALTER TABLE tactical_dashboard_widgets DROP CONSTRAINT tactical_dashboard_widgets_type_check;
ALTER TABLE tactical_dashboard_widgets ADD CONSTRAINT tactical_dashboard_widgets_type_check
  CHECK (type IN ('dimension_table', 'evolution_chart', 'cross_matrix', 'pie_chart', 'period_comparison', 'custom_table'));

-- ─────────────────────────────────────────────────────────────────────────────
-- 19. Notifications configurables (in-app / push / email)
--     Deux niveaux de réglage : l'équipe autorise une catégorie et ses canaux,
--     l'utilisateur choisit ensuite ce qu'il reçoit en push/email.
--     Convention : LIGNE ABSENTE = ACTIVÉ (défauts portés par shared/notifications.js),
--     donc aucun seeding n'est nécessaire pour les équipes/utilisateurs existants.
-- ─────────────────────────────────────────────────────────────────────────────

-- Contexte d'équipe + catégorie sur les notifications existantes (nullable : historique conservé).
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS team_id  UUID REFERENCES teams(id) ON DELETE CASCADE;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS category TEXT;

CREATE TABLE IF NOT EXISTS team_notification_settings (
  team_id        UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  category       TEXT NOT NULL,
  in_app_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  push_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (team_id, category)
);

DROP TRIGGER IF EXISTS trg_team_notification_settings_updated_at ON team_notification_settings;
CREATE TRIGGER trg_team_notification_settings_updated_at
  BEFORE UPDATE ON team_notification_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE team_notification_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "team_notification_settings_select" ON team_notification_settings;
CREATE POLICY "team_notification_settings_select" ON team_notification_settings
  FOR SELECT TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

DROP POLICY IF EXISTS "team_notification_settings_write" ON team_notification_settings;
CREATE POLICY "team_notification_settings_write" ON team_notification_settings
  FOR ALL TO authenticated
  USING      (team_id IN (SELECT * FROM admin_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM admin_team_ids()));

-- L'in-app n'est pas désactivable côté utilisateur : c'est le centre de notifications.
CREATE TABLE IF NOT EXISTS user_notification_preferences (
  user_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  category      TEXT NOT NULL,
  push_enabled  BOOLEAN NOT NULL DEFAULT TRUE,
  email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (user_id, category)
);

DROP TRIGGER IF EXISTS trg_user_notification_preferences_updated_at ON user_notification_preferences;
CREATE TRIGGER trg_user_notification_preferences_updated_at
  BEFORE UPDATE ON user_notification_preferences
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE user_notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_notification_preferences_own" ON user_notification_preferences;
CREATE POLICY "user_notification_preferences_own" ON user_notification_preferences
  FOR ALL TO authenticated
  USING      (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Destinataires d'une notification d'équipe, avec les canaux effectifs après
-- croisement des réglages équipe et des préférences utilisateur.
-- Mêmes règles d'accès que accessible_team_ids(), appliquées dans l'autre sens :
-- superadmin de l'org, OU ligne team_roles sur cette équipe.
CREATE OR REPLACE FUNCTION notification_recipients(
  p_team_id  UUID,
  p_category TEXT,
  p_exclude  UUID DEFAULT NULL
)
RETURNS TABLE (user_id UUID, in_app BOOLEAN, push BOOLEAN, email BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.id,
         COALESCE(ts.in_app_enabled, TRUE),
         COALESCE(ts.push_enabled,  TRUE) AND COALESCE(up.push_enabled,  TRUE),
         COALESCE(ts.email_enabled, TRUE) AND COALESCE(up.email_enabled, TRUE)
  FROM      teams    t
  JOIN      profiles p  ON p.organization_id = t.organization_id
  LEFT JOIN team_notification_settings    ts ON ts.team_id = t.id  AND ts.category = p_category
  LEFT JOIN user_notification_preferences up ON up.user_id = p.id  AND up.category = p_category
  WHERE t.id = p_team_id
    AND (p_exclude IS NULL OR p.id <> p_exclude)
    AND (
      p.org_role = 'superadmin'
      OR EXISTS (SELECT 1 FROM team_roles tr WHERE tr.team_id = t.id AND tr.profile_id = p.id)
    )
$$;

-- Équipe d'un joueur via la saison courante — utilisée par le dispatch serveur
-- pour les entrées bien-être publiques (formulaire anonyme, sans utilisateur connecté).
CREATE OR REPLACE FUNCTION player_current_team(p_player_id UUID)
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT s.team_id
  FROM   player_season ps
  JOIN   seasons       s ON s.id = ps.season_id
  WHERE  ps.player_id = p_player_id
    AND  s.is_current = TRUE
  LIMIT  1
$$;

-- Ces deux fonctions ne sont appelées que par les fonctions serverless (service role).
-- Sans ces révocations, tout utilisateur connecté pourrait énumérer les préférences
-- de notification de ses coéquipiers via l'API REST de Supabase.
REVOKE ALL ON FUNCTION notification_recipients(UUID, TEXT, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION notification_recipients(UUID, TEXT, UUID) TO service_role;
REVOKE ALL ON FUNCTION player_current_team(UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION player_current_team(UUID) TO service_role;


-- ─────────────────────────────────────────────────────────────────────────────
-- 19b. Journal de diffusion — idempotence des notifications calculées
--      Les rappels du cron (et l'alerte bien-être publique) peuvent être rejoués :
--      réessai Vercel, déclenchement manuel, ou simple exécution quotidienne sur
--      une fenêtre de plusieurs jours. Sans trace, chaque rejeu renotifie.
--
--      Cette trace est volontairement SÉPARÉE de `notifications` : si une équipe
--      coupe le canal in-app, aucune ligne n'y est écrite et un contrôle basé sur
--      elle laisserait repartir le push indéfiniment.
--
--      La clé primaire fait l'idempotence : on insère d'abord, et une violation
--      d'unicité signifie « déjà diffusé » — atomique, donc sans course entre
--      deux exécutions concurrentes.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS notification_dispatch_log (
  dedup_key  TEXT NOT NULL,  -- ex. 'task_due_soon:<uuid>'
  dedup_day  DATE NOT NULL,  -- jour de diffusion, ou date de l'entité pour une idempotence définitive
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  PRIMARY KEY (dedup_key, dedup_day)
);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_log_created
  ON notification_dispatch_log (created_at);

-- Aucune policy : seules les fonctions serverless (service role, qui contourne RLS)
-- écrivent ici. Un client authentifié ne doit ni lire ni écrire ce journal.
ALTER TABLE notification_dispatch_log ENABLE ROW LEVEL SECURITY;


-- ─────────────────────────────────────────────────────────────────────────────
-- 19c. Garde-fous de diffusion : droit d'écriture et limitation de débit
-- ─────────────────────────────────────────────────────────────────────────────

-- Émettre une notification est une écriture : un rôle 'viewer' ne doit pas pouvoir
-- pousser un message à toute l'équipe. Même logique que writable_team_ids(), mais
-- paramétrée par utilisateur (les fonctions serverless n'ont pas d'auth.uid()).
CREATE OR REPLACE FUNCTION team_write_access(p_user_id UUID, p_team_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM   teams    t
    JOIN   profiles p ON p.organization_id = t.organization_id
    WHERE  t.id = p_team_id
      AND  p.id = p_user_id
      AND (
        p.org_role = 'superadmin'
        OR EXISTS (
          SELECT 1 FROM team_roles tr
          WHERE tr.team_id = t.id AND tr.profile_id = p.id AND tr.role IN ('admin', 'editor')
        )
      )
  )
$$;

CREATE TABLE IF NOT EXISTS notification_rate_limit (
  user_id      UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  window_start TIMESTAMPTZ NOT NULL,
  count        INTEGER     NOT NULL DEFAULT 0,

  PRIMARY KEY (user_id, window_start)
);

ALTER TABLE notification_rate_limit ENABLE ROW LEVEL SECURITY;

-- Incrémente le compteur de la fenêtre courante et dit si l'appel reste sous la
-- limite. L'upsert rend l'opération atomique : deux requêtes simultanées ne peuvent
-- pas contourner le plafond en lisant la même valeur.
CREATE OR REPLACE FUNCTION notification_rate_bump(
  p_user_id        UUID,
  p_limit          INTEGER,
  p_window_seconds INTEGER
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_window TIMESTAMPTZ := to_timestamp(
    floor(extract(epoch FROM NOW()) / p_window_seconds) * p_window_seconds
  );
  v_count INTEGER;
BEGIN
  INSERT INTO notification_rate_limit (user_id, window_start, count)
  VALUES (p_user_id, v_window, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET count = notification_rate_limit.count + 1
  RETURNING count INTO v_count;

  DELETE FROM notification_rate_limit WHERE window_start < v_window - INTERVAL '1 hour';

  RETURN v_count <= p_limit;
END;
$$;

REVOKE ALL ON FUNCTION team_write_access(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION team_write_access(UUID, UUID) TO service_role;
REVOKE ALL ON FUNCTION notification_rate_bump(UUID, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION notification_rate_bump(UUID, INTEGER, INTEGER) TO service_role;


-- ================================================================
-- OPS — Déplacer une équipe vers une autre organisation
--
-- Seules 4 tables portent organization_id : teams, players, profiles et
-- notifications. Tout le reste est rattaché par team_id / season_id /
-- player_id et suit donc l'équipe automatiquement. Déplacer une équipe se
-- réduit à traiter ces 4 tables — et surtout players, dont le lien à
-- l'équipe est indirect (player_season → seasons → teams) et que la policy
-- player_access cloisonne par organisation : sans cette étape, l'effectif
-- reste visible dans l'ancienne organisation et les noms disparaissent des
-- séances/RPE de la nouvelle.
--
-- Fonction d'exploitation, PAS destinée au client : elle traverse le
-- cloisonnement par organisation. D'où le REVOKE en fin de section — seul
-- le propriétaire (postgres, via le SQL Editor) peut l'exécuter.
--
-- Idempotente : l'effectif à déplacer est déduit des données de l'équipe,
-- jamais de l'ancienne organisation. La fonction marche donc aussi bien
-- avant qu'après un UPDATE manuel de teams.organization_id, et un second
-- appel ne fait plus rien.
--
--   -- 1. plan sans écriture
--   SELECT * FROM move_team_to_organization('<team>', '<org>');
--   -- 2. exécution
--   SELECT * FROM move_team_to_organization('<team>', '<org>', p_dry_run => FALSE);
-- ================================================================

CREATE OR REPLACE FUNCTION move_team_to_organization(
  p_team_id             UUID,
  p_org_id              UUID,
  p_dry_run             BOOLEAN DEFAULT TRUE,
  p_allow_shared        BOOLEAN DEFAULT FALSE,
  p_purge_foreign_roles BOOLEAN DEFAULT FALSE
)
RETURNS TABLE (etape TEXT, lignes BIGINT, action TEXT)
LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_team_org UUID;
  v_players  UUID[];
  v_shared   TEXT;
  v_n        BIGINT;
BEGIN
  SELECT t.organization_id INTO v_team_org FROM teams t WHERE t.id = p_team_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Équipe introuvable : %', p_team_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM organizations o WHERE o.id = p_org_id) THEN
    RAISE EXCEPTION 'Organisation introuvable : %', p_org_id;
  END IF;

  -- Effectif rattaché à l'équipe par N'IMPORTE QUEL chemin de données, et pas
  -- seulement par player_season : une joueuse peut porter un RPE ou une feuille
  -- de match sur l'équipe sans inscription en saison (import, désinscription en
  -- cours de saison). S'appuyer sur player_season seul laisserait ces joueuses
  -- derrière, avec des stats d'équipe amputées et sans nom.
  SELECT array_agg(DISTINCT u.pid) INTO v_players FROM (
    SELECT ps.player_id AS pid
      FROM player_season ps JOIN seasons s ON s.id = ps.season_id
     WHERE s.team_id = p_team_id
    UNION
    SELECT r.player_id
      FROM rpe_entries r JOIN training_sessions ts ON ts.id = r.session_id
     WHERE ts.team_id = p_team_id
    UNION
    SELECT ta.player_id
      FROM training_attendance ta JOIN training_sessions ts ON ts.id = ta.session_id
     WHERE ts.team_id = p_team_id
    UNION
    SELECT stp.player_id
      FROM session_team_players stp JOIN training_sessions ts ON ts.id = stp.session_id
     WHERE ts.team_id = p_team_id
    UNION
    SELECT ms.player_id
      FROM match_stats ms JOIN matches m ON m.id = ms.match_id
     WHERE m.team_id = p_team_id
    UNION
    SELECT pa.player_id FROM player_actions pa
     WHERE pa.team_id = p_team_id AND pa.player_id IS NOT NULL
    UNION
    SELECT o.player_id FROM objectives o
     WHERE o.team_id = p_team_id AND o.player_id IS NOT NULL
  ) u;

  v_players := COALESCE(v_players, ARRAY[]::UUID[]);

  -- Garde-fou : une joueuse inscrite à la saison d'une AUTRE équipe est partagée.
  -- La déplacer la ferait sortir de l'organisation de cette autre équipe, dont
  -- elle disparaîtrait (player_access). Ces cas demandent une duplication de la
  -- fiche joueuse, pas un déplacement — d'où l'arrêt plutôt qu'un choix implicite.
  SELECT string_agg(pl.last_name || ' ' || pl.first_name, ', ' ORDER BY pl.last_name)
    INTO v_shared
    FROM players pl
   WHERE pl.id = ANY(v_players)
     AND EXISTS (
       SELECT 1 FROM player_season ps JOIN seasons s ON s.id = ps.season_id
        WHERE ps.player_id = pl.id AND s.team_id <> p_team_id
     );

  IF v_shared IS NOT NULL AND NOT p_allow_shared THEN
    RAISE EXCEPTION 'Joueuses partagées avec une autre équipe : %. '
                    'Dupliquez-les puis relancez, ou forcez avec p_allow_shared => TRUE.', v_shared;
  END IF;

  -- ── 1. L'équipe ────────────────────────────────────────────────
  v_n := CASE WHEN v_team_org IS DISTINCT FROM p_org_id THEN 1 ELSE 0 END;
  IF v_n > 0 AND NOT p_dry_run THEN
    UPDATE teams SET organization_id = p_org_id WHERE id = p_team_id;
  END IF;
  etape  := 'teams.organization_id';
  lignes := v_n;
  action := CASE WHEN v_n = 0 THEN 'déjà dans l''organisation cible' ELSE 'déplacée' END;
  RETURN NEXT;

  -- ── 2. L'effectif ──────────────────────────────────────────────
  SELECT count(*) INTO v_n FROM players pl
   WHERE pl.id = ANY(v_players) AND pl.organization_id IS DISTINCT FROM p_org_id;
  IF v_n > 0 AND NOT p_dry_run THEN
    UPDATE players SET organization_id = p_org_id
     WHERE id = ANY(v_players) AND organization_id IS DISTINCT FROM p_org_id;
  END IF;
  etape  := 'players.organization_id';
  lignes := v_n;
  action := format('%s joueuse(s) rattachée(s) à l''équipe, dont %s à déplacer',
                   cardinality(v_players), v_n);
  RETURN NEXT;

  -- ── 3. Notifications obsolètes ─────────────────────────────────
  -- notifications_user_own filtre sur user_id, pas sur l'organisation : sans
  -- purge, les anciens membres gardent des notifications pointant vers des
  -- entités que la RLS leur masque désormais. Le filtre sur organization_id
  -- (figée à la création) épargne les notifications émises depuis le
  -- déplacement, côté nouvelle organisation.
  SELECT count(*) INTO v_n FROM notifications n
   WHERE n.organization_id IS DISTINCT FROM p_org_id
     AND (   n.entity_id = ANY(v_players)
          OR n.entity_id IN (SELECT id FROM training_sessions WHERE team_id = p_team_id)
          OR n.entity_id IN (SELECT id FROM matches           WHERE team_id = p_team_id)
          OR n.entity_id IN (SELECT id FROM seasons           WHERE team_id = p_team_id));
  IF v_n > 0 AND NOT p_dry_run THEN
    DELETE FROM notifications n
     WHERE n.organization_id IS DISTINCT FROM p_org_id
       AND (   n.entity_id = ANY(v_players)
            OR n.entity_id IN (SELECT id FROM training_sessions WHERE team_id = p_team_id)
            OR n.entity_id IN (SELECT id FROM matches           WHERE team_id = p_team_id)
            OR n.entity_id IN (SELECT id FROM seasons           WHERE team_id = p_team_id));
  END IF;
  etape  := 'notifications obsolètes';
  lignes := v_n;
  action := CASE WHEN p_dry_run THEN 'à supprimer' ELSE 'supprimées' END;
  RETURN NEXT;

  -- ── 4. Rôles d'équipe hérités ──────────────────────────────────
  -- accessible_team_ids() joint profiles.organization_id = teams.organization_id :
  -- ces lignes n'ouvrent plus aucun droit, mais restent affichées sans nom dans
  -- la config des rôles (profiles_org_visible masque leur profil).
  SELECT count(*) INTO v_n
    FROM team_roles tr JOIN profiles pr ON pr.id = tr.profile_id
   WHERE tr.team_id = p_team_id AND pr.organization_id IS DISTINCT FROM p_org_id;
  IF v_n > 0 AND p_purge_foreign_roles AND NOT p_dry_run THEN
    DELETE FROM team_roles tr USING profiles pr
     WHERE pr.id = tr.profile_id
       AND tr.team_id = p_team_id AND pr.organization_id IS DISTINCT FROM p_org_id;
  END IF;
  etape  := 'team_roles hors organisation';
  lignes := v_n;
  action := CASE WHEN v_n = 0 THEN 'aucun'
                 WHEN p_purge_foreign_roles THEN 'purgés'
                 ELSE 'conservés — p_purge_foreign_roles => TRUE pour purger' END;
  RETURN NEXT;

  -- ── 5. Intervenants liés à un compte de l'ancienne organisation ─
  -- On délie le compte sans supprimer l'intervenant : la fiche staff porte
  -- l'historique (player_actions.assigned_to, staff_meetings).
  SELECT count(*) INTO v_n
    FROM staff st JOIN profiles pr ON pr.id = st.profile_id
   WHERE st.team_id = p_team_id AND pr.organization_id IS DISTINCT FROM p_org_id;
  IF v_n > 0 AND p_purge_foreign_roles AND NOT p_dry_run THEN
    UPDATE staff st SET profile_id = NULL
      FROM profiles pr
     WHERE pr.id = st.profile_id
       AND st.team_id = p_team_id AND pr.organization_id IS DISTINCT FROM p_org_id;
  END IF;
  etape  := 'staff.profile_id hors organisation';
  lignes := v_n;
  action := CASE WHEN v_n = 0 THEN 'aucun'
                 WHEN p_purge_foreign_roles THEN 'comptes déliés (fiches conservées)'
                 ELSE 'conservés — p_purge_foreign_roles => TRUE pour délier' END;
  RETURN NEXT;

  -- ── 6. Auteurs hors organisation (informatif) ──────────────────
  SELECT (SELECT count(*) FROM training_sessions ts JOIN profiles pr ON pr.id = ts.created_by
           WHERE ts.team_id = p_team_id AND pr.organization_id IS DISTINCT FROM p_org_id)
       + (SELECT count(*) FROM objectives o JOIN profiles pr ON pr.id = o.created_by
           WHERE o.team_id = p_team_id AND pr.organization_id IS DISTINCT FROM p_org_id)
       + (SELECT count(*) FROM player_actions pa JOIN profiles pr ON pr.id = pa.created_by
           WHERE pa.team_id = p_team_id AND pr.organization_id IS DISTINCT FROM p_org_id)
    INTO v_n;
  etape  := 'created_by hors organisation';
  lignes := v_n;
  action := 'informatif — auteur affiché vide, aucune donnée cassée';
  RETURN NEXT;

  IF p_dry_run THEN
    etape  := '⚠ SIMULATION';
    lignes := 0;
    action := 'aucune écriture — relancez avec p_dry_run => FALSE';
    RETURN NEXT;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION move_team_to_organization(UUID, UUID, BOOLEAN, BOOLEAN, BOOLEAN)
  FROM PUBLIC, anon, authenticated;

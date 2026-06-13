-- ================================================================
-- STAMINA — Schéma Supabase
-- ================================================================
-- Corrections appliquées :
--   • int renommé intercepts (mot-clé PostgreSQL réservé)
--   • Métriques avancées en colonnes GENERATED (pas stockées)
--   • Table seasons (séparation historique saison)
--   • Table training_sessions (RPE session-based)
--   • Table matches (entité centrale, lien match_stats ↔ team_match_stats)
--   • Table organizations (niveau club)
--   • Table staff (intervenants avec ou sans compte app)
--   • Table player_team_history (transferts intra-club)
--   • medical_records.resolved_date remplace days_absent
--   • player_actions.completed_at + trigger automatique
--   • position validée via enum basketball_position
--   • game_number sur matches
--   • RLS team-scoped
--   • Formule wellness correcte (métriques inversées)
-- ================================================================


-- ────────────────────────────────────────────────────────────────
-- 1. ENUMS
-- ────────────────────────────────────────────────────────────────

CREATE TYPE player_status        AS ENUM ('active', 'injured', 'limited', 'suspended', 'unavailable');
CREATE TYPE basketball_position  AS ENUM ('Meneur', 'Arrière', 'Ailier', 'Ailier Fort', 'Pivot');
CREATE TYPE session_type         AS ENUM ('training', 'match', 'gym', 'rest');
CREATE TYPE medical_type         AS ENUM ('injury', 'checkup', 'treatment');
CREATE TYPE medical_severity     AS ENUM ('mild', 'moderate', 'severe');
CREATE TYPE medical_status       AS ENUM ('active', 'resolved');
CREATE TYPE action_status        AS ENUM ('todo', 'in_progress', 'waiting', 'done');
CREATE TYPE action_priority      AS ENUM ('low', 'normal', 'high', 'critical');
CREATE TYPE action_category      AS ENUM (
  'medical', 'physical', 'mental', 'tactical',
  'administrative', 'interview', 'video', 'discussion'
);
CREATE TYPE home_away            AS ENUM ('home', 'away');
CREATE TYPE match_result         AS ENUM ('win', 'loss');


-- ────────────────────────────────────────────────────────────────
-- 2. FONCTION updated_at (réutilisée par tous les triggers)
-- ────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ────────────────────────────────────────────────────────────────
-- 3. ORGANIZATIONS (niveau club — ex : "AL Meyzieu")
-- ────────────────────────────────────────────────────────────────

CREATE TABLE organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ────────────────────────────────────────────────────────────────
-- 4. TEAMS
-- ────────────────────────────────────────────────────────────────

CREATE TABLE teams (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL,           -- 'NF2', 'U21', 'U18'
  color           TEXT NOT NULL DEFAULT '#3B82F6',
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────
-- 5. SEASONS
--    • season est une entité indépendante avec des bornes de date
--    • plus jamais lié à un label texte sur l'équipe
-- ────────────────────────────────────────────────────────────────

CREATE TABLE seasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  label       TEXT NOT NULL,         -- '2025/2026'
  start_date  DATE NOT NULL,
  end_date    DATE NOT NULL,
  total_games SMALLINT,              -- nb de journées au calendrier
  is_current  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (team_id, label),
  CONSTRAINT season_dates_valid CHECK (end_date > start_date)
);

-- Une seule saison courante par équipe
CREATE UNIQUE INDEX one_current_season_per_team
  ON seasons (team_id)
  WHERE is_current = TRUE;


-- ────────────────────────────────────────────────────────────────
-- 6. PROFILES (extension de auth.users — comptes staff app)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE profiles (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES organizations(id),
  first_name      TEXT NOT NULL DEFAULT '',
  last_name       TEXT NOT NULL DEFAULT '',
  -- 'admin' | 'coach' | 'staff' | 'medical'
  role            TEXT NOT NULL DEFAULT 'staff',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger : création automatique du profil à l'inscription
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO profiles (id, first_name, last_name, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
    COALESCE(NEW.raw_user_meta_data->>'last_name',  ''),
    COALESCE(NEW.raw_user_meta_data->>'role', 'staff')
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();


-- ────────────────────────────────────────────────────────────────
-- 7. STAFF
--    • Séparé de profiles : un intervenant (kiné, médecin) peut
--      exister sans avoir de compte dans l'app
-- ────────────────────────────────────────────────────────────────

CREATE TABLE staff (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  profile_id      UUID REFERENCES profiles(id),  -- NULL si pas de compte
  first_name      TEXT NOT NULL,
  last_name       TEXT NOT NULL,
  -- 'coach' | 'kine' | 'medecin' | 'prep_physique' | 'analyste'
  role            TEXT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON staff (organization_id);


-- ────────────────────────────────────────────────────────────────
-- 8. PLAYERS
--    • Rattachés à l'organisation, pas directement à une équipe
--    • L'affectation à une saison passe par player_season
--    • La team est retrouvable indirectement via seasons.team_id
-- ────────────────────────────────────────────────────────────────

CREATE TABLE players (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  first_name         TEXT NOT NULL,
  last_name          TEXT NOT NULL,
  number             SMALLINT NOT NULL,
  position           basketball_position NOT NULL,
  secondary_position basketball_position,
  -- Champ autoritaire géré par le staff (pas dérivé auto des medical_records)
  status             player_status NOT NULL DEFAULT 'active',
  nationality        CHAR(2) NOT NULL DEFAULT 'FR',
  birth_date         DATE NOT NULL,
  height_cm          SMALLINT CHECK (height_cm BETWEEN 140 AND 230),
  weight_kg          SMALLINT CHECK (weight_kg BETWEEN 40 AND 150),
  hand               TEXT NOT NULL DEFAULT 'right'
                       CHECK (hand IN ('right', 'left', 'both')),
  contract_end       DATE,
  avatar_url         TEXT,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON players (organization_id);

CREATE TRIGGER trg_players_updated_at
  BEFORE UPDATE ON players
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────
-- 9. PLAYER SEASON (inscription d'une joueuse à une saison)
--    • Lie une joueuse à une saison ; la team se retrouve via
--      seasons.team_id
--    • Contrainte d'unicité : une joueuse ne peut être inscrite
--      qu'une seule fois par saison
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
--     • Entité centrale du RPE : le coach crée UNE session,
--       chaque joueuse y soumet son RPE
-- ────────────────────────────────────────────────────────────────

CREATE TABLE training_sessions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id        UUID NOT NULL REFERENCES seasons(id),
  date             DATE NOT NULL,
  session_type     session_type NOT NULL,
  planned_duration SMALLINT NOT NULL CHECK (planned_duration BETWEEN 1 AND 300),
  notes            TEXT,
  created_by       UUID REFERENCES profiles(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON training_sessions (team_id, date DESC);


-- ────────────────────────────────────────────────────────────────
-- 11. RPE ENTRIES
--     • UNIQUE (session_id, player_id) : une joueuse soumet
--       son RPE une seule fois par session
--     • Absence = pas d'entrée (pas de valeur NULL)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE rpe_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id      UUID NOT NULL REFERENCES training_sessions(id) ON DELETE CASCADE,
  player_id       UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  rpe             SMALLINT NOT NULL CHECK (rpe BETWEEN 1 AND 10),
  actual_duration SMALLINT CHECK (actual_duration BETWEEN 1 AND 300),
  notes           TEXT,
  created_by      UUID REFERENCES profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (session_id, player_id)
);

CREATE INDEX ON rpe_entries (player_id, created_at DESC);
CREATE INDEX ON rpe_entries (session_id);


-- ────────────────────────────────────────────────────────────────
-- 12. WELLNESS ENTRIES
--     • score GENERATED avec la formule correcte :
--       fatigue/stress/soreness sont des métriques INVERSÉES
--       (8 de fatigue = mauvais → contribue peu au score)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE wellness_entries (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id   UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date        DATE NOT NULL,
  fatigue     SMALLINT NOT NULL CHECK (fatigue    BETWEEN 1 AND 10),
  mood        SMALLINT NOT NULL CHECK (mood       BETWEEN 1 AND 10),
  stress      SMALLINT NOT NULL CHECK (stress     BETWEEN 1 AND 10),
  motivation  SMALLINT NOT NULL CHECK (motivation BETWEEN 1 AND 10),
  sleep       SMALLINT NOT NULL CHECK (sleep      BETWEEN 1 AND 10),
  soreness    SMALLINT NOT NULL CHECK (soreness   BETWEEN 1 AND 10),

  -- Formule : inverser fatigue, stress, soreness
  -- Score max = 10 (toutes métriques positives) ; min ≈ 0
  score       NUMERIC(3,1) GENERATED ALWAYS AS (
    ROUND(
      ((10 - fatigue) + mood + (10 - stress) + motivation + sleep + (10 - soreness))::NUMERIC / 6,
      1
    )
  ) STORED,

  notes       TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (player_id, date)
);

CREATE INDEX ON wellness_entries (player_id, date DESC);


-- ────────────────────────────────────────────────────────────────
-- 13. MEDICAL RECORDS
--     • resolved_date remplace days_absent (calculable : resolved_date - date)
--     • Contrainte : un dossier resolved doit avoir une resolved_date
--     • created_by / updated_by → staff (pas profiles)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE medical_records (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id     UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  date          DATE NOT NULL,
  type          medical_type NOT NULL,
  description   TEXT NOT NULL,
  location      TEXT,
  severity      medical_severity,
  status        medical_status NOT NULL DEFAULT 'active',
  rtp_date      DATE,
  resolved_date DATE,                    -- remplace days_absent
  rtp_step      SMALLINT DEFAULT 0 CHECK (rtp_step >= 0),
  rtp_total     SMALLINT DEFAULT 6 CHECK (rtp_total > 0),
  treatment     TEXT,
  created_by    UUID REFERENCES staff(id),
  updated_by    UUID REFERENCES staff(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT rtp_step_valid     CHECK (rtp_step IS NULL OR rtp_total IS NULL OR rtp_step <= rtp_total),
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
    WHEN type = 'injury' AND rtp_date IS NOT NULL      THEN rtp_date - date
    ELSE NULL
  END AS days_absent
FROM medical_records;


-- ────────────────────────────────────────────────────────────────
-- 14. PLAYER ACTIONS
--     • assigned_to → staff (pas profiles) : supporte les
--       intervenants externes sans compte app
--     • completed_at : renseigné automatiquement par trigger
-- ────────────────────────────────────────────────────────────────

CREATE TABLE player_actions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  player_id    UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  title        TEXT NOT NULL,
  description  TEXT,
  category     action_category NOT NULL,
  priority     action_priority NOT NULL DEFAULT 'normal',
  due_date     DATE NOT NULL,
  assigned_to  UUID REFERENCES staff(id),
  status       action_status NOT NULL DEFAULT 'todo',
  completed_at TIMESTAMPTZ,             -- SET auto via trigger
  created_by   UUID REFERENCES profiles(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX ON player_actions (player_id, status, due_date);
CREATE INDEX ON player_actions (assigned_to, status);
CREATE INDEX ON player_actions (due_date) WHERE status != 'done';

CREATE TRIGGER trg_player_actions_updated_at
  BEFORE UPDATE ON player_actions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Trigger : completed_at automatique
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
-- 15. MATCHES (entité centrale)
--     • Source de vérité pour date/adversaire/résultat/score
--     • match_stats ET team_match_stats y référencent via match_id
--     • game_number = numéro de journée (J14, J13…)
-- ────────────────────────────────────────────────────────────────

CREATE TABLE matches (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  season_id   UUID NOT NULL REFERENCES seasons(id),
  game_number SMALLINT,
  date        DATE NOT NULL,
  opponent    TEXT NOT NULL,
  home_away   home_away NOT NULL DEFAULT 'home',
  competition TEXT NOT NULL DEFAULT 'NF2',
  result      match_result NOT NULL,
  score_us    SMALLINT NOT NULL CHECK (score_us    >= 0),
  score_them  SMALLINT NOT NULL CHECK (score_them  >= 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (team_id, date, opponent)
);

CREATE INDEX ON matches (team_id, season_id, date DESC);

CREATE TRIGGER trg_matches_updated_at
  BEFORE UPDATE ON matches
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ────────────────────────────────────────────────────────────────
-- 16. MATCH STATS (statistiques individuelles)
--     • pts : GENERATED (fg2m×2 + fg3m×3 + ftm) — jamais à insérer
--     • intercepts : renommé depuis int (mot-clé réservé)
--     • UNIQUE (match_id, player_id) : une ligne par joueuse par match
-- ────────────────────────────────────────────────────────────────

CREATE TABLE match_stats (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id   UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE,
  player_id  UUID NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  starter    BOOLEAN NOT NULL DEFAULT FALSE,
  min        NUMERIC(4,1) NOT NULL DEFAULT 0,

  -- Tirs
  fg2m       SMALLINT NOT NULL DEFAULT 0,
  fg2a       SMALLINT NOT NULL DEFAULT 0,
  fg3m       SMALLINT NOT NULL DEFAULT 0,
  fg3a       SMALLINT NOT NULL DEFAULT 0,
  ftm        SMALLINT NOT NULL DEFAULT 0,
  fta        SMALLINT NOT NULL DEFAULT 0,

  -- Points : toujours cohérents avec les tirs
  pts        SMALLINT GENERATED ALWAYS AS (fg2m * 2 + fg3m * 3 + ftm) STORED,

  -- Rebonds
  ro         SMALLINT NOT NULL DEFAULT 0,
  rd         SMALLINT NOT NULL DEFAULT 0,

  -- Passes / Défense
  pd         SMALLINT NOT NULL DEFAULT 0,
  ct         SMALLINT NOT NULL DEFAULT 0,
  intercepts SMALLINT NOT NULL DEFAULT 0,  -- anciennement "int"
  bp         SMALLINT NOT NULL DEFAULT 0,

  -- Fautes
  fpr        SMALLINT NOT NULL DEFAULT 0,  -- fautes personnelles commises
  fte        SMALLINT NOT NULL DEFAULT 0,  -- fautes reçues

  -- Fourni par la feuille de match officielle (FFBB)
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
-- 17. TEAM MATCH STATS (statistiques collectives)
--     • 1:1 avec matches (UNIQUE match_id)
--     • rt / opp_rt : GENERATED (ro+rd)
--     • Métriques avancées : toutes GENERATED depuis stats brutes
--     • off_rating / def_rating : dans la VIEW (besoin du score
--       de matches — impossible en GENERATED sans subquery)
--     • intercepts / opp_intercepts : renommés depuis int/opp_int
-- ────────────────────────────────────────────────────────────────

CREATE TABLE team_match_stats (
  id      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID NOT NULL REFERENCES matches(id) ON DELETE CASCADE UNIQUE,

  -- Stats brutes équipe
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

  -- Possessions (saisie manuelle — non calculable depuis box score seul)
  possessions     NUMERIC(5,1) NOT NULL DEFAULT 0,
  opp_possessions NUMERIC(5,1),

  -- Stats brutes adversaire
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

  -- Métriques avancées GÉNÉRÉES (cohérentes avec stats brutes)
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
    THEN ROUND(m.score_us::NUMERIC  / tms.possessions * 100, 1)
    ELSE NULL END AS off_rating,
  CASE WHEN tms.possessions > 0
    THEN ROUND(m.score_them::NUMERIC / tms.possessions * 100, 1)
    ELSE NULL END AS def_rating
FROM team_match_stats tms
JOIN matches m ON m.id = tms.match_id;


-- ────────────────────────────────────────────────────────────────
-- 18. ROW LEVEL SECURITY
--     • Cloisonnement par équipe : un staff ne voit que les
--       données des joueuses de son équipe
--     • Les données médicales / wellness sont des données de santé
--       (RGPD) — le cloisonnement est obligatoire
-- ────────────────────────────────────────────────────────────────

ALTER TABLE organizations        ENABLE ROW LEVEL SECURITY;
ALTER TABLE teams                ENABLE ROW LEVEL SECURITY;
ALTER TABLE seasons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE players              ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_season         ENABLE ROW LEVEL SECURITY;
ALTER TABLE training_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE rpe_entries        ENABLE ROW LEVEL SECURITY;
ALTER TABLE wellness_entries   ENABLE ROW LEVEL SECURITY;
ALTER TABLE medical_records    ENABLE ROW LEVEL SECURITY;
ALTER TABLE player_actions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches            ENABLE ROW LEVEL SECURITY;
ALTER TABLE match_stats        ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_match_stats   ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff              ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles           ENABLE ROW LEVEL SECURITY;

-- Helper : équipes accessibles par l'utilisateur courant
CREATE OR REPLACE FUNCTION accessible_team_ids()
RETURNS SETOF UUID LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT t.id
  FROM teams t
  JOIN organizations o ON o.id = t.organization_id
  JOIN profiles p ON p.organization_id = o.id
  WHERE p.id = auth.uid()
$$;

-- Profil : chaque utilisateur gère uniquement le sien
CREATE POLICY "own_profile" ON profiles
  FOR ALL TO authenticated
  USING  (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Organisations : visibles si l'utilisateur y appartient
CREATE POLICY "org_access" ON organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Équipes : accès limité aux équipes de l'organisation
CREATE POLICY "team_access" ON teams
  FOR ALL TO authenticated
  USING (id IN (SELECT * FROM accessible_team_ids()))
  WITH CHECK (
    organization_id = (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

-- Saisons : suivent les équipes
CREATE POLICY "season_access" ON seasons
  FOR ALL TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()))
  WITH CHECK (team_id IN (SELECT * FROM accessible_team_ids()));

-- Joueuses : cloisonnement par organisation
CREATE POLICY "player_access" ON players
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()))
  WITH CHECK (organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid()));

-- Inscription joueuse/saison : accessible si la saison appartient à une équipe de l'organisation
CREATE POLICY "player_season_access" ON player_season
  FOR ALL TO authenticated
  USING (
    season_id IN (
      SELECT id FROM seasons WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  )
  WITH CHECK (
    season_id IN (
      SELECT id FROM seasons WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

-- Sessions d'entraînement : cloisonnement par équipe
CREATE POLICY "training_session_access" ON training_sessions
  FOR ALL TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

-- RPE : via la joueuse (organisation)
CREATE POLICY "rpe_access" ON rpe_entries
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players
      WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players
      WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Wellness : idem
CREATE POLICY "wellness_access" ON wellness_entries
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players
      WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players
      WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Dossiers médicaux : idem
CREATE POLICY "medical_access" ON medical_records
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players
      WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players
      WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Actions : idem
CREATE POLICY "action_access" ON player_actions
  FOR ALL TO authenticated
  USING (
    player_id IN (
      SELECT id FROM players
      WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  )
  WITH CHECK (
    player_id IN (
      SELECT id FROM players
      WHERE organization_id IN (SELECT organization_id FROM profiles WHERE id = auth.uid())
    )
  );

-- Matches : cloisonnement par équipe
CREATE POLICY "match_access" ON matches
  FOR ALL TO authenticated
  USING (team_id IN (SELECT * FROM accessible_team_ids()));

-- Stats individuelles : via match
CREATE POLICY "match_stats_access" ON match_stats
  FOR ALL TO authenticated
  USING (
    match_id IN (
      SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

-- Stats collectives : via match
CREATE POLICY "team_match_stats_access" ON team_match_stats
  FOR ALL TO authenticated
  USING (
    match_id IN (
      SELECT id FROM matches WHERE team_id IN (SELECT * FROM accessible_team_ids())
    )
  );

-- Staff : visible au niveau organisation
CREATE POLICY "staff_access" ON staff
  FOR ALL TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM profiles WHERE id = auth.uid()
    )
  );

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { teamsApi, seasonsApi } from '../api';
import { supabase } from '../api/client';
import type { Team, Season, OrgRole, TeamRole, WellnessEntryMethod } from '../data/types';

export interface TeamSeasonOption {
  team: Team;
  season: Season;
}

export interface LoadThresholds {
  lightMax:        number;
  normalMax:       number;
  sessionsPerWeek: number;
}

export interface StatThresholds {
  evalTOrange: number;
  evalTBlue:   number;
  evalTGreen:  number;
  ortgTAmber:  number;
  ortgTGreen:  number;
  drtgTAmber:  number;
  drtgTRed:    number;
}

interface Ctx {
  options:        TeamSeasonOption[];
  selected:       TeamSeasonOption | null;
  /** Bascule d'équipe/saison : sauvegarde le choix, pose équipe/saison dans l'URL, recharge —
   *  vers `pathname` si fourni ; sinon sur la page courante si seule la saison change, ou vers
   *  le tableau de bord si l'équipe change (la page courante peut référencer une ressource qui
   *  n'existe pas pour la nouvelle équipe). */
  selectAndGo:    (opt: TeamSeasonOption, pathname?: string) => void;
  loading:        boolean;
  reload:         () => void;
  thresholds:            LoadThresholds;
  statThresholds:        StatThresholds;
  defaultWellnessMethod: WellnessEntryMethod;
  publicWellnessMethod:  WellnessEntryMethod;
  orgId:          string | null;
  /** Superadmin : accès total à l'organisation (config club, toutes les équipes). */
  isSuperadmin:   boolean;
  /** true tant que org_role n'a pas encore été chargé (évite le flash "accès restreint"). */
  roleLoading:    boolean;
  /** Rôle du profil courant sur l'équipe sélectionnée (null = aucun accès, superadmin = 'admin' implicite). */
  teamRole:       TeamRole | null;
  /** true tant que teamRole n'a pas encore été chargé pour l'équipe sélectionnée (évite le flash "accès restreint" pour un admin/editor légitime). */
  teamRoleLoading: boolean;
  /** Droit d'éditer les données opérationnelles de l'équipe sélectionnée (superadmin, admin ou editor). */
  canEditTeamData:   boolean;
  /** Droit de configurer l'équipe sélectionnée (superadmin ou admin). */
  canConfigureTeam:  boolean;
}

const DEFAULT_THRESHOLDS: LoadThresholds = { lightMax: 2750, normalMax: 4250, sessionsPerWeek: 3 };

const DEFAULT_STAT_THRESHOLDS: StatThresholds = {
  evalTOrange: 0, evalTBlue: 5, evalTGreen: 10,
  ortgTAmber: 60, ortgTGreen: 90,
  drtgTAmber: 100, drtgTRed: 115,
};

const TeamSeasonContext = createContext<Ctx>({
  options: [], selected: null, selectAndGo: () => {}, loading: true, reload: () => {},
  thresholds: DEFAULT_THRESHOLDS, statThresholds: DEFAULT_STAT_THRESHOLDS,
  defaultWellnessMethod: 'detailed', publicWellnessMethod: 'detailed',
  orgId: null, isSuperadmin: false, roleLoading: true, teamRole: null, teamRoleLoading: true,
  canEditTeamData: false, canConfigureTeam: false,
});

function storageKey(userId: string) {
  return `stamina_selection_${userId}`;
}

function saveSelection(userId: string, opt: TeamSeasonOption) {
  localStorage.setItem(storageKey(userId), JSON.stringify({ teamId: opt.team.id, seasonId: opt.season.id }));
}

function loadSavedIds(userId: string): { teamId: string; seasonId: string } | null {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function TeamSeasonProvider({ children }: { children: ReactNode }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const [options,  setOptions]  = useState<TeamSeasonOption[]>([]);
  const [selected, setSelected] = useState<TeamSeasonOption | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [tick,     setTick]     = useState(0);
  const [orgRole,  setOrgRole]  = useState<OrgRole | null>(null);
  const [teamRole, setTeamRole] = useState<TeamRole | null>(null);
  const [teamRoleLoading, setTeamRoleLoading] = useState(true);

  const reload = () => setTick(t => t + 1);
  const isSuperadmin = orgRole === 'superadmin';
  const roleLoading  = orgRole === null;

  // Suit les changements d'auth : reset à la déconnexion, recharge à la connexion
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        setSelected(null);
        setOptions([]);
        setOrgRole(null);
        setTeamRole(null);
      } else {
        reload();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Charge le rôle organisation de l'utilisateur connecté
  useEffect(() => {
    if (!userId) { setOrgRole(null); return; }
    let cancelled = false;
    supabase.from('profiles').select('org_role').eq('id', userId).single()
      .then(({ data, error }) => {
        if (cancelled || error || !data) return;
        setOrgRole((data.org_role as OrgRole) ?? 'member');
      }, () => { /* réseau : orgRole reste null, le guard bloquera */ });
    return () => { cancelled = true; };
  }, [userId]);

  // Charge le rôle par équipe de l'utilisateur connecté sur l'équipe sélectionnée
  // (superadmin : accès total implicite, pas besoin de ligne team_roles)
  useEffect(() => {
    // Reset immédiat : sans ça, changer d'équipe dans le sélecteur laisse
    // brièvement le rôle de l'équipe PRÉCÉDENTE actif (canEditTeamData/
    // canConfigureTeam calculés dessus) le temps du round-trip réseau.
    setTeamRole(null);
    if (!userId || !selected) { setTeamRoleLoading(false); return; }
    if (isSuperadmin) { setTeamRole('admin'); setTeamRoleLoading(false); return; }
    let cancelled = false;
    setTeamRoleLoading(true);
    supabase.from('team_roles').select('role')
      .eq('team_id', selected.team.id).eq('profile_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        setTeamRole(error || !data ? null : (data.role as TeamRole));
        setTeamRoleLoading(false);
      }, () => { if (!cancelled) { setTeamRole(null); setTeamRoleLoading(false); } });
    return () => { cancelled = true; };
  }, [userId, selected, isSuperadmin]);

  /** Bascule d'équipe/saison depuis un sélecteur (topbar, palette de recherche, tiroir mobile) :
   *  mémorise le choix, pose équipe/saison dans l'URL et recharge — vers `pathname` si fourni
   *  (ex. bascule + ouverture directe d'une fiche joueur d'une autre équipe). Sans `pathname` :
   *  reste sur place si seule la saison change ; revient au tableau de bord si l'équipe change,
   *  car la page courante peut référencer une ressource (joueur, séance, match…) propre à
   *  l'ancienne équipe et absente de la nouvelle. */
  function selectAndGo(opt: TeamSeasonOption, pathname?: string) {
    if (userId) saveSelection(userId, opt);
    const teamChanged = selected != null && selected.team.id !== opt.team.id;
    const target = pathname ?? (teamChanged ? '/tableau-de-bord' : window.location.pathname);
    const keepCurrentParams = !pathname && !teamChanged;
    const params = new URLSearchParams(keepCurrentParams ? window.location.search : undefined);
    params.set('equipe', opt.team.id);
    params.set('saison', opt.season.id);
    window.location.href = `${target}?${params.toString()}`;
  }

  useEffect(() => {
    if (!userId) return;
    setLoading(true);
    Promise.all([teamsApi.list(), seasonsApi.listAll()])
      .then(([teams, seasons]) => {
        const opts: TeamSeasonOption[] = [];
        for (const team of teams) {
          for (const season of seasons.filter(s => s.teamId === team.id)) {
            opts.push({ team, season });
          }
        }
        setOptions(opts);
        setSelected(prev => {
          // Priorité : URL (lien partagé) > sélection déjà en mémoire (ex. reload() sur changement
          // d'auth) > dernier choix mémorisé localement > saison en cours > première option.
          const urlParams = new URLSearchParams(window.location.search);
          const urlTeamId   = urlParams.get('equipe');
          const urlSeasonId = urlParams.get('saison');
          const fromUrl = urlTeamId && urlSeasonId ? { teamId: urlTeamId, seasonId: urlSeasonId } : null;
          const saved = loadSavedIds(userId);
          const targetId = fromUrl ?? (prev ? { teamId: prev.team.id, seasonId: prev.season.id } : saved);
          if (targetId) {
            const match = opts.find(o => o.team.id === targetId.teamId && o.season.id === targetId.seasonId);
            if (match) return match;
          }
          return opts.find(o => o.season.isCurrent) ?? opts[0] ?? null;
        });
      })
      .finally(() => setLoading(false));
  }, [userId, tick]);

  // Garde l'URL synchronisée avec l'équipe/saison affichée : toute navigation interne qui ne
  // reporterait pas ces paramètres (lien, redirection, retour arrière…) se les voit réattribués
  // sans nouvelle entrée d'historique — un lien copié depuis la barre d'adresse pointe donc
  // toujours vers la bonne équipe/saison, quelle que soit la page.
  useEffect(() => {
    if (!selected) return;
    if (searchParams.get('equipe') === selected.team.id && searchParams.get('saison') === selected.season.id) return;
    const params = new URLSearchParams(searchParams);
    params.set('equipe', selected.team.id);
    params.set('saison', selected.season.id);
    setSearchParams(params, { replace: true });
  }, [selected, searchParams, setSearchParams]);

  const thresholds: LoadThresholds = {
    lightMax:        selected?.team.loadLightMax    ?? DEFAULT_THRESHOLDS.lightMax,
    normalMax:       selected?.team.loadNormalMax   ?? DEFAULT_THRESHOLDS.normalMax,
    sessionsPerWeek: selected?.team.sessionsPerWeek ?? DEFAULT_THRESHOLDS.sessionsPerWeek,
  };

  const statThresholds: StatThresholds = {
    evalTOrange: selected?.team.evalTOrange ?? DEFAULT_STAT_THRESHOLDS.evalTOrange,
    evalTBlue:   selected?.team.evalTBlue   ?? DEFAULT_STAT_THRESHOLDS.evalTBlue,
    evalTGreen:  selected?.team.evalTGreen  ?? DEFAULT_STAT_THRESHOLDS.evalTGreen,
    ortgTAmber:  selected?.team.ortgTAmber  ?? DEFAULT_STAT_THRESHOLDS.ortgTAmber,
    ortgTGreen:  selected?.team.ortgTGreen  ?? DEFAULT_STAT_THRESHOLDS.ortgTGreen,
    drtgTAmber:  selected?.team.drtgTAmber  ?? DEFAULT_STAT_THRESHOLDS.drtgTAmber,
    drtgTRed:    selected?.team.drtgTRed    ?? DEFAULT_STAT_THRESHOLDS.drtgTRed,
  };

  const defaultWellnessMethod = selected?.team.defaultWellnessMethod ?? 'detailed';
  const publicWellnessMethod  = selected?.team.publicWellnessMethod  ?? 'detailed';

  const orgId = selected?.team.organizationId ?? options[0]?.team.organizationId ?? null;

  const canEditTeamData  = isSuperadmin || teamRole === 'admin' || teamRole === 'editor';
  const canConfigureTeam = isSuperadmin || teamRole === 'admin';

  return (
    <TeamSeasonContext.Provider value={{
      options, selected, selectAndGo, loading, reload,
      thresholds, statThresholds, defaultWellnessMethod, publicWellnessMethod,
      orgId, isSuperadmin, roleLoading, teamRole, teamRoleLoading, canEditTeamData, canConfigureTeam,
    }}>
      {children}
    </TeamSeasonContext.Provider>
  );
}

export const useTeamSeason = () => useContext(TeamSeasonContext);

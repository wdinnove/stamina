import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { teamsApi, seasonsApi } from '../api';
import { supabase } from '../api/client';
import type { Team, Season, OrgRole } from '../data/types';

export interface TeamSeasonOption {
  team: Team;
  season: Season;
}

export interface LoadThresholds {
  lightMax:  number;
  normalMax: number;
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
  setSelected:    (opt: TeamSeasonOption) => void;
  loading:        boolean;
  reload:         () => void;
  thresholds:     LoadThresholds;
  statThresholds: StatThresholds;
  orgId:          string | null;
  orgRole:        OrgRole | null;
}

const DEFAULT_THRESHOLDS: LoadThresholds = { lightMax: 2750, normalMax: 4250 };

const DEFAULT_STAT_THRESHOLDS: StatThresholds = {
  evalTOrange: 0, evalTBlue: 5, evalTGreen: 10,
  ortgTAmber: 60, ortgTGreen: 90,
  drtgTAmber: 100, drtgTRed: 115,
};

const TeamSeasonContext = createContext<Ctx>({
  options: [], selected: null, setSelected: () => {}, loading: true, reload: () => {},
  thresholds: DEFAULT_THRESHOLDS, statThresholds: DEFAULT_STAT_THRESHOLDS, orgId: null, orgRole: null,
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
  const [options,  setOptions]  = useState<TeamSeasonOption[]>([]);
  const [selected, setSelected] = useState<TeamSeasonOption | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [userId,   setUserId]   = useState<string | null>(null);
  const [tick,     setTick]     = useState(0);
  const [orgRole,  setOrgRole]  = useState<OrgRole | null>(null);

  const reload = () => setTick(t => t + 1);

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
        setOrgRole((data.org_role as OrgRole) ?? 'editor');
      })
      .catch(() => { /* réseau : orgRole reste null, le guard bloquera */ });
    return () => { cancelled = true; };
  }, [userId]);

  function handleSetSelected(opt: TeamSeasonOption) {
    setSelected(opt);
    if (userId) saveSelection(userId, opt);
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
          const saved = loadSavedIds(userId);
          const targetId = prev
            ? { teamId: prev.team.id, seasonId: prev.season.id }
            : saved;
          if (targetId) {
            const match = opts.find(o => o.team.id === targetId.teamId && o.season.id === targetId.seasonId);
            if (match) return match;
          }
          return opts.find(o => o.season.isCurrent) ?? opts[0] ?? null;
        });
      })
      .finally(() => setLoading(false));
  }, [userId, tick]);

  const thresholds: LoadThresholds = {
    lightMax:  selected?.team.loadLightMax  ?? DEFAULT_THRESHOLDS.lightMax,
    normalMax: selected?.team.loadNormalMax ?? DEFAULT_THRESHOLDS.normalMax,
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

  const orgId = selected?.team.organizationId ?? options[0]?.team.organizationId ?? null;

  return (
    <TeamSeasonContext.Provider value={{ options, selected, setSelected: handleSetSelected, loading, reload, thresholds, statThresholds, orgId, orgRole }}>
      {children}
    </TeamSeasonContext.Provider>
  );
}

export const useTeamSeason = () => useContext(TeamSeasonContext);

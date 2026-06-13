import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { teamsApi, seasonsApi } from '../api';
import { supabase } from '../api/client';
import type { Team, Season } from '../data/types';

export interface TeamSeasonOption {
  team: Team;
  season: Season;
}

interface Ctx {
  options:     TeamSeasonOption[];
  selected:    TeamSeasonOption | null;
  setSelected: (opt: TeamSeasonOption) => void;
  loading:     boolean;
  reload:      () => void;
}

const TeamSeasonContext = createContext<Ctx>({
  options: [], selected: null, setSelected: () => {}, loading: true, reload: () => {},
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

  const reload = () => setTick(t => t + 1);

  // Suit les changements d'auth : reset à la déconnexion, recharge à la connexion
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => setUserId(user?.id ?? null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const uid = session?.user?.id ?? null;
      setUserId(uid);
      if (!uid) {
        // Déconnexion : on vide la sélection en mémoire (le localStorage reste par user)
        setSelected(null);
        setOptions([]);
      } else {
        reload();
      }
    });
    return () => subscription.unsubscribe();
  }, []);

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

  return (
    <TeamSeasonContext.Provider value={{ options, selected, setSelected: handleSetSelected, loading, reload }}>
      {children}
    </TeamSeasonContext.Provider>
  );
}

export const useTeamSeason = () => useContext(TeamSeasonContext);

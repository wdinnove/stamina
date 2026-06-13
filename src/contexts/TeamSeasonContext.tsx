import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { teamsApi, seasonsApi } from '../api';
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

export function TeamSeasonProvider({ children }: { children: ReactNode }) {
  const [options,  setOptions]  = useState<TeamSeasonOption[]>([]);
  const [selected, setSelected] = useState<TeamSeasonOption | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [tick,     setTick]     = useState(0);

  const reload = () => setTick(t => t + 1);

  useEffect(() => {
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
          if (prev) {
            const refreshed = opts.find(o => o.team.id === prev.team.id && o.season.id === prev.season.id);
            return refreshed ?? opts.find(o => o.season.isCurrent) ?? opts[0] ?? null;
          }
          return opts.find(o => o.season.isCurrent) ?? opts[0] ?? null;
        });
      })
      .finally(() => setLoading(false));
  }, [tick]);

  return (
    <TeamSeasonContext.Provider value={{ options, selected, setSelected, loading, reload }}>
      {children}
    </TeamSeasonContext.Provider>
  );
}

export const useTeamSeason = () => useContext(TeamSeasonContext);

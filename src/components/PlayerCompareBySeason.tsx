import { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { EmptyState } from './EmptyState';
import { filterControlStyle, GroupPickerBox, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';
import { PlayerCompareStatBlocks } from './PlayerCompareStatBlocks';
import { StatDisplayToggle } from './StatDisplayToggle';
import type { RPEEntry, WellnessEntry, MatchStat, TeamMatchStat } from '../data/types';

type SeasonGroup = { seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: MatchStat[] };

interface Props {
  seasonGroupedStats: SeasonGroup[];
  /** Historique RPE/bien-être toutes saisons — borné à la saison choisie pour chaque côté */
  rpe: RPEEntry[];
  wellness: WellnessEntry[];
  teamStatsMap?: Map<string, TeamMatchStat>;
  /** Saison/équipe actuellement sélectionnées dans la TopBar — préséléctionnées en Groupe A si présentes dans l'historique du joueur */
  currentSeasonId?: string;
  currentTeamId?: string;
}

const keyOf = (g: SeasonGroup) => `${g.seasonId}::${g.teamId}`;
const labelOf = (g: SeasonGroup) => `${g.teamName || '—'} — ${g.seasonLabel}`;

function dateRangeOf(ms: MatchStat[]): { from: string; to: string } | null {
  if (!ms.length) return null;
  const dates = ms.map(m => m.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

export function PlayerCompareBySeason({ seasonGroupedStats, rpe, wellness, teamStatsMap, currentSeasonId, currentTeamId }: Props) {
  const [display, setDisplay] = useState<'blocks' | 'chart'>('blocks');

  // Tri par date du dernier match du groupe (le plus récent en premier) — seasonId est un UUID
  // aléatoire, non chronologique, donc impropre au tri.
  const groups = useMemo(
    () => [...seasonGroupedStats].sort((a, b) => {
      const da = dateRangeOf(a.stats)?.to ?? '';
      const db = dateRangeOf(b.stats)?.to ?? '';
      return db.localeCompare(da);
    }),
    [seasonGroupedStats],
  );

  const [keyA, setKeyA] = useState<string | null>(null);
  const [keyB, setKeyB] = useState<string | null>(null);

  // Présélection : saison/équipe en cours (TopBar) si présente dans l'historique du joueur,
  // sinon la première de la liste ; Groupe B = la suivante dans la liste.
  const currentKey = currentSeasonId && currentTeamId ? `${currentSeasonId}::${currentTeamId}` : null;
  const defaultA = (currentKey && groups.some(g => keyOf(g) === currentKey)) ? currentKey : (groups[0] ? keyOf(groups[0]) : null);
  const defaultB = groups.find(g => keyOf(g) !== defaultA);

  const effectiveA = keyA ?? defaultA;
  const effectiveB = keyB ?? (defaultB ? keyOf(defaultB) : null);

  const groupA = groups.find(g => keyOf(g) === effectiveA) ?? null;
  const groupB = groups.find(g => keyOf(g) === effectiveB) ?? null;

  // Si l'utilisateur choisit d'un côté la saison/équipe déjà sélectionnée de l'autre côté,
  // on échange les deux plutôt que de laisser une comparaison A == B (0% d'écart partout, sans explication).
  const handleSetA = (key: string) => { if (key === effectiveB) setKeyB(effectiveA); setKeyA(key); };
  const handleSetB = (key: string) => { if (key === effectiveA) setKeyA(effectiveB); setKeyB(key); };

  if (groups.length < 2) {
    return <EmptyState message="Il faut au moins deux saisons/équipes différentes dans l'historique du joueur pour lancer une comparaison." />;
  }

  const rangeA = groupA ? dateRangeOf(groupA.stats) : null;
  const rangeB = groupB ? dateRangeOf(groupB.stats) : null;
  const rpeInRange      = (range: { from: string; to: string } | null) => range ? rpe.filter(e => e.date >= range.from && e.date <= range.to) : [];
  const wellnessInRange = (range: { from: string; to: string } | null) => range ? wellness.filter(w => w.date >= range.from && w.date <= range.to) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <CardTitle icon={<SlidersHorizontal size={12} style={{ color: '#3B82F6' }} />} mb={10}
          right={<StatDisplayToggle value={display} onChange={setDisplay} />}
        >Sélection</CardTitle>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <GroupPickerBox color={GROUP_A_COLOR}>
            <select value={effectiveA ?? ''} onChange={e => handleSetA(e.target.value)} style={filterControlStyle}>
              {groups.map(g => <option key={keyOf(g)} value={keyOf(g)}>{labelOf(g)}</option>)}
            </select>
          </GroupPickerBox>
          <GroupPickerBox color={GROUP_B_COLOR}>
            <select value={effectiveB ?? ''} onChange={e => handleSetB(e.target.value)} style={filterControlStyle}>
              {groups.map(g => <option key={keyOf(g)} value={keyOf(g)}>{labelOf(g)}</option>)}
            </select>
          </GroupPickerBox>
        </div>
      </Card>

      {groupA && groupB ? (
        <PlayerCompareStatBlocks
          a={{ label: labelOf(groupA), matchStats: groupA.stats, rpe: rpeInRange(rangeA), wellness: wellnessInRange(rangeA) }}
          b={{ label: labelOf(groupB), matchStats: groupB.stats, rpe: rpeInRange(rangeB), wellness: wellnessInRange(rangeB) }}
          teamStatsMap={teamStatsMap}
          display={display}
        />
      ) : (
        <EmptyState message="Choisis une saison et une équipe pour chaque côté de la comparaison." />
      )}
    </div>
  );
}

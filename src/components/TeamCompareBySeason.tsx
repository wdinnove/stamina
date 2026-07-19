import { useMemo, useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { EmptyState } from './EmptyState';
import { TeamCompareStatBlocks } from './TeamCompareStatBlocks';
import { filterControlStyle, GroupPickerBox, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';
import { StatDisplayToggle } from './StatDisplayToggle';
import type { TeamMatchStat } from '../data/types';

type SeasonGroup = { seasonId: string; seasonLabel: string; teamId: string; teamName: string; stats: TeamMatchStat[] };

interface Props {
  seasonGroupedStats: SeasonGroup[];
  /** Saison actuellement sélectionnée dans la TopBar — préséléctionnée en Groupe A si présente */
  currentSeasonId?: string;
}

const keyOf = (g: SeasonGroup) => g.seasonId;
const labelOf = (g: SeasonGroup) => `${g.teamName || '—'} — ${g.seasonLabel}`;

function dateRangeOf(ms: TeamMatchStat[]): { from: string; to: string } | null {
  if (!ms.length) return null;
  const dates = ms.map(m => m.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

/**
 * "Comparer > Par saison" côté équipe — même principe que PlayerCompareBySeason, mais sur les
 * stats d'équipe (TeamMatchStat) de chaque saison jouée par l'équipe plutôt que sur l'historique
 * d'un seul joueur. RPE/bien-être ne sont pas comparés ici (non disponibles de façon fiable sur les
 * saisons passées, l'effectif ayant pu changer) — seules les stats de match sont comparées.
 */
export function TeamCompareBySeason({ seasonGroupedStats, currentSeasonId }: Props) {
  const [display, setDisplay] = useState<'blocks' | 'chart'>('blocks');

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

  const defaultA = (currentSeasonId && groups.some(g => keyOf(g) === currentSeasonId)) ? currentSeasonId : (groups[0] ? keyOf(groups[0]) : null);
  const defaultB = groups.find(g => keyOf(g) !== defaultA);

  const effectiveA = keyA ?? defaultA;
  const effectiveB = keyB ?? (defaultB ? keyOf(defaultB) : null);

  const groupA = groups.find(g => keyOf(g) === effectiveA) ?? null;
  const groupB = groups.find(g => keyOf(g) === effectiveB) ?? null;

  const handleSetA = (key: string) => { if (key === effectiveB) setKeyB(effectiveA); setKeyA(key); };
  const handleSetB = (key: string) => { if (key === effectiveA) setKeyA(effectiveB); setKeyB(key); };

  if (groups.length < 2) {
    return <EmptyState message="Il faut au moins deux saisons différentes dans l'historique de l'équipe pour lancer une comparaison." />;
  }

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
        <TeamCompareStatBlocks
          a={{ label: labelOf(groupA), matchStats: groupA.stats, rpe: [], wellness: [], evalAvg: null }}
          b={{ label: labelOf(groupB), matchStats: groupB.stats, rpe: [], wellness: [], evalAvg: null }}
          display={display}
        />
      ) : (
        <EmptyState message="Choisis une saison pour chaque côté de la comparaison." />
      )}
    </div>
  );
}

import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { useDateRange, PeriodFields, type DatePreset } from './DateRangeCard';
import { GroupPickerBox, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';
import { TeamCompareStatBlocks } from './TeamCompareStatBlocks';
import { StatDisplayToggle } from './StatDisplayToggle';
import type { RPEEntry, WellnessEntry, TeamMatchStat, MatchStat } from '../data/types';

interface Props {
  /** Matchs d'équipe de la saison sélectionnée (pool filtrable par période) */
  teamStats: TeamMatchStat[];
  /** Stats joueurs (toutes joueuses confondues) sur la même saison — pour la moyenne d'évaluation par période */
  allStats: MatchStat[];
  allRpe: RPEEntry[];
  allWellness: WellnessEntry[];
  seasonStart?: string;
  seasonEnd?: string;
}

interface PeriodPickerProps {
  color: string;
  from: string; to: string; preset: DatePreset | null;
  onPreset: (p: DatePreset) => void; onFrom: (v: string) => void; onTo: (v: string) => void;
}

function PeriodPicker({ color, from, to, preset, onPreset, onFrom, onTo }: PeriodPickerProps) {
  return (
    <GroupPickerBox color={color}>
      <PeriodFields from={from} to={to} preset={preset} onPreset={onPreset} onFrom={onFrom} onTo={onTo} />
    </GroupPickerBox>
  );
}

/**
 * "Comparer > Par période" côté équipe — même principe que PlayerDynStatTab (2 périodes
 * sélectionnées librement, groupe A = phase en cours par défaut, groupe B = saison complète),
 * mais sur les stats d'équipe (TeamMatchStat) plutôt que sur un seul joueur. Même sélecteur
 * ("Sélection" + StatDisplayToggle) que les autres onglets Comparer côté équipe (Par match,
 * Par saison, Par joueur), pour un rendu cohérent entre les 4 pages de comparaison.
 */
export function TeamCompareByPeriod({ teamStats, allStats, allRpe, allWellness, seasonStart, seasonEnd }: Props) {
  const rangeA = useDateRange(seasonStart, undefined, seasonEnd);
  const rangeB = useDateRange(seasonStart, 'saison', seasonEnd);
  const [display, setDisplay] = useState<'blocks' | 'chart'>('blocks');

  const inRangeA = (iso: string) => iso >= rangeA.from && iso <= rangeA.to;
  const inRangeB = (iso: string) => iso >= rangeB.from && iso <= rangeB.to;

  const evalAvgOf = (inRange: (iso: string) => boolean) => {
    const vals = allStats.filter(m => inRange(m.date) && m.eval !== null).map(m => Number(m.eval));
    return vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length * 10) / 10 : null;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <CardTitle icon={<SlidersHorizontal size={12} style={{ color: '#3B82F6' }} />} mb={10}
          right={<StatDisplayToggle value={display} onChange={setDisplay} />}
        >Sélection</CardTitle>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <PeriodPicker
            color={GROUP_A_COLOR}
            from={rangeA.from} to={rangeA.to} preset={rangeA.preset}
            onPreset={p => rangeA.applyPreset(p, seasonStart, seasonEnd)} onFrom={rangeA.setFrom} onTo={rangeA.setTo}
          />
          <PeriodPicker
            color={GROUP_B_COLOR}
            from={rangeB.from} to={rangeB.to} preset={rangeB.preset}
            onPreset={p => rangeB.applyPreset(p, seasonStart, seasonEnd)} onFrom={rangeB.setFrom} onTo={rangeB.setTo}
          />
        </div>
      </Card>

      <TeamCompareStatBlocks
        a={{
          label: 'groupe A',
          matchStats: teamStats.filter(m => inRangeA(m.date)),
          rpe: allRpe.filter(e => inRangeA(e.date)),
          wellness: allWellness.filter(w => inRangeA(w.date)),
          evalAvg: evalAvgOf(inRangeA),
        }}
        b={{
          label: 'groupe B',
          matchStats: teamStats.filter(m => inRangeB(m.date)),
          rpe: allRpe.filter(e => inRangeB(e.date)),
          wellness: allWellness.filter(w => inRangeB(w.date)),
          evalAvg: evalAvgOf(inRangeB),
        }}
        display={display}
      />
    </div>
  );
}

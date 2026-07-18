import { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { useDateRange, PeriodFields, type DatePreset } from './DateRangeCard';
import { GroupPickerBox, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';
import { PlayerCompareStatBlocks } from './PlayerCompareStatBlocks';
import { StatDisplayToggle } from './StatDisplayToggle';
import type { RPEEntry, WellnessEntry, MatchStat, TeamMatchStat } from '../data/types';

interface Props {
  rpe: RPEEntry[];
  wellness: WellnessEntry[];
  matchStats: MatchStat[];
  seasonStart?: string;
  seasonEnd?: string;
  teamStatsMap?: Map<string, TeamMatchStat>;
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

// ── Main ──────────────────────────────────────────────────────────────────────

export function PlayerDynStatTab({ rpe, wellness, matchStats, seasonStart, seasonEnd, teamStatsMap }: Props) {
  // Groupe A : phase en cours (phase1 août-déc, phase2 janv-juin, calculée par useDateRange
  // selon la date du jour) ; Groupe B : saison complète — comparaison par défaut sensée à l'ouverture.
  const rangeA = useDateRange(seasonStart, undefined, seasonEnd);
  const rangeB = useDateRange(seasonStart, 'saison', seasonEnd);
  const [display, setDisplay] = useState<'blocks' | 'chart'>('blocks');

  const inRangeA = (iso: string) => iso >= rangeA.from && iso <= rangeA.to;
  const inRangeB = (iso: string) => iso >= rangeB.from && iso <= rangeB.to;

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

      <PlayerCompareStatBlocks
        a={{
          label: 'groupe A',
          matchStats: matchStats.filter(m => inRangeA(m.date)),
          rpe: rpe.filter(r => inRangeA(r.date)),
          wellness: wellness.filter(w => inRangeA(w.date)),
        }}
        b={{
          label: 'groupe B',
          matchStats: matchStats.filter(m => inRangeB(m.date)),
          rpe: rpe.filter(r => inRangeB(r.date)),
          wellness: wellness.filter(w => inRangeB(w.date)),
        }}
        teamStatsMap={teamStatsMap}
        display={display}
      />
    </div>
  );
}

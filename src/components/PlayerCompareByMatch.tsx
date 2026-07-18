import { useEffect, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { PlayerCompareStatBlocks } from './PlayerCompareStatBlocks';
import { filterControlStyle, GroupPickerBox, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';
import { StatDisplayToggle } from './StatDisplayToggle';
import { evalColor } from '../data';
import { fmtDate } from '../utils/dateFormat';
import type { MatchStat, RPEEntry, WellnessEntry, TeamMatchStat } from '../data/types';
import type { StatThresholds } from '../contexts/TeamSeasonContext';

interface Props {
  /** Matchs de la saison sélectionnée pour ce joueur */
  matchStats: MatchStat[];
  /** Historique RPE/bien-être toutes saisons — filtré par date implicite du groupe de matchs choisi */
  rpe: RPEEntry[];
  wellness: WellnessEntry[];
  teamStatsMap?: Map<string, TeamMatchStat>;
  statThresholds: StatThresholds;
}

type Group = 'a' | 'b' | null;

function dateRangeOf(ms: MatchStat[]): { from: string; to: string } | null {
  if (!ms.length) return null;
  const dates = ms.map(m => m.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

interface DropdownProps {
  color: string;
  matches: MatchStat[];
  assign: Map<string, Group>;
  group: 'a' | 'b';
  otherLabel: string;
  onToggle: (id: string) => void;
  statThresholds: StatThresholds;
}

function MatchGroupDropdown({ color, matches, assign, group, otherLabel, onToggle, statThresholds }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const count = matches.filter(m => assign.get(m.id) === group).length;

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <GroupPickerBox color={color}>
      <div ref={ref} style={{ position: 'relative' }}>
        <button
          onClick={() => setOpen(v => !v)}
          style={{ ...filterControlStyle, display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none' }}
        >
          <span style={{ flex: 1, textAlign: 'left' }}>
            {count === 0 ? 'Aucun match sélectionné' : `${count} match${count > 1 ? 's' : ''} sélectionné${count > 1 ? 's' : ''}`}
          </span>
          <ChevronDown size={14} style={{ color: '#475569', transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s', flexShrink: 0 }} />
        </button>

        {open && (
          <div style={{
            position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0,
            backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)', overflow: 'hidden', zIndex: 300,
            maxHeight: 320, overflowY: 'auto',
          }}>
            {matches.length === 0 ? (
              <div style={{ padding: '10px 12px', color: '#475569', fontSize: '0.78rem' }}>Aucun match disponible</div>
            ) : matches.map(m => {
              const g = assign.get(m.id) ?? null;
              const checked = g === group;
              return (
                <label key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                  borderBottom: '1px solid #1E2229', fontSize: '0.78rem',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => onToggle(m.id)} style={{ accentColor: color, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ color: '#F1F5F9', flexShrink: 0 }}>{fmtDate(m.date)}</span>
                  <span style={{ color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.opponent}</span>
                  <span style={{ fontWeight: 700, flexShrink: 0, color: m.eval !== null ? evalColor(m.eval, statThresholds) : '#475569' }}>{m.eval ?? '—'}</span>
                  {g !== null && !checked && (
                    <span style={{ color: '#64748B', fontSize: '0.68rem', flexShrink: 0 }}>({otherLabel})</span>
                  )}
                </label>
              );
            })}
          </div>
        )}
      </div>
    </GroupPickerBox>
  );
}

export function PlayerCompareByMatch({ matchStats, rpe, wellness, teamStatsMap, statThresholds }: Props) {
  const [assign, setAssign] = useState<Map<string, Group>>(new Map());
  const [display, setDisplay] = useState<'blocks' | 'chart'>('blocks');
  const didInit = useRef(false);

  const setGroup = (id: string, g: Group) => {
    setAssign(prev => {
      const next = new Map(prev);
      next.set(id, next.get(id) === g ? null : g);
      return next;
    });
  };

  const sorted = [...matchStats].sort((a, b) => b.date.localeCompare(a.date));

  // Présélection : dernier match en Groupe A, avant-dernier en Groupe B — pour une comparaison
  // non vide à l'ouverture, ajustable ensuite via les sélecteurs.
  useEffect(() => {
    if (didInit.current || sorted.length === 0) return;
    didInit.current = true;
    const next = new Map<string, Group>();
    if (sorted[0]) next.set(sorted[0].id, 'a');
    if (sorted[1]) next.set(sorted[1].id, 'b');
    setAssign(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sorted.length]);
  const matchesA = matchStats.filter(m => assign.get(m.id) === 'a');
  const matchesB = matchStats.filter(m => assign.get(m.id) === 'b');

  const rangeA = dateRangeOf(matchesA);
  const rangeB = dateRangeOf(matchesB);
  const rpeInRange       = (range: { from: string; to: string } | null) => range ? rpe.filter(e => e.date >= range.from && e.date <= range.to) : [];
  const wellnessInRange  = (range: { from: string; to: string } | null) => range ? wellness.filter(w => w.date >= range.from && w.date <= range.to) : [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <CardTitle icon={<SlidersHorizontal size={12} style={{ color: '#3B82F6' }} />} mb={10}
          right={<StatDisplayToggle value={display} onChange={setDisplay} />}
        >Sélection</CardTitle>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <MatchGroupDropdown color={GROUP_A_COLOR} matches={sorted} assign={assign} group="a" otherLabel="Groupe B" onToggle={id => setGroup(id, 'a')} statThresholds={statThresholds} />
          <MatchGroupDropdown color={GROUP_B_COLOR} matches={sorted} assign={assign} group="b" otherLabel="Groupe A" onToggle={id => setGroup(id, 'b')} statThresholds={statThresholds} />
        </div>
      </Card>

      <PlayerCompareStatBlocks
        a={{ label: 'groupe A', matchStats: matchesA, rpe: rpeInRange(rangeA), wellness: wellnessInRange(rangeA) }}
        b={{ label: 'groupe B', matchStats: matchesB, rpe: rpeInRange(rangeB), wellness: wellnessInRange(rangeB) }}
        teamStatsMap={teamStatsMap}
        display={display}
      />
    </div>
  );
}

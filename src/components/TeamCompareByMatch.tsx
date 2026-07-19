import { useEffect, useRef, useState } from 'react';
import { ChevronDown, SlidersHorizontal } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { TeamCompareStatBlocks } from './TeamCompareStatBlocks';
import { filterControlStyle, GroupPickerBox, GROUP_A_COLOR, GROUP_B_COLOR } from './FilterField';
import { StatDisplayToggle } from './StatDisplayToggle';
import { fmtDate } from '../utils/dateFormat';
import { roundedAvg } from '../utils/avg';
import type { TeamMatchStat, MatchStat, RPEEntry, WellnessEntry } from '../data/types';

interface Props {
  /** Matchs de l'équipe sur la saison sélectionnée (pool sélectionnable pour les groupes A/B) */
  teamStats: TeamMatchStat[];
  /** Stats joueurs (toutes joueuses confondues) sur la même saison — pour la moyenne d'évaluation par groupe */
  allStats: MatchStat[];
  allRpe: RPEEntry[];
  allWellness: WellnessEntry[];
  /** Identifiant stable équipe+saison — refait la présélection quand il change, pour ne pas
   * garder une sélection de matchs orpheline d'une autre équipe/saison. */
  seasonKey?: string;
}

type Group = 'a' | 'b' | null;

function dateRangeOf(ms: TeamMatchStat[]): { from: string; to: string } | null {
  if (!ms.length) return null;
  const dates = ms.map(m => m.date).sort();
  return { from: dates[0], to: dates[dates.length - 1] };
}

interface DropdownProps {
  color: string;
  matches: TeamMatchStat[];
  assign: Map<string, Group>;
  group: 'a' | 'b';
  otherLabel: string;
  onToggle: (id: string) => void;
}

function MatchGroupDropdown({ color, matches, assign, group, otherLabel, onToggle }: DropdownProps) {
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
              const resColor = m.result === 'win' ? '#00E5A0' : '#EF4444';
              return (
                <label key={m.id} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '7px 12px', cursor: 'pointer',
                  borderBottom: '1px solid #1E2229', fontSize: '0.78rem',
                }}>
                  <input type="checkbox" checked={checked} onChange={() => onToggle(m.id)} style={{ accentColor: color, cursor: 'pointer', flexShrink: 0 }} />
                  <span style={{ color: '#F1F5F9', flexShrink: 0 }}>{fmtDate(m.date)}</span>
                  <span style={{ color: '#94A3B8', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.opponent}</span>
                  <span style={{ fontWeight: 700, flexShrink: 0, color: resColor }}>{m.scoreUs}-{m.scoreThem}</span>
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

/**
 * "Comparer > Par match" côté équipe — même principe que PlayerCompareByMatch (2 groupes de
 * matchs sélectionnés librement), mais sur les stats d'équipe (TeamMatchStat) plutôt que sur un
 * seul joueur.
 */
export function TeamCompareByMatch({ teamStats, allStats, allRpe, allWellness, seasonKey }: Props) {
  const [assign, setAssign] = useState<Map<string, Group>>(new Map());
  const [display, setDisplay] = useState<'blocks' | 'chart'>('blocks');
  const didInit = useRef<string | null>('__uninitialized__');

  const setGroup = (id: string, g: Group) => {
    setAssign(prev => {
      const next = new Map(prev);
      next.set(id, next.get(id) === g ? null : g);
      return next;
    });
  };

  const sorted = [...teamStats].sort((a, b) => b.date.localeCompare(a.date));

  // Présélection : dernier match en Groupe A, avant-dernier en Groupe B — refaite à chaque
  // changement d'équipe/saison (seasonKey), pour ne pas garder une sélection orpheline.
  useEffect(() => {
    if (didInit.current === (seasonKey ?? null) || sorted.length === 0) return;
    didInit.current = seasonKey ?? null;
    const next = new Map<string, Group>();
    if (sorted[0]) next.set(sorted[0].id, 'a');
    if (sorted[1]) next.set(sorted[1].id, 'b');
    setAssign(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seasonKey, sorted.length]);

  const matchesA = teamStats.filter(m => assign.get(m.id) === 'a');
  const matchesB = teamStats.filter(m => assign.get(m.id) === 'b');
  const rangeA = dateRangeOf(matchesA);
  const rangeB = dateRangeOf(matchesB);
  const matchIdsA = new Set(matchesA.map(m => m.matchId).filter((v): v is string => !!v));
  const matchIdsB = new Set(matchesB.map(m => m.matchId).filter((v): v is string => !!v));

  const rpeInRange = (range: { from: string; to: string } | null) => range ? allRpe.filter(e => e.date >= range.from && e.date <= range.to) : [];
  const wellnessInRange = (range: { from: string; to: string } | null) => range ? allWellness.filter(w => w.date >= range.from && w.date <= range.to) : [];
  const evalAvgOf = (ids: Set<string>) =>
    roundedAvg(allStats.filter(m => m.matchId && ids.has(m.matchId) && m.eval !== null).map(m => Number(m.eval)));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <Card>
        <CardTitle icon={<SlidersHorizontal size={12} style={{ color: '#3B82F6' }} />} mb={10}
          right={<StatDisplayToggle value={display} onChange={setDisplay} />}
        >Sélection</CardTitle>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <MatchGroupDropdown color={GROUP_A_COLOR} matches={sorted} assign={assign} group="a" otherLabel="Groupe B" onToggle={id => setGroup(id, 'a')} />
          <MatchGroupDropdown color={GROUP_B_COLOR} matches={sorted} assign={assign} group="b" otherLabel="Groupe A" onToggle={id => setGroup(id, 'b')} />
        </div>
      </Card>

      <TeamCompareStatBlocks
        a={{ label: 'groupe A', matchStats: matchesA, rpe: rpeInRange(rangeA), wellness: wellnessInRange(rangeA), evalAvg: evalAvgOf(matchIdsA) }}
        b={{ label: 'groupe B', matchStats: matchesB, rpe: rpeInRange(rangeB), wellness: wellnessInRange(rangeB), evalAvg: evalAvgOf(matchIdsB) }}
        display={display}
      />
    </div>
  );
}

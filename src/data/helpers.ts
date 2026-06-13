import type { MatchStat, TeamMatchStat, PlayerSeasonAvg } from './types';
import { players }        from './mock/players';
import { teams }          from './mock/teams';
import { rpeEntries }     from './mock/rpe';
import { wellnessEntries }from './mock/wellness';
import { medicalRecords } from './mock/medical';
import { actions }        from './mock/actions';
import { matchStats }     from './mock/stats';
import { CURRENT_DATE }   from './config';

// ─── Finders ─────────────────────────────────────────────────────────────────
export const getPlayerById   = (id: string) => players.find(p => p.id === id);
export const getTeamById     = (id: string) => teams.find(t => t.id === id);
export const getPlayersByTeam = (teamId: string) => players.filter(p => p.teamId === teamId);

// ─── Per-player getters ───────────────────────────────────────────────────────
export const getPlayerRPE      = (id: string) => rpeEntries.filter(e => e.playerId === id).sort((a, b) => b.date.localeCompare(a.date));
export const getPlayerWellness = (id: string) => wellnessEntries.filter(e => e.playerId === id).sort((a, b) => b.date.localeCompare(a.date));
export const getPlayerMedical  = (id: string) => medicalRecords.filter(r => r.playerId === id).sort((a, b) => b.date.localeCompare(a.date));
export const getPlayerActions  = (id: string) => actions.filter(a => a.playerId === id).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
export const getPlayerStats    = (id: string) => matchStats.filter(s => s.playerId === id).sort((a, b) => b.date.localeCompare(a.date));

// ─── Global queries ───────────────────────────────────────────────────────────
export const getActiveInjuries  = () => medicalRecords.filter(r => r.status === 'active' && r.type === 'injury');
export const getOverdueActions  = (refDate = CURRENT_DATE) => actions.filter(a => a.status !== 'done' && a.dueDate < refDate);

// ─── Stat computations ────────────────────────────────────────────────────────
export function fg2Pct(m: Pick<MatchStat | TeamMatchStat, 'fg2m' | 'fg2a'>): string {
  return m.fg2a ? `${Math.round(m.fg2m / m.fg2a * 100)}%` : '—';
}
export function fg3Pct(m: Pick<MatchStat | TeamMatchStat, 'fg3m' | 'fg3a'>): string {
  return m.fg3a ? `${Math.round(m.fg3m / m.fg3a * 100)}%` : '—';
}
export function ftPct(m: Pick<MatchStat | TeamMatchStat, 'ftm' | 'fta'>): string {
  return m.fta ? `${Math.round(m.ftm / m.fta * 100)}%` : '—';
}

export function playerSeasonAvg(playerId: string): PlayerSeasonAvg {
  const s = getPlayerStats(playerId);
  const n = s.length || 1;
  const sum = (key: keyof MatchStat) => s.reduce((acc, m) => acc + (m[key] as number), 0);
  return {
    gp:       s.length,
    min:      +(sum('min') / n).toFixed(1),
    pts:      +(sum('pts') / n).toFixed(1),
    fg2m:     +(sum('fg2m') / n).toFixed(1),
    fg2a:     +(sum('fg2a') / n).toFixed(1),
    fg2pct:   sum('fg2a') ? Math.round(sum('fg2m') / sum('fg2a') * 100) : 0,
    fg3m:     +(sum('fg3m') / n).toFixed(1),
    fg3a:     +(sum('fg3a') / n).toFixed(1),
    fg3pct:   sum('fg3a') ? Math.round(sum('fg3m') / sum('fg3a') * 100) : 0,
    ftm:      +(sum('ftm') / n).toFixed(1),
    fta:      +(sum('fta') / n).toFixed(1),
    ftpct:    sum('fta')  ? Math.round(sum('ftm')  / sum('fta')  * 100) : 0,
    ro:       +(sum('ro') / n).toFixed(1),
    rd:       +(sum('rd') / n).toFixed(1),
    rt:       +((sum('ro') + sum('rd')) / n).toFixed(1),
    pd:       +(sum('pd') / n).toFixed(1),
    ct:       +(sum('ct') / n).toFixed(1),
    intercepts: +(sum('intercepts') / n).toFixed(1),
    bp:       +(sum('bp') / n).toFixed(1),
    fte:      +(sum('fte') / n).toFixed(1),
    fpr:      +(sum('fpr') / n).toFixed(1),
    eval:     +(sum('eval') / n).toFixed(1),
    plusMinus:+(sum('plusMinus') / n).toFixed(1),
  };
}

// ─── Formatters ───────────────────────────────────────────────────────────────
export function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function getAge(birthDate: string, refDate = CURRENT_DATE): number {
  const today = new Date(refDate);
  const birth = new Date(birthDate);
  let age = today.getFullYear() - birth.getFullYear();
  if (
    today.getMonth() < birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() < birth.getDate())
  ) age--;
  return age;
}

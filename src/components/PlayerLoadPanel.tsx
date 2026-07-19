import { useState } from 'react';
import { getWeekTier, weeklyLoadBuckets } from '../utils/weeklyLoad';
import { mondayIso as getWeekMonday } from '../utils/weeklyLoad';
import { rpeColor, rpeLabel, SESSION_TYPES } from '../utils/rpe';
import { fmtDate, fmtDateWithDay } from '../utils/dateFormat';
import { fmt1 } from '../utils/format';
import { roundedAvg } from '../utils/avg';
import { ListChecks } from 'lucide-react';
import { RpeKpiCard } from './RpeKpiCard';
import { Badge } from './Badge';
import { CardTitle } from './Card';
import { ChargeRpeComboChart } from './ChargeRpeComboChart';
import type { LoadThresholds } from '../contexts/TeamSeasonContext';
import type { RPEEntry } from '../data/types';

interface PlayerLoadPanelProps {
  history: RPEEntry[];   // ALL-TIME entries for this player (rpeApi.listPlayerHistory)
  filtered: RPEEntry[];  // `history` restreint à la période sélectionnée
  thresholds: LoadThresholds;
  showSeasonDiff: boolean;
  /** Graphique/Tableau — piloté depuis le bloc Filtres du parent (extra de DateRangeCard) si fourni, sinon géré en interne */
  display?: 'chart' | 'table';
  onDisplayChange?: (v: 'chart' | 'table') => void;
}

/**
 * KPIs + graphe combiné (charge/RPE) + tableau historique pour un joueur — onglet "Historique
 * joueur" de RPEPage, extrait pour être réutilisable par d'autres pages (perf individuelle).
 */
export function PlayerLoadPanel({ history, filtered, thresholds, showSeasonDiff, display, onDisplayChange }: PlayerLoadPanelProps) {
  const [indivComboView, setIndivComboView] = useState<'session' | 'week'>('week');
  const [internalDisplay, setInternalDisplay] = useState<'chart' | 'table'>('chart');
  const indivDisplay   = display ?? internalDisplay;
  const setIndivDisplay = onDisplayChange ?? setInternalDisplay;
  const [indivTableView, setIndivTableView] = useState<'session' | 'week'>('week');

  const avgRPE = roundedAvg(filtered.map((e: RPEEntry) => e.rpe));
  const toWeeklyRow = (e: RPEEntry) => ({ date: e.date, playerId: e.playerId, rpe: e.rpe, actualDuration: e.actualDuration, plannedDuration: e.plannedDuration });
  const weeklyBuckets = weeklyLoadBuckets(filtered.map(toWeeklyRow));
  const weeklyChartData = weeklyBuckets.map(b => ({ date: fmtDate(b.week), load: Math.round(b.load) }));
  const sessionLoadNormal = Math.round(thresholds.normalMax / thresholds.sessionsPerWeek);

  return (
    <>
      {/* KPIs joueur */}
      {(() => {
        // Moyenne des charges hebdomadaires réellement enregistrées (semaines sans séance
        // exclues), et non charge totale / nb de semaines calendaires de la période — sinon
        // les semaines sans entraînement (trêve, blessure) faisaient chuter la moyenne affichée.
        const avgWeeklyLoad = weeklyChartData.length
          ? Math.round(weeklyChartData.reduce((s, w) => s + w.load, 0) / weeklyChartData.length)
          : 0;
        const tier          = avgWeeklyLoad > 0 ? getWeekTier(avgWeeklyLoad, thresholds.lightMax, thresholds.normalMax) : null;

        const surchargeWeeks = weeklyChartData.filter(w => w.load >= thresholds.normalMax).length;
        const totalWeeks     = weeklyChartData.length;

        return (
          <div className="grid grid-cols-2 lg:grid-cols-4" style={{ gap: 10, marginBottom: 20 }}>
            <RpeKpiCard
              accent={tier ? tier.color : '#334155'}
              label="Charge moyenne par semaine"
              value={avgWeeklyLoad > 0 ? <>{avgWeeklyLoad.toLocaleString('fr')}<span title="Unité Arbitraire = RPE × durée de la séance (minutes)" style={{ fontSize: '0.82rem', fontWeight: 400, marginLeft: 3 }}>UA</span></> : '—'}
              sub={tier ? <Badge color={tier.color} size="sm" label={tier.label} style={{ fontSize: '0.62rem' }} /> : undefined}
            />
            <RpeKpiCard
              accent={avgRPE !== null ? rpeColor(avgRPE) : '#334155'}
              label="RPE moyen par semaine"
              value={fmt1(avgRPE)}
              sub={avgRPE !== null ? <Badge color={rpeColor(avgRPE)} size="sm" label={rpeLabel(Math.round(avgRPE))} style={{ fontSize: '0.62rem' }} /> : undefined}
            />
            <RpeKpiCard
              accent="#3B82F6"
              label="Nombre de séances"
              value={filtered.length}
              valueColor="#F1F5F9"
              sub="sur la période sélectionnée"
            />
            <RpeKpiCard
              accent={surchargeWeeks > 0 ? '#EF4444' : '#00E5A0'}
              label="Semaines en surcharge"
              value={<><span style={{ color: surchargeWeeks > 0 ? '#EF4444' : '#00E5A0' }}>{surchargeWeeks}</span><span style={{ color: '#475569', fontSize: '0.9rem', fontWeight: 400 }}> / {totalWeeks}</span></>}
              valueColor="#F1F5F9"
              sub={totalWeeks > 0 ? `${Math.round(surchargeWeeks / totalWeeks * 100)} % des semaines` : '—'}
            />
          </div>
        );
      })()}

      {/* Graphe combiné UA + RPE joueur */}
      {indivDisplay === 'chart' && (() => {
        const weekCombo = weeklyBuckets.map(b => ({
          date: fmtDateWithDay(b.week),
          load: Math.round(b.load),
          rpe:  b.avgRpe ?? 0,
        }));
        const sessionCombo = [...filtered]
          .sort((a: RPEEntry, b: RPEEntry) => a.date.localeCompare(b.date))
          .map((e: RPEEntry) => ({
            date: fmtDateWithDay(e.date),
            load: Math.round(e.rpe * (e.actualDuration ?? e.plannedDuration)),
            rpe:  e.rpe,
          }));
        const comboData = indivComboView === 'session' ? sessionCombo : weekCombo;
        const high      = indivComboView === 'session' ? sessionLoadNormal : thresholds.normalMax;
        return (
          <div style={{ marginBottom: 20 }}>
            <ChargeRpeComboChart
              data={comboData}
              view={indivComboView}
              onViewChange={setIndivComboView}
              high={high}
              title="Charge & RPE"
              height={320}
            />
          </div>
        );
      })()}

      {/* Tableau historique */}
      {indivDisplay === 'table' && (() => {
        const sessionT1 = Math.round(sessionLoadNormal / 3);
        const sessionT2 = Math.round(sessionLoadNormal * 2 / 3);
        const loadCfgSession = (ua: number) => ua >= sessionLoadNormal
          ? { color: '#EF4444', label: 'Surcharge' }
          : ua >= sessionT2 ? { color: '#F97316', label: 'Élevée' }
          : ua >= sessionT1 ? { color: '#EAB308', label: 'Soutenue' }
          : { color: '#00E5A0', label: 'Normale' };

        const weekT1 = Math.round(thresholds.normalMax / 3);
        const weekT2 = Math.round(thresholds.normalMax * 2 / 3);
        const loadCfgWeek = (ua: number) => ua >= thresholds.normalMax
          ? { color: '#EF4444', label: 'Surcharge' }
          : ua >= weekT2 ? { color: '#F97316', label: 'Élevée' }
          : ua >= weekT1 ? { color: '#EAB308', label: 'Soutenue' }
          : { color: '#00E5A0', label: 'Normale' };

        // Agrégation semaine
        const weekMap = new Map<string, { rpes: number[]; totalLoad: number; totalDur: number; dates: string[]; teams: Set<string> }>();
        filtered.forEach(e => {
          const k = getWeekMonday(e.date);
          if (!weekMap.has(k)) weekMap.set(k, { rpes: [], totalLoad: 0, totalDur: 0, dates: [], teams: new Set() });
          const w = weekMap.get(k)!;
          const dur = e.actualDuration ?? e.plannedDuration;
          w.rpes.push(e.rpe);
          w.totalLoad += e.rpe * dur;
          w.totalDur  += dur;
          w.dates.push(e.date);
          if (e.teamName) w.teams.add(e.teamName);
        });
        const weekRows = [...weekMap.entries()]
          .sort(([a], [b]) => b.localeCompare(a))
          .map(([, { rpes, totalLoad, totalDur, dates, teams }]) => {
            const sorted = [...dates].sort();
            return {
              dateFrom:  sorted[0],
              dateTo:    sorted[sorted.length - 1],
              avgRpe:    Math.round(rpes.reduce((s, v) => s + v, 0) / rpes.length * 10) / 10,
              totalLoad: Math.round(totalLoad),
              totalDur,
              teamLabel: [...teams].join(', ') || '—',
            };
          });

        return (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
            <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A' }}>
              <CardTitle icon={<ListChecks size={12} style={{ color: '#00E5A0' }} />} mb={0}
                right={
                  <div style={{ display: 'flex', gap: 2, backgroundColor: '#0D0F14', borderRadius: 6, padding: 2 }}>
                    {(['session', 'week'] as const).map(v => (
                      <button key={v} onClick={() => setIndivTableView(v)}
                        style={{ padding: '3px 10px', borderRadius: 4, border: 'none', cursor: 'pointer', fontSize: '0.7rem',
                          fontWeight: indivTableView === v ? 700 : 400,
                          backgroundColor: indivTableView === v ? '#1E2229' : 'transparent',
                          color: indivTableView === v ? '#00E5A0' : '#475569', whiteSpace: 'nowrap' }}>
                        {v === 'session' ? 'Séance' : 'Semaine'}
                      </button>
                    ))}
                  </div>
                }>
                Historique des séances
              </CardTitle>
            </div>
            <div style={{ overflowX: 'auto' }}>
              {indivTableView === 'session' ? (
                <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    <col /><col /><col /><col /><col /><col />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Date', 'Type', 'Équipe', 'Durée', 'RPE', 'UA', 'Charge'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', backgroundColor: '#1E2229', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(e => {
                      const dur     = e.actualDuration ?? e.plannedDuration;
                      const load    = e.rpe * dur;
                      const rpeC    = rpeColor(e.rpe);
                      const typeCfg = SESSION_TYPES[e.sessionType] ?? SESSION_TYPES.training;
                      const lCfg    = loadCfgSession(load);
                      return (
                        <tr key={e.id} style={{ borderBottom: '1px solid #2A2F3A22' }}
                          onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                          onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                          <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{fmtDateWithDay(e.date)}</td>
                          <td style={{ padding: '9px 14px' }}>
                            <span style={{ backgroundColor: typeCfg.bg, color: typeCfg.color, fontSize: '0.65rem', fontWeight: 600, padding: '2px 7px', borderRadius: 4, whiteSpace: 'nowrap' }}>{typeCfg.label}</span>
                          </td>
                          <td style={{ padding: '9px 14px', color: '#475569', fontSize: '0.78rem' }}>{e.teamName ?? '—'}</td>
                          <td style={{ padding: '9px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{dur} <span style={{ color: '#475569', fontSize: '0.7rem' }}>min</span></td>
                          <td style={{ padding: '9px 14px' }}><span style={{ color: rpeC, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem' }}>{fmt1(e.rpe)}</span></td>
                          <td style={{ padding: '9px 14px', color: lCfg.color, fontSize: '0.82rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{load.toLocaleString('fr')}</td>
                          <td style={{ padding: '9px 14px' }}><Badge color={lCfg.color} bg={lCfg.color + '20'} size="sm" label={lCfg.label} style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px' }} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              ) : (
                <table style={{ width: '100%', minWidth: 680, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                  <colgroup>
                    <col style={{ width: '20%' }} />
                    <col /><col /><col /><col /><col /><col />
                  </colgroup>
                  <thead>
                    <tr>
                      {['Date', 'Type', 'Équipe', 'Durée', 'RPE', 'UA', 'Charge'].map(h => (
                        <th key={h} style={{ padding: '8px 14px', textAlign: 'left', color: '#475569', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A', backgroundColor: '#1E2229', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {weekRows.map(w => {
                      const lCfg = loadCfgWeek(w.totalLoad);
                      const rpeC = rpeColor(w.avgRpe);
                      const dateLabel = w.dateFrom === w.dateTo
                        ? fmtDateWithDay(w.dateFrom)
                        : `${fmtDateWithDay(w.dateFrom)} → ${fmtDateWithDay(w.dateTo)}`;
                      return (
                        <tr key={w.dateFrom} style={{ borderBottom: '1px solid #2A2F3A22' }}
                          onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                          onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                          <td style={{ padding: '9px 14px', color: '#94A3B8', fontSize: '0.78rem', whiteSpace: 'nowrap', fontFamily: 'JetBrains Mono, monospace' }}>{dateLabel}</td>
                          <td style={{ padding: '9px 14px' }}>
                            <Badge color="#3B82F6" size="sm" label="Semaine" style={{ fontSize: '0.65rem', fontWeight: 600 }} />
                          </td>
                          <td style={{ padding: '9px 14px', color: '#475569', fontSize: '0.78rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{w.teamLabel}</td>
                          <td style={{ padding: '9px 14px', color: '#64748B', fontSize: '0.78rem', fontFamily: 'JetBrains Mono, monospace' }}>{w.totalDur} <span style={{ color: '#475569', fontSize: '0.7rem' }}>min</span></td>
                          <td style={{ padding: '9px 14px' }}><span style={{ color: rpeC, fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', fontSize: '0.9rem' }}>{fmt1(w.avgRpe)}</span></td>
                          <td style={{ padding: '9px 14px', color: lCfg.color, fontSize: '0.82rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{w.totalLoad.toLocaleString('fr')}</td>
                          <td style={{ padding: '9px 14px' }}><Badge color={lCfg.color} bg={lCfg.color + '20'} size="sm" label={lCfg.label} style={{ fontSize: '0.62rem', fontWeight: 600, padding: '2px 6px' }} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        );
      })()}
    </>
  );
}

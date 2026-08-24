import { useState, useEffect, useRef } from 'react';
import { FileDown, Users, User } from 'lucide-react';
import { playersApi } from '../api/players';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useTeamRpeHistory } from '../hooks/useTeamRpeHistory';
import { useReportData } from '../hooks/useReportData';
import {
  Card, CardTitle, EmptyState, Spinner, DateRangeCard, useDateRange, PlayerSelect,
  ReportPage, ReportSummary, A4, REPORT_PAGE_CLASS,
  ReportRpeSection, ReportWellnessSection, ReportMedicalSection, ReportStatsSection, ReportObjectivesSection,
  rpeFindings, wellnessFindings, medicalFindings, statsFindings, objectivesFindings,
  reportDate, reportInt, reportDec,
} from '../components';
import { teamWellnessAvg, wellnessRawValue, WELLNESS_DIMENSIONS } from '../utils/wellness';
import { sumInjuryDays } from '../utils/medical';
import { ratioFromSums } from '../utils/ratioFromSums';
import type { Tone } from '../components/ReportKit';
import { exportPagesToPdf, reportFilename } from '../utils/reportPdf';
import { playerNameFull } from '../utils/playerName';
import { getWeekTier } from '../utils/weeklyLoad';
import type { RpeSectionData } from '../components/ReportRpeSection';
import type { Player } from '../data/types';

type Subject = 'team' | 'player';

/** Les sections proposées au rapport. L'ordre ici est celui du document généré. */
const SECTIONS = [
  { key: 'rpe',        label: "Charge d'entraînement (RPE)" },
  { key: 'wellness',   label: 'Bien-être' },
  { key: 'medical',    label: 'Médical' },
  { key: 'stats',      label: 'Statistiques basket' },
  { key: 'objectives', label: 'Objectifs' },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

/** Sections dont le gabarit existe — les autres seraient annoncées mais non cochables. */
const AVAILABLE: SectionKey[] = ['rpe', 'wellness', 'medical', 'stats', 'objectives'];

const toggleBtn = (active: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
  padding: '8px 16px', borderRadius: 7, fontWeight: 700, fontSize: '0.85rem', cursor: 'pointer',
  backgroundColor: active ? 'rgba(0,229,160,0.1)' : '#1E2229',
  border: `1px solid ${active ? '#00E5A0' : '#2A2F3A'}`,
  color: active ? '#00E5A0' : '#94A3B8',
});

export default function ReportsPage() {
  const { selected, thresholds, loading: teamLoading } = useTeamSeason();
  const dateRange = useDateRange(selected?.season.startDate, 45, selected?.season.endDate);

  const [roster,   setRoster]   = useState<Player[]>([]);
  const [subject,  setSubject]  = useState<Subject>('team');
  const [playerId, setPlayerId] = useState('');
  const [chosen,   setChosen]   = useState<SectionKey[]>(['rpe']);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  const documentRef = useRef<HTMLDivElement>(null);
  const generatedOn = new Date().toLocaleDateString('sv');

  useEffect(() => {
    if (!selected) return;
    playersApi.listBySeason(selected.season.id)
      .then(players => {
        setRoster(players);
        setPlayerId(prev => prev || (players[0]?.id ?? ''));
      })
      .catch(() => {});
  }, [selected?.season.id]);

  const {
    teamWeekRows, teamKpis, playerRanking, teamPeriodAvgWeeklyLoad, teamSeasonAvgWeeklyLoad,
    teamSeasonAvgRpe, teamAcwrAvg, teamFreshAvg, loadingTeamHistory,
  } = useTeamRpeHistory(selected?.team.id, selected?.season.id, dateRange.from, dateRange.to, roster);

  // Les 4 autres sections partagent un seul chargement (le même que l'analyse collective).
  const report = useReportData(dateRange.from, dateRange.to);

  const player = subject === 'player' ? roster.find(p => p.id === playerId) : undefined;

  function toggleSection(key: SectionKey) {
    setChosen(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  async function handleExport() {
    if (!documentRef.current || !selected) return;
    setExporting(true);
    setExportError('');
    try {
      const pages = Array.from(documentRef.current.querySelectorAll<HTMLElement>(`.${REPORT_PAGE_CLASS}`));
      const name = player ? playerNameFull(player) : selected.team.name;
      await exportPagesToPdf(pages, reportFilename(name, generatedOn));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erreur pendant la génération du PDF.');
    } finally {
      setExporting(false);
    }
  }

  if (teamLoading) return <div style={{ padding: 24, color: '#94A3B8', fontSize: '0.85rem' }}>Chargement…</div>;

  if (!selected) {
    return (
      <div className="p-4 md:p-6">
        <h1 style={{ color: '#F1F5F9', margin: '0 0 24px' }}>Rapports</h1>
        <EmptyState message="Sélectionnez une équipe et une saison dans la barre du haut." size="lg" />
      </div>
    );
  }

  // ── Données de section, mises à plat pour les gabarits ────────────────────
  const rpeData: RpeSectionData = {
    avgWeeklyLoad:       Math.round(teamPeriodAvgWeeklyLoad.value ?? 0),
    seasonAvgWeeklyLoad: teamSeasonAvgWeeklyLoad.value,
    rpeAvg:              teamKpis && teamKpis.sessions > 0 ? teamKpis.avg : { value: null, players: 0 },
    seasonRpeAvg:        teamSeasonAvgRpe.value,
    sessions:            teamKpis?.sessions ?? 0,
    totalLoad:           teamKpis?.totalLoad ?? 0,
    weeks:               teamWeekRows.map(w => ({ week: w.week, load: w.load })),
    acwr:                teamAcwrAvg,
    freshness:           teamFreshAvg,
    players:             playerRanking.map(p => ({ name: p.name, nbSessions: p.nbSessions, avgRpe: p.avgRpe, totalLoad: p.totalLoad })),
  };

  const includedSections = SECTIONS.filter(s => chosen.includes(s.key));
  const totalPages = includedSections.length + 1;
  const running = `${player ? playerNameFull(player) : selected.team.name} · ${reportDate(dateRange.from)} → ${reportDate(dateRange.to)}`;

  const tier = getWeekTier(rpeData.avgWeeklyLoad, thresholds.lightMax, thresholds.normalMax);
  const overloadWeeks = rpeData.weeks.filter(w => w.load >= thresholds.normalMax).length;
  const loadDelta = teamSeasonAvgWeeklyLoad.value !== null && teamSeasonAvgWeeklyLoad.value > 0
    ? Math.round(rpeData.avgWeeklyLoad - teamSeasonAvgWeeklyLoad.value) : null;

  /**
   * La synthèse ne résume que les sections retenues, et donne à chacune la même place : un
   * chiffre de tête et un constat. Sans ça, un rapport « Médical seul » ouvrirait sur une page
   * vide, et un rapport complet ouvrirait sur quatre chiffres de charge et rien d'autre.
   */
  const summaryStats: { label: string; value: React.ReactNode; unit?: string; hint?: React.ReactNode; tone?: Tone }[] = [];
  const summaryFindings: { tone: Tone; text: string }[] = [];

  if (chosen.includes('rpe')) {
    summaryStats.push({
      label: 'Charge hebdo moyenne',
      value: rpeData.avgWeeklyLoad > 0 ? reportInt(rpeData.avgWeeklyLoad) : '—',
      unit: 'UA', hint: tier.label,
      tone: overloadWeeks > 0 ? 'warn' : 'good',
    });
    summaryFindings.push(...rpeFindings(rpeData, thresholds, overloadWeeks, loadDelta).slice(0, 1));
  }

  if (chosen.includes('wellness')) {
    const wAvg = teamWellnessAvg(report.wellness.entries).value;
    summaryStats.push({
      label: 'Bien-être moyen',
      value: reportDec(wAvg), unit: '/ 10',
      hint: `${report.wellness.entries.length} saisie${report.wellness.entries.length > 1 ? 's' : ''}`,
      tone: wAvg === null ? 'neutral' : wAvg >= 7 ? 'good' : wAvg >= 5 ? 'warn' : 'bad',
    });
    const activeDays = new Set(report.wellness.entries.map(e => e.date)).size;
    const expected = report.wellness.rosterSize * activeDays;
    const rate = expected > 0 ? Math.round((report.wellness.entries.length / expected) * 100) : 0;
    const dims = WELLNESS_DIMENSIONS.map(dim => ({
      label: dim.shortLabel,
      value: teamWellnessAvg(
        report.wellness.entries.map(e => ({ ...e, [dim.key]: wellnessRawValue(Number(e[dim.key]), dim.inverted) })),
        dim.key,
      ).value ?? 0,
    })).sort((a, b) => a.value - b.value);
    summaryFindings.push(...wellnessFindings(report.wellness, wAvg, null, rate, dims).slice(0, 1));
  }

  if (chosen.includes('medical')) {
    const injuries = report.medical.events.filter(e => e.record.type === 'injury');
    const unavailable = report.medical.roster.filter(p => p.status === 'injured' || p.status === 'unavailable').length;
    const severe = injuries.filter(e => e.record.severity === 'severe').length;
    const daysLost = sumInjuryDays(injuries.map(e => e.record)).days;
    summaryStats.push({
      label: 'Effectif disponible',
      value: <>{report.medical.roster.filter(p => p.status === 'active').length}<span style={{ fontSize: 14, fontWeight: 600 }}> / {report.medical.roster.length}</span></>,
      hint: `${injuries.length} blessure${injuries.length > 1 ? 's' : ''} sur la période`,
      tone: unavailable === 0 ? 'good' : unavailable > 2 ? 'bad' : 'warn',
    });
    summaryFindings.push(...medicalFindings(report.medical, injuries.length, severe, daysLost, unavailable).slice(0, 1));
  }

  if (chosen.includes('stats')) {
    const games = report.stats.teamStats;
    const wins = games.filter(g => g.result === 'win').length;
    const losses = games.length - wins;
    const ptsFor = games.length ? games.reduce((s, g) => s + g.scoreUs, 0) / games.length : null;
    const ptsAgainst = games.length ? games.reduce((s, g) => s + g.scoreThem, 0) / games.length : null;
    const diff = ptsFor !== null && ptsAgainst !== null ? ptsFor - ptsAgainst : null;
    summaryStats.push({
      label: 'Bilan',
      value: games.length === 0 ? '—' : <>{wins}<span style={{ fontSize: 15, fontWeight: 600 }}> V </span>{losses}<span style={{ fontSize: 15, fontWeight: 600 }}> D</span></>,
      hint: `${games.length} match${games.length > 1 ? 's' : ''} joué${games.length > 1 ? 's' : ''}`,
      tone: games.length === 0 ? 'neutral' : wins > losses ? 'good' : wins === losses ? 'neutral' : 'bad',
    });
    const fg3 = ratioFromSums(games, g => g.fg3m, g => g.fg3a);
    const to = games.length ? games.reduce((s, g) => s + g.bp, 0) / games.length : null;
    summaryFindings.push(...statsFindings(games, wins, losses, diff, fg3, to).slice(0, 1));
  }

  if (chosen.includes('objectives')) {
    const active = report.objectives.filter(o => o.objective.active);
    const measured = active.filter(o => o.met !== null);
    const met = measured.filter(o => o.met === true).length;
    const rate = measured.length > 0 ? Math.round((met / measured.length) * 100) : null;
    summaryStats.push({
      label: "Taux d'atteinte",
      value: rate === null ? '—' : `${rate}`, unit: rate === null ? undefined : '%',
      hint: `${met} sur ${measured.length} objectif${measured.length > 1 ? 's' : ''} mesuré${measured.length > 1 ? 's' : ''}`,
      tone: rate === null ? 'neutral' : rate >= 70 ? 'good' : rate >= 40 ? 'warn' : 'bad',
    });
    summaryFindings.push(...objectivesFindings(active, met, measured.length - met, rate).slice(0, 1));
  }

  const needsPerfData = chosen.some(k => k !== 'rpe');
  const dataLoading = (chosen.includes('rpe') && loadingTeamHistory) || (needsPerfData && report.loading);
  const notReady = chosen.length === 0 || dataLoading;

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Rapports</h1>
        <button type="button" onClick={handleExport} disabled={exporting || notReady}
          style={{
            display: 'flex', alignItems: 'center', gap: 7, padding: '8px 16px', borderRadius: 7,
            fontWeight: 700, fontSize: '0.85rem', whiteSpace: 'nowrap',
            backgroundColor: exporting || notReady ? '#1E2229' : '#00E5A0',
            border: 'none', color: exporting || notReady ? '#475569' : '#0D0F14',
            cursor: exporting || notReady ? 'not-allowed' : 'pointer',
          }}>
          <FileDown size={15} />
          {exporting ? 'Génération…' : 'Générer le PDF'}
        </button>
      </div>

      <Card style={{ marginBottom: 20 }}>
        <CardTitle mb={12}>Contenu du rapport</CardTitle>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => setSubject('team')} style={toggleBtn(subject === 'team')}>
            <Users size={14} /> Équipe
          </button>
          <button type="button" onClick={() => setSubject('player')} style={toggleBtn(subject === 'player')}>
            <User size={14} /> Joueur
          </button>
          {subject === 'player' && roster.length > 0 && (
            <PlayerSelect players={roster} value={playerId} onChange={setPlayerId} />
          )}
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {SECTIONS.map(s => {
            const disabled = !AVAILABLE.includes(s.key);
            const active = chosen.includes(s.key);
            return (
              <label key={s.key}
                title={disabled ? 'Gabarit en cours de conception' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 7, padding: '7px 12px', borderRadius: 7,
                  backgroundColor: active ? 'rgba(0,229,160,0.08)' : '#1E2229',
                  border: `1px solid ${active ? '#00E5A050' : '#2A2F3A'}`,
                  color: disabled ? '#475569' : active ? '#F1F5F9' : '#94A3B8',
                  fontSize: '0.82rem', fontWeight: 600,
                  cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.55 : 1,
                }}>
                <input type="checkbox" checked={active} disabled={disabled}
                  onChange={() => toggleSection(s.key)}
                  style={{ accentColor: '#00E5A0', cursor: disabled ? 'not-allowed' : 'pointer' }} />
                {s.label}
              </label>
            );
          })}
        </div>
      </Card>

      <DateRangeCard
        from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
        onPreset={dateRange.applyPreset} onFrom={dateRange.setFrom} onTo={dateRange.setTo}
        style={{ marginBottom: 20 }}
      />

      {exportError && <div style={{ color: '#EF4444', fontSize: '0.85rem', marginBottom: 16 }}>{exportError}</div>}

      {chosen.length === 0 ? (
        <EmptyState message="Cochez au moins une section à inclure dans le rapport." size="lg" />
      ) : dataLoading ? (
        <Spinner centered />
      ) : (
        <>
          <p style={{ color: '#475569', fontSize: '0.78rem', margin: '0 0 10px' }}>
            Aperçu du document — {totalPages} page{totalPages > 1 ? 's' : ''} A4
          </p>
          {/* Le document est rendu à sa taille réelle (794 px de large) puis réduit à l'écran :
              l'export capture les pages telles qu'elles sont mises en page, pas telles qu'elles
              sont affichées ici. */}
          <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
            <div ref={documentRef} style={{ display: 'flex', flexDirection: 'column', gap: 20, width: A4.width }}>
              <ReportPage running={undefined} pageNumber={1} totalPages={totalPages}>
                <ReportSummary
                  teamName={selected.team.name}
                  seasonLabel={selected.season.label}
                  player={player}
                  from={dateRange.from}
                  to={dateRange.to}
                  generatedOn={generatedOn}
                  stats={summaryStats}
                  findings={summaryFindings}
                  sections={includedSections.map(s => s.label)}
                />
              </ReportPage>

              {includedSections.map((s, i) => (
                <ReportPage key={s.key} running={running} pageNumber={i + 2} totalPages={totalPages}>
                  {s.key === 'rpe'        && <ReportRpeSection        index={i + 1} data={rpeData} thresholds={thresholds} />}
                  {s.key === 'wellness'   && <ReportWellnessSection   index={i + 1} data={report.wellness} />}
                  {s.key === 'medical'    && <ReportMedicalSection    index={i + 1} data={report.medical} />}
                  {s.key === 'stats'      && <ReportStatsSection      index={i + 1} data={report.stats} />}
                  {s.key === 'objectives' && <ReportObjectivesSection index={i + 1} data={{ objectives: report.objectives }} />}
                </ReportPage>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

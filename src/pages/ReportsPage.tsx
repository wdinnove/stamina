import { useState, useEffect, useRef } from 'react';
import { FileDown, Users, User } from 'lucide-react';
import { playersApi } from '../api/players';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useTeamRpeHistory } from '../hooks/useTeamRpeHistory';
import {
  Card, CardTitle, EmptyState, Spinner, DateRangeCard, useDateRange, PlayerSelect,
  ReportPage, ReportSummary, ReportRpeSection, rpeFindings, A4, REPORT_PAGE_CLASS,
  reportDate, reportInt, reportDec,
} from '../components';
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

/** Sections déjà conçues — les autres sont annoncées mais pas encore cochables. */
const AVAILABLE: SectionKey[] = ['rpe'];

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

  // La synthèse remonte les chiffres des sections retenues — pas d'autres.
  const summaryStats = chosen.includes('rpe') ? [
    { label: 'Charge hebdo moyenne', value: rpeData.avgWeeklyLoad > 0 ? reportInt(rpeData.avgWeeklyLoad) : '—', unit: 'UA', hint: tier.label },
    { label: 'RPE moyen', value: reportDec(rpeData.rpeAvg.value), unit: '/ 10', hint: `${rpeData.rpeAvg.players} joueur${rpeData.rpeAvg.players > 1 ? 's' : ''}` },
    { label: 'Séances suivies', value: rpeData.sessions, hint: `${reportInt(rpeData.totalLoad)} UA cumulées` },
    { label: 'Semaines en surcharge', value: `${overloadWeeks} / ${rpeData.weeks.length}`, tone: overloadWeeks > 0 ? ('bad' as const) : ('good' as const) },
  ] : [];

  const summaryFindings = chosen.includes('rpe')
    ? rpeFindings(rpeData, thresholds, overloadWeeks, loadDelta).slice(0, 3)
    : [];

  const dataLoading = chosen.includes('rpe') && loadingTeamHistory;
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
                  {s.key === 'rpe' && <ReportRpeSection index={i + 1} data={rpeData} thresholds={thresholds} />}
                </ReportPage>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

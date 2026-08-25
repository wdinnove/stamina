import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { FileDown, ChevronDown, ChevronRight, Users } from 'lucide-react';
import { playersApi } from '../api/players';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useTeamRpeHistory } from '../hooks/useTeamRpeHistory';
import { useReportData } from '../hooks/useReportData';
import type { PlayerReportBundle } from '../hooks/useReportData';
import type { LoadThresholds } from '../contexts/TeamSeasonContext';
import {
  Card, CardTitle, EmptyState, Spinner, DateRangeCard, useDateRange,
  ReportPage, ReportSummary, PlayerStrip, A4, REPORT_PAGE_CLASS,
  REPORT_CONTENT_WIDTH, REPORT_PAGE_AVAILABLE, REPORT_BLOCK_GAP,
  ReportRpeSection, ReportWellnessSection, ReportMedicalSection, ReportStatsSection, ReportObjectivesSection,
  ReportPlayerRpeSection, ReportPlayerWellnessSection, ReportPlayerMedicalSection, ReportPlayerStatsSection,
  rpeFindings, wellnessFindings, medicalFindings, statsFindings, objectivesFindings,
  playerRpeFindings, playerMedicalFindings,
  reportDate, reportInt, reportDec,
} from '../components';
import type { SummaryEntry } from '../components';
import { teamWellnessAvg, wellnessRawValue, WELLNESS_DIMENSIONS } from '../utils/wellness';
import { sumInjuryDays } from '../utils/medical';
import { ratioFromSums } from '../utils/ratioFromSums';
import type { Tone } from '../components/ReportKit';
import { exportPagesToPdf, reportFilename } from '../utils/reportPdf';
import { playerNameShort } from '../utils/playerName';
import { getWeekTier } from '../utils/weeklyLoad';
import { composeGroups, paginateGroups, groupScopeLabel } from '../utils/reportComposition';
import type { ReportScope, ReportBlock } from '../utils/reportComposition';
import type { RpeSectionData } from '../components/ReportRpeSection';
import type { Player } from '../data/types';

/** Les sections proposées au rapport. L'ordre ici est celui qu'elles suivent chez chaque sujet. */
const SECTIONS = [
  { key: 'rpe',        label: "Charge d'entraînement (RPE)" },
  { key: 'wellness',   label: 'Bien-être' },
  { key: 'medical',    label: 'Médical' },
  { key: 'stats',      label: 'Statistiques basket' },
  { key: 'objectives', label: 'Objectifs' },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];
type Scope = ReportScope;
type Block = ReportBlock<SectionKey>;

/**
 * Le périmètre est choisi section par section. Un staff veut couramment la charge de tout
 * l'effectif joueur par joueur mais le médical seulement au niveau du groupe — une sélection
 * unique valable pour tout le document ne saurait pas exprimer ça.
 */
const EMPTY_SCOPES: Record<SectionKey, Scope> = {
  rpe:        { team: true,  players: [] },
  wellness:   { team: false, players: [] },
  medical:    { team: false, players: [] },
  stats:      { team: false, players: [] },
  objectives: { team: false, players: [] },
};

/** Repli de sécurité si le bandeau d'identité n'a pas encore été mesuré. */
const STRIP_FALLBACK = 69;

export default function ReportsPage() {
  const { selected, thresholds, loading: teamLoading } = useTeamSeason();
  const dateRange = useDateRange(selected?.season.startDate, 45, selected?.season.endDate);

  const [roster, setRoster] = useState<Player[]>([]);
  const [scopes, setScopes] = useState<Record<SectionKey, Scope>>(EMPTY_SCOPES);
  const [openPicker, setOpenPicker] = useState<SectionKey | null>(null);
  const [exporting, setExporting] = useState(false);
  const [progress, setProgress]   = useState<{ done: number; total: number } | null>(null);
  const [exportError, setExportError] = useState('');

  const documentRef = useRef<HTMLDivElement>(null);
  const generatedOn = new Date().toLocaleDateString('sv');

  useEffect(() => {
    if (!selected) return;
    playersApi.listBySeason(selected.season.id).then(setRoster).catch(() => {});
  }, [selected?.season.id]);

  const {
    teamWeekRows, teamKpis, playerRanking, teamPeriodAvgWeeklyLoad, teamSeasonAvgWeeklyLoad,
    teamSeasonAvgRpe, teamAcwrAvg, teamFreshAvg, loadingTeamHistory,
  } = useTeamRpeHistory(selected?.team.id, selected?.season.id, dateRange.from, dateRange.to, roster);

  // Tout le reste — équipe comme joueurs — partage un seul chargement (celui de l'analyse collective).
  const report = useReportData(dateRange.from, dateRange.to);

  // ── Mesure des sections, pour les enchaîner sans les couper ────────────────
  const { heights, stripHeight, measureBlock, measureStrip } =
    useBlockHeights(`${dateRange.from}|${dateRange.to}|${selected?.season.id ?? ''}`);

  // ── Largeur disponible pour l'aperçu, qui est réduit pour tenir dans sa colonne ──
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewWidth, setPreviewWidth] = useState(0);
  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setPreviewWidth(entry.contentRect.width));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  function setScope(key: SectionKey, next: Scope) {
    setScopes(prev => ({ ...prev, [key]: next }));
  }

  function togglePlayer(key: SectionKey, playerId: string) {
    const scope = scopes[key];
    setScope(key, {
      ...scope,
      players: scope.players.includes(playerId)
        ? scope.players.filter(id => id !== playerId)
        : [...scope.players, playerId],
    });
  }

  /** Reporter un périmètre sur toutes les sections — « idem pour le reste », en un clic. */
  function applyToAll(key: SectionKey) {
    const scope = scopes[key];
    setScopes(Object.fromEntries(
      SECTIONS.map(s => [s.key, { team: scope.team, players: [...scope.players] }]),
    ) as Record<SectionKey, Scope>);
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

  // ── Composition du document ───────────────────────────────────────────────
  const groups = composeGroups<SectionKey, Player>(SECTIONS, scopes, roster, playerNameShort);
  const pages = paginateGroups(groups, {
    available: REPORT_PAGE_AVAILABLE,
    heights,
    gap: REPORT_BLOCK_GAP,
    stripHeight: stripHeight ?? STRIP_FALLBACK,
  });
  const totalPages = pages.length === 0 ? 0 : pages.length + 1;

  const teamAnywhere = groups.some(g => !g.player);
  const detailedPlayers = groups.filter(g => g.player).map(g => g.player as Player);
  const soloPlayer = !teamAnywhere && detailedPlayers.length === 1 ? detailedPlayers[0] : undefined;

  // Sommaire : une ligne par sujet, avec les sections qu'il couvre et sa plage de pages.
  const firstPageOf = new Map<string, number>();
  const lastPageOf  = new Map<string, number>();
  pages.forEach((p, i) => {
    if (!firstPageOf.has(p.groupId)) firstPageOf.set(p.groupId, i + 2);
    lastPageOf.set(p.groupId, i + 2);
  });
  const summaryEntries: SummaryEntry[] = groups.map(g => ({
    label: g.subject,
    scope: groupScopeLabel(g),
    fromPage: firstPageOf.get(g.id) ?? 2,
    toPage:   lastPageOf.get(g.id) ?? 2,
  }));

  // ── Données de la section RPE d'équipe, mises à plat pour le gabarit ───────
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

  const tier = getWeekTier(rpeData.avgWeeklyLoad, thresholds.lightMax, thresholds.normalMax);
  const overloadWeeks = rpeData.weeks.filter(w => w.load >= thresholds.normalMax).length;
  const loadDelta = teamSeasonAvgWeeklyLoad.value !== null && teamSeasonAvgWeeklyLoad.value > 0
    ? Math.round(rpeData.avgWeeklyLoad - teamSeasonAvgWeeklyLoad.value) : null;

  /**
   * La synthèse ne parle que du collectif : un chiffre et un constat par section demandée AU NIVEAU
   * DE L'ÉQUIPE. Une section détaillée joueur par joueur n'y contribue pas — ce serait présenter
   * comme un bilan de groupe une donnée qu'on n'a pas demandée pour le groupe.
   */
  const summaryStats: { label: string; value: React.ReactNode; unit?: string; hint?: React.ReactNode; tone?: Tone }[] = [];
  const summaryFindings: { tone: Tone; text: string }[] = [];

  if (scopes.rpe.team) {
    summaryStats.push({
      label: 'Charge hebdo moyenne',
      value: rpeData.avgWeeklyLoad > 0 ? reportInt(rpeData.avgWeeklyLoad) : '—',
      unit: 'UA', hint: tier.label,
      tone: overloadWeeks > 0 ? 'warn' : 'good',
    });
    summaryFindings.push(...rpeFindings(rpeData, thresholds, overloadWeeks, loadDelta).slice(0, 1));
  }

  if (scopes.wellness.team) {
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

  if (scopes.medical.team) {
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

  if (scopes.stats.team) {
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

  if (scopes.objectives.team) {
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

  /**
   * Un rapport sans aucun périmètre d'équipe s'ouvrirait sur une page nue. Quand il ne couvre
   * qu'un joueur, la synthèse prend donc ses chiffres à lui : c'est bien le sujet du document.
   * À plusieurs joueurs, aucun chiffre n'est légitime en tête — la synthèse se limite alors à
   * annoncer qui est couvert et où le trouver.
   */
  if (soloPlayer) {
    const bundle = report.byPlayer.get(soloPlayer.id);
    if (bundle) {
      if (scopes.rpe.players.includes(soloPlayer.id)) {
        const p = bundle.rpe;
        const pTier = getWeekTier(p.avgWeeklyLoad ?? 0, thresholds.lightMax, thresholds.normalMax);
        const pOverload = p.weeks.filter(w => w.load >= thresholds.normalMax).length;
        const vsTeam = p.avgWeeklyLoad !== null && p.teamAvgWeeklyLoad !== null
          ? Math.round(p.avgWeeklyLoad - p.teamAvgWeeklyLoad) : null;
        const vsRpe = p.avgRpe !== null && p.teamAvgRpe !== null
          ? Math.round((p.avgRpe - p.teamAvgRpe) * 10) / 10 : null;
        const att = p.teamSessions > 0 ? Math.round((p.sessions / p.teamSessions) * 100) : null;
        summaryStats.push({
          label: 'Charge hebdo moyenne',
          value: p.avgWeeklyLoad === null ? '—' : reportInt(p.avgWeeklyLoad),
          unit: 'UA', hint: pTier.label,
          tone: pOverload > 0 ? 'warn' : 'good',
        });
        summaryFindings.push(...playerRpeFindings(p, thresholds, pTier.label, pOverload, vsTeam, vsRpe, att).slice(0, 1));
      }
      if (scopes.wellness.players.includes(soloPlayer.id)) {
        const w = bundle.wellness;
        const wAvg = teamWellnessAvg(w.entries).value;
        summaryStats.push({
          label: 'Bien-être moyen',
          value: reportDec(wAvg), unit: '/ 10',
          hint: `${w.entries.length} saisie${w.entries.length > 1 ? 's' : ''}`,
          tone: wAvg === null ? 'neutral' : wAvg >= 7 ? 'good' : wAvg >= 5 ? 'warn' : 'bad',
        });
      }
      if (scopes.medical.players.includes(soloPlayer.id)) {
        const m = bundle.medical;
        const inj = m.records.filter(r => r.type === 'injury');
        summaryStats.push({
          label: 'Jours indisponible',
          value: reportInt(sumInjuryDays(inj).days),
          hint: `${inj.length} blessure${inj.length > 1 ? 's' : ''} sur la période`,
          tone: m.player.status === 'active' ? 'good' : 'bad',
        });
        summaryFindings.push(...playerMedicalFindings(
          m, inj, inj.filter(r => r.severity === 'severe').length,
          sumInjuryDays(inj).days, sumInjuryDays(m.seasonRecords.filter(r => r.type === 'injury')).days,
          [],
        ).slice(0, 1));
      }
      if (scopes.stats.players.includes(soloPlayer.id)) {
        const g = bundle.stats.games;
        const pts = g.length ? g.reduce((s, x) => s + x.pts, 0) / g.length : null;
        summaryStats.push({
          label: 'Points par match',
          value: reportDec(pts),
          hint: `${g.length} match${g.length > 1 ? 's' : ''} sur ${bundle.stats.teamGames}`,
        });
      }
      if (scopes.objectives.players.includes(soloPlayer.id)) {
        const act = bundle.objectives.filter(o => o.objective.active);
        const meas = act.filter(o => o.met !== null);
        const ok = meas.filter(o => o.met === true).length;
        const rate = meas.length > 0 ? Math.round((ok / meas.length) * 100) : null;
        summaryStats.push({
          label: "Taux d'atteinte",
          value: rate === null ? '—' : `${rate}`, unit: rate === null ? undefined : '%',
          hint: `${ok} sur ${meas.length} objectif${meas.length > 1 ? 's' : ''} mesuré${meas.length > 1 ? 's' : ''}`,
          tone: rate === null ? 'neutral' : rate >= 70 ? 'good' : rate >= 40 ? 'warn' : 'bad',
        });
        summaryFindings.push(...objectivesFindings(act, ok, meas.length - ok, rate).slice(0, 1));
      }
    }
  }

  const allBlocks = groups.flatMap(g => g.blocks.map(b => ({ block: b, player: g.player, subject: g.subject })));
  const needsTeamRpe = scopes.rpe.team;
  const needsPerfData = allBlocks.some(b => b.player !== undefined || b.block.section !== 'rpe');
  const dataLoading = (needsTeamRpe && loadingTeamHistory) || (needsPerfData && report.loading);
  const notReady = allBlocks.length === 0 || dataLoading;

  const running = `${selected.team.name} · ${reportDate(dateRange.from)} → ${reportDate(dateRange.to)}`;

  const renderBlock = (block: Block, player: Player | undefined, subject: string) =>
    player
      ? renderPlayerBlock(block, subject, report.byPlayer.get(player.id), thresholds)
      : renderTeamBlock(block, rpeData, report, thresholds);

  // L'aperçu est réduit pour tenir dans sa colonne, mais le document reste à sa taille réelle :
  // l'export capture des pages A4, jamais leur réduction à l'écran (d'où `scale = 1` pendant).
  const scale = exporting || previewWidth === 0 ? 1 : Math.min(1, previewWidth / A4.width);
  const docHeight = pages.length === 0 ? 0 : (pages.length + 1) * (A4.height + 20) - 20;

  async function handleExport() {
    if (!documentRef.current || !selected) return;
    setExporting(true);
    setExportError('');
    setProgress({ done: 0, total: totalPages });
    // Laisser React repeindre le document à l'échelle 1 avant de le capturer.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    try {
      const nodes = Array.from(documentRef.current.querySelectorAll<HTMLElement>(`.${REPORT_PAGE_CLASS}`));
      const name = soloPlayer ? playerNameShort(soloPlayer) : selected.team.name;
      await exportPagesToPdf(nodes, reportFilename(name, generatedOn), (done, total) => setProgress({ done, total }));
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'Erreur pendant la génération du PDF.');
    } finally {
      setExporting(false);
      setProgress(null);
    }
  }

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
          {exporting
            ? progress ? `Génération… ${progress.done} / ${progress.total}` : 'Génération…'
            : 'Générer le PDF'}
        </button>
      </div>

      {/* La colonne de gauche doit s'étirer sur toute la hauteur de la ligne (pas d'`align-items:
          start`) pour que le panneau qu'elle contient puisse rester collé pendant qu'on fait
          défiler l'aperçu. */}
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr]" style={{ gap: 20 }}>
        {/* ── Colonne de gauche : ce que contient le rapport ── */}
        <div>
        <div className="lg:sticky" style={{ top: 16 }}>
          <Card style={{ marginBottom: 16 }}>
            <CardTitle mb={12}>Contenu du rapport</CardTitle>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {SECTIONS.map(s => (
                <SectionRow
                  key={s.key}
                  label={s.label}
                  scope={scopes[s.key]}
                  roster={roster}
                  open={openPicker === s.key}
                  onToggleOpen={() => setOpenPicker(prev => (prev === s.key ? null : s.key))}
                  onToggleTeam={() => setScope(s.key, { ...scopes[s.key], team: !scopes[s.key].team })}
                  onSetPlayers={ids => setScope(s.key, { ...scopes[s.key], players: ids })}
                  onTogglePlayer={id => togglePlayer(s.key, id)}
                  onApplyToAll={() => applyToAll(s.key)}
                />
              ))}
            </div>
          </Card>

          {/* `compact` : la barre de filtres en ligne est calibrée pour la pleine largeur d'une
              page et déborderait de cette colonne. */}
          <DateRangeCard
            compact
            from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
            onPreset={dateRange.applyPreset} onFrom={dateRange.setFrom} onTo={dateRange.setTo}
          />

          {exportError && <div style={{ color: '#EF4444', fontSize: '0.85rem', marginTop: 14 }}>{exportError}</div>}
        </div>
        </div>

        {/* ── Colonne de droite : l'aperçu du document ── */}
        <div ref={previewRef} style={{ minWidth: 0 }}>
          {allBlocks.length === 0 ? (
            <EmptyState message="Choisissez au moins un périmètre — le bilan d'équipe ou un joueur — dans une section." size="lg" />
          ) : dataLoading ? (
            <Spinner centered />
          ) : (
            <>
              {/* Seul avertissement conservé au-dessus de l'aperçu : il prévient d'une attente à
                  venir, ce que le document lui-même ne dit pas. */}
              {totalPages > 25 && (
                <p style={{
                  color: '#F59E0B', fontSize: '0.75rem', margin: '0 0 10px',
                  display: 'flex', alignItems: 'center', gap: 5,
                }}>
                  <Users size={12} /> Document volumineux ({totalPages} pages) : la génération peut prendre une minute ou deux.
                </p>
              )}

              <div style={{ height: exporting ? 'auto' : docHeight * scale, overflow: exporting ? 'visible' : 'hidden' }}>
                <div ref={documentRef} style={{
                  display: 'flex', flexDirection: 'column', gap: 20, width: A4.width,
                  transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: 'top left',
                }}>
                  <ReportPage running={undefined} pageNumber={1} totalPages={totalPages}>
                    <ReportSummary
                      teamName={selected.team.name}
                      seasonLabel={selected.season.label}
                      teamLevel={teamAnywhere}
                      soloPlayer={soloPlayer}
                      playerCount={detailedPlayers.length}
                      playerNames={detailedPlayers.map(playerNameShort)}
                      from={dateRange.from}
                      to={dateRange.to}
                      generatedOn={generatedOn}
                      stats={summaryStats}
                      findings={summaryFindings}
                      entries={summaryEntries}
                    />
                  </ReportPage>

                  {pages.map((p, i) => (
                    <ReportPage key={p.id} running={running} pageNumber={i + 2} totalPages={totalPages}>
                      {p.player && <PlayerStrip player={p.player} />}
                      {p.blocks.map((b, k) => (
                        <div key={b.id} style={{ marginTop: k === 0 ? 0 : REPORT_BLOCK_GAP }}>
                          {renderBlock(b, p.player, p.subject)}
                        </div>
                      ))}
                    </ReportPage>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Couche de mesure : les sections y sont rendues à la largeur d'une page A4 pour connaître
          leur hauteur réelle, seule façon d'enchaîner deux sections courtes sur une même feuille.
          Jamais visible, jamais capturée — elle ne porte pas la classe des pages. */}
      {!dataLoading && (
        <div aria-hidden style={{
          position: 'fixed', top: 0, left: -100000, width: REPORT_CONTENT_WIDTH,
          visibility: 'hidden', pointerEvents: 'none',
          fontFamily: 'Inter, system-ui, -apple-system, sans-serif', color: '#0F172A',
        }}>
          {roster[0] && <div ref={measureStrip}><PlayerStrip player={roster[0]} /></div>}
          {allBlocks.map(({ block, player, subject }) => (
            <div key={block.id} ref={measureBlock(block.id)}>
              {renderBlock(block, player, subject)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Hauteur réelle de chaque section, relevée sur une couche de mesure hors écran.
 *
 * Les mesures d'un même rendu sont regroupées en une seule mise à jour d'état : une par section
 * relancerait autant de recompositions du document.
 */
function useBlockHeights(resetKey: string) {
  const [heights, setHeights] = useState<Record<string, number>>({});
  const [stripHeight, setStripHeight] = useState<number | null>(null);
  const known = useRef<Record<string, number>>({});
  const frame = useRef<number | null>(null);

  // Les hauteurs sont indexées par bloc, pas par période : sans cette remise à zéro, changer de
  // période paginerait le nouveau contenu sur les mesures de l'ancien.
  useEffect(() => {
    known.current = {};
    setHeights({});
  }, [resetKey]);

  const publish = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      setHeights({ ...known.current });
    });
  }, []);

  const measureBlock = useCallback((id: string) => (el: HTMLElement | null) => {
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    if (known.current[id] === h) return;
    known.current[id] = h;
    publish();
  }, [publish]);

  const measureStrip = useCallback((el: HTMLElement | null) => {
    if (!el) return;
    const h = Math.ceil(el.getBoundingClientRect().height);
    setStripHeight(prev => (prev === h ? prev : h));
  }, []);

  useEffect(() => () => { if (frame.current !== null) cancelAnimationFrame(frame.current); }, []);

  return useMemo(() => ({ heights, stripHeight, measureBlock, measureStrip }),
    [heights, stripHeight, measureBlock, measureStrip]);
}

// ── Rendu des blocs ─────────────────────────────────────────────────────────

function renderTeamBlock(
  b: Block,
  rpeData: RpeSectionData,
  report: ReturnType<typeof useReportData>,
  thresholds: LoadThresholds,
) {
  switch (b.section) {
    case 'rpe':        return <ReportRpeSection        index={b.index} data={rpeData} thresholds={thresholds} />;
    case 'wellness':   return <ReportWellnessSection   index={b.index} data={report.wellness} />;
    case 'medical':    return <ReportMedicalSection    index={b.index} data={report.medical} />;
    case 'stats':      return <ReportStatsSection      index={b.index} data={report.stats} />;
    case 'objectives': return <ReportObjectivesSection index={b.index} subject="Équipe" data={{ objectives: report.objectives }} />;
  }
}

function renderPlayerBlock(
  b: Block, subject: string, bundle: PlayerReportBundle | undefined, thresholds: LoadThresholds,
) {
  if (!bundle) {
    return (
      <p style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
        Données indisponibles pour ce joueur.
      </p>
    );
  }
  switch (b.section) {
    case 'rpe':        return <ReportPlayerRpeSection      index={b.index} subject={subject} data={bundle.rpe} thresholds={thresholds} />;
    case 'wellness':   return <ReportPlayerWellnessSection index={b.index} subject={subject} data={bundle.wellness} />;
    case 'medical':    return <ReportPlayerMedicalSection  index={b.index} subject={subject} data={bundle.medical} />;
    case 'stats':      return <ReportPlayerStatsSection    index={b.index} subject={subject} data={bundle.stats} />;
    case 'objectives': return <ReportObjectivesSection     index={b.index} subject={subject} individual data={{ objectives: bundle.objectives }} />;
  }
}

// ── Contrôles ───────────────────────────────────────────────────────────────

/**
 * Une section et son périmètre : trois boutons.
 *
 * « Bilan équipe » et « Bilan joueurs » sont les deux demandes courantes, atteignables d'un clic —
 * la seconde prend tout l'effectif. Le troisième bouton ouvre la liste nominative, pour le cas
 * moins fréquent d'un choix partiel. Laisser cette liste dépliée en permanence sur cinq sections
 * noierait le choix structurant sous des dizaines de noms.
 */
function SectionRow({
  label, scope, roster, open,
  onToggleOpen, onToggleTeam, onSetPlayers, onTogglePlayer, onApplyToAll,
}: {
  label: string;
  scope: Scope;
  roster: Player[];
  open: boolean;
  onToggleOpen: () => void;
  onToggleTeam: () => void;
  onSetPlayers: (ids: string[]) => void;
  onTogglePlayer: (id: string) => void;
  onApplyToAll: () => void;
}) {
  const n = scope.players.length;
  const active = scope.team || n > 0;
  const allPlayers  = roster.length > 0 && n === roster.length;
  const somePlayers = n > 0 && !allPlayers;

  return (
    <div style={{
      border: `1px solid ${active ? '#00E5A030' : '#2A2F3A'}`, borderRadius: 8,
      padding: '10px 11px', backgroundColor: active ? 'rgba(0,229,160,0.03)' : 'transparent',
      minWidth: 0,
    }}>
      <p style={{
        margin: '0 0 8px', color: active ? '#F1F5F9' : '#94A3B8',
        fontWeight: 700, fontSize: '0.82rem', lineHeight: 1.3,
      }}>
        {label}
      </p>

      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
        <Chip label="Bilan équipe" active={scope.team} accent onClick={onToggleTeam} />
        <Chip
          label="Bilan joueurs"
          active={allPlayers}
          title={allPlayers ? "Retirer tous les joueurs de cette section" : "Détailler tout l'effectif dans cette section"}
          onClick={() => onSetPlayers(allPlayers ? [] : roster.map(p => p.id))}
        />
        <button type="button" onClick={onToggleOpen}
          title="Choisir les joueurs un par un"
          style={{
            display: 'flex', alignItems: 'center', gap: 5,
            padding: '4px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
            backgroundColor: somePlayers ? 'rgba(125,211,252,0.1)' : '#1E2229',
            border: `1px solid ${somePlayers ? '#7DD3FC' : '#2A2F3A'}`,
            color: somePlayers ? '#7DD3FC' : '#94A3B8',
          }}>
          {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {somePlayers ? `${n} joueur${n > 1 ? 's' : ''}` : 'Choisir'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: 9, paddingTop: 9, borderTop: '1px solid #2A2F3A', minWidth: 0 }}>
          {roster.length === 0 ? (
            <span style={{ color: '#475569', fontSize: '0.75rem' }}>Aucun joueur dans l'effectif de la saison.</span>
          ) : (
            <>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', minWidth: 0 }}>
                {roster.map(p => (
                  <Chip key={p.id} label={playerNameShort(p)}
                    active={scope.players.includes(p.id)}
                    onClick={() => onTogglePlayer(p.id)} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 6, marginTop: 9, flexWrap: 'wrap', minWidth: 0 }}>
                <MiniBtn onClick={() => onSetPlayers([])} disabled={n === 0}>Aucun</MiniBtn>
                <MiniBtn onClick={onApplyToAll} title="Reprendre ce périmètre sur les 5 sections">
                  Appliquer partout
                </MiniBtn>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function Chip({ label, active, accent, title, onClick }: {
  label: string; active: boolean; accent?: boolean; title?: string; onClick: () => void;
}) {
  const color = accent ? '#00E5A0' : '#7DD3FC';
  return (
    <button type="button" onClick={onClick} title={title}
      style={{
        padding: '4px 10px', borderRadius: 999, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
        backgroundColor: active ? `${color}1A` : '#1E2229',
        border: `1px solid ${active ? color : '#2A2F3A'}`,
        color: active ? color : '#94A3B8',
        // Pas de `nowrap` : dans une colonne étroite, un libellé long doit se replier plutôt que
        // dépasser du bord de la card.
        maxWidth: '100%',
      }}>
      {label}
    </button>
  );
}

function MiniBtn({ children, onClick, disabled, title }: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean; title?: string;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      style={{
        padding: '3px 9px', borderRadius: 6, fontSize: '0.72rem', fontWeight: 600,
        backgroundColor: 'transparent', border: '1px solid #2A2F3A',
        color: disabled ? '#334155' : '#94A3B8',
        cursor: disabled ? 'not-allowed' : 'pointer', maxWidth: '100%',
      }}>
      {children}
    </button>
  );
}

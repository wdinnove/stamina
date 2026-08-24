import { useState, useEffect, useRef } from 'react';
import { FileDown, Users, User } from 'lucide-react';
import { playersApi } from '../api/players';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useTeamRpeHistory } from '../hooks/useTeamRpeHistory';
import {
  Card, CardTitle, EmptyState, Spinner, DateRangeCard, useDateRange, PlayerSelect,
  ReportHeader, ReportRpeSection,
} from '../components';
import { exportElementToPdf, reportFilename } from '../utils/reportPdf';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

type Subject = 'team' | 'player';

/** Les sections proposées au rapport. L'ordre ici est celui du document généré. */
const SECTIONS = [
  { key: 'rpe',       label: 'RPE / Charge physique' },
  { key: 'wellness',  label: 'Bien-être' },
  { key: 'medical',   label: 'Médical' },
  { key: 'stats',     label: 'Statistiques basket' },
  { key: 'objectives', label: 'Objectifs' },
] as const;

type SectionKey = typeof SECTIONS[number]['key'];

/** Sections déjà implémentées — les autres sont proposées mais désactivées, cf. lots suivants. */
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
    teamSessionRows, teamWeekRows, teamKpis, teamPeriodAvgWeeklyLoad, loadingTeamHistory,
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
      const name = player ? playerNameFull(player) : selected.team.name;
      await exportElementToPdf(documentRef.current, reportFilename(name, generatedOn));
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

  // Exporter pendant le chargement figerait un spinner dans le PDF.
  const notReady = chosen.length === 0 || loadingTeamHistory;

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

      {/* ── Ce que contient le rapport ─────────────────────────────────────── */}
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
                title={disabled ? 'Bientôt disponible' : undefined}
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

      {/* ── Le document tel qu'il sera exporté ─────────────────────────────── */}
      {chosen.length === 0 ? (
        <EmptyState message="Cochez au moins une section à inclure dans le rapport." size="lg" />
      ) : (
        <div ref={documentRef} style={{ backgroundColor: '#0D0F14', padding: 20, borderRadius: 10, border: '1px solid #2A2F3A' }}>
          <ReportHeader
            teamName={selected.team.name}
            seasonLabel={selected.season.label}
            player={player}
            from={dateRange.from}
            to={dateRange.to}
            generatedOn={generatedOn}
          />

          {chosen.includes('rpe') && (loadingTeamHistory ? <Spinner centered /> : (
            <ReportRpeSection
              avgWeeklyLoad={teamPeriodAvgWeeklyLoad.value ?? 0}
              rpeAvgPeriod={teamKpis && teamKpis.sessions > 0 ? teamKpis.avg : { value: null, players: 0 }}
              sessions={teamKpis?.sessions ?? 0}
              weekLoads={teamWeekRows.map(w => w.load)}
              sessionRows={teamSessionRows}
              thresholds={thresholds}
            />
          ))}
        </div>
      )}
    </div>
  );
}

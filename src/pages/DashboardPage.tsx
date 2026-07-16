import { useState, useEffect, useMemo, useRef, type ReactNode, type PointerEvent } from 'react';
import { useNavigate } from 'react-router';
import { Dumbbell, Trophy, Stethoscope, Activity, Heart, CheckSquare, ArrowRight } from 'lucide-react';
import { Badge, StatusBadge, PlayerAvatar } from '../components';
import { playersApi, medicalApi, actionsApi, matchesApi, rpeApi } from '../api';
import { profileApi } from '../api/profile';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { usePerformanceData } from '../hooks/usePerformanceData';
import type { PlayerCrossData } from '../data/crossAnalysis';
import { wellnessAvg, aggregateTeamWellnessDaily, wellnessTier, worstWellnessAxis, type WellnessAxisAlert } from '../utils/wellness';
import { playerNameShort, playerNameFull } from '../utils/playerName';
import type { Player, Action, MedicalRecord, Match } from '../data/types';
import { rpeColor, rpeLabel, computeAcwr, acwrZone, avgRpe } from '../utils/rpe';
import { averageWeeklyLoad } from '../utils/weeklyLoad';
import { fmtDateShort } from '../utils/dateFormat';
import { fmt1 } from '../utils/format';
import { evalColor } from '../data';

type DateRange = '21j' | 'season';

function localDate(offsetDays = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toLocaleDateString('sv');
}
function fmtWeekday(dateStr: string): string {
  return new Date(dateStr + 'T00:00:00').toLocaleDateString('fr-FR', { weekday: 'short' });
}

interface TrainingSession { id: string; date: string; planned_duration: number; session_type?: string }
interface SessionSummary  { id: string; date: string; duration: number; load: number | null; avgRpe: number | null; nbPlayers: number; type: string }

const SESSION_TYPE_LABELS: Record<string, string> = {
  training: 'Entraînement', match: 'Match', gym: 'Gym', rest: 'Repos',
};
const SESSION_TYPE_COLORS: Record<string, string> = {
  training: '#00E5A0', match: '#EF4444', gym: '#F59E0B', rest: '#3B82F6',
};
// ── Page principale ───────────────────────────────────────────────────────────
export default function DashboardPage() {
  const navigate = useNavigate();
  const { selected, loading: teamLoading, thresholds } = useTeamSeason();
  const { data: perfData, loading: perfLoading } = usePerformanceData();

  const today = useMemo(() => localDate(0), []);
  const todayLabel = useMemo(() => new Date().toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  }), []);

  // Plage de dates affichée sur les cartes/tableau sensibles (Charge physique, Bien-être,
  // colonnes RPE/Assiduité/Éval du tableau) — Matchs/Entraînements/Actions/Infirmerie et le
  // risque blessure (ACWR) ne sont eux jamais impactés par ce sélecteur.
  const [range, setRange] = useState<DateRange>('21j');

  // ACWR à la date du jour, par joueur — dérivé de l'historique RPE toutes saisons confondues
  // (allTimeRpe) pour un calcul correct même en tout début de saison. Indépendant de `range`.
  const acwrByPlayer = useMemo(() => {
    const map = new Map<string, number | null>();
    if (!perfData) return map;
    for (const pd of perfData.players) map.set(pd.player.id, computeAcwr(pd.allTimeRpe, today));
    return map;
  }, [perfData, today]);

  // Bien-être par joueur sur la période sélectionnée (21j glissants ou saison entière) :
  // score moyen de TOUTES les entrées de la période (pas juste la dernière saisie — sinon
  // le sélecteur 21j/saison n'a souvent aucun effet visible, la dernière entrée tombant déjà
  // dans les deux fenêtres), et le pire écart d'axe (< 5, "ressenti") observé sur la période.
  const wellnessStatsByPlayer = useMemo(() => {
    const map = new Map<string, { avgScore: number | null; worstDim: WellnessAxisAlert | null }>();
    if (!perfData) return map;
    const cutoff = range === '21j' ? localDate(-21) : null;
    for (const pd of perfData.players) {
      const pool = cutoff ? pd.wellness.filter(w => w.date >= cutoff) : pd.wellness;
      map.set(pd.player.id, {
        avgScore: wellnessAvg(pool.map(w => w.score)),
        worstDim: worstWellnessAxis(pool),
      });
    }
    return map;
  }, [perfData, range]);

  // Bien-être équipe — mêmes fonctions que la page Bien-être / Historique équipe
  // (agrégat quotidien puis moyenne des jours) pour rester cohérent avec cette page.
  const teamWellnessNow = useMemo(() => {
    if (!perfData) return null;
    const cutoff = range === '21j' ? localDate(-21) : null;
    const allEntries = perfData.players.flatMap(pd => cutoff ? pd.wellness.filter(w => w.date >= cutoff) : pd.wellness);
    const daily = aggregateTeamWellnessDaily(allEntries);
    return wellnessAvg(daily.map(e => e.score));
  }, [perfData, range]);

  const [userName,        setUserName]        = useState('');
  const [players,         setPlayers]         = useState<Player[]>([]);
  const [injuries,        setInjuries]        = useState<MedicalRecord[]>([]);
  const [actions,         setActions]         = useState<Action[]>([]);
  const [last3Matches,    setLast3Matches]    = useState<Match[]>([]);
  const [last3Sessions,   setLast3Sessions]   = useState<SessionSummary[]>([]);
  const [kpiStats,          setKpiStats]          = useState<{
    wins: number; losses: number;
    avgLoad21d: number | null; avgRpe21d: number | null;
    avgLoadSeason: number | null; avgRpeSeason: number | null;
  } | null>(null);
  const [loading,         setLoading]         = useState(false);

  useEffect(() => {
    profileApi.getCurrent().then(profile => { if (profile) setUserName(profile.firstName); });
  }, []);

  useEffect(() => {
    if (!selected || teamLoading) return;
    setLoading(true);
    setPlayers([]);
    setInjuries([]);
    setActions([]);
    setLast3Matches([]);
    setLast3Sessions([]);
    setKpiStats(null);

    const from30 = localDate(-30);
    const from21 = localDate(-21); // fenêtre 21 jours glissants

    Promise.all([
      playersApi.listBySeason(selected.season.id),
      medicalApi.getActiveInjuries(),
      actionsApi.list({ teamId: selected.team.id }),
      rpeApi.listTeamSessionsInRange(selected.team.id, selected.season.id, from30, today),
      matchesApi.listBySeason(selected.team.id, selected.season.id),
    ])
      .then(async ([seasonPlayers, rawInjuries, allActions, sessResult, matchesList]) => {
        // Matchs
        setLast3Matches(matchesList.slice(0, 3));

        setPlayers(seasonPlayers);

        const seasonPlayerIds = new Set(seasonPlayers.map(p => p.id));
        const activeInjuries = rawInjuries.filter(inj => seasonPlayerIds.has(inj.playerId));
        setInjuries(activeInjuries);

        setActions(
          allActions
            .filter(a => a.status !== 'done' && (!a.playerId || seasonPlayerIds.has(a.playerId)))
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
        );

        // Séances — 3 dernières (carte Entraînements, jamais impactée par le sélecteur de plage)
        const sessions: TrainingSession[] = sessResult.map(s => ({
          id: s.id, date: s.date, planned_duration: s.plannedDuration, session_type: s.sessionType,
        }));
        const sessionDurMap = new Map(sessions.map(s => [s.id, s.planned_duration]));
        const sessionIds30d = sessions.map(s => s.id);
        const recentSessions = [...sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3);

        if (sessionIds30d.length > 0) {
          const rpeRows30d = await rpeApi.listRpeDetailsBySessionIds(sessionIds30d);
          const sessionLoadMap = new Map<string, { total: number; sumRpe: number; nb: number }>();
          for (const r of rpeRows30d) {
            if (!sessionLoadMap.has(r.sessionId)) sessionLoadMap.set(r.sessionId, { total: 0, sumRpe: 0, nb: 0 });
            const entry = sessionLoadMap.get(r.sessionId)!;
            const dur = r.actualDuration ?? sessionDurMap.get(r.sessionId) ?? 0;
            entry.total  += r.rpe * dur;
            entry.sumRpe += r.rpe;
            entry.nb     += 1;
          }
          setLast3Sessions(recentSessions.map(s => {
            const e = sessionLoadMap.get(s.id);
            return {
              id: s.id, date: s.date, duration: s.planned_duration, type: s.session_type ?? 'training',
              load:    e ? Math.round(e.total) : null,
              avgRpe:  e ? Math.round(e.sumRpe / e.nb * 10) / 10 : null,
              nbPlayers: e?.nb ?? 0,
            };
          }));
        } else {
          setLast3Sessions(recentSessions.map(s => ({ id: s.id, date: s.date, duration: s.planned_duration, type: s.session_type ?? 'training', load: null, avgRpe: null, nbPlayers: 0 })));
        }

        // ── Charge/RPE équipe — calculées à la fois sur 21j glissants et sur toute la
        // saison ; le sélecteur en haut de page choisit laquelle des deux afficher. ─────
        const kpiWins   = matchesList.filter(m => m.result === 'win').length;
        const kpiLosses = matchesList.filter(m => m.result === 'loss').length;

        const allSessRows = await rpeApi.listTeamSessionsInRange(selected.team.id, selected.season.id, undefined, today);
        const allSessIds  = allSessRows.map(s => s.id);
        const seasonRpeRows2 = await rpeApi.listRpeDetailsBySessionIds(allSessIds);

        const durMap2  = new Map(allSessRows.map(s => [s.id, s.plannedDuration]));
        const dateMap2 = new Map(allSessRows.map(s => [s.id, s.date]));
        type RpeRowSeason = { rpe: number; actual_duration: number | null; player_id: string; session_id: string };
        const seasonRpeRows: RpeRowSeason[] = seasonRpeRows2.map(r => ({
          rpe: r.rpe, actual_duration: r.actualDuration ?? null, player_id: r.playerId, session_id: r.sessionId,
        }));

        // 21 jours glissants — même fonction averageWeeklyLoad (bucket semaine réel, ÷ joueurs
        // distincts, moyenne sur les semaines actives) que la vue "Saison" et que RPEPage/
        // useTeamRpeHistory/PlayerLoadPanel, pour rester cohérent partout dans l'app.
        const rows21d = seasonRpeRows.filter(r => (dateMap2.get(r.session_id) ?? '') >= from21);
        const avgLoad21d = averageWeeklyLoad(rows21d.map(r => ({
          date: dateMap2.get(r.session_id) ?? '',
          playerId: r.player_id,
          rpe: r.rpe,
          actualDuration: r.actual_duration ?? undefined,
          plannedDuration: durMap2.get(r.session_id) ?? 0,
        })).filter(r => r.date));
        const avgRpe21d = avgRpe(rows21d.map(r => r.rpe));

        // Saison entière : même fonction, sur tout l'historique de la saison.
        const avgLoadSeason = averageWeeklyLoad(seasonRpeRows.map(r => ({
          date: dateMap2.get(r.session_id) ?? '',
          playerId: r.player_id,
          rpe: r.rpe,
          actualDuration: r.actual_duration ?? undefined,
          plannedDuration: durMap2.get(r.session_id) ?? 0,
        })).filter(r => r.date));
        const avgRpeSeason = avgRpe(seasonRpeRows.map(r => r.rpe));

        setKpiStats({
          wins: kpiWins, losses: kpiLosses,
          avgLoad21d, avgRpe21d, avgLoadSeason, avgRpeSeason,
        });

        setLoading(false);
      })
      .catch(err => { console.error('[Dashboard]', err); setLoading(false); });
  }, [selected, teamLoading]);

  // Actions : 3 items max, retard en premier
  const topActions = [
    ...actions.filter(a => a.dueDate < today),
    ...actions.filter(a => a.dueDate >= today),
  ].slice(0, 3);

  // Infirmerie — comptes pour la carte "hero"
  const injuredCount     = players.filter(p => p.status === 'injured').length;
  const limitedCount     = players.filter(p => p.status === 'limited').length;
  const inTreatmentCount = injuries.filter(inj => !!inj.treatment?.trim()).length;
  const availablePct = players.length > 0 ? Math.round((players.length - injuredCount) / players.length * 100) : null;
  const availableColor = availablePct === null ? '#475569'
    : availablePct >= 90 ? '#00E5A0'
    : availablePct >= 75 ? '#F59E0B' : '#EF4444';

  // Bien-être équipe — carte "hero" (sensible à `range`) : nombre de joueurs dont le score
  // global MOYEN sur la période est sous 5.
  const wellnessAlertCount = [...wellnessStatsByPlayer.values()].filter(s => s.avgScore !== null && s.avgScore < 5).length;
  const teamWellnessTier = teamWellnessNow === null ? null : wellnessTier(teamWellnessNow);
  const teamWellnessColor = teamWellnessTier?.color ?? '#475569';
  const teamWellnessLabel = teamWellnessTier?.label ?? '—';

  // Charge physique équipe — carte "hero" (sensible à `range`, mêmes seuils dans les 2 cas)
  const teamLoadNow = range === '21j' ? (kpiStats?.avgLoad21d ?? null) : (kpiStats?.avgLoadSeason ?? null);
  const teamRpeNow  = range === '21j' ? (kpiStats?.avgRpe21d ?? null) : (kpiStats?.avgRpeSeason ?? null);
  const teamLoadColor = teamLoadNow === null ? '#475569'
    : teamLoadNow > thresholds.normalMax ? '#EF4444'
    : teamLoadNow > thresholds.normalMax * 2 / 3 ? '#F97316'
    : teamLoadNow > thresholds.normalMax / 3 ? '#EAB308' : '#00E5A0';
  const teamLoadLabel = teamLoadNow === null ? '—'
    : teamLoadNow > thresholds.normalMax ? 'Surcharge'
    : teamLoadNow > thresholds.normalMax * 2 / 3 ? 'Élevée'
    : teamLoadNow > thresholds.normalMax / 3 ? 'Soutenu' : 'Normal';
  const highRiskAcwrCount = players.filter(p => acwrZone(acwrByPlayer.get(p.id) ?? null)?.label === 'Risque élevé').length;

  if (teamLoading) return <div style={{ padding: 24, color: '#94A3B8', fontSize: '0.85rem' }}>Chargement…</div>;
  if (!selected) return (
    <div style={{ padding: 24 }}>
      <p style={{ color: '#94A3B8', fontSize: '0.85rem' }}>Sélectionnez une équipe et une saison dans la barre du haut pour afficher le dashboard.</p>
    </div>
  );

  // Un seul loader tant que TOUTES les sources ne sont pas prêtes (chargement principal +
  // hook croisement perf) — évite l'incohérence visuelle de cards qui apparaissent l'une après l'autre.
  if (loading || perfLoading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: '120px 0' }}>
        <div style={{ width: 28, height: 28, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div>
          <h1 style={{ color: '#F1F5F9', margin: '0 0 2px' }}>{userName ? `Bonjour ${userName}` : 'Bonjour'}</h1>
          <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>{todayLabel} · {selected.team.name}</p>
        </div>
        <RangeToggle value={range} onChange={setRange} />
      </div>

      {/* 6 cartes "hero" — Matchs / Entraînements / Actions / Infirmerie / Charge physique / Bien-être */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3" style={{ gap: 12, marginBottom: 16 }}>
        <MatchCarouselCard matches={last3Matches} wins={kpiStats?.wins ?? 0} losses={kpiStats?.losses ?? 0} onOpen={() => navigate('/matches')} />
        <SessionCarouselCard sessions={last3Sessions.filter(s => s.type !== 'match')} onOpen={() => navigate('/sessions')} />
        <ActionCarouselCard actions={topActions} totalCount={actions.length} players={players} today={today} onOpen={() => navigate('/actions')} />
        <HeroCard
          icon={<Stethoscope size={20} color="#EF4444" />}
          iconBg="#EF444422"
          title="Infirmerie"
          ctaLabel="Voir l'infirmerie"
          headerRight={availablePct !== null && <Badge color={availableColor} label={`${availablePct}% dispo`} size="sm" style={{ flexShrink: 0 }} />}
          borderColor={availableColor}
          stats={[
            { value: injuredCount, label: `Blessé${injuredCount > 1 ? 's' : ''}`, color: '#EF4444' },
            { value: limitedCount, label: `Limité${limitedCount > 1 ? 's' : ''}`, color: '#F59E0B' },
            { value: inTreatmentCount, label: 'En traitement', color: '#3B82F6' },
          ]}
          onOpen={() => navigate('/medical/infirmary')}
        />
        <HeroCard
          icon={<Activity size={20} color="#8B5CF6" />}
          iconBg="#8B5CF622"
          title="Charge physique"
          ctaLabel="Voir le RPE"
          headerRight={<Badge color={teamLoadColor} label={teamLoadLabel} size="sm" style={{ flexShrink: 0 }} />}
          borderColor={teamLoadColor}
          stats={[
            { value: teamLoadNow ?? 0, label: 'UA / semaine', color: teamLoadColor },
            { value: teamRpeNow ?? 0, label: 'RPE moyen /10', color: teamRpeNow === null ? '#475569' : rpeColor(teamRpeNow), decimals: 1 },
            { value: highRiskAcwrCount, label: 'Risque blessures', color: '#EF4444' },
          ]}
          onOpen={() => navigate('/rpe')}
        />
        <HeroCard
          icon={<Heart size={20} color="#EC4899" />}
          iconBg="#EC489922"
          title="Bien-être"
          ctaLabel="Voir le bien-être"
          headerRight={<Badge color={teamWellnessColor} label={teamWellnessLabel} size="sm" style={{ flexShrink: 0 }} />}
          borderColor={teamWellnessColor}
          stats={[
            { value: teamWellnessNow ?? 0, label: 'Score moyen /10', color: teamWellnessColor, decimals: 1 },
            { value: wellnessAlertCount, label: `Joueur${wellnessAlertCount > 1 ? 's' : ''} en alerte`, color: '#EF4444' },
          ]}
          onOpen={() => navigate('/wellness/team')}
        />
      </div>

      {/* Tableau par joueur — vue d'ensemble à 6 notions */}
      {perfData && (
        <PlayerOverviewTable
          players={perfData.players}
          acwrByPlayer={acwrByPlayer}
          wellnessStatsByPlayer={wellnessStatsByPlayer}
          range={range}
          onOpenPlayer={id => navigate(`/performance-individuelle/${id}/vue-ensemble`)}
        />
      )}

    </div>
  );
}

/**
 * Coque partagée des cartes "hero" : icône ronde + titre, liseré latéral neutre (blanc),
 * contenu libre au milieu, flèche + libellé en bas à droite vers la page liée.
 * La couleur reste sur l'icône/les badges, pas sur le cadre de la carte.
 * Pensée pour occuper 1/3 d'une grille à 3 colonnes.
 */
function HeroCardShell({ icon, iconBg, title, ctaLabel, onOpen, children, footerLeft, headerRight, borderColor = '#475569' }: {
  icon: ReactNode; iconBg: string; title: string;
  ctaLabel: string; onOpen: () => void; children: ReactNode;
  /** Contenu optionnel affiché à gauche de la dernière ligne (ex. points du carrousel). */
  footerLeft?: ReactNode;
  /** Contenu optionnel affiché en haut à droite (ex. badge V/D). */
  headerRight?: ReactNode;
  /** Couleur du liseré latéral, reflétant l'état des données de la carte. */
  borderColor?: string;
}) {
  return (
    <div
      style={{
        backgroundColor: '#161920', border: '1px solid #2A2F3A', borderLeft: `3px solid ${borderColor}`,
        borderRadius: 10, padding: '18px 20px', minHeight: 160,
        display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0, flex: '1 1 auto', overflow: 'hidden' }}>
          <div style={{
            width: 42, height: 42, borderRadius: '50%', backgroundColor: iconBg, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {icon}
          </div>
          <p style={{ color: '#F1F5F9', fontSize: '0.95rem', fontWeight: 700, margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{title}</p>
        </div>
        {headerRight && <div style={{ flexShrink: 0 }}>{headerRight}</div>}
      </div>

      {children}

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 5, marginTop: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, minHeight: 6 }}>{footerLeft}</div>
        <div onClick={onOpen}
          style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '4px 0 4px 12px', marginRight: -4 }}
          onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.opacity = '0.7'}
          onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.opacity = '1'}
        >
          <span style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 500 }}>{ctaLabel}</span>
          <ArrowRight size={14} color="#475569" />
        </div>
      </div>
    </div>
  );
}

/** Variante "stats" — N gros chiffres (ou libellés courts) côte à côte (ex. Infirmerie). */
function HeroCard({ icon, iconBg, title, stats, ctaLabel, onOpen, headerRight, borderColor }: {
  icon: ReactNode; iconBg: string; title: string;
  stats: { value: number | string; label: string; color: string; decimals?: number }[];
  ctaLabel: string; onOpen: () => void;
  headerRight?: ReactNode;
  borderColor?: string;
}) {
  return (
    <HeroCardShell icon={icon} iconBg={iconBg} title={title} ctaLabel={ctaLabel} onOpen={onOpen} headerRight={headerRight} borderColor={borderColor}>
      <div style={{ display: 'flex', gap: 24 }}>
        {stats.map(s => {
          const isNumber = typeof s.value === 'number';
          const displayValue = isNumber && s.decimals !== undefined ? (s.value as number).toFixed(s.decimals) : s.value;
          return (
            <div key={s.label}>
              <div style={{
                color: isNumber && s.value === 0 ? '#475569' : s.color,
                fontSize: isNumber ? '1.7rem' : '1.1rem', fontWeight: 800, lineHeight: 1, whiteSpace: 'nowrap',
                fontFamily: isNumber ? 'JetBrains Mono, monospace' : undefined,
              }}>
                {displayValue}
              </div>
              <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: 5, whiteSpace: 'nowrap' }}>{s.label}</div>
            </div>
          );
        })}
      </div>
    </HeroCardShell>
  );
}

const RANGE_OPTIONS: { key: DateRange; label: string }[] = [
  { key: '21j',    label: '21 jours' },
  { key: 'season', label: 'Saison' },
];

/** Sélecteur de plage de dates — Charge physique, Bien-être et une partie du tableau en dépendent. */
function RangeToggle({ value, onChange }: { value: DateRange; onChange: (v: DateRange) => void }) {
  return (
    <div style={{ display: 'flex', gap: 4, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2, flexShrink: 0 }}>
      {RANGE_OPTIONS.map(({ key, label }) => {
        const active = value === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            style={{
              padding: '6px 14px', borderRadius: 4, border: 'none', cursor: 'pointer',
              fontSize: '0.8rem', fontWeight: active ? 600 : 400, transition: 'all 0.15s',
              backgroundColor: active ? '#1E2229' : 'transparent',
              color: active ? '#00E5A0' : '#94A3B8',
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Navigation au doigt/souris (pointer events) pour les cartes carrousel — swipe gauche/droite. */
function useSwipeCarousel(count: number, index: number, setIndex: (i: number) => void) {
  const startX = useRef<number | null>(null);
  return {
    onPointerDown: (e: PointerEvent) => { startX.current = e.clientX; },
    onPointerUp: (e: PointerEvent) => {
      if (startX.current === null || count <= 1) return;
      const delta = e.clientX - startX.current;
      startX.current = null;
      if (Math.abs(delta) < 30) return;
      setIndex(delta < 0 ? (index + 1) % count : (index - 1 + count) % count);
    },
    style: { touchAction: 'pan-y' as const, userSelect: 'none' as const },
  };
}

/** Points de navigation partagés par les cartes carrousel (Matchs, Entraînements, Actions). */
function CarouselDots({ count, index, onSelect }: { count: number; index: number; onSelect: (i: number) => void }) {
  if (count <= 1) return null;
  return (
    <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
      {Array.from({ length: count }, (_, i) => (
        <button key={i} onClick={() => onSelect(i)} aria-label={`Élément ${i + 1}`}
          style={{
            width: 6, height: 6, borderRadius: '50%', border: 'none', padding: 0, cursor: 'pointer',
            backgroundColor: i === index ? '#CBD5E1' : '#2A2F3A',
          }} />
      ))}
    </div>
  );
}

/**
 * Piste défilante partagée par les cartes carrousel — anime le passage d'un élément à
 * l'autre (slide) au lieu d'un remplacement instantané, et gère nativement le swipe.
 */
function SlideCarousel<T>({ items, index, setIndex, renderItem }: {
  items: T[]; index: number; setIndex: (i: number) => void; renderItem: (item: T) => ReactNode;
}) {
  const swipe = useSwipeCarousel(items.length, index, setIndex);
  const clamped = Math.min(index, Math.max(items.length - 1, 0));
  return (
    <div style={{ overflow: 'hidden' }} onPointerDown={swipe.onPointerDown} onPointerUp={swipe.onPointerUp}>
      <div style={{ display: 'flex', transform: `translateX(-${clamped * 100}%)`, transition: 'transform 0.3s ease', ...swipe.style }}>
        {items.map((item, i) => (
          <div key={i} style={{ flex: '0 0 100%', minWidth: 0 }}>
            {renderItem(item)}
          </div>
        ))}
      </div>
    </div>
  );
}

function MatchCarouselCard({ matches, wins, losses, onOpen }: {
  matches: Match[]; wins: number; losses: number; onOpen: () => void;
}) {
  const [index, setIndex] = useState(0);
  const recordColor = wins > losses ? '#00E5A0' : losses > wins ? '#EF4444' : '#94A3B8';

  return (
    <HeroCardShell icon={<Trophy size={20} color="#F59E0B" />} iconBg="#F59E0B22" title="Matchs"
      ctaLabel="Voir les matchs" onOpen={onOpen}
      footerLeft={<CarouselDots count={matches.length} index={index} onSelect={setIndex} />}
      headerRight={<Badge color={recordColor} label={`${wins}-${losses}`} size="sm" style={{ flexShrink: 0 }} />}
      borderColor={recordColor}>
      {matches.length > 0 ? (
        <SlideCarousel items={matches} index={index} setIndex={setIndex} renderItem={mm => {
          const w = mm.result === 'win';
          const c = w ? '#00E5A0' : '#EF4444';
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ color: c, fontSize: '1.9rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                  {mm.scoreUs}–{mm.scoreThem}
                </span>
                <span style={{ color: c, fontSize: '0.72rem', fontWeight: 700 }}>{w ? 'Victoire' : 'Défaite'}</span>
              </div>
              <p style={{ color: '#475569', fontSize: '0.68rem', margin: '5px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                vs {mm.opponent} · {mm.homeAway === 'home' ? 'Domicile' : 'Extérieur'}
              </p>
            </div>
          );
        }} />
      ) : (
        <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucun match enregistré.</p>
      )}
    </HeroCardShell>
  );
}

function SessionCarouselCard({ sessions, onOpen }: { sessions: SessionSummary[]; onOpen: () => void }) {
  const [index, setIndex] = useState(0);
  const latestRpe = sessions[0]?.avgRpe ?? null;

  return (
    <HeroCardShell icon={<Dumbbell size={20} color="#00E5A0" />} iconBg="#00E5A022" title="Entraînements"
      ctaLabel="Voir les séances" onOpen={onOpen}
      footerLeft={<CarouselDots count={sessions.length} index={index} onSelect={setIndex} />}
      borderColor={latestRpe !== null ? rpeColor(latestRpe) : '#475569'}>
      {sessions.length > 0 ? (
        <SlideCarousel items={sessions} index={index} setIndex={setIndex} renderItem={ss => {
          const col = ss.avgRpe != null ? rpeColor(ss.avgRpe) : '#475569';
          const lbl = ss.avgRpe != null ? rpeLabel(Math.round(ss.avgRpe)) : '';
          return (
            <div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ color: col, fontSize: '1.9rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                  {ss.avgRpe != null ? ss.avgRpe.toFixed(1) : '—'}
                </span>
                {lbl && <span style={{ color: col, fontSize: '0.72rem', fontWeight: 700 }}>{lbl}</span>}
              </div>
              <p style={{ color: '#475569', fontSize: '0.68rem', margin: '5px 0 0', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {fmtWeekday(ss.date)} {fmtDateShort(ss.date)} · {SESSION_TYPE_LABELS[ss.type] ?? ss.type} · {ss.duration} min
              </p>
            </div>
          );
        }} />
      ) : (
        <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucune séance récente.</p>
      )}
    </HeroCardShell>
  );
}

function ActionCarouselCard({ actions, totalCount, players, today, onOpen }: {
  actions: Action[]; totalCount: number; players: Player[]; today: string; onOpen: () => void;
}) {
  const [index, setIndex] = useState(0);
  const hasOverdue = actions.some(a => a.dueDate < today);
  const actionsBorderColor = actions.length === 0 ? '#475569' : hasOverdue ? '#EF4444' : '#00E5A0';

  return (
    <HeroCardShell icon={<CheckSquare size={20} color="#3B82F6" />} iconBg="#3B82F622" title="Actions"
      ctaLabel="Voir les tâches" onOpen={onOpen}
      footerLeft={<CarouselDots count={actions.length} index={index} onSelect={setIndex} />}
      headerRight={<Badge color={totalCount > 0 ? '#3B82F6' : '#475569'} label={`${totalCount} à faire`} size="sm" style={{ flexShrink: 0 }} />}
      borderColor={actionsBorderColor}>
      {actions.length > 0 ? (
        <SlideCarousel items={actions} index={index} setIndex={setIndex} renderItem={aa => {
          const isOverdue = aa.dueDate < today;
          const color = isOverdue ? '#EF4444' : '#00E5A0';
          const player = players.find(p => p.id === aa.playerId);
          return (
            <div>
              <p style={{ color: '#CBD5E1', fontSize: '0.82rem', fontWeight: 600, margin: '0 0 6px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {aa.title}{player ? ` · ${playerNameShort(player)}` : ''}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <span style={{ color, fontSize: '1.3rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
                  {aa.dueDate.slice(5).replace('-', '/')}
                </span>
                <span style={{ color, fontSize: '0.72rem', fontWeight: 700 }}>
                  {isOverdue ? 'En retard' : 'À faire'}
                </span>
              </div>
            </div>
          );
        }} />
      ) : (
        <p style={{ color: '#334155', fontSize: '0.8rem', margin: 0 }}>Aucune tâche en cours.</p>
      )}
    </HeroCardShell>
  );
}

const thBase = {
  padding: '10px 14px', textAlign: 'center' as const, color: '#475569', fontSize: '0.67rem',
  textTransform: 'uppercase' as const, letterSpacing: '0.05em', fontWeight: 600,
  borderBottom: '1px solid #2A2F3A', backgroundColor: '#161920',
};
const thSortable = { ...thBase, cursor: 'pointer' as const, userSelect: 'none' as const };
const tdBase = { padding: '10px 14px', textAlign: 'center' as const, fontSize: '0.8rem', verticalAlign: 'middle' as const };

const STATUS_SORT_RANK: Record<Player['status'], number> = {
  injured: 0, limited: 1, suspended: 2, unavailable: 3, active: 4,
};

/**
 * Libellés alternatifs pour la colonne "Charge entraînement" du tableau — plus neutres que
 * les libellés de `acwrZone` (pensés "risque blessure"), qui restent inchangés partout
 * ailleurs dans l'app (RPE, fiche joueur, infirmerie…).
 */
const ACWR_LABEL_BIS: Record<string, string> = {
  'Sous-charge':   'Très faible',
  'Zone optimale': 'Faible',
  'Risque modéré': 'Moyen',
  'Risque élevé':  'Élevé',
};

/**
 * Tableau par joueur (identité + 6 notions) — statut, risque blessure (ACWR, jamais impacté
 * par `range`), RPE, bien-être (score moyen sur la période), alerte bien-être (pire axe <5
 * observé sur la période) et éval moyen (RPE, bien-être et éval sensibles à `range` : 21j
 * glissants ou saison entière). Colonne joueur fixe au scroll horizontal, comme les autres
 * tableaux de l'app.
 */
type OverviewSortKey = 'name' | 'status' | 'risk' | 'rpe' | 'wellness' | 'attention' | 'eval';
type SortDir = 'asc' | 'desc';

function PlayerOverviewTable({ players, acwrByPlayer, wellnessStatsByPlayer, range, onOpenPlayer }: {
  players: PlayerCrossData[];
  acwrByPlayer: Map<string, number | null>;
  wellnessStatsByPlayer: Map<string, { avgScore: number | null; worstDim: WellnessAxisAlert | null }>;
  range: DateRange;
  onOpenPlayer: (id: string) => void;
}) {
  const cutoff = range === '21j' ? localDate(-21) : null;
  const [sortKey, setSortKey] = useState<OverviewSortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: OverviewSortKey) => {
    if (key === sortKey) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(key); setSortDir('asc'); }
  };
  const arrow = (key: OverviewSortKey) => sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

  const rows = players.map(pd => {
    const p = pd.player;
    const acwr = acwrByPlayer.get(p.id) ?? null;
    const zone = acwrZone(acwr);
    const stat = wellnessStatsByPlayer.get(p.id);
    const avgScore = stat?.avgScore ?? null;
    const wellnessColor = avgScore !== null ? wellnessTier(avgScore).color : '#475569';
    const weakDim = stat?.worstDim ?? null;

    const recentRpe = cutoff ? pd.rpe.filter(e => e.date >= cutoff) : pd.rpe;
    const avgRpe = recentRpe.length
      ? Math.round(recentRpe.reduce((s, e) => s + e.rpe, 0) / recentRpe.length * 10) / 10 : null;

    const matchPool = cutoff ? pd.matchStats.filter(m => m.date >= cutoff) : pd.matchStats;
    const evalVals = matchPool.map(m => m.eval).filter((v): v is number => v !== null);
    const evalAvg = evalVals.length
      ? Math.round(evalVals.reduce((s, v) => s + v, 0) / evalVals.length * 10) / 10 : null;

    return { p, acwr, zone, avgScore, wellnessColor, weakDim, avgRpe, evalAvg };
  });

  const dir = sortDir === 'asc' ? 1 : -1;
  const sorted = [...rows].sort((x, y) => {
    switch (sortKey) {
      case 'name':      return `${x.p.lastName} ${x.p.firstName}`.localeCompare(`${y.p.lastName} ${y.p.firstName}`) * dir;
      case 'status':    return (STATUS_SORT_RANK[x.p.status] - STATUS_SORT_RANK[y.p.status]) * dir;
      case 'risk':      return ((x.acwr ?? -Infinity) - (y.acwr ?? -Infinity)) * dir;
      case 'rpe':       return ((x.avgRpe ?? -Infinity) - (y.avgRpe ?? -Infinity)) * dir;
      case 'wellness':  return ((x.avgScore ?? -Infinity) - (y.avgScore ?? -Infinity)) * dir;
      case 'attention': return ((x.weakDim?.felt ?? Infinity) - (y.weakDim?.felt ?? Infinity)) * dir;
      case 'eval':      return ((x.evalAvg ?? -Infinity) - (y.evalAvg ?? -Infinity)) * dir;
    }
  });

  return (
    <div style={{ border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', whiteSpace: 'nowrap', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 220 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
            <col style={{ width: 130 }} />
          </colgroup>
          <thead>
            <tr>
              <th style={{ ...thSortable, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2 }} onClick={() => toggleSort('name')}>Joueur{arrow('name')}</th>
              <th style={thSortable} onClick={() => toggleSort('status')}>Statut{arrow('status')}</th>
              <th style={thSortable} onClick={() => toggleSort('risk')}>Risque blessure{arrow('risk')}</th>
              <th style={thSortable} onClick={() => toggleSort('rpe')}>RPE{arrow('rpe')}</th>
              <th style={thSortable} onClick={() => toggleSort('wellness')}>Bien-être{arrow('wellness')}</th>
              <th style={thSortable} onClick={() => toggleSort('attention')}>Alerte{arrow('attention')}</th>
              <th style={thSortable} onClick={() => toggleSort('eval')}>Éval{arrow('eval')}</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map(({ p, zone, avgScore, wellnessColor, weakDim, avgRpe, evalAvg }, i) => {
              const rowBg = i % 2 === 0 ? '#161920' : '#1A1E26';

              return (
                <tr key={p.id} onClick={() => onOpenPlayer(p.id)}
                  style={{ height: 46, borderBottom: '1px solid #1E2229', backgroundColor: rowBg, cursor: 'pointer' }}
                  className="hover:!bg-white/5"
                >
                  <td style={{ ...tdBase, textAlign: 'left', position: 'sticky', left: 0, zIndex: 1, backgroundColor: rowBg }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                      <PlayerAvatar player={p} size={22} />
                      <span className="md:hidden" style={{ color: '#F1F5F9', fontWeight: 600 }}>{playerNameShort(p)}</span>
                      <span className="hidden md:inline" style={{ color: '#F1F5F9', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis' }}>{playerNameFull(p)}</span>
                    </span>
                  </td>
                  <td style={tdBase}><StatusBadge status={p.status} size="sm" /></td>
                  <td style={tdBase}>
                    {zone ? <Badge color={zone.color} label={ACWR_LABEL_BIS[zone.label] ?? zone.label} size="sm" /> : <span style={{ color: '#334155' }}>—</span>}
                  </td>
                  <td style={{ ...tdBase, color: avgRpe === null ? '#334155' : rpeColor(avgRpe), fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmt1(avgRpe)}
                  </td>
                  <td style={{ ...tdBase, color: wellnessColor, fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                    {fmt1(avgScore)}
                  </td>
                  <td style={tdBase}>
                    {weakDim && <Badge color={weakDim.color} label={weakDim.label} size="sm" />}
                  </td>
                  <td style={{ ...tdBase, color: evalAvg === null ? '#334155' : evalColor(evalAvg), fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                    {evalAvg ?? '—'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

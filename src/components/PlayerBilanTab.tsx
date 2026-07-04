import { useMemo } from 'react';
import { ResponsiveContainer, RadarChart, PolarGrid, PolarAngleAxis, Radar } from 'recharts';
import { Activity, Heart, Stethoscope, ArrowRight } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { EmptyState } from './EmptyState';
import { DateRangeCard, useDateRange } from './DateRangeCard';
import { MedCard, daysBetween, rtpDaysLeft } from './MedicalCard';
import { ChargeFreshnessChart } from './ChargeFreshnessChart';
import type { RPEEntry, WellnessEntry, MedicalRecord } from '../data/types';

// ── Helpers ──────────────────────────────────────────────────────────────────
const wellColor = (v: number) => v >= 7 ? '#00E5A0' : v >= 5 ? '#F59E0B' : '#EF4444';
const rpeColor  = (v: number) => v >= 8 ? '#EF4444' : v >= 6 ? '#F97316' : v >= 4 ? '#F59E0B' : '#00E5A0';

const WELL_DIMS = [
  { key: 'fatigue',    label: 'Fatigue',    inverted: true  },
  { key: 'mood',       label: 'Humeur',     inverted: false },
  { key: 'stress',     label: 'Stress',     inverted: true  },
  { key: 'motivation', label: 'Motivation', inverted: false },
  { key: 'sleep',      label: 'Sommeil',    inverted: false },
  { key: 'soreness',   label: 'Douleurs',   inverted: true  },
];

const wellDimColor = (v: number, inv: boolean) => wellColor(inv ? 11 - v : v);

const fmtShort = (d: string) => {
  const dt = new Date(d);
  return `${dt.getDate()}/${dt.getMonth() + 1}`;
};

const KPI_STYLE = {
  label: { color: '#475569', fontSize: '0.57rem', textTransform: 'uppercase' as const, letterSpacing: '0.05em', marginBottom: 3 },
  val:   { fontWeight: 700 as const, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' },
};

// ── Component ─────────────────────────────────────────────────────────────────
interface Props {
  rpe:         RPEEntry[];
  wellness:    WellnessEntry[];
  medical:     MedicalRecord[];
  playerId:    string;
  playerName:  string;
  seasonStart?: string;
  onNavigate:  (path: string, state?: Record<string, unknown>) => void;
}

export function PlayerBilanTab({ rpe, wellness, medical, playerId, playerName, seasonStart, onNavigate }: Props) {
  const from = `/players/${playerId}`;

  const injuries  = useMemo(() => medical.filter(m => m.type === 'injury').sort((a, b) => a.date.localeCompare(b.date)), [medical]);
  const activeInj = useMemo(() => injuries.filter(i => i.status === 'active'), [injuries]);
  const accentInj = activeInj.length > 0 ? '#EF4444' : injuries.length > 0 ? '#F59E0B' : '#00E5A0';

  // ── Filtre de date (s'applique à tout l'onglet) ──
  const dateRange = useDateRange(seasonStart);
  const inRange = (iso: string) => (!dateRange.from || iso >= dateRange.from) && iso <= dateRange.to;

  const rpeP      = useMemo(() => rpe.filter(e => inRange(e.date)),      [rpe,      dateRange.from, dateRange.to]);
  const wellP     = useMemo(() => wellness.filter(e => inRange(e.date)), [wellness, dateRange.from, dateRange.to]);
  const medFiltered = useMemo(() => medical.filter(m => inRange(m.date)), [medical, dateRange.from, dateRange.to]);

  const sortRecords = (recs: MedicalRecord[]) => [...recs].sort((a, b) => {
    if (a.status !== b.status) return a.status === 'active' ? -1 : 1;
    return b.date.localeCompare(a.date);
  });
  const medSections = [
    { key: 'injury',    title: 'Blessures',    color: '#EF4444', records: sortRecords(medFiltered.filter(m => m.type === 'injury')),    emptyMsg: 'Aucune blessure sur cette période.'  },
    { key: 'treatment', title: 'Traitements',  color: '#00E5A0', records: sortRecords(medFiltered.filter(m => m.type === 'treatment')), emptyMsg: 'Aucun traitement sur cette période.' },
    { key: 'checkup',   title: 'Bilans santé', color: '#3B82F6', records: sortRecords(medFiltered.filter(m => m.type === 'checkup')),   emptyMsg: 'Aucun bilan sur cette période.'      },
  ];

  // ── RPE stats ──
  const rpePeriodAvg = useMemo(() =>
    rpeP.length > 0 ? Math.round(rpeP.reduce((s, e) => s + e.rpe, 0) / rpeP.length * 10) / 10 : null,
    [rpeP]);
  const rpeSaisonAvg = useMemo(() =>
    rpe.length > 0 ? Math.round(rpe.reduce((s, e) => s + e.rpe, 0) / rpe.length * 10) / 10 : null,
    [rpe]);
  const lastRpe  = rpe.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;
  const rpeAccent = rpePeriodAvg !== null ? rpeColor(rpePeriodAvg) : '#475569';

  // ── Wellness stats ──
  const wellPeriodAvg = useMemo(() =>
    wellP.length > 0 ? Math.round(wellP.reduce((s, e) => s + e.score, 0) / wellP.length * 10) / 10 : null,
    [wellP]);
  const wellSaisonAvg = useMemo(() =>
    wellness.length > 0 ? Math.round(wellness.reduce((s, e) => s + e.score, 0) / wellness.length * 10) / 10 : null,
    [wellness]);
  const wellAccent = wellPeriodAvg !== null ? wellColor(wellPeriodAvg) : '#475569';

  const radarData = useMemo(() =>
    wellP.length > 0
      ? WELL_DIMS.map(d => ({
          dim: d.label,
          value: parseFloat((wellP.reduce((s, e) => s + (e[d.key as keyof typeof e] as number), 0) / wellP.length).toFixed(1)),
          fullMark: 10,
        }))
      : [],
    [wellP]);
  const avgWScore   = wellP.length > 0 ? wellP.reduce((s, e) => s + e.score, 0) / wellP.length : 5;
  const radarColor  = wellColor(avgWScore);
  const lastWell    = wellness.sort((a, b) => b.date.localeCompare(a.date))[0] ?? null;

  return (
    <div>
      <DateRangeCard
        from={dateRange.from} to={dateRange.to} preset={dateRange.preset}
        onPreset={p => dateRange.applyPreset(p, seasonStart)}
        onFrom={dateRange.setFrom} onTo={dateRange.setTo}
      />

      {/* ── Graphs row (same as résumé tab) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr]" style={{ gap: 12, marginBottom: 14, alignItems: 'stretch' }}>

        {/* RPE sparkline */}
        <Card accentColor={rpeAccent} style={{ cursor: 'pointer', height: '100%', minHeight: 280, display: 'flex', flexDirection: 'column' }}
          onClick={() => onNavigate(`/rpe/individual/${playerId}`, { from, playerName })}>
          <CardTitle icon={<Activity size={12} style={{ color: rpeAccent }} />} mb={10}
            right={<ArrowRight size={13} style={{ color: '#475569' }} />}>Charge & RPE</CardTitle>
          {rpe.length === 0
            ? <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><EmptyState message="Aucune session." size="sm" /></div>
            : <>
                <ChargeFreshnessChart rpe={rpe} from={dateRange.from} to={dateRange.to} />
                <div style={{ display: 'flex', borderTop: '1px solid #1E2229', marginTop: 10, paddingTop: 10 }}>
                  {[
                    { label: 'Moy. période', val: rpePeriodAvg !== null ? `${rpePeriodAvg}/10` : '—', col: rpeAccent },
                    { label: 'Moy. saison',  val: rpeSaisonAvg !== null ? `${rpeSaisonAvg}/10` : '—', col: rpeSaisonAvg !== null ? rpeColor(rpeSaisonAvg) : '#475569' },
                    { label: 'Dernier',      val: lastRpe ? `${lastRpe.rpe}/10` : '—', col: lastRpe ? rpeColor(lastRpe.rpe) : '#475569' },
                  ].map((k, i, arr) => (
                    <div key={k.label} style={{ flex: 1, textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid #1E2229' : 'none', padding: '0 6px' }}>
                      <div style={KPI_STYLE.label}>{k.label}</div>
                      <div style={{ ...KPI_STYLE.val, color: k.col }}>{k.val}</div>
                    </div>
                  ))}
                </div>
              </>
          }
        </Card>

        {/* Bien-être radar */}
        <Card accentColor={radarData.length > 0 ? radarColor : undefined}
          style={{ cursor: 'pointer', height: '100%', minHeight: 280, display: 'flex', flexDirection: 'column' }}
          onClick={() => onNavigate(`/wellness/history/${playerId}`, { from, playerName })}>
          <CardTitle icon={<Heart size={12} style={{ color: '#F472B6' }} />} mb={10}
            right={<ArrowRight size={13} style={{ color: '#475569' }} />}>Bien-être</CardTitle>
          {radarData.length === 0
            ? <div style={{ flex: 1, display: 'flex', alignItems: 'center' }}><EmptyState message="Aucune saisie." size="sm" /></div>
            : <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <div style={{ flex: 1, minHeight: 140 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData} margin={{ top: 8, right: 20, bottom: 8, left: 20 }}>
                      <PolarGrid stroke="#2A2F3A" />
                      <PolarAngleAxis dataKey="dim" tick={{ fill: '#94A3B8', fontSize: 9 }} />
                      <Radar name="Moy." dataKey="value" stroke={radarColor} fill={radarColor} fillOpacity={0.15} strokeWidth={2}
                        dot={(props: { cx: number; cy: number; index: number }) => {
                          const dim = WELL_DIMS[props.index];
                          const pt  = radarData[props.index];
                          if (!dim || !pt) return <circle key={props.index} cx={props.cx} cy={props.cy} r={0} />;
                          return <circle key={props.index} cx={props.cx} cy={props.cy} r={5} fill={wellDimColor(pt.value, dim.inverted)} stroke="#161920" strokeWidth={2} />;
                        }}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ display: 'flex', borderTop: '1px solid #1E2229', marginTop: 8, paddingTop: 10 }}>
                  {[
                    { label: 'Score période', val: wellPeriodAvg !== null ? `${wellPeriodAvg.toFixed(1)}/10` : '—', col: wellAccent },
                    { label: 'Moy. saison',   val: wellSaisonAvg !== null ? `${wellSaisonAvg.toFixed(1)}/10` : '—', col: wellSaisonAvg !== null ? wellColor(wellSaisonAvg) : '#475569' },
                    { label: 'Dernière',      val: lastWell ? fmtShort(lastWell.date) : '—', col: '#94A3B8' },
                  ].map((k, i, arr) => (
                    <div key={k.label} style={{ flex: 1, textAlign: 'center', borderRight: i < arr.length - 1 ? '1px solid #1E2229' : 'none', padding: '0 6px' }}>
                      <div style={KPI_STYLE.label}>{k.label}</div>
                      <div style={{ ...KPI_STYLE.val, color: k.col }}>{k.val}</div>
                    </div>
                  ))}
                </div>
              </div>
          }
        </Card>
      </div>

      {/* ── Infirmerie ── */}
      <Card accentColor={accentInj}>
        <CardTitle icon={<Stethoscope size={12} style={{ color: accentInj }} />} mb={14}>Infirmerie</CardTitle>
        <div className="grid grid-cols-1 lg:grid-cols-3" style={{ gap: 12 }}>
          {medSections.map(section => (
            <div key={section.key}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: section.records.length > 0 ? 14 : 0 }}>
                <h4 style={{ color: '#94A3B8', fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.05em', margin: 0, fontWeight: 700, flex: 1 }}>
                  {section.title}
                </h4>
                {section.records.length > 0 && (
                  <span style={{ color: section.color, fontWeight: 700, fontSize: '0.78rem', backgroundColor: section.color + '18', padding: '2px 8px', borderRadius: 3 }}>
                    {section.records.length}
                  </span>
                )}
              </div>
              {section.records.length === 0
                ? <EmptyState message={section.emptyMsg} size="sm" />
                : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {section.records.map(record => {
                      const isActive = record.status === 'active';
                      const days = record.rtpDate
                        ? (isActive ? rtpDaysLeft(record.rtpDate) : daysBetween(record.date, record.rtpDate))
                        : null;
                      const rtpLabel = record.type === 'injury' ? 'RTP' : 'Fin';
                      const daysLabel = days !== null && days > 0
                        ? (isActive ? `${rtpLabel} J+${days}` : `${days}j`)
                        : null;
                      return (
                        <MedCard
                          key={record.id}
                          record={record}
                          daysLabel={daysLabel}
                          daysColor={isActive && days !== null && days <= 3 ? '#00E5A0' : isActive ? '#F59E0B' : '#475569'}
                          onEdit={() => onNavigate(`/medical/record/${playerId}`)}
                          onDetail={() => onNavigate(`/medical/record/${playerId}`)}
                        />
                      );
                    })}
                  </div>
                )
              }
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

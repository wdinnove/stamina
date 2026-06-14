import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { ChevronRight } from 'lucide-react';
import { attendanceApi } from '../api/attendance';
import { rpeApi } from '../api/rpe';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { TrainingSession } from '../data/types';

const SESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  training: { label: 'Entraînement', color: '#3B82F6', bg: '#3B82F622' },
  match:    { label: 'Match',        color: '#F59E0B', bg: '#F59E0B22' },
  gym:      { label: 'Salle',        color: '#A855F7', bg: '#A855F722' },
  rest:     { label: 'Repos',        color: '#475569', bg: '#47556922' },
};

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FR   = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    dow:        DAYS_FR[d.getDay()],
    day:        d.getDate(),
    month:      MONTHS_FR[d.getMonth()].slice(0, 3),
    monthKey:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    monthLabel: `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`,
  };
}

export default function TrainingSessionsPage() {
  const { selected } = useTeamSeason();
  const navigate = useNavigate();

  const [sessions,         setSessions]         = useState<TrainingSession[]>([]);
  const [attendanceCounts, setAttendanceCounts] = useState<Record<string, { present: number; absent: number; late: number }>>({});
  const [rpeAvg,           setRpeAvg]           = useState<Record<string, number>>({});
  const [loading,          setLoading]          = useState(false);
  const [error,            setError]            = useState('');

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError('');

    attendanceApi.listSessions(selected.team.id, selected.season.id)
      .then(async (sess) => {
        const sorted = [...sess].sort((a, b) => b.date.localeCompare(a.date));
        setSessions(sorted);
        if (!sorted.length) { setLoading(false); return; }

        const ids = sorted.map(s => s.id);
        const [attendance, rpeEntries] = await Promise.all([
          attendanceApi.listAttendance(ids),
          rpeApi.listBySessions(ids),
        ]);

        const counts: Record<string, { present: number; absent: number; late: number }> = {};
        for (const a of attendance) {
          if (!counts[a.sessionId]) counts[a.sessionId] = { present: 0, absent: 0, late: 0 };
          counts[a.sessionId][a.status]++;
        }
        setAttendanceCounts(counts);

        const bySession: Record<string, number[]> = {};
        for (const e of rpeEntries) {
          if (!bySession[e.sessionId]) bySession[e.sessionId] = [];
          bySession[e.sessionId].push(e.rpe);
        }
        const avgs: Record<string, number> = {};
        for (const [sid, vals] of Object.entries(bySession)) {
          avgs[sid] = vals.reduce((a, b) => a + b, 0) / vals.length;
        }
        setRpeAvg(avgs);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selected?.team.id, selected?.season.id]);

  // Group by month
  const grouped: { monthLabel: string; sessions: TrainingSession[] }[] = [];
  const seenMonths = new Set<string>();
  for (const s of sessions) {
    const { monthKey, monthLabel } = fmtDate(s.date);
    if (!seenMonths.has(monthKey)) {
      seenMonths.add(monthKey);
      grouped.push({ monthLabel, sessions: [] });
    }
    grouped[grouped.length - 1].sessions.push(s);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1 style={{ color: '#F1F5F9', margin: '0 0 20px' }}>Séances</h1>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#EF4444', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : sessions.length === 0 ? (
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Aucune séance enregistrée pour cette saison.</p>
      ) : (
        grouped.map(group => (
          <div key={group.monthLabel} style={{ marginBottom: 28 }}>
            <div style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
              {group.monthLabel}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {group.sessions.map(session => {
                const { dow, day, month } = fmtDate(session.date);
                const typeCfg = SESSION_TYPES[session.sessionType] ?? SESSION_TYPES.training;
                const counts  = attendanceCounts[session.id];
                const avg     = rpeAvg[session.id];

                return (
                  <div
                    key={session.id}
                    onClick={() => navigate(`/sessions/${session.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 14, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '11px 14px', cursor: 'pointer', transition: 'border-color 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = '#3B3F4A')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A2F3A')}
                  >
                    <div style={{ minWidth: 46, textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ color: '#475569', fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase' }}>{dow}</div>
                      <div style={{ color: '#F1F5F9', fontSize: '1.05rem', fontWeight: 700, lineHeight: 1.1 }}>{day}</div>
                      <div style={{ color: '#94A3B8', fontSize: '0.65rem' }}>{month}</div>
                    </div>

                    <div style={{ width: 1, height: 32, backgroundColor: '#2A2F3A', flexShrink: 0 }} />

                    <span style={{ color: typeCfg.color, backgroundColor: typeCfg.bg, fontSize: '0.71rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4, flexShrink: 0 }}>
                      {typeCfg.label}
                    </span>

                    <span style={{ color: '#94A3B8', fontSize: '0.8rem', flexShrink: 0 }}>
                      {session.plannedDuration} min
                    </span>

                    <div style={{ flex: 1 }} />

                    {counts && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                        {counts.present > 0 && <span style={{ color: '#00E5A0', fontSize: '0.76rem' }}>{counts.present} prés.</span>}
                        {counts.absent  > 0 && <span style={{ color: '#EF4444',  fontSize: '0.76rem' }}>{counts.absent} abs.</span>}
                        {counts.late    > 0 && <span style={{ color: '#F59E0B',  fontSize: '0.76rem' }}>{counts.late} retard</span>}
                      </div>
                    )}

                    {avg !== undefined && (
                      <div style={{ textAlign: 'right', flexShrink: 0, minWidth: 54 }}>
                        <div style={{ color: '#475569', fontSize: '0.62rem', textTransform: 'uppercase' }}>RPE moy.</div>
                        <div style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700 }}>{avg.toFixed(1)}</div>
                      </div>
                    )}

                    <ChevronRight size={14} color="#2A2F3A" style={{ flexShrink: 0 }} />
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

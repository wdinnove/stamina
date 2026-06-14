import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router';
import { ArrowLeft, Clock, Upload, File, FileText, Image, Video, Trash2, ExternalLink } from 'lucide-react';
import { attendanceApi } from '../api/attendance';
import { rpeApi } from '../api/rpe';
import { playersApi } from '../api/players';
import { documentsApi } from '../api/documents';
import { PlayerAvatar } from '../components';
import type { TrainingSession, Player, TrainingAttendance, SessionDocument } from '../data/types';

const SESSION_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  training: { label: 'Entraînement', color: '#3B82F6', bg: '#3B82F622' },
  match:    { label: 'Match',        color: '#F59E0B', bg: '#F59E0B22' },
  gym:      { label: 'Salle',        color: '#A855F7', bg: '#A855F722' },
  rest:     { label: 'Repos',        color: '#475569', bg: '#47556922' },
};

const STATUS_CFG = {
  present: { label: 'Présent', color: '#00E5A0', bg: 'rgba(0,229,160,0.12)' },
  absent:  { label: 'Absent',  color: '#EF4444', bg: 'rgba(239,68,68,0.12)' },
  late:    { label: 'Retard',  color: '#F59E0B', bg: 'rgba(245,158,11,0.12)' },
} as const;

const MONTHS_FR = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FULL = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];

function fmtDateFull(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return `${DAYS_FULL[d.getDay()]} ${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

function rpeColor(rpe: number): string {
  if (rpe <= 3) return '#00E5A0';
  if (rpe <= 5) return '#3B82F6';
  if (rpe <= 7) return '#F59E0B';
  return '#EF4444';
}

function fmtSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function DocIcon({ mimeType }: { mimeType?: string }) {
  const m = mimeType ?? '';
  if (m.startsWith('image/'))  return <Image  size={15} color="#A855F7" />;
  if (m.startsWith('video/'))  return <Video  size={15} color="#F59E0B" />;
  if (m === 'application/pdf') return <FileText size={15} color="#EF4444" />;
  return <File size={15} color="#94A3B8" />;
}

function SessionDocuments({ sessionId }: { sessionId: string }) {
  const fileRef = useRef<HTMLInputElement>(null);

  const [docs,      setDocs]      = useState<SessionDocument[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver,  setDragOver]  = useState(false);
  const [docError,  setDocError]  = useState('');

  useEffect(() => {
    documentsApi.list(sessionId).then(setDocs).catch(() => {});
  }, [sessionId]);

  async function handleFiles(files: FileList | null) {
    if (!files || !files.length) return;
    setUploading(true);
    setDocError('');
    try {
      for (const file of Array.from(files)) {
        const doc = await documentsApi.upload(sessionId, file);
        setDocs(prev => [...prev, doc]);
      }
    } catch (e: any) {
      setDocError(e.message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function handleOpen(doc: SessionDocument) {
    try {
      const url = await documentsApi.getSignedUrl(doc.storagePath);
      window.open(url, '_blank', 'noreferrer');
    } catch (e: any) {
      setDocError(e.message);
    }
  }

  async function handleDelete(doc: SessionDocument) {
    try {
      await documentsApi.remove(doc);
      setDocs(prev => prev.filter(d => d.id !== doc.id));
    } catch (e: any) {
      setDocError(e.message);
    }
  }

  return (
    <div style={{ marginTop: 28 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ color: '#475569', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Documents
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: uploading ? '#475569' : '#94A3B8', fontSize: '0.76rem', padding: '5px 10px', cursor: uploading ? 'default' : 'pointer' }}
        >
          <Upload size={12} />
          {uploading ? 'Upload…' : 'Ajouter'}
        </button>
      </div>

      {docError && (
        <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 10 }}>{docError}</div>
      )}

      <input
        ref={fileRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => handleFiles(e.target.files)}
      />

      {docs.length === 0 && !uploading ? (
        <div
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
          onClick={() => fileRef.current?.click()}
          style={{ border: `1px dashed ${dragOver ? '#00E5A0' : '#2A2F3A'}`, borderRadius: 8, padding: '20px 16px', textAlign: 'center', color: '#475569', fontSize: '0.8rem', cursor: 'pointer', transition: 'border-color 0.15s' }}
        >
          Glisser-déposer ou cliquer pour ajouter un fichier
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          {docs.map(doc => (
            <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 10, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 14px' }}>
              <DocIcon mimeType={doc.mimeType} />
              <span style={{ color: '#F1F5F9', fontSize: '0.83rem', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</span>
              {doc.size && <span style={{ color: '#475569', fontSize: '0.72rem', flexShrink: 0 }}>{fmtSize(doc.size)}</span>}
              <button onClick={() => handleOpen(doc)}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#94A3B8')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                <ExternalLink size={13} />
              </button>
              <button onClick={() => handleDelete(doc)}
                style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 0 }}
                onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                onMouseLeave={e => (e.currentTarget.style.color = '#475569')}>
                <Trash2 size={13} />
              </button>
            </div>
          ))}

          {!uploading && (
            <div
              onDragOver={e => { e.preventDefault(); setDragOver(true); }}
              onDragLeave={() => setDragOver(false)}
              onDrop={e => { e.preventDefault(); setDragOver(false); handleFiles(e.dataTransfer.files); }}
              onClick={() => fileRef.current?.click()}
              style={{ border: `1px dashed ${dragOver ? '#00E5A0' : '#1E2229'}`, borderRadius: 6, padding: '8px', textAlign: 'center', color: '#2A2F3A', fontSize: '0.74rem', cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.color = '#475569'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.color = '#2A2F3A'; }}
            >
              + Ajouter un fichier
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrainingSessionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [session,    setSession]    = useState<TrainingSession | null>(null);
  const [players,    setPlayers]    = useState<Player[]>([]);
  const [attendance, setAttendance] = useState<TrainingAttendance[]>([]);
  const [rpeEntries, setRpeEntries] = useState<{ playerId: string; rpe: number; actualDuration?: number }[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (!id) return;
    setLoading(true);
    setError('');
    Promise.all([
      attendanceApi.getSession(id),
      playersApi.list(),
      attendanceApi.listAttendance([id]),
      rpeApi.listBySession(id),
    ])
      .then(([sess, ps, att, rpe]) => {
        setSession(sess);
        setPlayers(ps);
        setAttendance(att);
        setRpeEntries(rpe);
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '64px 0' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (error || !session) return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate('/sessions')} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 16, padding: 0 }}>
        <ArrowLeft size={14} /> Toutes les séances
      </button>
      <div style={{ color: '#EF4444', fontSize: '0.85rem' }}>{error || 'Séance introuvable.'}</div>
    </div>
  );

  const typeCfg = SESSION_TYPES[session.sessionType] ?? SESSION_TYPES.training;
  const attMap  = Object.fromEntries(attendance.map(a => [a.playerId, a.status]));
  const rpeMap  = Object.fromEntries(rpeEntries.map(e => [e.playerId, e]));

  const knownIds = new Set([...attendance.map(a => a.playerId), ...rpeEntries.map(e => e.playerId)]);
  const relevantPlayers = players
    .filter(p => knownIds.has(p.id))
    .sort((a, b) => a.lastName.localeCompare(b.lastName));

  const presentCount = attendance.filter(a => a.status === 'present').length;
  const absentCount  = attendance.filter(a => a.status === 'absent').length;
  const lateCount    = attendance.filter(a => a.status === 'late').length;
  const rpeValues    = rpeEntries.map(e => e.rpe);
  const avgRpe       = rpeValues.length ? rpeValues.reduce((a, b) => a + b, 0) / rpeValues.length : null;
  const totalLoad    = rpeEntries.reduce((sum, e) => sum + e.rpe * (e.actualDuration ?? session.plannedDuration), 0);

  return (
    <div style={{ padding: 24 }}>
      <button onClick={() => navigate('/sessions')}
        style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20, padding: 0 }}>
        <ArrowLeft size={14} /> Toutes les séances
      </button>

      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1.25rem' }}>{fmtDateFull(session.date)}</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <span style={{ color: typeCfg.color, backgroundColor: typeCfg.bg, fontSize: '0.75rem', fontWeight: 700, padding: '3px 10px', borderRadius: 4 }}>
            {typeCfg.label}
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94A3B8', fontSize: '0.82rem' }}>
            <Clock size={13} /> {session.plannedDuration} min
          </span>
          {(session.partnerCount ?? 0) > 0 && (
            <span style={{ color: '#475569', fontSize: '0.78rem' }}>{session.partnerCount} partenaire{(session.partnerCount ?? 0) > 1 ? 's' : ''}</span>
          )}
        </div>
        {session.notes && (
          <p style={{ color: '#94A3B8', fontSize: '0.82rem', margin: '8px 0 0', fontStyle: 'italic' }}>{session.notes}</p>
        )}
      </div>

      {/* KPI chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {[
          { value: presentCount, label: 'Présents',   color: '#00E5A0', show: true },
          { value: absentCount,  label: 'Absents',    color: '#EF4444', show: absentCount > 0 },
          { value: lateCount,    label: 'Retards',    color: '#F59E0B', show: lateCount > 0 },
        ].filter(k => k.show).map(k => (
          <div key={k.label} style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 72 }}>
            <div style={{ color: k.color, fontSize: '1.15rem', fontWeight: 700 }}>{k.value}</div>
            <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>{k.label}</div>
          </div>
        ))}
        {avgRpe !== null && (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 72 }}>
            <div style={{ color: '#F1F5F9', fontSize: '1.15rem', fontWeight: 700 }}>{avgRpe.toFixed(1)}</div>
            <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>RPE moy.</div>
          </div>
        )}
        {totalLoad > 0 && (
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 18px', textAlign: 'center', minWidth: 72 }}>
            <div style={{ color: '#F1F5F9', fontSize: '1.15rem', fontWeight: 700 }}>{Math.round(totalLoad)}</div>
            <div style={{ color: '#94A3B8', fontSize: '0.68rem' }}>Charge tot.</div>
          </div>
        )}
      </div>

      {/* Player table */}
      {relevantPlayers.length === 0 ? (
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Aucune donnée enregistrée pour cette séance.</p>
      ) : (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                {['Joueur', 'Présence', 'RPE', 'Durée eff.', 'Charge'].map((h, i) => (
                  <th key={h} style={{ padding: '10px 16px', textAlign: i === 0 ? 'left' : 'center', color: '#475569', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {relevantPlayers.map((player, i) => {
                const attStatus = attMap[player.id] as TrainingAttendance['status'] | undefined;
                const rpe       = rpeMap[player.id];
                const dur       = rpe?.actualDuration ?? session.plannedDuration;
                const load      = rpe ? rpe.rpe * dur : null;
                const statusCfg = attStatus ? STATUS_CFG[attStatus] : null;

                return (
                  <tr key={player.id} style={{ borderBottom: i < relevantPlayers.length - 1 ? '1px solid #1E2229' : 'none' }}>
                    <td style={{ padding: '10px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <PlayerAvatar player={player} size={28} />
                        <div>
                          <div style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600 }}>
                            {player.lastName} {player.firstName[0]}.
                          </div>
                          <div style={{ color: '#475569', fontSize: '0.7rem' }}>#{player.number} · {player.position}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {statusCfg
                        ? <span style={{ color: statusCfg.color, backgroundColor: statusCfg.bg, fontSize: '0.72rem', fontWeight: 600, padding: '3px 8px', borderRadius: 4 }}>{statusCfg.label}</span>
                        : <span style={{ color: '#2A2F3A', fontSize: '0.72rem' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center' }}>
                      {rpe
                        ? <span style={{ color: rpeColor(rpe.rpe), fontSize: '0.92rem', fontWeight: 700 }}>{rpe.rpe}</span>
                        : <span style={{ color: '#2A2F3A' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: '#94A3B8', fontSize: '0.8rem' }}>
                      {rpe ? `${dur} min` : '—'}
                    </td>
                    <td style={{ padding: '10px 16px', textAlign: 'center', color: load ? '#F1F5F9' : '#2A2F3A', fontSize: '0.82rem', fontWeight: load ? 600 : 400 }}>
                      {load !== null ? load : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <SessionDocuments sessionId={session.id} />
    </div>
  );
}

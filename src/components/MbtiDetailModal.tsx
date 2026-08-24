import { useState } from 'react';
import { X } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Badge } from './Badge';
import { Modal } from './Modal';
import { MBTI_PROFILES_V1, tieLabel, type MbtiResult, type MbtiType } from '../data/mbti';
import { fmtDate } from '../utils/dateFormat';

const ACCENT = '#8B5CF6';

interface MbtiDetailModalProps {
  name: string;
  result: MbtiResult;
  submittedAt: string;
  onClose: () => void;
}

/**
 * Détail de fiche personnalité en lecture seule — ouvert au clic sur les 4 lettres depuis
 * Analyse collective (joueurs et staff). Reprend la fiche "Profil" de `MbtiPlayerPanel`, sans
 * les actions de gestion (copier le lien, envoyer, réinitialiser) qui n'ont pas leur place ici.
 */
export function MbtiDetailModal({ name, result, submittedAt, onClose }: MbtiDetailModalProps) {
  const [selectedType, setSelectedType] = useState<MbtiType | null>(null);
  const type = selectedType ?? result.candidates[0];
  const profile = MBTI_PROFILES_V1[type];

  return (
    <Modal onClose={onClose} closeOnBackdropClick maxWidth={720} maxHeight="85vh" overlayOpacity={0.7} style={{ padding: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.05rem' }}>{name}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
      </div>

      <Card accentColor={ACCENT} style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
          <div style={{
            width: 84, height: 84, borderRadius: 12, flexShrink: 0,
            backgroundColor: ACCENT + '18', border: `1px solid ${ACCENT}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: ACCENT, fontWeight: 900, fontSize: '1.5rem', letterSpacing: '0.05em',
          }}>
            {result.code}
          </div>
          <div style={{ flex: 1, minWidth: 200 }}>
            <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1.05rem', margin: '0 0 4px' }}>{profile.nick}</p>
            <p style={{ color: '#64748B', fontSize: '0.75rem', margin: '0 0 8px' }}>
              Questionnaire rempli le {fmtDate(submittedAt.slice(0, 10))}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {result.ties.map(t => (
                <Badge key={t} color="#F59E0B" label={tieLabel(t)} size="sm" />
              ))}
            </div>
          </div>
        </div>

        {result.ties.length > 0 && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: '1px solid #2A2F3A' }}>
            <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '0 0 8px', lineHeight: 1.6 }}>
              Un ou plusieurs axes sont à égalité stricte : le questionnaire ne tranche pas. Voici les
              fiches compatibles — regarde celle qui lui ressemble le plus, ou les deux.
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {result.candidates.map(c => (
                <button key={c} onClick={() => setSelectedType(c)}
                  style={{
                    padding: '5px 10px', borderRadius: 6, cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700,
                    border: `1px solid ${c === type ? ACCENT : '#2A2F3A'}`,
                    backgroundColor: c === type ? ACCENT + '22' : '#1E2229',
                    color: c === type ? '#F1F5F9' : '#94A3B8',
                  }}>
                  {c} · {MBTI_PROFILES_V1[c].nick}
                </button>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <CardTitle>Répartition sur les 4 axes</CardTitle>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {result.axes.map(ax => (
            <div key={ax.key}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', marginBottom: 4 }}>
                <span style={{ color: ax.winner === ax.a ? '#F1F5F9' : '#64748B', fontWeight: ax.winner === ax.a ? 700 : 500 }}>
                  {ax.a} · {ax.percentA}%
                </span>
                <span style={{ color: '#475569', fontSize: '0.72rem' }}>{ax.label}</span>
                <span style={{ color: ax.winner === ax.b ? '#F1F5F9' : '#64748B', fontWeight: ax.winner === ax.b ? 700 : 500 }}>
                  {ax.percentB}% · {ax.b}
                </span>
              </div>
              <div style={{ display: 'flex', height: 8, borderRadius: 4, overflow: 'hidden', backgroundColor: '#0D0F14' }}>
                <div style={{ width: `${ax.percentA}%`, backgroundColor: ax.winner === ax.a ? ACCENT : '#2A2F3A' }} />
                <div style={{ width: `${ax.percentB}%`, backgroundColor: ax.winner === ax.b ? ACCENT : '#2A2F3A' }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card style={{ marginBottom: 14 }}>
        <CardTitle>L'essentiel</CardTitle>
        <p style={{ color: '#CBD5E1', fontSize: '0.86rem', lineHeight: 1.65, margin: 0 }}>{profile.essence}</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14 }}>
        <ListCard title="Forces" color="#00E5A0" items={profile.forces} />
        <ListCard title="Points de vigilance" color="#F59E0B" items={profile.vigilances} />
        <ListCard title="Ce qui le stresse" color="#EF4444" items={profile.stress} />
        <ListCard title="Ce qui le motive" color="#3B82F6" items={profile.motiv} />
      </div>

      <div style={{ marginTop: 14 }}>
        <ListCard title="Comment communiquer" color={ACCENT} items={profile.comm} />
      </div>
    </Modal>
  );
}

function ListCard({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <Card>
      <CardTitle>{title}</CardTitle>
      <ul style={{ margin: 0, paddingLeft: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {items.map(item => (
          <li key={item} style={{ color: '#CBD5E1', fontSize: '0.83rem', lineHeight: 1.5, display: 'flex', gap: 8 }}>
            <span style={{ color, flexShrink: 0 }}>·</span>{item}
          </li>
        ))}
      </ul>
    </Card>
  );
}

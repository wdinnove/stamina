import { useState } from 'react';
import { Copy, Check, Mail, RotateCcw, Sparkles, AlertTriangle, X } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { Modal } from './Modal';
import { mbtiApi } from '../api/mbti';
import { sendMbtiLinks } from '../api/email';
import { useMbtiResponses } from '../hooks/useMbtiResponses';
import { MBTI_PROFILES_V1, safeComputeMbtiResult, tieLabel } from '../data/mbti';
import type { MbtiType } from '../data/mbti';
import { fmtDate } from '../utils/dateFormat';
import { playerNameFull } from '../utils/playerName';
import { copyToClipboard, mbtiPublicUrl } from '../utils/publicLinks';
import type { Player } from '../data/types';

const ACCENT = '#8B5CF6';

interface MbtiPlayerPanelProps {
  player: Player;
  /** Équipe courante — requise pour l'envoi du lien par email. */
  teamId?: string;
}

export function MbtiPlayerPanel({ player, teamId }: MbtiPlayerPanelProps) {
  const { responses, loading, reload } = useMbtiResponses([player.id]);
  const response = responses[0] ?? null;
  const result = safeComputeMbtiResult(response?.answers);

  const [selectedType, setSelectedType] = useState<MbtiType | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendMsg, setSendMsg] = useState('');
  const [confirmReset, setConfirmReset] = useState(false);
  const [resetting, setResetting] = useState(false);

  async function handleCopy() {
    const ok = await copyToClipboard(mbtiPublicUrl(player.id));
    if (ok) { setCopied(true); setTimeout(() => setCopied(false), 2000); }
  }

  async function handleSend() {
    if (!teamId) return;
    setSending(true);
    setSendMsg('');
    try {
      const res = await sendMbtiLinks(teamId, [player.id]);
      setSendMsg(res.sent.length ? 'Lien envoyé par email.'
        : res.skipped.length ? 'Aucun envoi : pas d\'adresse email renseignée.'
        : "L'envoi a échoué.");
    } catch (err) {
      setSendMsg(err instanceof Error ? err.message : "L'envoi a échoué.");
    } finally {
      setSending(false);
    }
  }

  async function handleReset() {
    setResetting(true);
    try {
      await mbtiApi.reset(player.id);
      setConfirmReset(false);
      setSelectedType(null);
      reload();
    } finally {
      setResetting(false);
    }
  }

  if (loading) return <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>;

  // ── Pas encore de passation ─────────────────────────────────────────────────
  if (!response || !result) {
    return (
      <div>
        <Disclaimer />
        <Card>
          <CardTitle icon={<Sparkles size={14} color={ACCENT} />}>Questionnaire de personnalité</CardTitle>
          <EmptyState message={`${playerNameFull(player)} n'a pas encore rempli le questionnaire.`} />
          <p style={{ color: '#64748B', fontSize: '0.78rem', textAlign: 'center', margin: '0 0 14px', lineHeight: 1.6 }}>
            Transmets-lui le lien : 24 affirmations, environ 5 minutes, sans compte à créer.
            Il ne fonctionne qu'une fois.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button onClick={handleCopy} style={btn(copied ? '#00E5A0' : ACCENT)}>
              {copied ? <Check size={14} /> : <Copy size={14} />}
              {copied ? 'Lien copié' : 'Copier le lien'}
            </button>
            <button onClick={handleSend} disabled={!player.email || !teamId || sending} style={btn('#1E2229', '#94A3B8', !player.email || !teamId || sending)}>
              <Mail size={14} />
              {sending ? 'Envoi…' : player.email ? 'Envoyer par email' : 'Pas d\'email renseigné'}
            </button>
          </div>
          {sendMsg && <p style={{ color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center', margin: '12px 0 0' }}>{sendMsg}</p>}
        </Card>
      </div>
    );
  }

  // ── Profil ──────────────────────────────────────────────────────────────────
  const type = selectedType ?? result.candidates[0];
  const profile = MBTI_PROFILES_V1[type];

  return (
    <div>
      <Disclaimer />

      {/* En-tête : type + surnom */}
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
              Questionnaire rempli le {fmtDate(response.submittedAt.slice(0, 10))}
            </p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {result.ties.map(t => (
                <Badge key={t} color="#F59E0B" label={tieLabel(t)} size="sm" />
              ))}
            </div>
          </div>
          <button onClick={() => setConfirmReset(true)} style={btn('#1E2229', '#94A3B8')}>
            <RotateCcw size={14} /> Réinitialiser
          </button>
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

      {/* Répartition sur les 4 axes */}
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

      {/* Fiche */}
      <Card style={{ marginBottom: 14 }}>
        <CardTitle>L'essentiel</CardTitle>
        <p style={{ color: '#CBD5E1', fontSize: '0.86rem', lineHeight: 1.65, margin: 0 }}>{profile.essence}</p>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2" style={{ gap: 14 }}>
        <ListCard title="Forces" color="#00E5A0" items={profile.forces} />
        <ListCard title="Points de vigilance" color="#F59E0B" items={profile.vigilances} />
        <ListCard title="Ce qui la stresse" color="#EF4444" items={profile.stress} />
        <ListCard title="Ce qui la motive" color="#3B82F6" items={profile.motiv} />
      </div>

      <div style={{ marginTop: 14 }}>
        <ListCard title="Comment communiquer avec elle" color={ACCENT} items={profile.comm} />
      </div>

      {confirmReset && (
        <Modal onClose={() => setConfirmReset(false)} maxWidth={420} style={{ padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem' }}>Réinitialiser le questionnaire</h2>
            <button onClick={() => setConfirmReset(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', lineHeight: 1.6, margin: '0 0 20px' }}>
            Les réponses de {playerNameFull(player)} seront supprimées définitivement et son lien
            redeviendra utilisable. L'ancienne passation n'est pas conservée.
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button onClick={() => setConfirmReset(false)} style={btn('#1E2229', '#94A3B8')}>Annuler</button>
            <button onClick={handleReset} disabled={resetting} style={btn('#EF4444', '#0D0F14', resetting)}>
              {resetting ? 'Suppression…' : 'Supprimer les réponses'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

/** Rappel non-clinique — exigé par le cahier des charges, et pas seulement pour la forme :
 *  ces fiches décrivent des préférences déclarées, pas une aptitude ni un diagnostic. */
export function Disclaimer() {
  return (
    <div style={{
      marginBottom: 14, padding: '12px 14px', borderRadius: 8,
      backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderLeft: `3px solid ${ACCENT}`,
      display: 'flex', gap: 10, alignItems: 'flex-start',
    }}>
      <AlertTriangle size={15} color={ACCENT} style={{ flexShrink: 0, marginTop: 2 }} />
      <p style={{ margin: 0, fontSize: '0.78rem', color: '#94A3B8', lineHeight: 1.6 }}>
        Outil <strong style={{ color: '#CBD5E1' }}>indicatif</strong>, pas un diagnostic psychologique :
        il reflète des préférences déclarées un jour donné. À utiliser pour ajuster la communication,
        jamais pour juger une joueuse ni décider d'un temps de jeu.
      </p>
    </div>
  );
}

function btn(bg: string, color = '#0D0F14', disabled = false): React.CSSProperties {
  return {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
    padding: '8px 14px', backgroundColor: bg, color,
    border: 'none', borderRadius: 6, fontWeight: 700, fontSize: '0.8rem',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
}

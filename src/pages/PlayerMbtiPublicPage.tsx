import { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router';
import { Send, CheckCircle, AlertCircle, Lock } from 'lucide-react';
import { mbtiApi } from '../api/mbti';
import { StaminaLogo } from '../components/StaminaLogo';
import { MBTI_QUESTIONS, MBTI_QUESTION_COUNT, MBTI_SCALE_LABELS } from '../data/mbti';
import { playerNameFull } from '../utils/playerName';

type Status = 'idle' | 'submitting' | 'success' | 'already' | 'error';

const ACCENT = '#8B5CF6';   // violet — même code couleur que les profils dans l'app

export default function PlayerMbtiPublicPage() {
  const { playerId } = useParams<{ playerId: string }>();

  const [playerName, setPlayerName] = useState<string | null>(null);
  const [notFound,   setNotFound]   = useState(false);
  const [loading,    setLoading]    = useState(true);

  const [answers,  setAnswers]  = useState<Record<number, number>>({});
  const [status,   setStatus]   = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!playerId) { setNotFound(true); setLoading(false); return; }
    mbtiApi.getPublicInfo(playerId)
      .then(info => {
        if (!info) { setNotFound(true); }
        else {
          setPlayerName(playerNameFull(info));
          if (info.alreadyAnswered) setStatus('already');
        }
        setLoading(false);
      }, () => { setNotFound(true); setLoading(false); });
  }, [playerId]);

  const answeredCount = useMemo(() => Object.keys(answers).length, [answers]);
  const complete = answeredCount === MBTI_QUESTION_COUNT;
  const firstUnanswered = MBTI_QUESTIONS.find(q => answers[q.id] === undefined);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId || !complete) return;
    setStatus('submitting');

    const { error } = await mbtiApi.submitPublic(playerId, answers);

    if (!error) {
      setStatus('success');
    } else if (error.message.includes('déjà rempli')) {
      // Cas d'un double envoi ou d'un lien rouvert dans un autre onglet.
      setStatus('already');
    } else {
      setStatus('error');
      setErrorMsg(error.message);
    }
  }

  // ── Render guards ────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <Page>
        <div style={card}>
          <div style={{ textAlign: 'center', color: '#475569', fontSize: '0.88rem', padding: '32px 0' }}>Chargement…</div>
        </div>
      </Page>
    );
  }

  if (notFound) {
    return (
      <Page>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <AlertCircle size={40} style={{ color: '#EF4444', marginBottom: 12 }} />
            <p style={{ color: '#F1F5F9', fontWeight: 600, margin: '0 0 8px' }}>Joueur introuvable</p>
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Ce lien n'est pas valide ou le joueur n'existe plus.</p>
          </div>
        </div>
      </Page>
    );
  }

  if (status === 'success') {
    return (
      <Page>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <CheckCircle size={48} style={{ color: '#00E5A0', marginBottom: 16 }} />
            <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1.05rem', margin: '0 0 8px' }}>C'est envoyé, merci !</p>
            <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>
              Tes réponses sont enregistrées. Ton profil est consultable avec ton staff — parles-en avec eux si tu veux le découvrir.
            </p>
          </div>
        </div>
      </Page>
    );
  }

  if (status === 'already') {
    return (
      <Page>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Lock size={40} style={{ color: ACCENT, marginBottom: 12 }} />
            <p style={{ color: '#F1F5F9', fontWeight: 600, margin: '0 0 8px' }}>Questionnaire déjà rempli</p>
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>
              Il ne se remplit qu'une fois. Si tu penses t'être trompé, demande à ton staff de le réinitialiser.
            </p>
          </div>
        </div>
      </Page>
    );
  }

  // ── Formulaire ───────────────────────────────────────────────────────────────
  return (
    <Page>
      <div style={card}>
        <div style={{ marginBottom: 20 }}>
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Questionnaire de personnalité</p>
          <h1 style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1.15rem', margin: 0 }}>{playerName}</h1>
        </div>

        <div style={{ padding: '12px 14px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderLeft: `3px solid ${ACCENT}`, borderRadius: 8, marginBottom: 20 }}>
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', lineHeight: 1.6, margin: 0 }}>
            24 affirmations, environ 5 minutes. Réponds spontanément, il n'y a ni bonne ni mauvaise réponse.
            L'outil est <strong style={{ color: '#CBD5E1' }}>indicatif</strong> : il décrit des préférences de
            fonctionnement, ce n'est ni un test psychologique ni une évaluation sportive.
            <br />
            <strong style={{ color: '#CBD5E1' }}>Une seule passation</strong> — prends le temps, tu ne pourras pas recommencer.
          </p>
        </div>

        {/* Progression — collée en haut pendant le défilement */}
        <div style={{ position: 'sticky', top: 0, zIndex: 2, backgroundColor: '#161920', paddingBottom: 10, marginBottom: 6 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
            <span style={{ color: '#94A3B8', fontSize: '0.78rem', fontWeight: 600 }}>Progression</span>
            <span style={{ color: complete ? '#00E5A0' : ACCENT, fontSize: '0.85rem', fontWeight: 700 }}>
              {answeredCount} / {MBTI_QUESTION_COUNT}
            </span>
          </div>
          <div style={{ height: 6, borderRadius: 3, backgroundColor: '#0D0F14', overflow: 'hidden' }}>
            <div style={{
              width: `${(answeredCount / MBTI_QUESTION_COUNT) * 100}%`, height: '100%',
              backgroundColor: complete ? '#00E5A0' : ACCENT, transition: 'width 0.2s',
            }} />
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22, margin: '18px 0 24px' }}>
            {MBTI_QUESTIONS.map((q, index) => {
              const value = answers[q.id];
              return (
                <div key={q.id}>
                  <p style={{ color: '#F1F5F9', fontSize: '0.9rem', lineHeight: 1.45, margin: '0 0 10px' }}>
                    <span style={{ color: '#475569', fontWeight: 700, marginRight: 6 }}>{index + 1}.</span>
                    {q.text}
                  </p>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {MBTI_SCALE_LABELS.map(opt => {
                      const active = value === opt.value;
                      return (
                        <button
                          key={opt.value}
                          type="button"
                          aria-label={opt.label}
                          aria-pressed={active}
                          onClick={() => setAnswers(prev => ({ ...prev, [q.id]: opt.value }))}
                          style={{
                            flex: 1, height: 48, borderRadius: 8, cursor: 'pointer',
                            border: `1px solid ${active ? ACCENT : '#2A2F3A'}`,
                            backgroundColor: active ? ACCENT + '22' : '#0D0F14',
                            color: active ? '#F1F5F9' : '#64748B',
                            fontWeight: active ? 700 : 500, fontSize: '0.95rem',
                          }}
                        >
                          {opt.value}
                        </button>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                    <span style={{ color: '#475569', fontSize: '0.68rem' }}>{MBTI_SCALE_LABELS[0].label}</span>
                    <span style={{ color: '#475569', fontSize: '0.68rem' }}>{MBTI_SCALE_LABELS[MBTI_SCALE_LABELS.length - 1].label}</span>
                  </div>
                </div>
              );
            })}
          </div>

          {status === 'error' && (
            <div style={{ padding: '10px 12px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#FCA5A5', fontSize: '0.82rem' }}>{errorMsg || 'Une erreur est survenue, réessaie.'}</span>
            </div>
          )}

          {!complete && (
            <p style={{ color: '#F59E0B', fontSize: '0.78rem', margin: '0 0 10px', textAlign: 'center' }}>
              Il reste {MBTI_QUESTION_COUNT - answeredCount} affirmation{MBTI_QUESTION_COUNT - answeredCount > 1 ? 's' : ''} sans réponse
              {firstUnanswered ? ` (la n° ${MBTI_QUESTIONS.indexOf(firstUnanswered) + 1})` : ''}.
            </p>
          )}

          <button
            type="submit"
            disabled={!complete || status === 'submitting'}
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              width: '100%', padding: '13px 16px', border: 'none', borderRadius: 8,
              backgroundColor: complete ? '#00E5A0' : '#1E2229',
              color: complete ? '#0D0F14' : '#475569',
              fontWeight: 700, fontSize: '0.9rem',
              cursor: complete && status !== 'submitting' ? 'pointer' : 'not-allowed',
              opacity: status === 'submitting' ? 0.6 : 1,
            }}
          >
            <Send size={15} />
            {status === 'submitting' ? 'Envoi…' : 'Envoyer mes réponses'}
          </button>
        </form>
      </div>
    </Page>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const card: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 16,
  padding: '28px 24px', width: '100%', maxWidth: 480,
};

function Page({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#0D0F14', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '32px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 32 }}>
        <StaminaLogo size={28} />
        <div>
          <div style={{ color: '#F1F5F9', fontWeight: 900, fontSize: '0.95rem', letterSpacing: '0.12em', lineHeight: 1.1 }}>STAMINA</div>
          <div style={{ color: '#00E5A080', fontSize: '0.55rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Management App</div>
        </div>
      </div>
      <div style={{ width: '100%', maxWidth: 480 }}>{children}</div>
    </div>
  );
}

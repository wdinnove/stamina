import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { Send, CheckCircle, AlertCircle, Clock, Smile, Meh, Frown } from 'lucide-react';
import { supabase } from '../api/client';
import { StaminaLogo } from '../components/StaminaLogo';
import {
  WELLNESS_DIMENSIONS, WELLNESS_QUICK_SCALE, wellnessScoreColor, wellnessDimColor,
  wellnessGlobalScore, wellnessRawValue, wellnessBroadcastValues,
} from '../utils/wellness';
import type { WellnessEntryMethod } from '../data/types';

const DIMS = WELLNESS_DIMENSIONS;

// Même formule que la colonne générée wellness_entries.score (schema.sql) et wellnessGlobalScore
function calcScore(v: Record<string, number>) {
  return wellnessGlobalScore(v as { fatigue: number; mood: number; stress: number; motivation: number; sleep: number; soreness: number });
}

const scoreColor = wellnessScoreColor;
const dimColor   = wellnessDimColor;
const QUICK_ICONS = { frown: Frown, meh: Meh, smile: Smile };

function todayStr() { return new Date().toISOString().split('T')[0]; }
function minDateStr() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return d.toISOString().split('T')[0];
}

type Status = 'idle' | 'submitting' | 'success' | 'rate_limited' | 'error';

export default function PlayerWellnessPublicPage() {
  const { playerId } = useParams<{ playerId: string }>();

  const [playerName, setPlayerName] = useState<string | null>(null);
  const [notFound,   setNotFound]   = useState(false);
  const [loading,    setLoading]    = useState(true);

  const [date,   setDate]   = useState(todayStr());
  const [values, setValues] = useState<Record<string, number>>(
    Object.fromEntries(DIMS.map(d => [d.key, 5]))
  );
  const [entryMode, setEntryMode] = useState<WellnessEntryMethod>('detailed');
  const [singleValue, setSingleValue] = useState(5);
  const [notes,  setNotes]  = useState('');

  const [status,   setStatus]   = useState<Status>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    if (!playerId) { setNotFound(true); setLoading(false); return; }
    supabase.rpc('get_player_public_info', { p_player_id: playerId })
      .maybeSingle()
      .then(({ data, error }) => {
        if (error || !data) { setNotFound(true); }
        else {
          const info = data as { first_name: string; last_name: string; public_wellness_method: WellnessEntryMethod | null };
          setPlayerName(`${info.first_name} ${info.last_name}`);
          setEntryMode(info.public_wellness_method ?? 'detailed');
        }
        setLoading(false);
      });
  }, [playerId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!playerId) return;
    setStatus('submitting');

    const { error } = await supabase.rpc('submit_wellness_public', {
      p_player_id:  playerId,
      p_date:       date,
      p_fatigue:    values.fatigue,
      p_mood:       values.mood,
      p_stress:     values.stress,
      p_motivation: values.motivation,
      p_sleep:      values.sleep,
      p_soreness:   values.soreness,
      p_notes:      notes.trim() || null,
    });

    if (!error) {
      setStatus('success');
    } else if (error.message.includes('Limite hebdomadaire')) {
      setStatus('rate_limited');
    } else {
      setStatus('error');
      setErrorMsg(error.message);
    }
  }

  function resetForm() {
    setValues(Object.fromEntries(DIMS.map(d => [d.key, 5])));
    setNotes('');
    setDate(todayStr());
    setStatus('idle');
    setErrorMsg('');
  }

  const score = calcScore(values);

  // ── Styles ──────────────────────────────────────────────────────────────────
  const card: React.CSSProperties = {
    backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 16,
    padding: '28px 24px', width: '100%', maxWidth: 480,
  };

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
            <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1.05rem', margin: '0 0 8px' }}>Formulaire envoyé !</p>
            <p style={{ color: '#475569', fontSize: '0.85rem', margin: '0 0 24px' }}>Ton bien-être du {formatDate(date)} a bien été enregistré.</p>
            <button onClick={resetForm} style={btnStyle('#1E2229', '#94A3B8')}>
              Remplir un autre jour
            </button>
          </div>
        </div>
      </Page>
    );
  }

  if (status === 'rate_limited') {
    return (
      <Page>
        <div style={card}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Clock size={40} style={{ color: '#F59E0B', marginBottom: 12 }} />
            <p style={{ color: '#F1F5F9', fontWeight: 600, margin: '0 0 8px' }}>Limite hebdomadaire atteinte</p>
            <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Tu as déjà soumis 10 formulaires cette semaine. Reviens lundi prochain.</p>
          </div>
        </div>
      </Page>
    );
  }

  // ── Main form ────────────────────────────────────────────────────────────────
  return (
    <Page>
      <div style={card}>
        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '0 0 4px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Formulaire bien-être</p>
          <h1 style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1.15rem', margin: 0 }}>{playerName}</h1>
        </div>

        <form onSubmit={handleSubmit}>
          {/* Date */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Date</label>
            <input
              type="date"
              value={date}
              min={minDateStr()}
              max={todayStr()}
              onChange={e => setDate(e.target.value)}
              required
              style={{ width: '100%', padding: '9px 12px', backgroundColor: '#0D0F14', border: '1px solid #2A2F3A', borderRadius: 8, color: '#F1F5F9', fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box' }}
            />
          </div>

          {entryMode === 'single' ? (
            <div style={{ padding: '18px 12px', backgroundColor: '#0D0F14', border: '1px solid #2A2F3A', borderRadius: 8, marginBottom: 24, textAlign: 'center' }}>
              <p style={{ color: '#F1F5F9', fontWeight: 500, margin: '0 0 14px', fontSize: '0.9rem' }}>Comment tu te sens aujourd'hui ?</p>
              <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
                {WELLNESS_QUICK_SCALE.map(opt => {
                  const Icon = QUICK_ICONS[opt.icon];
                  return (
                    <button key={opt.v} type="button" onClick={() => { setSingleValue(opt.v); setValues(wellnessBroadcastValues(opt.v)); }}
                      style={{ width: 68, height: 68, borderRadius: 12, border: `2px solid ${singleValue === opt.v ? opt.color : '#2A2F3A'}`, backgroundColor: singleValue === opt.v ? opt.color + '22' : '#161920', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                      <Icon size={24} color={singleValue === opt.v ? opt.color : '#475569'} />
                      <span style={{ fontSize: '0.65rem', color: singleValue === opt.v ? opt.color : '#94A3B8', fontWeight: 600 }}>{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 20, marginBottom: 24 }}>
              {DIMS.map(dim => {
                const val   = values[dim.key];
                const color = dimColor(val, dim.inverted);
                const [lo, hi] = dim.desc.split(' ← → ');
                return (
                  <div key={dim.key}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
                      <span style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 500 }}>
                        {dim.emoji} {dim.label}
                      </span>
                      <span style={{ color, fontWeight: 700, fontSize: '1rem', minWidth: 20, textAlign: 'right' }}>{val}</span>
                    </div>
                    {entryMode === 'emoji' ? (
                      <div style={{ display: 'flex', gap: 8 }}>
                        {WELLNESS_QUICK_SCALE.map(opt => {
                          const raw = wellnessRawValue(opt.v, dim.inverted);
                          const active = val === raw;
                          const Icon = QUICK_ICONS[opt.icon];
                          return (
                            <button key={opt.v} type="button" onClick={() => setValues(prev => ({ ...prev, [dim.key]: raw }))}
                              style={{ flex: 1, height: 44, borderRadius: 8, border: `1px solid ${active ? opt.color : '#2A2F3A'}`, backgroundColor: active ? opt.color + '22' : '#0D0F14', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Icon size={20} color={active ? opt.color : '#475569'} />
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <>
                        <input
                          type="range" min={1} max={10} step={1}
                          value={val}
                          onChange={e => setValues(prev => ({ ...prev, [dim.key]: Number(e.target.value) }))}
                          style={{ width: '100%', accentColor: color, cursor: 'pointer' }}
                        />
                        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
                          <span style={{ color: '#475569', fontSize: '0.68rem' }}>{lo?.trim()}</span>
                          <span style={{ color: '#475569', fontSize: '0.68rem' }}>{hi?.trim()}</span>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Score preview */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', backgroundColor: '#0D0F14', border: '1px solid #2A2F3A', borderRadius: 8, marginBottom: 20 }}>
            <span style={{ color: '#94A3B8', fontSize: '0.82rem' }}>Score bien-être estimé</span>
            <span style={{ color: scoreColor(score), fontWeight: 700, fontSize: '1.1rem' }}>{score}/10</span>
          </div>

          {/* Notes */}
          <div style={{ marginBottom: 24 }}>
            <label style={labelStyle}>Notes <span style={{ color: '#475569', fontWeight: 400 }}>(optionnel)</span></label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Douleur particulière, ressenti général…"
              rows={3}
              style={{ width: '100%', padding: '9px 12px', backgroundColor: '#0D0F14', border: '1px solid #2A2F3A', borderRadius: 8, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
          </div>

          {/* Error */}
          {status === 'error' && (
            <div style={{ padding: '10px 12px', backgroundColor: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 8, marginBottom: 16, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
              <AlertCircle size={16} style={{ color: '#EF4444', flexShrink: 0, marginTop: 1 }} />
              <span style={{ color: '#FCA5A5', fontSize: '0.82rem' }}>{errorMsg || 'Une erreur est survenue, réessaie.'}</span>
            </div>
          )}

          <button
            type="submit"
            disabled={status === 'submitting'}
            style={btnStyle('#00E5A0', '#0D0F14', status === 'submitting')}
          >
            <Send size={15} />
            {status === 'submitting' ? 'Envoi…' : 'Envoyer'}
          </button>
        </form>
      </div>
    </Page>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────────────

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

const labelStyle: React.CSSProperties = {
  display: 'block', color: '#94A3B8', fontSize: '0.78rem',
  fontWeight: 600, marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em',
};

function btnStyle(bg: string, color: string, disabled = false): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '11px 16px', backgroundColor: bg, color,
    border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9rem',
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
    transition: 'opacity 0.15s',
  };
}

const MONTHS = ['janv', 'févr', 'mars', 'avr', 'mai', 'juin', 'juil', 'août', 'sept', 'oct', 'nov', 'déc'];
function formatDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

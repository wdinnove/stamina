import { useState } from 'react';
import { X, AlertCircle, Trash2 } from 'lucide-react';
import { Modal } from './Modal';
import { matchesApi } from '../api/matches';
import type { Match } from '../data/types';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const DEFAULT_QUARTERS = [
  { us: '0', them: '0' },
  { us: '0', them: '0' },
  { us: '0', them: '0' },
  { us: '0', them: '0' },
];

type QuarterScoreForm = { us: string; them: string };

interface MatchFormValues {
  date: string;
  opponent: string;
  homeAway: 'home' | 'away';
  competition: string;
  result: 'win' | 'loss';
  scoreUs: string;
  scoreThem: string;
  gameNumber: string;
  quarterScores: QuarterScoreForm[];
}

function emptyForm(): MatchFormValues {
  return {
    date:          new Date().toLocaleDateString('sv'),
    opponent:      '',
    homeAway:      'home',
    competition:   'NF2',
    result:        'win',
    scoreUs:       '0',
    scoreThem:     '0',
    gameNumber:    '',
    quarterScores: DEFAULT_QUARTERS,
  };
}

function formFromMatch(m: Match): MatchFormValues {
  return {
    date:          m.date,
    opponent:      m.opponent,
    homeAway:      m.homeAway,
    competition:   m.competition,
    result:        m.result,
    scoreUs:       String(m.scoreUs),
    scoreThem:     String(m.scoreThem),
    gameNumber:    m.gameNumber ? String(m.gameNumber) : '',
    quarterScores: (m.quarterScores?.length ? m.quarterScores : DEFAULT_QUARTERS).map(q => ({ us: String(q.us), them: String(q.them) })),
  };
}

export interface MatchFormModalProps {
  /** Match à modifier, ou `null` pour créer un nouveau match. */
  match: Match | null;
  teamId: string;
  seasonId: string;
  onClose: () => void;
  onSaved: (match: Match) => void;
  /** Affiche le bouton supprimer (mode édition uniquement) — la confirmation reste à la charge de l'appelant. */
  onRequestDelete?: (match: Match) => void;
}

/** Modale unique de création/modification d'un match — partagée entre MatchesPage (création) et
 *  MatchDetailPage (modification) pour qu'elles restent toujours visuellement identiques. */
export function MatchFormModal({ match, teamId, seasonId, onClose, onSaved, onRequestDelete }: MatchFormModalProps) {
  const [form, setForm] = useState<MatchFormValues>(() => match ? formFromMatch(match) : emptyForm());
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.opponent.trim()) { setFormError('Adversaire requis.'); return; }
    if (form.scoreUs === '' || form.scoreThem === '') { setFormError('Score requis.'); return; }
    setSaving(true);
    setFormError('');
    try {
      const payload = {
        date:        form.date,
        opponent:    form.opponent.trim(),
        homeAway:    form.homeAway,
        competition: form.competition.trim() || 'NF2',
        result:      form.result,
        scoreUs:       parseInt(form.scoreUs),
        scoreThem:     parseInt(form.scoreThem),
        gameNumber:    form.gameNumber ? parseInt(form.gameNumber) : undefined,
        quarterScores: form.quarterScores.map(q => ({ us: parseInt(q.us) || 0, them: parseInt(q.them) || 0 })),
      };
      if (match) {
        await matchesApi.update(match.id, payload);
        onSaved({ ...match, ...payload });
      } else {
        const created = await matchesApi.create({ ...payload, teamId, seasonId });
        onSaved(created);
      }
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
      setSaving(false);
      return;
    }
    setSaving(false);
  }

  return (
    <Modal onClose={onClose} closeOnBackdropClick maxWidth={460} className="p-4 sm:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.05rem' }}>{match ? 'Modifier le match' : 'Nouveau match'}</h2>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
      </div>

      {formError && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
          <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Date *</label>
            <input type="date" required value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Journée</label>
            <input type="number" min={1} placeholder="J14…" value={form.gameNumber} onChange={e => setForm(f => ({ ...f, gameNumber: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Adversaire *</label>
          <input type="text" required placeholder="Nom de l'équipe adverse" value={form.opponent} onChange={e => setForm(f => ({ ...f, opponent: e.target.value }))} style={inputStyle} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Lieu</label>
            <select value={form.homeAway} onChange={e => setForm(f => ({ ...f, homeAway: e.target.value as 'home' | 'away' }))} style={inputStyle}>
              <option value="home">Domicile</option>
              <option value="away">Extérieur</option>
            </select>
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Compétition</label>
            <input type="text" placeholder="NF2" value={form.competition} onChange={e => setForm(f => ({ ...f, competition: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        <div>
          <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Résultat</label>
          <div style={{ display: 'flex', gap: 8 }}>
            {(['win', 'loss'] as const).map(r => (
              <button key={r} type="button" onClick={() => setForm(f => ({ ...f, result: r }))}
                style={{ flex: 1, padding: '8px', borderRadius: 6, border: '1px solid', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
                  borderColor:     form.result === r ? (r === 'win' ? '#00E5A0' : '#EF4444') : '#2A2F3A',
                  backgroundColor: form.result === r ? (r === 'win' ? 'rgba(0,229,160,0.12)' : 'rgba(239,68,68,0.12)') : '#1E2229',
                  color:           form.result === r ? (r === 'win' ? '#00E5A0' : '#EF4444') : '#94A3B8',
                }}>
                {r === 'win' ? 'Victoire' : 'Défaite'}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Score nous *</label>
            <input type="number" required min={0} placeholder="85" value={form.scoreUs} onChange={e => setForm(f => ({ ...f, scoreUs: e.target.value }))} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Score eux *</label>
            <input type="number" required min={0} placeholder="78" value={form.scoreThem} onChange={e => setForm(f => ({ ...f, scoreThem: e.target.value }))} style={inputStyle} />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem' }}>Scores par QT</label>
            <div style={{ display: 'flex', gap: 20, paddingRight: 24 }}>
              <span style={{ color: '#475569', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Nous</span>
              <span style={{ color: '#475569', fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Eux</span>
            </div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {form.quarterScores.map((qt, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ color: '#475569', fontSize: '0.75rem', width: 28, flexShrink: 0 }}>
                  {i < 4 ? `Q${i + 1}` : `P${i - 3}`}
                </span>
                <input type="number" min={0} value={qt.us}
                  onChange={e => setForm(f => { const qs = [...f.quarterScores]; qs[i] = { ...qs[i], us: e.target.value }; return { ...f, quarterScores: qs }; })}
                  style={{ ...inputStyle, textAlign: 'center', padding: '6px 4px' }} />
                <span style={{ color: '#475569', flexShrink: 0 }}>–</span>
                <input type="number" min={0} value={qt.them}
                  onChange={e => setForm(f => { const qs = [...f.quarterScores]; qs[i] = { ...qs[i], them: e.target.value }; return { ...f, quarterScores: qs }; })}
                  style={{ ...inputStyle, textAlign: 'center', padding: '6px 4px' }} />
                {i >= 4 && (
                  <button type="button"
                    onClick={() => setForm(f => ({ ...f, quarterScores: f.quarterScores.filter((_, j) => j !== i) }))}
                    style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                    <X size={13} />
                  </button>
                )}
              </div>
            ))}
            <button type="button"
              onClick={() => setForm(f => ({ ...f, quarterScores: [...f.quarterScores, { us: '0', them: '0' }] }))}
              style={{ padding: '5px', backgroundColor: '#1E2229', border: '1px dashed #2A2F3A', borderRadius: 6, color: '#475569', cursor: 'pointer', fontSize: '0.75rem', marginTop: 2 }}>
              + Prolongation
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          {match && onRequestDelete && (
            <button type="button" onClick={() => onRequestDelete(match)}
              style={{ padding: '10px 12px', backgroundColor: '#1E2229', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', flexShrink: 0 }}>
              <Trash2 size={14} />
            </button>
          )}
          <button type="button" onClick={onClose}
            style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
            Annuler
          </button>
          <button type="submit" disabled={saving}
            style={{ flex: 2, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
            {saving ? 'Sauvegarde…' : match ? 'Enregistrer' : 'Créer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

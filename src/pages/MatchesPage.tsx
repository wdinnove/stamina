import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus, X, AlertCircle, Trophy, Trash2 } from 'lucide-react';
import { matchesApi } from '../api/matches';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { Match } from '../data/types';

const MONTHS_FR  = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const DAYS_FULL  = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'];
const DAYS_ABBR  = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    dowFull:    DAYS_FULL[d.getDay()],
    dowAbbr:    DAYS_ABBR[d.getDay()],
    day:        d.getDate(),
    dayPad:     String(d.getDate()).padStart(2, '0'),
    monthFull:  MONTHS_FR[d.getMonth()],
    monthKey:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    monthLabel: `${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`,
  };
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const emptyForm = {
  date:        new Date().toLocaleDateString('sv'),
  opponent:    '',
  homeAway:    'home' as 'home' | 'away',
  competition: 'NF2',
  result:      'win' as 'win' | 'loss',
  scoreUs:     '',
  scoreThem:   '',
  gameNumber:  '',
};

export default function MatchesPage() {
  const { selected } = useTeamSeason();
  const navigate = useNavigate();

  const [matches,  setMatches]  = useState<Match[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editMatch, setEditMatch] = useState<Match | null>(null);
  const [form,      setForm]      = useState(emptyForm);
  const [saving,    setSaving]    = useState(false);
  const [formError, setFormError] = useState('');

  const [confirmDelete, setConfirmDelete] = useState<Match | null>(null);
  const [deleting,      setDeleting]      = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setError('');
    matchesApi
      .listBySeason(selected.team.id, selected.season.id)
      .then(setMatches)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, [selected?.team.id, selected?.season.id]);

  // Group by month
  const grouped: { monthLabel: string; matches: Match[] }[] = [];
  const seenMonths = new Set<string>();
  for (const m of matches) {
    const { monthKey, monthLabel } = fmtDate(m.date);
    if (!seenMonths.has(monthKey)) {
      seenMonths.add(monthKey);
      grouped.push({ monthLabel, matches: [] });
    }
    grouped[grouped.length - 1].matches.push(m);
  }

  function openAdd() {
    setEditMatch(null);
    setForm(emptyForm);
    setFormError('');
    setShowModal(true);
  }

  function openEdit(m: Match, e: React.MouseEvent) {
    e.stopPropagation();
    setEditMatch(m);
    setForm({
      date:        m.date,
      opponent:    m.opponent,
      homeAway:    m.homeAway,
      competition: m.competition,
      result:      m.result,
      scoreUs:     String(m.scoreUs),
      scoreThem:   String(m.scoreThem),
      gameNumber:  m.gameNumber ? String(m.gameNumber) : '',
    });
    setFormError('');
    setShowModal(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
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
        scoreUs:     parseInt(form.scoreUs),
        scoreThem:   parseInt(form.scoreThem),
        gameNumber:  form.gameNumber ? parseInt(form.gameNumber) : undefined,
      };
      if (editMatch) {
        await matchesApi.update(editMatch.id, payload);
        setMatches(prev => prev.map(m =>
          m.id === editMatch.id ? { ...m, ...payload } : m
        ));
      } else {
        const created = await matchesApi.create({
          ...payload,
          teamId:   selected.team.id,
          seasonId: selected.season.id,
        });
        setMatches(prev => [created, ...prev].sort((a, b) => b.date.localeCompare(a.date)));
      }
      setShowModal(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la sauvegarde.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await matchesApi.delete(confirmDelete.id);
      setMatches(prev => prev.filter(m => m.id !== confirmDelete.id));
      setConfirmDelete(null);
      setShowModal(false);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Matchs</h1>
        {selected && (
          <button
            onClick={openAdd}
            style={{ padding: '8px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <Plus size={15} /><span className="hidden sm:inline">Nouveau match</span>
          </button>
        )}
      </div>

      {error && (
        <div style={{ backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16, color: '#EF4444', fontSize: '0.82rem' }}>
          {error}
        </div>
      )}

      {!selected ? (
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sélectionnez une équipe et une saison.</p>
      ) : loading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
          <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      ) : matches.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#475569' }}>
          <Trophy size={36} style={{ marginBottom: 12, opacity: 0.3 }} />
          <p style={{ margin: 0, fontSize: '0.9rem' }}>Aucun match enregistré pour cette saison.</p>
        </div>
      ) : (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflow: 'hidden' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>J</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adversaire</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lieu</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</th>
                <th style={{ padding: '10px 20px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                <React.Fragment key={group.monthLabel}>
                  <tr>
                    <td colSpan={6} style={{ padding: '8px 20px', backgroundColor: '#0D0F14', borderBottom: '1px solid #1E2229', borderTop: '1px solid #2A2F3A', verticalAlign: 'middle' }}>
                      <span style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{group.monthLabel}</span>
                    </td>
                  </tr>
                  {group.matches.map((match, idx) => {
                    const { dowAbbr, dayPad, monthFull } = fmtDate(match.date);
                    const isWin  = match.result === 'win';
                    const isLast = idx === group.matches.length - 1;
                    return (
                      <tr
                        key={match.id}
                        onClick={() => navigate(`/matches/${match.id}`)}
                        style={{ borderBottom: isLast ? 'none' : '1px solid #1E2229', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.backgroundColor = '#1A1E26'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
                      >
                        <td style={{ padding: '12px 20px', whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 600 }}>{dowAbbr} </span>
                          <span style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700 }}>{dayPad} </span>
                          <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>{monthFull}</span>
                        </td>
                        <td style={{ padding: '12px 20px', color: '#475569', fontSize: '0.82rem' }}>
                          {match.gameNumber ? `J${match.gameNumber}` : '—'}
                        </td>
                        <td style={{ padding: '12px 20px', color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem' }}>
                          {match.opponent}
                        </td>
                        <td style={{ padding: '12px 20px' }}>
                          <span style={{
                            fontSize: '0.71rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                            color:           match.homeAway === 'home' ? '#3B82F6' : '#A855F7',
                            backgroundColor: match.homeAway === 'home' ? '#3B82F622' : '#A855F722',
                          }}>
                            {match.homeAway === 'home' ? 'DOM' : 'EXT'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 20px', whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.88rem', color: isWin ? '#00E5A0' : '#EF4444' }}>
                            {match.scoreUs} – {match.scoreThem}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px 12px 20px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                            <span style={{
                              fontSize: '0.71rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                              color:           isWin ? '#00E5A0' : '#EF4444',
                              backgroundColor: isWin ? 'rgba(0,229,160,0.12)' : 'rgba(239,68,68,0.12)',
                            }}>
                              {isWin ? 'Victoire' : 'Défaite'}
                            </span>
                            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M5 3l4 4-4 4" stroke="#334155" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal add/edit */}
      {showModal && (
        <div
          style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 460, padding: '24px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.05rem' }}>
                {editMatch ? 'Modifier le match' : 'Nouveau match'}
              </h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="grid grid-cols-2" style={{ gap: 10 }}>
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

              <div className="grid grid-cols-2" style={{ gap: 10 }}>
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
                    <button key={r} type="button"
                      onClick={() => setForm(f => ({ ...f, result: r }))}
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

              <div className="grid grid-cols-2" style={{ gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Score nous *</label>
                  <input type="number" required min={0} placeholder="85" value={form.scoreUs} onChange={e => setForm(f => ({ ...f, scoreUs: e.target.value }))} style={inputStyle} />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Score eux *</label>
                  <input type="number" required min={0} placeholder="78" value={form.scoreThem} onChange={e => setForm(f => ({ ...f, scoreThem: e.target.value }))} style={inputStyle} />
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                {editMatch && (
                  <button type="button" onClick={() => { setConfirmDelete(editMatch); }}
                    style={{ padding: '10px', backgroundColor: '#1E2229', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
                    <Trash2 size={14} />
                  </button>
                )}
                <button type="button" onClick={() => setShowModal(false)}
                  style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving}
                  style={{ flex: 2, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Sauvegarde…' : editMatch ? 'Enregistrer' : 'Créer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.8)', zIndex: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 360, padding: '24px' }}>
            <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Supprimer ce match ?</h3>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 20px' }}>
              {confirmDelete.opponent} — {confirmDelete.date}<br />
              <span style={{ color: '#EF4444', fontSize: '0.78rem' }}>Les statistiques associées seront aussi supprimées.</span>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleting}
                style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

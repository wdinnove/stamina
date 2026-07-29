import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Plus } from 'lucide-react';
import { matchesApi } from '../api/matches';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { Modal, DropzoneEmptyState, MatchFormModal, EmptyState } from '../components';
import { MONTHS_FULL, DAYS_FULL, DAYS_ABBR3 } from '../utils/dateFormat';
import type { Match } from '../data/types';
import { notify } from '../api/notifications';

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00');
  return {
    dowFull:    DAYS_FULL[d.getDay()],
    dowAbbr:    DAYS_ABBR3[d.getDay()],
    day:        d.getDate(),
    dayPad:     String(d.getDate()).padStart(2, '0'),
    monthFull:  MONTHS_FULL[d.getMonth()],
    monthKey:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    monthLabel: `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`,
  };
}

export default function MatchesPage() {
  const { selected, canEditTeamData } = useTeamSeason();
  const navigate = useNavigate();

  const [matches,  setMatches]  = useState<Match[]>([]);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const [showModal, setShowModal] = useState(false);
  const [editMatch, setEditMatch] = useState<Match | null>(null);

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
    setShowModal(true);
  }

  function openEdit(m: Match, e: React.MouseEvent) {
    e.stopPropagation();
    setEditMatch(m);
    setShowModal(true);
  }

  function handleSaved(saved: Match) {
    const isNew = !matches.some(m => m.id === saved.id);
    setMatches(prev => {
      const exists = prev.some(m => m.id === saved.id);
      const next = exists ? prev.map(m => m.id === saved.id ? saved : m) : [saved, ...prev];
      return next.sort((a, b) => b.date.localeCompare(a.date));
    });
    if (isNew) {
      notify(selected?.team.id, 'match_added', `Match planifié — vs ${saved.opponent}`, { body: saved.date, entityType: 'match', entityId: saved.id });
    }
    setShowModal(false);
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
      setError(err instanceof Error ? err.message : 'Erreur lors de la suppression.');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Matchs</h1>
        {selected && canEditTeamData && (
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
        canEditTeamData ? (
          <DropzoneEmptyState label="Cliquer pour ajouter un match" onClick={openAdd} />
        ) : (
          <EmptyState message="Aucun match. Seuls les rôles Admin et Éditeur peuvent en créer." size="lg" />
        )
      ) : (
        <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, overflowX: 'auto' }}>
          <table className="matches-table sm:min-w-[420px]" style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th className="px-3 sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Adversaire</th>
                <th className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>J</th>
                <th className="px-3 sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Date</th>
                <th className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Lieu</th>
                <th className="px-3 sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Score</th>
                <th className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 10, paddingBottom: 10, textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Résultat</th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(group => (
                <React.Fragment key={group.monthLabel}>
                  <tr>
                    <td colSpan={6} className="px-3 sm:px-5" style={{ paddingTop: 8, paddingBottom: 8, backgroundColor: '#0D0F14', borderBottom: '1px solid #1E2229', borderTop: '1px solid #2A2F3A', verticalAlign: 'middle' }}>
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
                        <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem' }}>
                          {match.opponent}
                        </td>
                        <td className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, color: '#475569', fontSize: '0.82rem' }}>
                          {match.gameNumber ? `J${match.gameNumber}` : '—'}
                        </td>
                        <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, whiteSpace: 'nowrap' }}>
                          <span style={{ color: '#475569', fontSize: '0.78rem', fontWeight: 600 }}>{dowAbbr} </span>
                          <span style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 700 }}>{dayPad} </span>
                          <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>{monthFull}</span>
                        </td>
                        <td className="hidden sm:table-cell sm:px-5" style={{ paddingTop: 12, paddingBottom: 12 }}>
                          <span style={{
                            fontSize: '0.71rem', fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                            color:           match.homeAway === 'home' ? '#3B82F6' : '#A855F7',
                            backgroundColor: match.homeAway === 'home' ? '#3B82F622' : '#A855F722',
                          }}>
                            {match.homeAway === 'home' ? 'DOM' : 'EXT'}
                          </span>
                        </td>
                        <td className="px-3 sm:px-5" style={{ paddingTop: 12, paddingBottom: 12, whiteSpace: 'nowrap' }}>
                          <span style={{ fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, fontSize: '0.88rem', color: isWin ? '#00E5A0' : '#EF4444' }}>
                            {match.scoreUs} – {match.scoreThem}
                          </span>
                        </td>
                        <td className="hidden sm:table-cell sm:pl-5 sm:pr-4" style={{ paddingTop: 12, paddingBottom: 12 }}>
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
      {showModal && selected && (
        <MatchFormModal
          match={editMatch}
          teamId={selected.team.id}
          seasonId={selected.season.id}
          onClose={() => setShowModal(false)}
          onSaved={handleSaved}
          onRequestDelete={m => setConfirmDelete(m)}
        />
      )}

      {/* Confirm delete */}
      {confirmDelete && (
        <Modal maxWidth={360} overlayOpacity={0.8} zIndex={110} scrollOverlay={false} style={{ padding: '24px' }}>
            <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Supprimer ce match ?</h3>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 20px' }}>
              {confirmDelete.opponent} — {confirmDelete.date}<br />
              <span style={{ color: '#EF4444', fontSize: '0.78rem' }}>Les statistiques associées seront aussi supprimées.</span>
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleDelete} disabled={deleting} className="btn-danger"
                style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#fff', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {deleting ? 'Suppression…' : 'Supprimer'}
              </button>
            </div>
        </Modal>
      )}
    </div>
  );
}

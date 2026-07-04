import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Search, UserPlus, UserMinus, X, Check } from 'lucide-react';
import { supabase } from '../api/client';
import { playersApi } from '../api/players';
import { StatusBadge, PlayerAvatar, EmptyState } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { notifyOrg } from '../api/notifications';
import type { Player } from '../data/types';

function toPlayer(row: Record<string, unknown>): Player {
  return {
    id:                row.id                 as string,
    firstName:         row.first_name         as string,
    lastName:          row.last_name          as string,
    number:            row.number             as number,
    position:          row.position           as Player['position'],
    secondaryPosition: row.secondary_position as Player['position'] | undefined,
    organizationId:    row.organization_id    as string,
    status:            row.status             as Player['status'],
    nationality:       row.nationality        as string,
    birthDate:         row.birth_date         as string,
    height:            row.height_cm          as number | undefined,
    weight:            row.weight_kg          as number | undefined,
    hand:              row.hand               as Player['hand'],
    contractEnd:       row.contract_end       as string | undefined,
  };
}

async function fetchRosterPlayers(seasonId: string): Promise<Player[]> {
  const { data, error } = await supabase
    .from('player_season')
    .select('players(*)')
    .eq('season_id', seasonId);
  if (error) throw error;
  return (data ?? [])
    .map((row) => {
      const p = row.players as Record<string, unknown> | null;
      return p ? toPlayer(p) : null;
    })
    .filter((p): p is Player => p !== null)
    .sort((a, b) => a.lastName.localeCompare(b.lastName, 'fr'));
}

// ─── Add-to-roster modal ───────────────────────────────────────────────────

interface AddModalProps {
  seasonId: string;
  teamName: string;
  seasonLabel: string;
  rosterIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}

function AddModal({ seasonId, teamName, seasonLabel, rosterIds, onClose, onSaved }: AddModalProps) {
  const [allPlayers, setAllPlayers]   = useState<Player[]>([]);
  const [loading, setLoading]         = useState(true);
  const [saving, setSaving]           = useState(false);
  const [error, setError]             = useState('');
  const [search, setSearch]           = useState('');
  const [selected, setSelected]       = useState<Set<string>>(new Set());
  const overlayRef                    = useRef<HTMLDivElement>(null);

  useEffect(() => {
    playersApi.list()
      .then(players => setAllPlayers(players.filter(p => !rosterIds.has(p.id))))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const filtered = allPlayers.filter(p => {
    const q = search.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q) ||
      String(p.number).includes(q)
    );
  });

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) return;
    setSaving(true);
    setError('');
    try {
      const rows = Array.from(selected).map(playerId => ({
        player_id: playerId,
        season_id: seasonId,
      }));
      const { error: err } = await supabase
        .from('player_season')
        .insert(rows);
      if (err) throw err;
      onSaved();
      const names = allPlayers.filter(p => selected.has(p.id)).map(p => `${p.firstName} ${p.lastName}`).join(', ');
      notifyOrg('player_added', `${selected.size} joueur${selected.size > 1 ? 's' : ''} ajouté${selected.size > 1 ? 's' : ''} au roster`, names || undefined, 'player');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSaving(false);
    }
  }

  return (
    <div
      ref={overlayRef}
      onClick={e => { if (e.target === overlayRef.current) onClose(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        backgroundColor: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
      }}
    >
      <div style={{
        backgroundColor: '#161920', border: '1px solid #2A2F3A',
        borderRadius: 12, width: '100%', maxWidth: 520,
        maxHeight: '80vh', display: 'flex', flexDirection: 'column',
        boxShadow: '0 24px 60px rgba(0,0,0,0.6)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '18px 20px', borderBottom: '1px solid #1E2229',
        }}>
          <div>
            <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem' }}>
              Ajouter au roster
            </div>
            <div style={{ color: '#475569', fontSize: '0.78rem', marginTop: 2 }}>
              {teamName} · {seasonLabel}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4, display: 'flex' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Search */}
        <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #1E2229' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
            <input
              autoFocus
              type="text"
              placeholder="Rechercher un joueur…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
                backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 7,
                color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
              }}
            />
          </div>
          {selected.size > 0 && (
            <div style={{ color: '#00E5A0', fontSize: '0.75rem', marginTop: 8, fontWeight: 600 }}>
              {selected.size} joueur{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
            </div>
          )}
        </div>

        {/* List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {loading && (
            <div style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '32px 0' }}>
              Chargement…
            </div>
          )}
          {!loading && filtered.length === 0 && (
            <div style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '32px 0' }}>
              {allPlayers.length === 0
                ? 'Toutes les joueurs sont déjà dans le roster.'
                : 'Aucun résultat.'}
            </div>
          )}
          {!loading && filtered.map(player => {
            const isSelected = selected.has(player.id);
            return (
              <button
                key={player.id}
                onClick={() => toggle(player.id)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  width: '100%', padding: '10px 10px', marginBottom: 2,
                  background: isSelected ? 'rgba(0,229,160,0.08)' : 'none',
                  border: `1px solid ${isSelected ? 'rgba(0,229,160,0.25)' : 'transparent'}`,
                  borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s',
                }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#1E2229'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
              >
                {/* Checkbox */}
                <div style={{
                  width: 20, height: 20, borderRadius: 5, flexShrink: 0,
                  border: `2px solid ${isSelected ? '#00E5A0' : '#2A2F3A'}`,
                  backgroundColor: isSelected ? '#00E5A0' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.12s',
                }}>
                  {isSelected && <Check size={12} color="#0a0e14" strokeWidth={3} />}
                </div>

                {/* Number */}
                <span style={{
                  width: 28, height: 28, borderRadius: 5, flexShrink: 0,
                  backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#64748B', fontSize: '0.75rem', fontWeight: 700,
                }}>
                  {player.number}
                </span>

                {/* Name + position */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 600 }}>
                    {player.lastName.toUpperCase()}{' '}
                    <span style={{ color: '#94A3B8', fontWeight: 400 }}>{player.firstName}</span>
                  </div>
                  <div style={{ color: '#475569', fontSize: '0.75rem' }}>{player.position}</div>
                </div>

                {/* Status */}
                <StatusBadge status={player.status} size="sm" />
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px', borderTop: '1px solid #1E2229', gap: 10,
        }}>
          {error && <span style={{ color: '#EF4444', fontSize: '0.78rem', flex: 1 }}>{error}</span>}
          {!error && <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={onClose}
              style={{
                padding: '8px 16px', borderRadius: 7, border: '1px solid #2A2F3A',
                background: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem',
              }}
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              disabled={selected.size === 0 || saving}
              style={{
                padding: '8px 18px', borderRadius: 7, border: 'none',
                backgroundColor: selected.size === 0 || saving ? '#1E2229' : '#00E5A0',
                color: selected.size === 0 || saving ? '#475569' : '#0a0e14',
                cursor: selected.size === 0 || saving ? 'not-allowed' : 'pointer',
                fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.15s',
              }}
            >
              {saving ? 'Enregistrement…' : `Ajouter${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ─────────────────────────────────────────────────────────────

export default function RosterPage() {
  const navigate = useNavigate();
  const { selected, loading: ctxLoading, orgRole } = useTeamSeason();
  const [players, setPlayers]     = useState<Player[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [showUnlinkModal, setShowUnlinkModal] = useState(false);
  const [unlinkSelected, setUnlinkSelected]   = useState<Set<string>>(new Set());
  const [unlinking, setUnlinking]             = useState(false);
  const [unlinkError, setUnlinkError]         = useState('');

  function loadRoster(seasonId: string) {
    setLoading(true);
    setPlayers([]);
    setError('');
    fetchRosterPlayers(seasonId)
      .then(setPlayers)
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!selected) return;
    loadRoster(selected.season.id);
  }, [selected?.season.id]);

  const filtered = players.filter(p => {
    const q = search.toLowerCase();
    const nameMatch = (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q) ||
      String(p.number).includes(q)
    );
    const statusMatch = statusFilter === 'all' || p.status === statusFilter;
    return nameMatch && statusMatch;
  });

  const rosterIds = new Set(players.map(p => p.id));

  const handleUnlinkConfirm = async () => {
    if (!selected || unlinkSelected.size === 0) return;
    setUnlinking(true);
    setUnlinkError('');
    try {
      await Promise.all(
        Array.from(unlinkSelected).map(pid => playersApi.unlinkFromSeason(pid, selected.season.id))
      );
      setShowUnlinkModal(false);
      setUnlinkSelected(new Set());
      loadRoster(selected.season.id);
    } catch (err: unknown) {
      setUnlinkError(err instanceof Error ? err.message : 'Erreur lors de la déliaison.');
    } finally {
      setUnlinking(false);
    }
  };

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Effectif</h1>
        {selected && (
          <div style={{ display: 'flex', gap: 8 }}>
            {orgRole === 'admin' && players.length > 0 && (
              <button
                onClick={() => { setUnlinkSelected(new Set()); setUnlinkError(''); setShowUnlinkModal(true); }}
                style={{ padding: '8px 14px', backgroundColor: '#1E2229', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, color: '#EF4444', cursor: 'pointer', fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}
              >
                <UserMinus size={16} /><span className="hidden md:inline">Délier du roster</span>
              </button>
            )}
            <button
              onClick={() => setShowModal(true)}
              style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <UserPlus size={16} /><span className="hidden md:inline">Ajouter au roster</span>
            </button>
          </div>
        )}
      </div>

      {/* No team selected */}
      {!ctxLoading && !selected && (
        <EmptyState message="Sélectionnez une équipe et une saison dans la barre du haut." size="lg" />
      )}

      {selected && (
        <>
          {/* Filtres */}
          <div className="flex flex-col md:flex-row" style={{ gap: 10, marginBottom: 20 }}>
            <div style={{ position: 'relative', flex: 1 }}>
              <Search size={15} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
              <input
                placeholder="Rechercher un joueur…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                style={{ width: '100%', padding: '8px 10px 8px 32px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}
              />
            </div>
            <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
              className="w-full md:w-auto"
              style={{ padding: '8px 12px', backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }}>
              <option value="all">Tous statuts</option>
              <option value="active">Actif</option>
              <option value="injured">Blessé</option>
              <option value="limited">Limité</option>
              <option value="unavailable">Indisponible</option>
            </select>
          </div>

          {/* Error */}
          {error && (
            <div style={{ color: '#EF4444', fontSize: '0.85rem', marginBottom: 16 }}>{error}</div>
          )}

          {/* Loading */}
          {loading && (
            <div style={{ color: '#475569', fontSize: '0.85rem', padding: '40px 0', textAlign: 'center' }}>
              Chargement…
            </div>
          )}

          {/* Empty */}
          {!loading && !error && filtered.length === 0 && (
            <EmptyState
              message={search || statusFilter !== 'all' ? 'Aucun résultat.' : 'Aucun joueur dans le roster pour cette saison.'}
              size="lg"
            />
          )}

          {/* Cards */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {filtered.map(player => (
                <div key={player.id} onClick={() => navigate(`/individual-analyze/${player.id}`)}
                  style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#00E5A066')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A2F3A')}>
                  <PlayerAvatar player={player} size={48} />
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem', margin: 0 }}>{player.lastName}</p>
                    <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '2px 0' }}>{player.firstName}</p>
                    <p style={{ color: '#475569', fontSize: '0.72rem', margin: 0 }}>#{player.number} · {player.position.split(' ')[0]}</p>
                  </div>
                  <StatusBadge status={player.status} size="sm" />
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Add modal */}
      {showModal && selected && (
        <AddModal
          seasonId={selected.season.id}
          teamName={selected.team.name}
          seasonLabel={selected.season.label}
          rosterIds={rosterIds}
          onClose={() => setShowModal(false)}
          onSaved={() => {
            setShowModal(false);
            loadRoster(selected.season.id);
          }}
        />
      )}

      {/* Unlink modal */}
      {showUnlinkModal && selected && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 12, width: '100%', maxWidth: 480, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #1E2229' }}>
              <div>
                <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem' }}>Délier du roster</div>
                <div style={{ color: '#475569', fontSize: '0.78rem', marginTop: 2 }}>{selected.team.name} · {selected.season.label}</div>
              </div>
              <button onClick={() => setShowUnlinkModal(false)} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4 }}>
                <X size={18} />
              </button>
            </div>

            {/* Player list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
              {players.map(p => {
                const checked = unlinkSelected.has(p.id);
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setUnlinkSelected(prev => {
                      const next = new Set(prev);
                      next.has(p.id) ? next.delete(p.id) : next.add(p.id);
                      return next;
                    })}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 12, padding: '10px 8px', borderRadius: 7, border: 'none', backgroundColor: checked ? 'rgba(239,68,68,0.1)' : 'transparent', cursor: 'pointer', textAlign: 'left', transition: 'background-color 0.12s' }}
                  >
                    <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${checked ? '#EF4444' : '#2A2F3A'}`, backgroundColor: checked ? '#EF4444' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                      {checked && <Check size={11} color="#fff" />}
                    </div>
                    <PlayerAvatar player={p} size={28} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.88rem' }}>{p.firstName} {p.lastName}</span>
                      <span style={{ color: '#475569', fontSize: '0.78rem', marginLeft: 8 }}>#{p.number} · {p.position}</span>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Footer */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid #1E2229' }}>
              {unlinkError && (
                <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '0 0 10px' }}>{unlinkError}</p>
              )}
              {unlinkSelected.size > 0 && (
                <p style={{ color: '#94A3B8', fontSize: '0.78rem', margin: '0 0 10px' }}>
                  {unlinkSelected.size} joueur{unlinkSelected.size > 1 ? 's' : ''} sélectionné{unlinkSelected.size > 1 ? 's' : ''} — son profil et ses stats ne sont pas supprimés.
                </p>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setShowUnlinkModal(false)} style={{ flex: 1, padding: '9px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem' }}>
                  Annuler
                </button>
                <button
                  onClick={handleUnlinkConfirm}
                  disabled={unlinkSelected.size === 0 || unlinking}
                  style={{ flex: 1, padding: '9px', backgroundColor: unlinkSelected.size === 0 || unlinking ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: unlinkSelected.size === 0 || unlinking ? '#475569' : '#fff', cursor: unlinkSelected.size === 0 || unlinking ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
                >
                  {unlinking ? 'Déliaison…' : `Délier${unlinkSelected.size > 0 ? ` (${unlinkSelected.size})` : ''}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

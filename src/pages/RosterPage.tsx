import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router';
import { Search, UserPlus, X, Check } from 'lucide-react';
import { supabase } from '../api/client';
import { playersApi } from '../api/players';
import { StatusBadge, PlayerAvatar } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
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
              placeholder="Rechercher une joueur…"
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
  const { selected, loading: ctxLoading } = useTeamSeason();
  const [players, setPlayers]     = useState<Player[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showModal, setShowModal] = useState(false);

  function loadRoster(seasonId: string) {
    setLoading(true);
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

  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Effectif</h1>
        {selected && (
          <button
            onClick={() => setShowModal(true)}
            style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.88rem', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <UserPlus size={16} /><span className="hidden md:inline">Ajouter au roster</span>
          </button>
        )}
      </div>

      {/* No team selected */}
      {!ctxLoading && !selected && (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: '#475569', fontSize: '0.9rem' }}>
          Sélectionnez une équipe et une saison dans la barre du haut.
        </div>
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
            <p style={{ color: '#475569', textAlign: 'center', padding: '40px 0', margin: 0 }}>
              {search || statusFilter !== 'all' ? 'Aucun résultat.' : 'Aucun joueur dans le roster pour cette saison.'}
            </p>
          )}

          {/* Cards */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {filtered.map(player => (
                <div key={player.id} onClick={() => navigate(`/players/${player.id}`, { state: { from: '/roster' } })}
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

      {/* Modal */}
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
    </div>
  );
}

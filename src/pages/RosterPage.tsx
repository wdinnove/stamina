import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Search } from 'lucide-react';
import { playersApi } from '../api/players';
import { StatusBadge, PlayerAvatar, EmptyState } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { playerNameFull } from '../utils/playerName';
import type { Player } from '../data/types';

export default function RosterPage() {
  const navigate = useNavigate();
  const { selected, loading: ctxLoading } = useTeamSeason();
  const [players, setPlayers]     = useState<Player[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  function loadRoster(seasonId: string) {
    setLoading(true);
    setPlayers([]);
    setError('');
    playersApi.listBySeason(seasonId)
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

  return (
    <div className="p-4 md:p-6">
      {/* Header */}
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Effectif</h1>
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
              message={search || statusFilter !== 'all' ? 'Aucun résultat.' : 'Aucun joueur dans l\'effectif pour cette saison.'}
              size="lg"
            />
          )}

          {/* Cards */}
          {!loading && filtered.length > 0 && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(160px, 1fr))', gap: 12 }}>
              {filtered.map(player => (
                <div key={player.id} onClick={() => navigate(`/performance-individuelle/${player.id}/vue-ensemble`)}
                  style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: '16px 12px', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, transition: 'border-color 0.15s' }}
                  onMouseEnter={e => (e.currentTarget.style.borderColor = '#00E5A066')}
                  onMouseLeave={e => (e.currentTarget.style.borderColor = '#2A2F3A')}>
                  <PlayerAvatar player={player} size={48} />
                  <div style={{ textAlign: 'center' }}>
                    <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.82rem', margin: 0 }}>{playerNameFull(player)}</p>
                    <p style={{ color: '#475569', fontSize: '0.72rem', margin: 0 }}>#{player.number} · {player.position.split(' ')[0]}</p>
                  </div>
                  <StatusBadge status={player.status} size="sm" />
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

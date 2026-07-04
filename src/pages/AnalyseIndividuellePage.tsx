import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { playersApi } from '../api/players';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { PlayerProfile } from './PlayersPage';
import type { Player } from '../data/types';

export default function AnalyseIndividuellePage() {
  const { id }       = useParams<{ id?: string }>();
  const navigate     = useNavigate();
  const { selected } = useTeamSeason();

  const [players, setPlayers] = useState<Player[]>([]);

  useEffect(() => {
    if (!selected) return;
    playersApi.listBySeason(selected.season.id).then(list => {
      const sorted = [...list].sort((a, b) => a.lastName.localeCompare(b.lastName));
      setPlayers(sorted);
      if (!id && sorted.length > 0) {
        navigate(`/individual-analyze/${sorted[0].id}`, { replace: true });
      }
    });
  }, [selected?.season.id]);

  const playerSelect = (
    <select
      value={id ?? ''}
      onChange={e => navigate(`/individual-analyze/${e.target.value}`)}
      style={{ padding: '6px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', minWidth: 180 }}
    >
      {players.map(p => (
        <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
      ))}
    </select>
  );

  if (!id) return null;

  return <PlayerProfile playerId={id} hideBackButton playerSelect={playerSelect} />;
}

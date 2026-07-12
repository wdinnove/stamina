import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { playersApi } from '../api/players';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { PlayerSelect } from '../components';
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
    <PlayerSelect players={players} value={id ?? ''} onChange={pid => navigate(`/individual-analyze/${pid}`)} />
  );

  if (!id) return null;

  return <PlayerProfile playerId={id} hideBackButton playerSelect={playerSelect} />;
}

import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { ConfigCard } from './ConfigCard';
import { NotificationChannelMatrix, emailUnsupported } from './NotificationChannelMatrix';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import {
  fetchTeamSettings,
  saveTeamSetting,
  type TeamNotificationSettings,
  type ChannelSettings,
} from '../api/notificationSettings';


/** Réglages d'équipe : quelles catégories sont actives et sur quels canaux. */
export function TeamNotificationsTab() {
  const { selected } = useTeamSeason();
  const teamId = selected?.team.id;

  const [settings, setSettings] = useState<TeamNotificationSettings | null>(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  useEffect(() => {
    if (!teamId) return;
    setSettings(null);
    setError('');
    fetchTeamSettings(teamId)
      .then(setSettings)
      .catch(err => setError(err instanceof Error ? err.message : 'Erreur de chargement'));
  }, [teamId]);

  async function toggle(category: string, channel: keyof ChannelSettings) {
    if (!teamId || !settings) return;
    const next = { ...settings[category], [channel]: !settings[category][channel] };
    setSettings({ ...settings, [category]: next });
    setSavingKey(`${category}:${channel}`);
    setError('');
    try {
      await saveTeamSetting(teamId, category, next);
    } catch (err) {
      setSettings(settings);
      setError(err instanceof Error ? err.message : 'Erreur d\'enregistrement');
    } finally {
      setSavingKey(null);
    }
  }

  if (!teamId) {
    return <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sélectionnez une équipe dans la barre du haut.</p>;
  }

  return (
    <ConfigCard
      icon={<Bell size={14} color="#00E5A0" />}
      title="Notifications de l'équipe"
      description="Ce que l'équipe autorise à envoyer. Chaque membre peut ensuite affiner ce qu'il reçoit depuis sa page « Mes notifications », mais il ne pourra pas réactiver un canal coupé ici. L'email n'est proposé que sur les catégories qui en envoient.">
      {error && <p style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: 0 }}>{error}</p>}
      {!settings ? (
        <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>
      ) : (
        <NotificationChannelMatrix
          channels={['inApp', 'push', 'email']}
          cell={(category, channel) => ({
            on: settings[category][channel],
            disabled: (channel === 'email' && emailUnsupported(category)) || savingKey === `${category}:${channel}`,
            reason: channel === 'email' && emailUnsupported(category)
              ? 'Aucune notification de cette catégorie ne part par email' : undefined,
          })}
          onToggle={(category, channel) => toggle(category, channel)}
        />
      )}
    </ConfigCard>
  );
}

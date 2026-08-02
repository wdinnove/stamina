import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { ConfigCard } from './ConfigCard';
import { ChannelToggle } from './ChannelToggle';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import {
  fetchTeamSettings,
  saveTeamSetting,
  type TeamNotificationSettings,
  type ChannelSettings,
} from '../api/notificationSettings';
import {
  NOTIFICATION_CATEGORIES,
  typesInCategory,
  categorySupportsEmail,
} from '../../shared/notifications.js';

const thStyle: React.CSSProperties = {
  padding: '8px 10px', color: '#94A3B8', fontSize: '0.7rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

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
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 460 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th style={{ ...thStyle, textAlign: 'left' }}>Catégorie</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Dans l'app</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Push</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>Email</th>
              </tr>
            </thead>
            <tbody>
              {NOTIFICATION_CATEGORIES.map(cat => {
                const channels = settings[cat.key];
                const emailAllowed = categorySupportsEmail(cat.key);
                return (
                  <tr key={cat.key} style={{ borderBottom: '1px solid #1A1F27' }}>
                    <td style={{ padding: '10px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: cat.color, flexShrink: 0 }} />
                        <span style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 500 }}>{cat.label}</span>
                      </div>
                      <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0 16px' }}>
                        {typesInCategory(cat.key).map(t => t.label).join(' · ')}
                      </p>
                    </td>
                    {(['inApp', 'push', 'email'] as const).map(channel => (
                      <td key={channel} style={{ padding: '10px', textAlign: 'center' }}>
                        <div style={{ display: 'flex', justifyContent: 'center' }}>
                          <ChannelToggle
                            on={channels[channel]}
                            disabled={(channel === 'email' && !emailAllowed) || savingKey === `${cat.key}:${channel}`}
                            title={channel === 'email' && !emailAllowed ? 'Aucune notification de cette catégorie ne part par email' : undefined}
                            onClick={() => toggle(cat.key, channel)}
                          />
                        </div>
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ConfigCard>
  );
}

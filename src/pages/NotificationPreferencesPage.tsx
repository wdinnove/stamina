import { useState, useEffect } from 'react';
import { Link } from 'react-router';
import { Bell, CheckCircle, AlertCircle } from 'lucide-react';
import { Card, CardTitle, Breadcrumb } from '../components';
import { NotificationChannelMatrix } from '../components/NotificationChannelMatrix';
import { isPushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from '../api';
import {
  fetchUserPreferences,
  fetchTeamSettings,
  saveUserPreference,
  type UserNotificationPreferences,
  type TeamNotificationSettings,
} from '../api/notificationSettings';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { categorySupportsEmail } from '../../shared/notifications.js';

/** Page « Mes notifications » : chaque utilisateur choisit ce qu'il reçoit. */
export default function NotificationPreferencesPage() {
  const { selected } = useTeamSeason();
  const teamId = selected?.team.id;

  const [prefs, setPrefs] = useState<UserNotificationPreferences | null>(null);
  const [teamSettings, setTeamSettings] = useState<TeamNotificationSettings | null>(null);
  const [error, setError] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);

  const [pushSupported, setPushSupported] = useState(true);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [pushErr, setPushErr] = useState('');

  useEffect(() => {
    if (!isPushSupported()) { setPushSupported(false); setPushLoading(false); return; }
    getExistingSubscription().then(sub => { setPushSubscribed(!!sub); setPushLoading(false); });
  }, []);

  useEffect(() => {
    setError('');
    fetchUserPreferences()
      .then(setPrefs)
      .catch(err => setError(err instanceof Error ? err.message : 'Erreur de chargement'));
  }, []);

  useEffect(() => {
    if (!teamId) { setTeamSettings(null); return; }
    fetchTeamSettings(teamId).then(setTeamSettings).catch(() => setTeamSettings(null));
  }, [teamId]);

  async function handleTogglePush() {
    setPushBusy(true);
    setPushErr('');
    setPushMsg('');
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        setPushMsg('Notifications désactivées sur cet appareil.');
      } else {
        await subscribeToPush();
        setPushSubscribed(true);
        setPushMsg('Notifications activées sur cet appareil.');
      }
    } catch (err: unknown) {
      setPushErr(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setPushBusy(false);
    }
  }

  async function toggle(category: string, channel: 'push' | 'email') {
    if (!prefs) return;
    const next = { ...prefs[category], [channel]: !prefs[category][channel] };
    setPrefs({ ...prefs, [category]: next });
    setSavingKey(`${category}:${channel}`);
    setError('');
    try {
      await saveUserPreference(category, next);
    } catch (err) {
      setPrefs(prefs);
      setError(err instanceof Error ? err.message : 'Erreur d\'enregistrement');
    } finally {
      setSavingKey(null);
    }
  }

  return (
    <div className="p-4 md:p-6">
      <Breadcrumb items={[{ label: 'Mon profil', path: '/profil' }]} />
      <h1 style={{ color: '#F1F5F9', margin: '8px 0 20px' }}>Mes notifications</h1>

      <Card style={{ padding: '20px 24px', borderRadius: 10, marginBottom: 20 }}>
        <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
          <CardTitle icon={<Bell size={14} color="#00E5A0" />}>Push sur cet appareil</CardTitle>
        </div>

        {pushMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <CheckCircle size={13} style={{ color: '#00E5A0', flexShrink: 0 }} />
            <span style={{ color: '#00E5A0', fontSize: '0.8rem' }}>{pushMsg}</span>
          </div>
        )}
        {pushErr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{pushErr}</span>
          </div>
        )}

        {!pushSupported ? (
          <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>
            Les notifications push ne sont pas supportées par ce navigateur.
          </p>
        ) : pushLoading ? (
          <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Vérification du statut…</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: pushSubscribed ? '#00E5A0' : '#475569', flexShrink: 0 }} />
              <span style={{ color: pushSubscribed ? '#00E5A0' : '#94A3B8', fontSize: '0.85rem', fontWeight: 600 }}>
                {pushSubscribed ? 'Appareil abonné' : 'Appareil non abonné'}
              </span>
            </div>
            <button
              onClick={handleTogglePush} disabled={pushBusy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 6,
                border: pushSubscribed ? '1px solid #2A2F3A' : 'none',
                backgroundColor: pushBusy ? '#1E2229' : pushSubscribed ? 'transparent' : '#00E5A0',
                color: pushBusy ? '#475569' : pushSubscribed ? '#94A3B8' : '#0D0F14',
                cursor: pushBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem',
              }}
            >
              {pushBusy ? 'Patientez…' : pushSubscribed ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        )}

        <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '14px 0 0' }}>
          Cet interrupteur ne concerne que cet appareil. Les choix par catégorie ci-dessous
          s'appliquent à tous vos appareils.
          {' '}
          <Link to="/notifications/test" style={{ color: '#3B82F6', textDecoration: 'none' }}>
            Page de test avancée →
          </Link>
        </p>
      </Card>

      <Card style={{ padding: '20px 24px', borderRadius: 10 }}>
        <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
          <CardTitle icon={<Bell size={14} color="#00E5A0" />}>Ce que je veux recevoir</CardTitle>
        </div>
        <p style={{ color: '#64748B', fontSize: '0.8rem', marginBottom: 16, marginTop: 0 }}>
          Les notifications dans l'app restent toujours actives : elles alimentent votre centre de
          notifications, et seule votre équipe peut les couper. Vous choisissez ici ce qui vous est
          envoyé en plus, par push ou par email.
        </p>

        {error && <p style={{ color: '#EF4444', fontSize: '0.8rem', marginTop: 0 }}>{error}</p>}
        {!prefs ? (
          <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>
        ) : (
          <NotificationChannelMatrix
            channels={['inApp', 'push', 'email']}
            cell={(category, channel) => {
              // « Dans l'app » n'est pas un choix personnel : ces notifications alimentent le
              // centre de notifications et il n'existe pas de préférence utilisateur pour les
              // couper (pas de colonne en base). On l'affiche quand même, en lecture seule, parce
              // que son absence donnait l'impression d'une colonne manquante — et parce que
              // l'équipe PEUT la couper, ce que la valeur reflète.
              const blockedByTeam = teamSettings ? !teamSettings[category][channel] : false;
              if (channel === 'inApp') {
                return {
                  on: !blockedByTeam,
                  disabled: true,
                  reason: blockedByTeam
                    ? `Désactivé pour l'équipe ${selected?.team.name ?? ''}`
                    : 'Toujours actif — alimente votre centre de notifications',
                };
              }
              const unsupported = channel === 'email' && !categorySupportsEmail(category);
              return {
                on: prefs[category][channel] && !blockedByTeam,
                disabled: unsupported || blockedByTeam || savingKey === `${category}:${channel}`,
                reason: unsupported ? 'Aucune notification de cette catégorie ne part par email'
                  : blockedByTeam ? `Désactivé pour l'équipe ${selected?.team.name ?? ''}`
                  : undefined,
              };
            }}
            onToggle={(category, channel) => {
              if (channel === 'inApp') return;   // lecture seule
              toggle(category, channel);
            }}
          />
        )}
      </Card>
    </div>
  );
}

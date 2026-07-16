import { useEffect, useState } from 'react';
import { Bell, Send, Trash2, ShieldCheck } from 'lucide-react';
import { supabase } from '../api/client';
import {
  NotificationService, isPushSupported, getNotificationPermission,
  getExistingSubscription, subscribeToPush, unsubscribeFromPush,
} from '../api';
import { Card, CardTitle } from '../components';

const btnStyle = (color: string, disabled: boolean): React.CSSProperties => ({
  display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 6, border: 'none',
  backgroundColor: disabled ? '#1E2229' : color, color: disabled ? '#475569' : '#0D0F14',
  cursor: disabled ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.85rem',
});

const rowStyle: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #1A1F28', gap: 12 };
const labelStyle: React.CSSProperties = { color: '#94A3B8', fontSize: '0.82rem' };
const valueStyle: React.CSSProperties = { color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 260 };

/** Page de test pour vérifier de bout en bout le flux de notifications Web Push. */
export default function PushNotificationTestPage() {
  const [userId, setUserId] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | 'unsupported'>('unsupported');
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<'subscribe' | 'send' | 'unsubscribe' | null>(null);
  const [log, setLog] = useState<{ ok: boolean; message: string }[]>([]);

  const refreshStatus = async () => {
    setPermission(getNotificationPermission());
    const sub = await getExistingSubscription();
    setEndpoint(sub?.endpoint ?? null);
  };

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUserId(data.user?.id ?? null));
    refreshStatus();
  }, []);

  const pushLog = (ok: boolean, message: string) => setLog(l => [{ ok, message }, ...l].slice(0, 10));

  async function handleSubscribe() {
    setBusy('subscribe');
    try {
      await subscribeToPush();
      await refreshStatus();
      pushLog(true, 'Abonnement créé avec succès.');
    } catch (err) {
      pushLog(false, err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setBusy(null);
    }
  }

  async function handleSendTest() {
    if (!userId) { pushLog(false, 'Utilisateur non authentifié.'); return; }
    setBusy('send');
    try {
      const result = await NotificationService.send({
        userId,
        title: 'Test Stamina',
        body: 'Ceci est une notification de test envoyée depuis la page de test.',
        url: '/notifications/test',
      });
      pushLog(result.sent > 0, result.message ?? `Envoyée à ${result.sent} appareil${result.sent > 1 ? 's' : ''}.`);
    } catch (err) {
      pushLog(false, err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setBusy(null);
    }
  }

  async function handleUnsubscribe() {
    setBusy('unsubscribe');
    try {
      await unsubscribeFromPush();
      await refreshStatus();
      pushLog(true, 'Abonnement supprimé.');
    } catch (err) {
      pushLog(false, err instanceof Error ? err.message : 'Erreur inconnue.');
    } finally {
      setBusy(null);
    }
  }

  const supported = isPushSupported();

  return (
    <div className="p-4 md:p-6">
      <h1 style={{ color: '#F1F5F9', margin: '0 0 20px' }}>Test des notifications push</h1>

      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 20, alignItems: 'start' }}>
        <Card style={{ padding: '20px 24px', borderRadius: 10 }}>
          <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 14, paddingBottom: 14 }}>
            <CardTitle icon={<ShieldCheck size={14} color="#00E5A0" />}>Statut actuel</CardTitle>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Supporté par ce navigateur</span>
            <span style={{ ...valueStyle, color: supported ? '#00E5A0' : '#EF4444' }}>{supported ? 'Oui' : 'Non'}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Permission navigateur</span>
            <span style={valueStyle}>{permission}</span>
          </div>
          <div style={rowStyle}>
            <span style={labelStyle}>Abonnement (cet appareil)</span>
            <span style={{ ...valueStyle, color: endpoint ? '#00E5A0' : '#475569' }}>{endpoint ? endpoint : 'Aucun'}</span>
          </div>
          <div style={{ ...rowStyle, borderBottom: 'none' }}>
            <span style={labelStyle}>Utilisateur</span>
            <span style={valueStyle}>{userId ?? '—'}</span>
          </div>
        </Card>

        <Card style={{ padding: '20px 24px', borderRadius: 10 }}>
          <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 14, paddingBottom: 14 }}>
            <CardTitle icon={<Bell size={14} color="#00E5A0" />}>Actions</CardTitle>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <button onClick={handleSubscribe} disabled={!supported || busy !== null} style={btnStyle('#00E5A0', !supported || busy !== null)}>
              <ShieldCheck size={14} /> {busy === 'subscribe' ? 'Demande en cours…' : 'Demander la permission / s\'abonner'}
            </button>
            <button onClick={handleSendTest} disabled={!endpoint || busy !== null} style={btnStyle('#3B82F6', !endpoint || busy !== null)}>
              <Send size={14} /> {busy === 'send' ? 'Envoi…' : 'Envoyer une notification de test'}
            </button>
            <button onClick={handleUnsubscribe} disabled={!endpoint || busy !== null} style={btnStyle('#EF4444', !endpoint || busy !== null)}>
              <Trash2 size={14} /> {busy === 'unsubscribe' ? 'Suppression…' : "Supprimer l'abonnement"}
            </button>
          </div>
        </Card>
      </div>

      <Card style={{ padding: '20px 24px', borderRadius: 10, marginTop: 20 }}>
        <CardTitle mb={10}>Journal</CardTitle>
        {log.length === 0 ? (
          <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>Aucune action pour l'instant.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {log.map((entry, i) => (
              <div key={i} style={{ fontSize: '0.8rem', color: entry.ok ? '#00E5A0' : '#EF4444' }}>
                {entry.ok ? '✓' : '✗'} {entry.message}
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

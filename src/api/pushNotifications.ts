import { supabase } from './client';

/** Détecte si les notifications push sont supportées par ce navigateur. */
export function isPushSupported(): boolean {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

/** État de la permission navigateur, ou 'unsupported' si l'API n'existe pas. */
export function getNotificationPermission(): NotificationPermission | 'unsupported' {
  if (!isPushSupported()) return 'unsupported';
  return Notification.permission;
}

/** Abonnement push existant pour cet appareil (service worker courant), s'il y en a un. */
export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!isPushSupported()) return null;
  const registration = await navigator.serviceWorker.ready;
  return registration.pushManager.getSubscription();
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

async function authHeaders(): Promise<HeadersInit> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/**
 * Demande l'autorisation navigateur si nécessaire, crée la Push Subscription pour cet appareil
 * et l'enregistre côté serveur (api/push/subscribe). Lève une erreur explicite si les notifications
 * ne sont pas supportées, si la clé VAPID publique n'est pas configurée, ou si l'utilisateur refuse.
 */
export async function subscribeToPush(): Promise<PushSubscription> {
  if (!isPushSupported()) throw new Error('Les notifications push ne sont pas supportées par ce navigateur.');

  const vapidPublicKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined;
  if (!vapidPublicKey) throw new Error('Clé VAPID publique manquante (VITE_VAPID_PUBLIC_KEY).');

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error("Autorisation refusée par l'utilisateur.");

  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing ?? await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const res = await fetch('/api/push/subscribe', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ subscription: subscription.toJSON() }),
  });
  if (!res.ok) throw new Error("Erreur lors de l'enregistrement de l'abonnement côté serveur.");

  return subscription;
}

/** Désactive les notifications push pour cet appareil : annule l'abonnement navigateur et le supprime côté serveur. */
export async function unsubscribeFromPush(): Promise<void> {
  const subscription = await getExistingSubscription();

  const res = await fetch('/api/push/unsubscribe', {
    method: 'DELETE',
    headers: await authHeaders(),
    body: JSON.stringify({ endpoint: subscription?.endpoint }),
  });
  if (!res.ok) throw new Error('Erreur lors de la désactivation côté serveur.');

  if (subscription) await subscription.unsubscribe();
}

export interface PushNotificationPayload {
  userId: string;
  title: string;
  body?: string;
  url?: string;
  icon?: string;
  image?: string;
}

export interface PushSendResult {
  ok: boolean;
  sent: number;
  removed?: number;
  message?: string;
}

/**
 * Point d'entrée unique pour envoyer une notification push (api/push/send). Toute nouvelle
 * fonctionnalité ayant besoin de notifier un utilisateur — nouveau message, rappel, fin de
 * traitement, commentaire, nouvelle tâche, changement de statut, validation… — doit passer par ce
 * service plutôt que d'appeler l'endpoint directement.
 *
 * Exemple : `await NotificationService.send({ userId, title, body, url, icon, image })`
 */
export const NotificationService = {
  async send(payload: PushNotificationPayload): Promise<PushSendResult> {
    const res = await fetch('/api/push/send', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({} as { error?: string }));
      throw new Error(err.error || "Erreur lors de l'envoi de la notification.");
    }
    return res.json();
  },
};

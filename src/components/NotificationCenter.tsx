import { Bell, X, User, Trophy, Heart, CheckSquare, Calendar, Users, Video, Activity, Smile, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useNotifications } from '../contexts/NotificationContext';
import { Modal } from './Modal';
import type { AppNotification } from '../api/notifications';
import { getNotificationCategory, getNotificationType, urlFor } from '../../shared/notifications.js';

/* ── Helpers ── */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "À l'instant";
  if (mins < 60) return `${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}j`;
  return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

const CATEGORY_ICONS: Record<string, typeof User> = {
  roster:   User,
  medical:  Heart,
  wellness: Smile,
  training: Activity,
  meetings: Users,
  tasks:    CheckSquare,
  matches:  Trophy,
  tactical: Video,
  season:   Calendar,
};

/** Les notifications antérieures au registre n'ont pas de `category` : on la retrouve par le type. */
function categoryOf(n: AppNotification): string | null {
  return n.category ?? getNotificationType(n.type)?.category ?? null;
}

function notifColor(n: AppNotification): string {
  const key = categoryOf(n);
  return (key && getNotificationCategory(key)?.color) || '#00E5A0';
}

function NotifIcon({ n }: { n: AppNotification }) {
  const key = categoryOf(n);
  const Icon = (key && CATEGORY_ICONS[key]) || Bell;
  return <Icon size={16} />;
}

function typeLabel(n: AppNotification): string {
  const key = categoryOf(n);
  return (key && getNotificationCategory(key)?.label) || 'Notification';
}

/* ── Badge ── */

function UnreadBadge({ count, large }: { count: number; large?: boolean }) {
  if (count === 0) return null;
  return (
    <span style={{
      position: 'absolute',
      top: large ? 6 : -3,
      right: large ? 6 : -3,
      minWidth: large ? 20 : 17,
      height: large ? 20 : 17,
      borderRadius: 10,
      backgroundColor: '#EF4444',
      color: '#fff',
      fontSize: large ? '0.68rem' : '0.62rem',
      fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '0 4px',
      border: '2px solid #0D0F14',
      lineHeight: 1,
    }}>
      {count > 99 ? '99+' : count}
    </span>
  );
}

/* ── Bell inline (TopBar desktop) ── */

export function NotificationBell() {
  const { unreadCount, openCenter } = useNotifications();
  return (
    <button
      onClick={openCenter}
      title="Notifications"
      style={{
        position: 'relative',
        width: 34, height: 34, borderRadius: '50%',
        backgroundColor: unreadCount > 0 ? 'rgba(0,229,160,0.08)' : '#1E2229',
        border: `1px solid ${unreadCount > 0 ? 'rgba(0,229,160,0.25)' : '#2A2F3A'}`,
        color: unreadCount > 0 ? '#00E5A0' : '#94A3B8',
        cursor: 'pointer', display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, transition: 'all 0.15s',
      }}
    >
      <Bell size={16} />
      <UnreadBadge count={unreadCount} />
    </button>
  );
}

/* ── Notification item ── */

function NotifItem({ n, onNavigate }: { n: AppNotification; onNavigate: (url: string) => void }) {
  const color = notifColor(n);
  const label = typeLabel(n);
  // Un type absent du registre (notification antérieure à son ajout, ou type renommé) n'a pas de
  // destination calculable. La ligne doit alors le DIRE : un clic mort silencieux se lit comme un
  // bug de l'app, pas comme une limite de la donnée.
  const url = getNotificationType(n.type) ? urlFor(n.type, n.entity_id ?? undefined) : null;
  const clickable = url !== null;

  return (
    <div
      onClick={clickable ? () => onNavigate(url!) : undefined}
      title={clickable ? undefined : "Cette notification n'a pas de page associée"}
      style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid #1A1F27',
        backgroundColor: 'transparent',
        transition: 'background-color 0.1s',
        cursor: clickable ? 'pointer' : 'default',
        opacity: clickable ? 1 : 0.55,
      }}
      onMouseEnter={e => { if (clickable) (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1A1F27'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = 'transparent'; }}
    >
      <div style={{ display: 'flex', gap: 12, padding: '14px 18px', flex: 1, minWidth: 0 }}>
        {/* Icône carrée arrondie */}
        <div style={{
          width: 38, height: 38, borderRadius: 10,
          backgroundColor: `${color}20`,
          border: `1px solid ${color}40`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, color,
        }}>
          <NotifIcon n={n} />
        </div>

        {/* Contenu */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Catégorie + temps */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 }}>
            <span style={{ fontSize: '0.68rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color }}>
              {label}
            </span>
            <span style={{ fontSize: '0.7rem', color: '#475569', flexShrink: 0, marginLeft: 8 }}>
              {timeAgo(n.created_at)}
            </span>
          </div>

          {/* Titre */}
          <span style={{
            color: '#F1F5F9', fontSize: '0.875rem', fontWeight: 500,
            lineHeight: 1.35, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            display: 'block',
          }}>
            {n.title}
          </span>

          {/* Body */}
          {n.body && (
            <p style={{
              color: '#64748B', fontSize: '0.78rem',
              margin: '3px 0 0', lineHeight: 1.4,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {n.body}
            </p>
          )}
        </div>

        {/* Flèche si cliquable */}
        {clickable && (
          <div style={{ display: 'flex', alignItems: 'center', paddingRight: 4, color: '#2A2F3A', flexShrink: 0 }}>
            <ChevronRight size={14} />
          </div>
        )}
      </div>
    </div>
  );
}

/* ── NotificationCenter (modale) ── */

export function NotificationCenter() {
  const { notifications, isOpen, closeCenter } = useNotifications();
  const navigate = useNavigate();

  function handleNavigate(url: string) {
    closeCenter();
    navigate(url);
  }

  return (
    <>
      {/* Modale */}
      {isOpen && (
        <Modal
          onClose={closeCenter}
          closeOnBackdropClick
          maxWidth={460}
          maxHeight="82vh"
          overlayOpacity={0.7}
          style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}
        >
            {/* Header */}
            <div style={{
              padding: '16px 20px',
              borderBottom: '1px solid #2A2F3A',
              background: 'linear-gradient(180deg, #1A1F28 0%, #161920 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 32, height: 32, borderRadius: 8,
                  backgroundColor: 'rgba(0,229,160,0.12)',
                  border: '1px solid rgba(0,229,160,0.25)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <Bell size={15} style={{ color: '#00E5A0' }} />
                </div>
                <div>
                  <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.95rem', lineHeight: 1.2 }}>
                    Notifications
                  </div>
                  {notifications.length > 0 && (
                    <div style={{ color: '#475569', fontSize: '0.72rem', marginTop: 1 }}>
                      {notifications.length} entrée{notifications.length > 1 ? 's' : ''}
                    </div>
                  )}
                </div>
              </div>

              <button
                onClick={closeCenter}
                style={{
                  width: 30, height: 30, borderRadius: 6,
                  background: 'none', border: '1px solid transparent',
                  color: '#475569', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.1s',
                }}
                onMouseEnter={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = '#1E2229';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = '#2A2F3A';
                  (e.currentTarget as HTMLButtonElement).style.color = '#F1F5F9';
                }}
                onMouseLeave={e => {
                  (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.borderColor = 'transparent';
                  (e.currentTarget as HTMLButtonElement).style.color = '#475569';
                }}
              >
                <X size={15} />
              </button>
            </div>

            {/* Liste */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              {notifications.length === 0 ? (
                <div style={{ padding: '56px 20px', textAlign: 'center' }}>
                  <div style={{
                    width: 56, height: 56, borderRadius: 14,
                    backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 14px',
                  }}>
                    <Bell size={24} style={{ color: '#2A2F3A' }} />
                  </div>
                  <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0, fontWeight: 500 }}>
                    Aucune notification
                  </p>
                  <p style={{ color: '#334155', fontSize: '0.75rem', margin: '4px 0 0' }}>
                    Les actions de l'équipe apparaîtront ici
                  </p>
                </div>
              ) : (
                <>
                  {notifications.map(n => <NotifItem key={n.id} n={n} onNavigate={handleNavigate} />)}
                </>
              )}
            </div>
        </Modal>
      )}
    </>
  );
}

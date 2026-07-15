import { Bell, X, User, Trophy, Heart, CheckSquare, Calendar, Dumbbell, Users, FileText, Activity, Smile, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router';
import { useNotifications } from '../contexts/NotificationContext';
import { Modal } from './Modal';
import type { AppNotification } from '../api/notifications';

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

function notifColor(type: string): string {
  if (type.startsWith('player'))   return '#3B82F6';
  if (type.startsWith('match'))    return '#F59E0B';
  if (type.startsWith('medical'))  return '#EF4444';
  if (type.startsWith('action'))   return '#8B5CF6';
  if (type.startsWith('rpe'))      return '#06B6D4';
  if (type.startsWith('wellness')) return '#EC4899';
  if (type.startsWith('session'))  return '#06B6D4';
  if (type.startsWith('exercise')) return '#10B981';
  if (type.startsWith('staff') || type.startsWith('meeting')) return '#F97316';
  if (type.startsWith('document')) return '#94A3B8';
  return '#00E5A0';
}

function NotifIcon({ type }: { type: string }) {
  const size = 16;
  if (type.startsWith('player'))   return <User size={size} />;
  if (type.startsWith('match'))    return <Trophy size={size} />;
  if (type.startsWith('medical'))  return <Heart size={size} />;
  if (type.startsWith('action'))   return <CheckSquare size={size} />;
  if (type.startsWith('rpe'))      return <Activity size={size} />;
  if (type.startsWith('wellness')) return <Smile size={size} />;
  if (type.startsWith('session'))  return <Calendar size={size} />;
  if (type.startsWith('exercise')) return <Dumbbell size={size} />;
  if (type.startsWith('staff') || type.startsWith('meeting')) return <Users size={size} />;
  if (type.startsWith('document')) return <FileText size={size} />;
  return <Bell size={size} />;
}

function typeLabel(type: string): string {
  if (type.startsWith('player'))   return 'Joueur';
  if (type.startsWith('match'))    return 'Match';
  if (type.startsWith('medical'))  return 'Médical';
  if (type.startsWith('action'))   return 'Tâche';
  if (type.startsWith('rpe'))      return 'RPE';
  if (type.startsWith('wellness')) return 'Bien-être';
  if (type.startsWith('session'))  return 'Séance';
  if (type.startsWith('exercise')) return 'Exercice';
  if (type.startsWith('meeting'))  return 'Réunion';
  if (type.startsWith('staff'))    return 'Staff';
  return 'Notification';
}

/* ── Route par type de notification ── */

function getNotifUrl(n: AppNotification): string | null {
  const { type, entity_id } = n;
  if (type === 'player_added')     return '/roster';
  if (type === 'medical_added')    return entity_id ? `/medical/record/${entity_id}` : '/medical';
  if (type === 'medical_resolved') return entity_id ? `/medical/record/${entity_id}` : '/medical';
  if (type === 'medical_updated')  return entity_id ? `/medical/record/${entity_id}` : '/medical';
  if (type === 'action_added')     return '/actions';
  if (type === 'action_deleted')   return '/actions';
  if (type === 'rpe_added')        return entity_id ? `/sessions/${entity_id}` : '/rpe';
  if (type === 'wellness_added')   return entity_id ? `/wellness/new/${entity_id}` : '/wellness';
  if (type === 'session_added')    return entity_id ? `/sessions/${entity_id}` : '/sessions';
  if (type === 'meeting_added')    return entity_id ? `/meetings/${entity_id}` : '/meetings';
  if (type === 'meeting_deleted')  return '/meetings';
  if (type === 'match_deleted')    return '/matches';
  return null;
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
  const color    = notifColor(n.type);
  const label    = typeLabel(n.type);
  const url      = getNotifUrl(n);
  const clickable = url !== null;

  return (
    <div
      onClick={clickable ? () => onNavigate(url!) : undefined}
      style={{
        display: 'flex', alignItems: 'stretch',
        borderBottom: '1px solid #1A1F27',
        backgroundColor: 'transparent',
        transition: 'background-color 0.1s',
        cursor: clickable ? 'pointer' : 'default',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.backgroundColor = '#1A1F27'; }}
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
          <NotifIcon type={n.type} />
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
          zIndex={1000}
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

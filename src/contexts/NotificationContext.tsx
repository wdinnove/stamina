import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { supabase } from '../api/client';
import { fetchNotifications, markAllNotificationsRead, type AppNotification } from '../api/notifications';

type NotificationContextType = {
  notifications: AppNotification[];
  unreadCount: number;
  isOpen: boolean;
  openCenter: () => void;
  closeCenter: () => void;
};

const NotificationContext = createContext<NotificationContextType>({
  notifications: [],
  unreadCount: 0,
  isOpen: false,
  openCenter: () => {},
  closeCenter: () => {},
});

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isOpen, setIsOpen]               = useState(false);
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  const unreadCount = notifications.filter(n => !n.read_at).length;

  async function load() {
    try {
      setNotifications(await fetchNotifications());
    } catch (e) {
      console.error('[NotificationContext] load', e);
    }
  }

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      load();

      channelRef.current = supabase
        .channel(`notifs-${user.id}`)
        .on('postgres_changes', {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${user.id}`,
        }, () => load())
        .subscribe();
    });

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, []);

  async function openCenter() {
    setIsOpen(true);
    if (unreadCount > 0) {
      setNotifications(prev => prev.map(n => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })));
      await markAllNotificationsRead();
    }
  }

  function closeCenter() {
    setIsOpen(false);
  }

  return (
    <NotificationContext.Provider value={{ notifications, unreadCount, isOpen, openCenter, closeCenter }}>
      {children}
    </NotificationContext.Provider>
  );
}

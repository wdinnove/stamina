import { useEffect, useState } from 'react';
import { Navigate, Outlet } from 'react-router';
import { supabase } from '../api/client';

export function RequireAuth() {
  const [status, setStatus] = useState<'loading' | 'auth' | 'unauth'>('loading');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setStatus(data.session ? 'auth' : 'unauth');
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setStatus(session ? 'auth' : 'unauth');
    });

    return () => subscription.unsubscribe();
  }, []);

  if (status === 'loading') return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0D0F14',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        width: 28, height: 28, border: '3px solid #1E2229',
        borderTopColor: '#00E5A0', borderRadius: '50%',
        animation: 'spin 0.7s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );

  if (status === 'unauth') return <Navigate to="/login" replace />;

  return <Outlet />;
}

import { useState } from 'react';
import { Outlet } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar, MobileSidebar } from './TopBar';
import { TeamSeasonProvider } from '../contexts/TeamSeasonContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { NotificationCenter } from '../components/NotificationCenter';

export function Layout() {
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);

  return (
    <TeamSeasonProvider>
    <NotificationProvider>
    <div style={{ display: 'flex', height: '100vh', backgroundColor: '#0D0F14', overflow: 'hidden' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex" style={{ position: 'relative' }}>
        <Sidebar collapsed={collapsed} />
        <button onClick={() => setCollapsed(!collapsed)}
          style={{ position: 'absolute', top: '50%', right: -12, transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: '50%', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94A3B8', zIndex: 10 }}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* Mobile sidebar */}
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar onMenuOpen={() => setMobileOpen(v => !v)} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>
      <NotificationCenter />
    </div>
    </NotificationProvider>
    </TeamSeasonProvider>
  );
}

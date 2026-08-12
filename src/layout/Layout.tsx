import { useEffect, useState } from 'react';
import { Outlet } from 'react-router';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { Sidebar } from './Sidebar';
import { TopBar, MobileSidebar } from './TopBar';
import { MobileBottomBar } from './MobileBottomBar';
import { TeamSeasonProvider } from '../contexts/TeamSeasonContext';
import { NotificationProvider } from '../contexts/NotificationContext';
import { NotificationCenter } from '../components/NotificationCenter';
import { CommandPalette } from '../components/CommandPalette';
import { LAYER } from '../styles/layers';

export function Layout() {
  const [collapsed,   setCollapsed]   = useState(false);
  const [mobileOpen,  setMobileOpen]  = useState(false);
  const [searchOpen,  setSearchOpen]  = useState(false);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(v => !v);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <TeamSeasonProvider>
    <NotificationProvider>
    <div style={{ display: 'flex', position: 'fixed', inset: 0, backgroundColor: '#0D0F14', overflow: 'hidden' }}>
      {/* Desktop sidebar */}
      <div className="hidden md:flex" style={{ position: 'relative' }}>
        <Sidebar collapsed={collapsed} />
        <button onClick={() => setCollapsed(!collapsed)}
          style={{ position: 'absolute', top: '50%', right: -12, transform: 'translateY(-50%)', width: 24, height: 24, borderRadius: '50%', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#94A3B8', zIndex: LAYER.sidebarToggle }}>
          {collapsed ? <ChevronRight size={12} /> : <ChevronLeft size={12} />}
        </button>
      </div>

      {/* Mobile sidebar */}
      <MobileSidebar open={mobileOpen} onClose={() => setMobileOpen(false)} />

      {/* Main */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', minWidth: 0 }}>
        <TopBar onOpenSearch={() => setSearchOpen(true)} />
        <main style={{ flex: 1, overflowY: 'auto' }}>
          <Outlet />
        </main>
        <MobileBottomBar onMenuOpen={() => setMobileOpen(v => !v)} />
      </div>

      {/* Recherche : bouton flottant mobile. Recouvert par le tiroir de navigation (LAYER.drawer). */}
      <button
        onClick={() => setSearchOpen(true)}
        className="flex md:hidden"
        aria-label="Recherche"
        title="Recherche"
        style={{
          position: 'fixed', right: 16, bottom: 72,
          width: 52, height: 52, borderRadius: '50%',
          backgroundColor: '#00E5A0', border: 'none',
          alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 4px 14px rgba(0,229,160,0.35)', cursor: 'pointer',
          zIndex: LAYER.fab,
        }}
      >
        <Search size={22} color="#0D0F14" />
      </button>

      <NotificationCenter />
      <CommandPalette open={searchOpen} onOpenChange={setSearchOpen} />
    </div>
    </NotificationProvider>
    </TeamSeasonProvider>
  );
}

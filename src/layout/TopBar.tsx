import { useState, useEffect, useRef } from 'react';
import { Bell, ChevronDown, Menu, Check, Shield, Users } from 'lucide-react';
import { StaminaLogo } from '../components/StaminaLogo';
import { navItems } from './Sidebar';
import { NavLink } from 'react-router';
import { useTeamSeason, type TeamSeasonOption } from '../contexts/TeamSeasonContext';

interface TopBarProps {
  onMenuOpen: () => void;
}

export function TopBar({ onMenuOpen }: TopBarProps) {
  const { options, selected, setSelected, loading } = useTeamSeason();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Group options by team for display
  const grouped = options.reduce<Record<string, { color: string; label: string; items: TeamSeasonOption[] }>>(
    (acc, opt) => {
      const tid = opt.team.id;
      if (!acc[tid]) acc[tid] = { color: opt.team.color, label: opt.team.name, items: [] };
      acc[tid].items.push(opt);
      return acc;
    },
    {}
  );

  const today = new Date().toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <header style={{
      height: 56, backgroundColor: '#161920', borderBottom: '1px solid #2A2F3A',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 20px', flexShrink: 0, position: 'relative', zIndex: 200,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Mobile menu button */}
        <button onClick={onMenuOpen}
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex' }}
          className="md:hidden">
          <Menu size={20} />
        </button>

        {/* Mes équipes */}
        <NavLink to="/teams"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 11px',
            backgroundColor: isActive ? 'rgba(0,229,160,0.08)' : '#1E2229',
            border: `1px solid ${isActive ? 'rgba(0,229,160,0.3)' : '#2A2F3A'}`,
            borderRadius: 6, color: isActive ? '#00E5A0' : '#94A3B8',
            textDecoration: 'none', fontSize: '0.82rem', fontWeight: 500,
            whiteSpace: 'nowrap',
          })}>
          <Shield size={14} />
          <span>Mes équipes</span>
        </NavLink>

        {/* Mes joueurs */}
        <NavLink to="/players"
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 11px',
            backgroundColor: isActive ? 'rgba(0,229,160,0.08)' : '#1E2229',
            border: `1px solid ${isActive ? 'rgba(0,229,160,0.3)' : '#2A2F3A'}`,
            borderRadius: 6, color: isActive ? '#00E5A0' : '#94A3B8',
            textDecoration: 'none', fontSize: '0.82rem', fontWeight: 500,
            whiteSpace: 'nowrap',
          })}>
          <Users size={14} />
          <span>Mes joueurs</span>
        </NavLink>

        {/* Team + Season selector */}
        <div ref={ref} style={{ position: 'relative' }}>
          <button
            onClick={() => !loading && setOpen(v => !v)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
              borderRadius: 6, padding: '6px 12px', cursor: loading ? 'default' : 'pointer',
              color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 500,
              opacity: loading ? 0.5 : 1,
            }}>
            {selected ? (
              <>
                <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: selected.team.color, flexShrink: 0 }} />
                <span>{selected.team.name}</span>
                <span style={{ color: '#475569', fontWeight: 400 }}>·</span>
                <span style={{ color: '#94A3B8', fontWeight: 400 }}>{selected.season.label}</span>
              </>
            ) : (
              <span style={{ color: '#475569' }}>{loading ? 'Chargement…' : 'Aucune équipe'}</span>
            )}
            <ChevronDown size={14} style={{ color: '#475569', marginLeft: 2, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>

          {open && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0,
              backgroundColor: '#161920', border: '1px solid #2A2F3A',
              borderRadius: 8, minWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              overflow: 'hidden',
            }}>
              {Object.values(grouped).map(group => (
                <div key={group.label}>
                  <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: group.color }} />
                    <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {group.label}
                    </span>
                  </div>
                  {group.items.map(opt => {
                    const isSelected = selected?.team.id === opt.team.id && selected?.season.id === opt.season.id;
                    return (
                      <button
                        key={opt.season.id}
                        onClick={() => { setSelected(opt); setOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '8px 12px 8px 24px',
                          background: isSelected ? 'rgba(0,229,160,0.08)' : 'none',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#1E2229'; }}
                        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: isSelected ? '#00E5A0' : '#F1F5F9', fontSize: '0.85rem' }}>
                            {opt.season.label}
                          </span>
                          {opt.season.isCurrent && (
                            <span style={{ padding: '1px 6px', backgroundColor: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 3, color: '#00E5A0', fontSize: '0.65rem', fontWeight: 600 }}>
                              En cours
                            </span>
                          )}
                        </div>
                        {isSelected && <Check size={13} style={{ color: '#00E5A0', flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              ))}
              {options.length === 0 && (
                <p style={{ color: '#475569', fontSize: '0.82rem', padding: '12px', margin: 0 }}>
                  Aucune équipe ni saison configurée.
                </p>
              )}
            </div>
          )}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ position: 'relative' }}>
          <button style={{ background: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 6, backgroundColor: '#1E2229', border: '1px solid #2A2F3A' }}>
            <Bell size={16} />
          </button>
          <span style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, backgroundColor: '#EF4444', borderRadius: '50%', fontSize: '0.6rem', fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>3</span>
        </div>
        <div style={{ color: '#94A3B8', fontSize: '0.78rem' }}>{today}</div>
      </div>
    </header>
  );
}

/** Sidebar mobile (drawer) */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {open && <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 40 }} />}
      <aside style={{ position: 'fixed', left: open ? 0 : -240, top: 0, bottom: 0, width: 240, backgroundColor: '#161920', borderRight: '1px solid #2A2F3A', display: 'flex', flexDirection: 'column', zIndex: 50, transition: 'left 0.25s ease' }}
        className="md:hidden">
        <div style={{ padding: '16px', borderBottom: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StaminaLogo size={28} />
            <span style={{ color: '#F1F5F9', fontWeight: 900, fontSize: '0.95rem', letterSpacing: '0.1em' }}>STAMINA</span>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {navItems.map(item => (
            <NavLink key={item.path} to={item.path} onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px',
                color: isActive ? '#00E5A0' : '#94A3B8',
                backgroundColor: isActive ? 'rgba(0,229,160,0.08)' : 'transparent',
                borderLeft: isActive ? '2px solid #00E5A0' : '2px solid transparent',
                textDecoration: 'none', fontSize: '0.85rem', fontWeight: isActive ? 600 : 400,
              })}>
              <item.icon size={18} />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>
    </>
  );
}

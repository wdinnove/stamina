import { Fragment, useState, useEffect, useRef } from 'react';
import { ChevronDown, Menu, Check, X } from 'lucide-react';
import { StaminaLogo } from '../components/StaminaLogo';
import { navItems } from './Sidebar';
import { Link, useNavigate, useLocation } from 'react-router';
import { useTeamSeason, type TeamSeasonOption } from '../contexts/TeamSeasonContext';
import { supabase } from '../api/client';

interface TopBarProps {
  onMenuOpen: () => void;
}

export function TopBar({ onMenuOpen }: TopBarProps) {
  const { options, selected, setSelected, loading } = useTeamSeason();
  const [dropOpen, setDropOpen]   = useState(false);
  const [initials, setInitials]   = useState('');
  const dropRef  = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) setInitials(`${data.first_name?.[0] ?? ''}${data.last_name?.[0] ?? ''}`.toUpperCase());
        });
    });
  }, []);

  useEffect(() => {
    if (!dropOpen) return;
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [dropOpen]);

  const grouped = options.reduce<Record<string, { color: string; label: string; items: TeamSeasonOption[] }>>(
    (acc, opt) => {
      const tid = opt.team.id;
      if (!acc[tid]) acc[tid] = { color: opt.team.color, label: opt.team.name, items: [] };
      acc[tid].items.push(opt);
      return acc;
    },
    {}
  );

  return (
    <header style={{
      height: 56, backgroundColor: '#161920', borderBottom: '1px solid #2A2F3A',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '0 16px', flexShrink: 0, position: 'relative', zIndex: 200,
    }}>
      {/* Left */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        {/* Mobile: hamburger + logo */}
        <button onClick={onMenuOpen}
          className="flex md:hidden"
          style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', flexShrink: 0 }}>
          <Menu size={20} />
        </button>
        <div className="flex md:hidden" style={{ alignItems: 'center', gap: 8 }}>
          <StaminaLogo size={26} />
          <div>
            <div style={{ color: '#F1F5F9', fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.12em', lineHeight: 1.1 }}>STAMINA</div>
            <div style={{ color: '#00E5A080', fontSize: '0.52rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Management App</div>
          </div>
        </div>

        {/* Desktop/tablet: team selector */}
        <div ref={dropRef} className="hidden md:block" style={{ position: 'relative' }}>
          <button
            onClick={() => !loading && setDropOpen(v => !v)}
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
                <span style={{ color: '#475569' }}>·</span>
                <span style={{ color: '#94A3B8', fontWeight: 400 }}>{selected.season.label}</span>
              </>
            ) : (
              <span style={{ color: '#475569' }}>{loading ? 'Chargement…' : 'Aucune équipe'}</span>
            )}
            <ChevronDown size={14} style={{ color: '#475569', transform: dropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }} />
          </button>

          {dropOpen && (
            <div style={{
              position: 'absolute', top: 'calc(100% + 6px)', left: 0,
              backgroundColor: '#161920', border: '1px solid #2A2F3A',
              borderRadius: 8, minWidth: 260, boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
              overflow: 'hidden', zIndex: 300,
            }}>
              {Object.values(grouped).map(group => (
                <div key={group.label}>
                  <div style={{ padding: '8px 12px 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: group.color }} />
                    <span style={{ color: '#475569', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{group.label}</span>
                  </div>
                  {group.items.map(opt => {
                    const isSel = selected?.team.id === opt.team.id && selected?.season.id === opt.season.id;
                    return (
                      <button key={opt.season.id}
                        onClick={() => { setSelected(opt); setDropOpen(false); }}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          width: '100%', padding: '8px 12px 8px 24px',
                          background: isSel ? 'rgba(0,229,160,0.08)' : 'none',
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                        }}
                        onMouseEnter={e => { if (!isSel) e.currentTarget.style.backgroundColor = '#1E2229'; }}
                        onMouseLeave={e => { if (!isSel) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ color: isSel ? '#00E5A0' : '#F1F5F9', fontSize: '0.85rem' }}>{opt.season.label}</span>
                          {opt.season.isCurrent && (
                            <span style={{ padding: '1px 6px', backgroundColor: 'rgba(0,229,160,0.12)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 3, color: '#00E5A0', fontSize: '0.65rem', fontWeight: 600 }}>En cours</span>
                          )}
                        </div>
                        {isSel && <Check size={13} style={{ color: '#00E5A0', flexShrink: 0 }} />}
                      </button>
                    );
                  })}
                </div>
              ))}
              {options.length === 0 && (
                <p style={{ color: '#475569', fontSize: '0.82rem', padding: '12px', margin: 0 }}>Aucune équipe configurée.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Right: avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => navigate('/profile')}
          title="Mon profil"
          style={{
            width: 34, height: 34, borderRadius: '50%',
            backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
            color: '#00E5A0', fontWeight: 700, fontSize: '0.72rem',
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
          {initials || '?'}
        </button>
      </div>
    </header>
  );
}

/** Mobile sidebar drawer */
export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  const location = useLocation();

  return (
    <>
      {open && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 40 }} />
      )}
      <aside
        style={{
          position: 'fixed', left: open ? 0 : '-100%', top: 0, bottom: 0, width: '100%',
          backgroundColor: '#161920', borderRight: '1px solid #2A2F3A',
          display: 'flex', flexDirection: 'column', zIndex: 50,
          transition: 'left 0.25s ease',
        }}
        className="md:hidden"
      >
        {/* Header */}
        <div style={{ height: 56, padding: '0 16px', borderBottom: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <StaminaLogo size={26} />
            <div>
              <div style={{ color: '#F1F5F9', fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.1em', lineHeight: 1.1 }}>STAMINA</div>
              <div style={{ color: '#00E5A080', fontSize: '0.52rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Management App</div>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex' }}>
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {navItems.map((item, i) => {
            const active = location.pathname === item.path || location.pathname.startsWith(item.path + '/');
            return (
              <Fragment key={item.path}>
                {i === 2 && (
                  <div style={{ height: 1, margin: '4px 8px', backgroundColor: '#2A2F3A' }} />
                )}
                <Link to={item.path} onClick={onClose}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
                    color: active ? '#00E5A0' : '#94A3B8',
                    backgroundColor: active ? 'rgba(0,229,160,0.08)' : 'transparent',
                    borderLeft: active ? '2px solid #00E5A0' : '2px solid transparent',
                    textDecoration: 'none', fontSize: '0.85rem', fontWeight: active ? 600 : 400,
                  }}>
                  <item.icon size={18} style={{ flexShrink: 0 }} />
                  {item.label}
                </Link>
              </Fragment>
            );
          })}
        </nav>
      </aside>
    </>
  );
}

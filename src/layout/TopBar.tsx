import { Fragment, useState, useEffect, useRef } from 'react';
import { ChevronDown, Check, X, ArrowLeft, Settings, Search, User } from 'lucide-react';
import { StaminaLogo } from '../components/StaminaLogo';
import { navGroups, isNavActive } from './Sidebar';
import { Link, useNavigate, useLocation } from 'react-router';
import { useTeamSeason, type TeamSeasonOption } from '../contexts/TeamSeasonContext';
import { supabase } from '../api/client';
import { NotificationBell } from '../components/NotificationCenter';

interface TopBarProps { onOpenSearch: () => void; }

export function TopBar({ onOpenSearch }: TopBarProps) {
  const { options, selected, setSelected, loading, orgRole } = useTeamSeason();
  const [dropOpen, setDropOpen]   = useState(false);
  const [initials, setInitials]   = useState('');
  const dropRef  = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

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
      {/* Desktop: team selector */}
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
                      onClick={() => {
                        setSelected(opt);
                        setDropOpen(false);
                        window.location.reload();
                      }}
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

      {/* Desktop: recherche globale — centrée */}
      <button
        onClick={onOpenSearch}
        className="hidden md:flex"
        style={{
          position: 'absolute', left: '50%', transform: 'translateX(-50%)',
          alignItems: 'center', gap: 10, width: 420,
          backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6,
          padding: '7px 12px', color: '#475569', fontSize: '0.8rem', cursor: 'pointer',
        }}
      >
        <Search size={14} style={{ flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>Rechercher…</span>
        <span style={{ display: 'flex', gap: 3, fontFamily: 'monospace', fontSize: '0.65rem' }}>
          <kbd style={{ background: '#262B35', border: '1px solid #323847', borderRadius: 4, padding: '1px 5px', color: '#94A3B8' }}>⌘</kbd>
          <kbd style={{ background: '#262B35', border: '1px solid #323847', borderRadius: 4, padding: '1px 5px', color: '#94A3B8' }}>K</kbd>
        </span>
      </button>

      {/* Mobile: back | logo | avatar */}
      <div className="flex md:hidden" style={{ flex: 1, alignItems: 'center' }}>
        <div style={{ flex: 1, display: 'flex', justifyContent: 'flex-start' }}>
          {location.pathname !== '/dashboard' && (
            <button onClick={() => navigate(-1)} title="Retour"
              style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', display: 'flex', alignItems: 'center', padding: 4 }}>
              <ArrowLeft size={20} />
            </button>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <StaminaLogo size={26} />
          <div>
            <div style={{ color: '#F1F5F9', fontWeight: 900, fontSize: '0.9rem', letterSpacing: '0.12em', lineHeight: 1.1 }}>STAMINA</div>
            <div style={{ color: '#00E5A080', fontSize: '0.52rem', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Management App</div>
          </div>
        </div>
        <div style={{ flex: 1 }} />
      </div>

      {/* Desktop right: notifications + configuration + avatar */}
      <div className="hidden md:flex" style={{ alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <NotificationBell />
        {orgRole === 'admin' && (
          <button onClick={() => navigate('/configuration')} title="Configuration"
            style={{
              width: 34, height: 34, borderRadius: '50%',
              backgroundColor: location.pathname.startsWith('/configuration') ? 'rgba(0,229,160,0.08)' : '#1E2229',
              border: `1px solid ${location.pathname.startsWith('/configuration') ? '#00E5A0' : '#2A2F3A'}`,
              color: location.pathname.startsWith('/configuration') ? '#00E5A0' : '#94A3B8',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
            <Settings size={16} />
          </button>
        )}
        <button onClick={() => navigate('/profile')} title="Mon profil"
          style={{
            width: 34, height: 34, borderRadius: '50%',
            backgroundColor: location.pathname.startsWith('/profile') ? 'rgba(0,229,160,0.08)' : '#1E2229',
            border: `1px solid ${location.pathname.startsWith('/profile') ? '#00E5A0' : '#2A2F3A'}`,
            color: '#00E5A0', fontWeight: 700, fontSize: '0.72rem', cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
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
  const navigate = useNavigate();
  const { options, selected, setSelected, loading, orgRole } = useTeamSeason();
  const [initials, setInitials] = useState('');
  const [fullName, setFullName] = useState('');

  const grouped = options.reduce<Record<string, { color: string; label: string; items: TeamSeasonOption[] }>>(
    (acc, opt) => {
      const tid = opt.team.id;
      if (!acc[tid]) acc[tid] = { color: opt.team.color, label: opt.team.name, items: [] };
      acc[tid].items.push(opt);
      return acc;
    },
    {}
  );

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) return;
      supabase.from('profiles').select('first_name, last_name').eq('id', user.id).single()
        .then(({ data }) => {
          if (data) {
            setInitials(`${data.first_name?.[0] ?? ''}${data.last_name?.[0] ?? ''}`.toUpperCase());
            setFullName(`${data.first_name ?? ''} ${data.last_name ?? ''}`.trim());
          }
        });
    });
  }, []);

  const navLinkStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px',
    color: active ? '#00E5A0' : '#94A3B8',
    backgroundColor: active ? 'rgba(0,229,160,0.08)' : 'transparent',
    borderLeft: active ? '2px solid #00E5A0' : '2px solid transparent',
    textDecoration: 'none', fontSize: '0.85rem', fontWeight: active ? 600 : 400,
  });

  const configActive = location.pathname.startsWith('/configuration');

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

        {/* Team selector */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid #2A2F3A', flexShrink: 0 }}>
          <select
            disabled={loading || options.length === 0}
            value={selected ? `${selected.team.id}__${selected.season.id}` : ''}
            onChange={e => {
              const [teamId, seasonId] = e.target.value.split('__');
              const opt = options.find(o => o.team.id === teamId && o.season.id === seasonId);
              if (opt) {
                setSelected(opt);
                window.location.reload();
              }
            }}
            style={{ width: '100%', padding: '8px 10px', backgroundColor: '#0F1117', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none' }}
          >
            {options.length === 0 && <option value="">Aucune équipe</option>}
            {Object.values(grouped).map(group => (
              <optgroup key={group.label} label={group.label}>
                {group.items.map(opt => (
                  <option key={opt.season.id} value={`${opt.team.id}__${opt.season.id}`}>
                    {opt.team.name} · {opt.season.label}{opt.season.isCurrent ? ' (en cours)' : ''}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {navGroups.map((group, gi) => (
            <div key={gi}>
              {group.title && (
                <div style={{ padding: '10px 16px 4px', color: '#475569', fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {group.title}
                </div>
              )}
              {group.items.map(item => {
                const active = isNavActive(item.path, location.pathname);
                return (
                  <Link key={item.path} to={item.path} onClick={onClose} style={navLinkStyle(active)}>
                    <item.icon size={18} style={{ flexShrink: 0 }} />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          ))}
          <div style={{ height: 1, margin: '4px 8px', backgroundColor: '#2A2F3A' }} />
          <Link to="/profile" onClick={onClose} style={navLinkStyle(location.pathname.startsWith('/profile'))}>
            <User size={18} style={{ flexShrink: 0 }} />
            Mon profil
          </Link>
          {/* Configuration */}
          {(orgRole === 'admin') && <div style={{ height: 1, margin: '4px 8px', backgroundColor: '#2A2F3A' }} />}
          {orgRole === 'admin' && (
            <Link to="/configuration" onClick={onClose} style={navLinkStyle(configActive)}>
              <Settings size={18} style={{ flexShrink: 0 }} />
              Configuration
            </Link>
          )}
        </nav>

        {/* Profile section */}
        <div style={{ borderTop: '1px solid #2A2F3A', padding: '12px 16px', flexShrink: 0 }}>
          <Link to="/profile" onClick={onClose}
            style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none' }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', color: '#00E5A0', fontWeight: 700, fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {initials || '?'}
            </div>
            <div style={{ minWidth: 0 }}>
              <div style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{fullName || 'Mon profil'}</div>
              <div style={{ color: '#475569', fontSize: '0.72rem' }}>Voir mon profil</div>
            </div>
          </Link>
        </div>
      </aside>
    </>
  );
}

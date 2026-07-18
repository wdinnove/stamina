import { useState } from 'react';
import { Menu, ChevronDown, X } from 'lucide-react';
import { Modal } from './Modal';

export interface TabNavItem { key: string; slug: string; label: string }
export interface TabNavGroup { label?: string; tabs: TabNavItem[] }

interface TabNavListProps {
  groups: TabNavGroup[];
  activeKey: string;
  onSelect: (slug: string) => void;
}

/** Liste verticale des sections/onglets — partagée entre la sidebar desktop et la modale mobile. */
export function TabNavList({ groups, activeKey, onSelect }: TabNavListProps) {
  return (
    <div className="flex flex-col" style={{ gap: 14 }}>
      {groups.map((group, gi) => (
        <div key={gi}>
          {group.label && (
            <div style={{ padding: '6px 10px 4px', color: '#475569', fontSize: '0.64rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>
              {group.label}
            </div>
          )}
          <div className="flex flex-col" style={{ gap: 2 }}>
            {group.tabs.map(t => (
              <button key={t.key} onClick={() => onSelect(t.slug)}
                style={{
                  textAlign: 'left', padding: '8px 12px', borderRadius: 6, border: 'none', cursor: 'pointer',
                  fontSize: '0.83rem', whiteSpace: 'nowrap',
                  backgroundColor: activeKey === t.key ? 'rgba(0,229,160,0.08)' : 'transparent',
                  color: activeKey === t.key ? '#00E5A0' : '#94A3B8',
                  fontWeight: activeKey === t.key ? 600 : 400,
                  borderLeft: activeKey === t.key ? '2px solid #00E5A0' : '2px solid transparent',
                  transition: 'all 0.15s',
                }}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

interface ResponsiveTabNavProps {
  groups: TabNavGroup[];
  activeKey: string;
  onSelect: (slug: string) => void;
}

/** Sidebar verticale d'onglets (desktop) + bouton → modale de sélection (mobile) — mutualisé
 *  entre Performance individuelle et Performance collective pour garder les deux navigations
 *  identiques en comportement. */
export function ResponsiveTabNav({ groups, activeKey, onSelect }: ResponsiveTabNavProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const activeLabel = groups.flatMap(g => g.tabs).find(t => t.key === activeKey)?.label ?? '';
  const selectAndClose = (slug: string) => { onSelect(slug); setMobileOpen(false); };

  return (
    <>
      {/* ── Sous-menu mobile : bouton → modale de sélection ── */}
      <div className="w-full lg:hidden">
        <button onClick={() => setMobileOpen(true)} style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 14px', borderRadius: 8, border: '1px solid #2A2F3A', backgroundColor: '#161920',
          color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Menu size={16} style={{ color: '#00E5A0' }} />
            {activeLabel}
          </span>
          <ChevronDown size={16} style={{ color: '#64748B' }} />
        </button>
      </div>

      {mobileOpen && (
        <Modal onClose={() => setMobileOpen(false)} closeOnBackdropClick maxWidth={300} align="flex-start" style={{ marginTop: 60 }}>
          <div style={{ padding: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem' }}>Sections</span>
              <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}>
                <X size={18} />
              </button>
            </div>
            <TabNavList groups={groups} activeKey={activeKey} onSelect={selectAndClose} />
          </div>
        </Modal>
      )}

      {/* ── Menu vertical d'onglets (desktop) ── */}
      <nav className="hidden lg:block lg:w-[200px]" style={{ flexShrink: 0, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, padding: 6 }}>
        <TabNavList groups={groups} activeKey={activeKey} onSelect={onSelect} />
      </nav>
    </>
  );
}

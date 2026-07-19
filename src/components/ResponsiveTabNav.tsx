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
      {/* ── Sous-menu mobile : bouton → modale de sélection — icône en médaillon, tout sur une
          ligne ("Menu — <onglet actif>"). ── */}
      <div className="w-full lg:hidden">
        <button onClick={() => setMobileOpen(true)} style={{
          width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '8px 14px', borderRadius: 8, border: '1px solid #2A2F3A',
          backgroundColor: '#161920', color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, cursor: 'pointer',
          appearance: 'none', WebkitAppearance: 'none',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <span style={{
              width: 26, height: 26, borderRadius: '50%', backgroundColor: 'rgba(0,229,160,0.13)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <Menu size={14} style={{ color: '#00E5A0' }} />
            </span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ color: '#94A3B8' }}>Menu</span>
              <span style={{ color: '#475569' }}> — </span>
              <span>{activeLabel}</span>
            </span>
          </span>
          <ChevronDown size={16} style={{ color: '#64748B' }} />
        </button>
      </div>

      {mobileOpen && (
        // zIndex au-dessus de MobileBottomBar/TopBar (200) : sinon la barre du bas recouvre le bas
        // de la modale dès que la liste de sections est assez longue pour l'atteindre. maxHeight
        // retire aussi la place du marginTop et de la barre du bas, pour ne jamais passer dessous —
        // le contenu défile à l'intérieur (en-tête "Sections" fixe, liste scrollable) le cas échéant.
        <Modal onClose={() => setMobileOpen(false)} closeOnBackdropClick maxWidth={300} align="flex-start" zIndex={250}
          style={{ marginTop: 60, maxHeight: 'calc(100vh - 140px)' }}>
          <div style={{ padding: '14px 14px 8px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem' }}>Sections</span>
            <button onClick={() => setMobileOpen(false)} style={{ background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', padding: 4 }}>
              <X size={18} />
            </button>
          </div>
          <div style={{ padding: '0 14px 14px', overflowY: 'auto', minHeight: 0 }}>
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

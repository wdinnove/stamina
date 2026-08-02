import React from 'react';
import { Save } from 'lucide-react';
import { Card } from './Card';

// Coque commune à tous les sous-onglets de /configuration : même carte, même entête
// (icône + titre à gauche, bouton d'action à droite), même hauteur d'entête que le
// bouton soit présent ou non, mêmes marges. Le contenu spécifique va dans children.

/** Hauteur fixe de la ligne d'entête — indépendante de la présence d'un bouton. */
const HEADER_ROW_HEIGHT = 32;

export function ConfigCard({ icon, title, description, action, children, style }: {
  icon?: React.ReactNode;
  title: string;
  /** Paragraphe d'introduction affiché juste sous l'entête. */
  description?: React.ReactNode;
  /** Bouton (ou groupe de boutons) aligné à droite de l'entête. */
  action?: React.ReactNode;
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <Card style={{ padding: '20px 24px', borderRadius: 10, ...style }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        minHeight: HEADER_ROW_HEIGHT, borderBottom: '1px solid #2A2F3A',
        paddingBottom: 14, marginBottom: 18,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
          {icon && <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>}
          <p style={{
            color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {title}
          </p>
        </div>
        {action && <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{action}</div>}
      </div>

      {description && (
        <p style={{ color: '#64748B', fontSize: '0.8rem', margin: '0 0 16px' }}>{description}</p>
      )}

      {children}
    </Card>
  );
}

/** Empile plusieurs ConfigCard d'un même sous-onglet avec un espacement constant. */
export function ConfigStack({ children }: { children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>{children}</div>;
}

/** Bouton d'action de l'entête — même gabarit partout (hauteur alignée sur l'entête). */
export function ConfigAction({ icon, children, onClick, type = 'button', disabled, hideLabelOnMobile, tone = 'primary' }: {
  icon?: React.ReactNode;
  children: React.ReactNode;
  onClick?: () => void;
  type?: 'button' | 'submit';
  disabled?: boolean;
  /** Masque le libellé sous sm pour ne garder que l'icône. */
  hideLabelOnMobile?: boolean;
  tone?: 'primary' | 'neutral';
}) {
  const primary = tone === 'primary';
  return (
    <button type={type} onClick={onClick} disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        height: HEADER_ROW_HEIGHT, padding: '0 14px',
        backgroundColor: primary ? '#00E5A0' : '#1E2229',
        border: primary ? 'none' : '1px solid #2A2F3A',
        borderRadius: 6, color: primary ? '#0A0C10' : '#94A3B8',
        fontWeight: 700, fontSize: '0.82rem', whiteSpace: 'nowrap',
        cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.6 : 1,
      }}>
      {icon}
      <span className={hideLabelOnMobile ? 'hidden sm:inline' : undefined}>{children}</span>
    </button>
  );
}

/** Bouton « Enregistrer » de l'entête — partagé par toutes les sections de type formulaire. */
export function ConfigSaveAction({ loading, onClick }: { loading: boolean; onClick: () => void }) {
  return (
    <ConfigAction icon={<Save size={14} />} onClick={onClick} disabled={loading}>
      {loading ? 'Enregistrement…' : 'Enregistrer'}
    </ConfigAction>
  );
}

/** Message de retour d'un formulaire, placé en bas de carte de façon uniforme. */
export function ConfigMessage({ msg }: { msg: { ok: boolean; text: string } | null }) {
  if (!msg) return null;
  return (
    <p style={{ color: msg.ok ? '#00E5A0' : '#EF4444', fontSize: '0.78rem', margin: '14px 0 0' }}>{msg.text}</p>
  );
}

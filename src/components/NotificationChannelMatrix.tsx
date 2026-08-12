import { ChannelToggle } from './ChannelToggle';
import {
  NOTIFICATION_CATEGORIES,
  typesInCategory,
  categorySupportsEmail,
} from '../../shared/notifications.js';

export type Channel = 'inApp' | 'push' | 'email';

export const CHANNEL_LABELS: Record<Channel, string> = {
  inApp: "Dans l'app",
  push:  'Push',
  email: 'Email',
};

/** État d'un interrupteur pour une (catégorie, canal) donnée. */
export interface CellState {
  on: boolean;
  disabled: boolean;
  /** Explication du grisage — affichée en tooltip, et sous le libellé en vue mobile. */
  reason?: string;
}

interface Props {
  /** Canaux à afficher, dans l'ordre des colonnes. */
  channels: readonly Channel[];
  cell: (category: string, channel: Channel) => CellState;
  onToggle: (category: string, channel: Channel) => void;
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px', color: '#94A3B8', fontSize: '0.7rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em',
};

function CategoryLabel({ color, label, types }: { color: string; label: string; types: string }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: color, flexShrink: 0 }} />
        <span style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 500 }}>{label}</span>
      </div>
      <p style={{ color: '#475569', fontSize: '0.72rem', margin: '3px 0 0 16px' }}>{types}</p>
    </>
  );
}

/**
 * Matrice catégories × canaux des réglages de notification, partagée par les réglages d'équipe et
 * les préférences personnelles — pour que les deux écrans ne divergent pas.
 *
 * Deux rendus, pas un tableau qui défile : sous `md`, une carte par catégorie avec les canaux
 * empilés. Un `<table>` de 3 canaux ne tient pas sur 390 px, et le mettre dans un conteneur à
 * défilement horizontal cachait la dernière colonne sans le moindre indice — c'est ce qui faisait
 * qu'on ne voyait pas la colonne « Dans l'app ».
 */
export function NotificationChannelMatrix({ channels, cell, onToggle }: Props) {
  return (
    <>
      {/* ── Mobile : une carte par catégorie ── */}
      <div className="flex flex-col md:hidden" style={{ gap: 10 }}>
        {NOTIFICATION_CATEGORIES.map(cat => (
          <div key={cat.key} style={{
            backgroundColor: '#1A1F27', border: '1px solid #2A2F3A', borderRadius: 8,
            padding: '12px 14px',
          }}>
            <CategoryLabel color={cat.color} label={cat.label} types={typesInCategory(cat.key).map(t => t.label).join(' · ')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginTop: 10 }}>
              {channels.map(channel => {
                const state = cell(cat.key, channel);
                return (
                  <div key={channel} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    gap: 12, padding: '6px 0',
                  }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ color: state.disabled ? '#475569' : '#94A3B8', fontSize: '0.82rem' }}>
                        {CHANNEL_LABELS[channel]}
                      </div>
                      {state.reason && (
                        <div style={{ color: '#475569', fontSize: '0.68rem', marginTop: 1 }}>{state.reason}</div>
                      )}
                    </div>
                    <ChannelToggle
                      on={state.on}
                      disabled={state.disabled}
                      title={state.reason}
                      onClick={() => onToggle(cat.key, channel)}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      {/* ── Desktop : tableau ── */}
      <div className="hidden md:block">
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
              <th style={{ ...thStyle, textAlign: 'left' }}>Catégorie</th>
              {channels.map(c => (
                <th key={c} style={{ ...thStyle, textAlign: 'center' }}>{CHANNEL_LABELS[c]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_CATEGORIES.map(cat => (
              <tr key={cat.key} style={{ borderBottom: '1px solid #1A1F27' }}>
                <td style={{ padding: '10px' }}>
                  <CategoryLabel color={cat.color} label={cat.label} types={typesInCategory(cat.key).map(t => t.label).join(' · ')} />
                </td>
                {channels.map(channel => {
                  const state = cell(cat.key, channel);
                  return (
                    <td key={channel} style={{ padding: '10px', textAlign: 'center' }}>
                      <div style={{ display: 'flex', justifyContent: 'center' }}>
                        <ChannelToggle
                          on={state.on}
                          disabled={state.disabled}
                          title={state.reason}
                          onClick={() => onToggle(cat.key, channel)}
                        />
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** Vrai si la catégorie n'envoie aucun email — le canal est alors grisé. */
export const emailUnsupported = (category: string) => !categorySupportsEmail(category);

import { useState } from 'react';
import { AlertTriangle, ChevronRight, ChevronDown, ChevronUp, ShieldCheck } from 'lucide-react';
import { Card, CardTitle } from './Card';
import type { RiskAlert } from '../data/crossAnalysis';

interface RiskAlertsListProps {
  alerts: RiskAlert[];
  onOpenPlayer?: (playerId: string) => void;
  /** Masquer le nom du joueur (vue individuelle : contexte déjà connu) */
  hidePlayerName?: boolean;
  /** Repliée par défaut, avec un bouton chevron pour l'ouvrir (ex. page "Charge physique") */
  collapsible?: boolean;
}

const LEVEL_COLORS = { red: '#EF4444', amber: '#F59E0B' } as const;

const fmtDayMonth = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${Number(d)}/${Number(m)}`;
};

/** Zones à risque détectées par les règles charge/fraîcheur × perf/blessure/bien-être */
export function RiskAlertsList({ alerts, onOpenPlayer, hidePlayerName, collapsible }: RiskAlertsListProps) {
  const [collapsed, setCollapsed] = useState(!!collapsible);
  const accent = alerts.some(a => a.level === 'red') ? '#EF4444' : alerts.length ? '#F59E0B' : '#00E5A0';
  return (
    <Card accentColor={accent}>
      <CardTitle icon={<AlertTriangle size={12} style={{ color: accent }} />} mb={collapsed ? 0 : 12}
        info={alerts.length > 0 ? `${alerts.length}` : undefined}
        right={collapsible ? (
          <button onClick={() => setCollapsed(v => !v)} title={collapsed ? 'Afficher' : 'Réduire'}
            style={{ background: 'none', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', padding: 6, display: 'flex', alignItems: 'center' }}>
            {collapsed ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
          </button>
        ) : undefined}>
        Zones à risque
      </CardTitle>

      {collapsed ? null : alerts.length === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#00E5A0', fontSize: '0.8rem', padding: '6px 0' }}>
          <ShieldCheck size={15} />
          Aucune zone de risque détectée sur la période.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {alerts.map((a, i) => {
            const c = LEVEL_COLORS[a.level];
            const clickable = !!onOpenPlayer;
            return (
              <div key={`${a.playerId}-${a.title}-${i}`}
                onClick={clickable ? () => onOpenPlayer!(a.playerId) : undefined}
                className={clickable ? 'hover:brightness-110' : undefined}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  backgroundColor: `${c}0D`, borderLeft: `3px solid ${c}`, borderRadius: 6,
                  padding: '8px 12px', cursor: clickable ? 'pointer' : 'default',
                }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                    {!hidePlayerName && <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 700 }}><span className="hidden md:inline">{a.playerName}</span><span className="md:hidden">{a.playerNameShort}</span></span>}
                    <span style={{ color: c, fontSize: '0.75rem', fontWeight: 700 }}>{a.title}</span>
                    <span style={{ color: '#475569', fontSize: '0.68rem', marginLeft: 'auto' }}>{fmtDayMonth(a.date)}</span>
                  </div>
                  <div style={{ color: '#94A3B8', fontSize: '0.73rem', marginTop: 2, lineHeight: 1.45 }}>{a.detail}</div>
                </div>
                {clickable && <ChevronRight size={14} style={{ color: '#475569', flexShrink: 0 }} />}
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

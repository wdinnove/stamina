import type { PlayerRank } from '../data/types';
import { rpeColor } from '../utils/rpe';

interface PlayerRankingTableProps {
  players:           PlayerRank[];
  sessionLoadNormal: number;
  normalMax:         number;
}

function ZoneDot({ color }: { color: string }) {
  return <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', backgroundColor: color, marginRight: 3 }} />;
}

export function PlayerRankingTable({ players, sessionLoadNormal, normalMax }: PlayerRankingTableProps) {
  const t1 = normalMax / 3;
  const t2 = normalMax * 2 / 3;

  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ padding: '10px 16px', borderBottom: '1px solid #2A2F3A', backgroundColor: '#1A1E26' }}>
        <p style={{ color: '#94A3B8', fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0, fontWeight: 600 }}>Classement joueurs</p>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', minWidth: 760, borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: 28 }} />
            <col />
            <col style={{ width: '9%' }} />
            <col style={{ width: '9%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '7%' }} />
            <col style={{ width: '12%' }} />
          </colgroup>
          <thead>
            <tr style={{ backgroundColor: '#1A1E26', position: 'sticky', top: 0, zIndex: 1 }}>
              <th style={{ padding: '7px 8px', textAlign: 'left', color: '#475569', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A' }}>#</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', color: '#475569', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A' }}>Nom</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', color: '#475569', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A' }}>RPE</th>
              <th style={{ padding: '7px 8px', textAlign: 'left', color: '#475569', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A' }}>± 30j</th>
              {([
                { label: 'Sur.',  color: '#EF4444' },
                { label: 'Él.',   color: '#F97316' },
                { label: 'Sou.', color: '#EAB308' },
                { label: 'Lég.', color: '#00E5A0' },
              ] as const).map(({ label, color }) => (
                <th key={label} style={{ padding: '7px 8px', textAlign: 'left', fontSize: '0.67rem', fontWeight: 700, borderBottom: '1px solid #2A2F3A' }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color }}>
                    <ZoneDot color={color} />{label}
                  </span>
                </th>
              ))}
              <th style={{ padding: '7px 8px', textAlign: 'left', color: '#475569', fontSize: '0.67rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, borderBottom: '1px solid #2A2F3A' }}>Charge</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, idx) => {
              const uaPerSession = p.nbSessions > 0 ? Math.round(p.totalLoad / p.nbSessions) : 0;
              const uaT1s   = Math.round(sessionLoadNormal / 3);
              const uaT2s   = Math.round(sessionLoadNormal * 2 / 3);
              const uaColor = uaPerSession >= sessionLoadNormal ? '#EF4444' : uaPerSession >= uaT2s ? '#F97316' : uaPerSession >= uaT1s ? '#EAB308' : '#00E5A0';
              const uaLabel = uaPerSession >= sessionLoadNormal ? 'Surcharge' : uaPerSession >= uaT2s ? 'Élevée' : uaPerSession >= uaT1s ? 'Soutenu' : 'Normal';
              const rpeC    = rpeColor(p.avgRpe);
              const diff    = p.rpe3w !== null ? Math.round((p.rpe3w - p.avgRpe) * 10) / 10 : null;
              const arrowCfg = diff === null ? null
                : diff > 0.2  ? { sym: '▲', color: diff > 1 ? '#EF4444' : '#F97316' }
                : diff < -0.2 ? { sym: '▼', color: '#00E5A0' }
                : { sym: '—', color: '#475569' };

              const zones = p.weekLoads.reduce(
                (acc, load) => {
                  if (load >= normalMax)        acc.surcharge++;
                  else if (load >= t2)          acc.elevee++;
                  else if (load >= t1)          acc.soutenu++;
                  else                          acc.legere++;
                  return acc;
                },
                { surcharge: 0, elevee: 0, soutenu: 0, legere: 0 },
              );

              const zoneCell = (val: number, color: string) => (
                <td style={{ padding: '8px 8px' }}>
                  {val > 0
                    ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, color, fontSize: '0.78rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{val}</span>
                    : <span style={{ color: '#334155', fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace' }}>—</span>}
                </td>
              );

              return (
                <tr key={p.playerId} style={{ borderBottom: '1px solid #1E2229' }}
                  onMouseEnter={el => (el.currentTarget.style.backgroundColor = '#1E222940')}
                  onMouseLeave={el => (el.currentTarget.style.backgroundColor = 'transparent')}>
                  <td style={{ padding: '8px 8px', color: idx < 3 ? '#F59E0B' : '#334155', fontSize: '0.75rem', fontWeight: idx < 3 ? 700 : 400, fontFamily: 'JetBrains Mono, monospace' }}>{idx + 1}</td>
                  <td style={{ padding: '8px 8px', color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 0 }}>{p.name}</td>
                  <td style={{ padding: '8px 8px', color: rpeC, fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{p.avgRpe}</td>
                  <td style={{ padding: '8px 8px' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4,
                      color: diff === null ? '#475569' : diff > 0.2 ? (diff > 1 ? '#EF4444' : '#F97316') : diff < -0.2 ? '#00E5A0' : '#475569' }}>
                      <span style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', fontWeight: 600 }}>
                        {diff === null ? '—' : (diff > 0 ? '+' : '') + diff}
                      </span>
                      {arrowCfg && arrowCfg.sym !== '—' && <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{arrowCfg.sym}</span>}
                    </span>
                  </td>
                  {zoneCell(zones.surcharge, '#EF4444')}
                  {zoneCell(zones.elevee,    '#F97316')}
                  {zoneCell(zones.soutenu,   '#EAB308')}
                  {zoneCell(zones.legere,    '#00E5A0')}
                  <td style={{ padding: '8px 8px' }}>
                    <span style={{ backgroundColor: uaColor + '20', color: uaColor, fontSize: '0.62rem', fontWeight: 600, padding: '2px 5px', borderRadius: 4, whiteSpace: 'nowrap' }}>{uaLabel}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

import { PlayerAvatar } from '../../../components';
import { getPlayerById, fg2Pct, fg3Pct, ftPct } from '../../../data';
import type { MatchStat } from '../../../data';
import { Th, Td } from './StatCell';

interface BoxScoreProps {
  matchStats: MatchStat[];
}

export function BoxScore({ matchStats }: BoxScoreProps) {
  return (
    <div style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, overflow: 'auto' }}>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #2A2F3A' }}>
        <h3 style={{ color: '#F1F5F9', margin: 0 }}>Box Score — Joueurs</h3>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 900 }}>
        <thead>
          <tr>
            <Th left>Joueur</Th>
            <Th>MIN</Th><Th>PTS</Th>
            <Th>2R</Th><Th>2T</Th><Th>2%</Th>
            <Th>3R</Th><Th>3T</Th><Th>3%</Th>
            <Th>LR</Th><Th>LT</Th><Th>L%</Th>
            <Th>RO</Th><Th>RD</Th><Th>RT</Th>
            <Th>PD</Th><Th>CT</Th><Th>IN</Th><Th>BP</Th>
            <Th>FTE</Th><Th>FPR</Th><Th>ÉVAL</Th><Th>+/-</Th>
          </tr>
        </thead>
        <tbody>
          {matchStats.map(m => {
            const p  = getPlayerById(m.playerId);
            const rt = m.ro + m.rd;
            return (
              <tr key={m.id} style={{ backgroundColor: m.starter ? 'transparent' : '#1E222944' }}>
                <Td left>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {p && <PlayerAvatar player={p} size={22} />}
                    <span style={{ color: '#F1F5F9', fontSize: '0.82rem', fontFamily: 'Inter, sans-serif' }}>
                      {p ? `${p.firstName} ${p.lastName}` : '—'}
                      {!m.starter && <span style={{ color: '#475569', marginLeft: 4, fontSize: '0.7rem' }}>B</span>}
                    </span>
                  </div>
                </Td>
                <Td>{m.min}</Td>
                <Td highlight={m.pts >= 15 ? '#00E5A0' : undefined}>{m.pts}</Td>
                <Td>{m.fg2m}</Td><Td>{m.fg2a}</Td><Td>{fg2Pct(m)}</Td>
                <Td>{m.fg3m}</Td><Td>{m.fg3a}</Td><Td>{fg3Pct(m)}</Td>
                <Td>{m.ftm}</Td><Td>{m.fta}</Td><Td>{ftPct(m)}</Td>
                <Td>{m.ro}</Td><Td>{m.rd}</Td>
                <Td highlight={rt >= 8 ? '#F59E0B' : undefined}>{rt}</Td>
                <Td highlight={m.pd >= 6 ? '#3B82F6' : undefined}>{m.pd}</Td>
                <Td>{m.ct}</Td><Td>{m.intercepts}</Td>
                <Td highlight={m.bp >= 6 ? '#EF4444' : undefined}>{m.bp}</Td>
                <Td>{m.fte}</Td><Td>{m.fpr}</Td>
                <Td highlight={(m.eval ?? 0) >= 15 ? '#00E5A0' : (m.eval ?? 0) < 5 ? '#EF4444' : undefined}>{m.eval ?? '—'}</Td>
                <Td highlight={(m.plusMinus ?? 0) > 0 ? '#00E5A0' : (m.plusMinus ?? 0) < 0 ? '#EF4444' : undefined}>
                  {m.plusMinus != null ? (m.plusMinus > 0 ? `+${m.plusMinus}` : m.plusMinus) : '—'}
                </Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

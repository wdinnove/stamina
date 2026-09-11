import { useState, useMemo } from 'react';
import { useMatchTracking } from '../hooks/useMatchTracking';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { ShotCourt, SHOT_COLORS } from './ShotChart';
import { zoneStats, MIN_ATTEMPTS_FOR_PCT } from '../data/shotChart';
import { periodLabel } from '../data/liveTrackingAnalysis';
import { playerNameShort } from '../utils/playerName';
import type { Match, Player, LineupSide } from '../data/types';

/**
 * Grille de tir d'un match, filtrable — la lecture de ce que la saisie a posé sur le terrain.
 *
 * Les tirs sont stockés en coordonnées BRUTES : le découpage en zones vit dans `data/shotChart.ts`
 * et nulle part ailleurs, donc le refaire plus tard ne perd pas un tir. Les tirs saisis sans
 * position (repli du mode rapide) comptent au boxscore mais sont écartés d'ici — ils n'ont pas de
 * zone, et les compter comme « zone inconnue » fausserait tous les pourcentages.
 *
 * Le filtre par joueur ne coûte rien en base : `MatchEvent` porte déjà son auteur.
 */

export interface MatchShotChartPanelProps {
  match: Match;
  players: Player[];
}

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 14,
};

const SECTION_TITLE: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', margin: '0 0 8px',
};

type Outcome = 'all' | 'made' | 'miss';

export function MatchShotChartPanel({ match, players }: MatchShotChartPanelProps) {
  const { selected } = useTeamSeason();
  const teamColor    = selected?.team.color ?? '#00E5A0';
  const ourTeamName  = selected?.team.name ?? 'Notre équipe';
  const opponentName = match.opponent || 'Adversaire';

  const { events, opponents, hasData, loading, error } = useMatchTracking(match.id);

  const [side, setSide] = useState<LineupSide>('us');
  const [playerId, setPlayerId] = useState<string>('');   // '' = tous
  const [outcome, setOutcome] = useState<Outcome>('all');
  const [quarter, setQuarter] = useState<number>(0);      // 0 = tout le match

  /** Tirs positionnés du camp choisi — la base sur laquelle les filtres et les listes déroulantes
   *  travaillent, pour qu'un joueur sans tir n'apparaisse jamais dans le sélecteur. */
  const sideShots = useMemo(
    () => events.filter(e => e.side === side && e.type === 'shot' && e.x !== undefined),
    [events, side],
  );

  const quarters = useMemo(
    () => [...new Set(sideShots.map(e => e.quarter))].sort((a, b) => a - b),
    [sideShots],
  );

  /** Auteurs ayant réellement tiré. Côté adverse, les tirs anonymes n'ont pas d'auteur : ils
   *  restent dans « Tous » et disparaissent dès qu'un joueur est choisi. */
  const authors = useMemo(() => {
    const ids = new Set<string>();
    for (const e of sideShots) {
      const id = side === 'us' ? e.playerId : e.opponentPlayerId;
      if (id) ids.add(id);
    }
    const nameOf = side === 'us'
      ? (id: string) => { const p = players.find(x => x.id === id); return p ? playerNameShort(p) : '?'; }
      : (id: string) => opponents.find(x => x.id === id)?.name ?? '?';
    return [...ids].map(id => ({ id, name: nameOf(id) })).sort((a, b) => a.name.localeCompare(b.name));
  }, [sideShots, side, players, opponents]);

  const shots = useMemo(() => sideShots.filter(e => {
    if (quarter !== 0 && e.quarter !== quarter) return false;
    if (outcome === 'made' && !e.made) return false;
    if (outcome === 'miss' && e.made) return false;
    if (playerId) {
      const id = side === 'us' ? e.playerId : e.opponentPlayerId;
      if (id !== playerId) return false;
    }
    return true;
  }), [sideShots, quarter, outcome, playerId, side]);

  /**
   * Le tableau des zones ignore le filtre de RÉUSSITE : un pourcentage calculé sur les seuls tirs
   * réussis vaudrait toujours 100 %. Les autres filtres, eux, s'appliquent.
   */
  const zoneShots = useMemo(() => sideShots.filter(e => {
    if (quarter !== 0 && e.quarter !== quarter) return false;
    if (playerId) {
      const id = side === 'us' ? e.playerId : e.opponentPlayerId;
      if (id !== playerId) return false;
    }
    return true;
  }), [sideShots, quarter, playerId, side]);

  const zones = useMemo(() => zoneStats(zoneShots, side), [zoneShots, side]);
  const colors = side === 'us' ? { made: teamColor, miss: SHOT_COLORS.us.miss } : SHOT_COLORS.them;

  const made = shots.filter(s => s.made).length;
  const totalAttempts = zoneShots.length;
  const totalMade = zoneShots.filter(s => s.made).length;
  const noPosition = useMemo(
    () => events.filter(e => e.side === side && e.type === 'shot' && e.x === undefined).length,
    [events, side],
  );

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (!hasData) {
    return (
      <div style={{ ...PANEL, color: '#64748B', fontSize: '0.85rem', lineHeight: 1.6 }}>
        <p style={{ margin: 0, color: '#94A3B8', fontWeight: 600 }}>Aucune saisie en direct pour ce match.</p>
        <p style={{ margin: '8px 0 0' }}>
          Les positions de tir se posent sur le terrain depuis l'onglet <strong style={{ color: '#CBD5E1' }}>Saisie des stats</strong>.
          Un match importé par feuille de marque n'en aura jamais : la feuille de marque ne contient pas
          l'endroit d'où chaque tir a été pris.
        </p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`
        .shot-cell { padding: 7px 8px; font-size: 0.76rem; text-align: right; color: #CBD5E1; }
        .shot-cell:first-child { text-align: left; color: #F1F5F9; }
        .shot-head { padding: 6px 8px; font-size: 0.62rem; text-align: right; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; }
        .shot-head:first-child { text-align: left; }
        .shot-layout { display: grid; grid-template-columns: minmax(300px, 480px) minmax(0, 1fr); gap: 14px; align-items: start; }
        @media (max-width: 899px) { .shot-layout { grid-template-columns: minmax(0, 1fr); } }
      `}</style>

      <div style={{ ...PANEL, display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 4 }}>
          {([['us', ourTeamName], ['them', opponentName]] as const).map(([s, label]) => (
            <button key={s} onClick={() => { setSide(s); setPlayerId(''); }} aria-pressed={side === s} style={toggleStyle(side === s)}>
              {label}
            </button>
          ))}
        </div>

        <label style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ color: '#64748B', fontSize: '0.74rem' }}>Joueur</span>
          <select value={playerId} onChange={e => setPlayerId(e.target.value)}
            style={{ height: 32, padding: '0 8px', borderRadius: 6, backgroundColor: '#0D0F14', border: '1px solid #2A2F3A', color: '#CBD5E1', fontSize: '0.78rem', cursor: 'pointer' }}>
            <option value="">Tous</option>
            {authors.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </label>

        <div style={{ display: 'flex', gap: 4 }}>
          {([['all', 'Tous'], ['made', 'Réussis'], ['miss', 'Manqués']] as const).map(([v, label]) => (
            <button key={v} onClick={() => setOutcome(v)} aria-pressed={outcome === v} style={toggleStyle(outcome === v)}>
              {label}
            </button>
          ))}
        </div>

        {quarters.length > 1 && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setQuarter(0)} aria-pressed={quarter === 0} style={toggleStyle(quarter === 0)}>Match</button>
            {quarters.map(q => (
              <button key={q} onClick={() => setQuarter(q)} aria-pressed={quarter === q} style={toggleStyle(quarter === q)}>
                {periodLabel(q)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="shot-layout">
        <div style={PANEL}>
          <ShotCourt shots={shots} colors={colors} radius={0.3} />
          <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: '10px 0 0', textAlign: 'center' }}>
            {shots.length === 0
              ? 'Aucun tir ne correspond à ces filtres.'
              : outcome === 'all'
                ? <>{made}/{shots.length} · <strong style={{ color: '#F1F5F9' }}>{Math.round((made / shots.length) * 100)} %</strong></>
                : `${shots.length} tir${shots.length > 1 ? 's' : ''}`}
          </p>
          {noPosition > 0 && (
            <p style={{ color: '#475569', fontSize: '0.73rem', margin: '6px 0 0', textAlign: 'center' }}>
              {noPosition} tir{noPosition > 1 ? 's' : ''} saisi{noPosition > 1 ? 's' : ''} sans position, hors de cette carte.
            </p>
          )}
        </div>

        <div style={PANEL}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
            <p style={SECTION_TITLE}>Par zone</p>
            <p style={{ color: '#64748B', fontSize: '0.74rem', margin: '0 0 8px' }}>
              {totalMade}/{totalAttempts} au total
            </p>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 320 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                  {['Zone', 'Tirs', '%', 'eFG%'].map(h => <th key={h} className="shot-head">{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {zones.map(z => (
                  <tr key={z.zone} style={{ borderBottom: '1px solid #1E2229' }}>
                    <td className="shot-cell" style={{ color: z.attempts === 0 ? '#475569' : '#F1F5F9' }}>{z.label}</td>
                    <td className="shot-cell">{z.attempts === 0 ? '—' : `${z.made}/${z.attempts}`}</td>
                    <td className="shot-cell" style={{ color: pctColor(z.fgPct, z.thin) }}>
                      {z.fgPct === null ? '—' : `${Math.round(z.fgPct)} %`}
                    </td>
                    <td className="shot-cell" style={{ color: pctColor(z.efgPct, z.thin) }}>
                      {z.efgPct === null ? '—' : `${Math.round(z.efgPct)} %`}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p style={{ color: '#475569', fontSize: '0.73rem', margin: '10px 0 0', lineHeight: 1.5 }}>
            Les pourcentages grisés portent sur moins de {MIN_ATTEMPTS_FOR_PCT} tirs : le nombre de tirs
            se lit, pas le taux. Ce tableau ignore le filtre Réussis / Manqués — sans quoi il afficherait
            toujours 100 %.
          </p>
        </div>
      </div>
    </div>
  );
}

function toggleStyle(active: boolean): React.CSSProperties {
  return {
    height: 32, padding: '0 12px', borderRadius: 6, fontSize: '0.74rem', cursor: 'pointer',
    border: `1px solid ${active ? '#00E5A0' : '#2A2F3A'}`,
    backgroundColor: active ? '#00E5A01F' : '#0D0F14',
    color: active ? '#00E5A0' : '#94A3B8',
    maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
  };
}

/** Un taux sur trop peu de tirs se lit en gris : il est affiché parce que le masquer cacherait
 *  aussi le nombre de tirs, mais il ne doit pas se lire comme une tendance. */
function pctColor(pct: number | null, thin: boolean): string {
  if (pct === null) return '#475569';
  return thin ? '#64748B' : '#F1F5F9';
}


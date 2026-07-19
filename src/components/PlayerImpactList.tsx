import { Link } from 'react-router';
import { strengthWord } from '../utils/correlation';
import { Badge } from './Badge';
import type { PlayerImpact } from '../data/pca';

interface PlayerImpactListProps {
  impacts: PlayerImpact[];
}

const WIN_COLOR = '#06B6D4';
const LOSS_COLOR = '#F59E0B';
const LEADER_COLOR = '#8B5CF6';
const LOW_CONFIDENCE_MATCHES = 8;

function ImpactRow({ f, color, isLeader }: { f: PlayerImpact; color: string; isLeader: boolean }) {
  const pct = Math.round(Math.abs(f.corr) * 100);
  const lowConfidence = f.n < LOW_CONFIDENCE_MATCHES;
  return (
    <div
      className="grid items-center gap-3 [grid-template-columns:minmax(140px,220px)_1fr_130px] sm:[grid-template-columns:minmax(140px,220px)_1fr_60px_130px]"
      style={{ opacity: lowConfidence ? 0.72 : 1 }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <span style={{ color: '#F1F5F9', fontSize: '0.8rem', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label}</span>
        {isLeader && <Badge color={LEADER_COLOR} label="★ Top 3" size="sm" style={{ flexShrink: 0 }} />}
      </span>
      <div className="hidden sm:block" style={{ height: 8, backgroundColor: '#1E2229', borderRadius: 4, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${pct}%`, backgroundColor: color, borderRadius: 4 }} />
      </div>
      <span className="sm:hidden" style={{ color, fontSize: '0.8rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
        {pct}%
      </span>
      <span className="hidden sm:inline" style={{ fontSize: '0.68rem', color: '#475569', whiteSpace: 'nowrap', textAlign: 'right' }}>
        {lowConfidence ? 'tendance fragile' : ''}
      </span>
      <span style={{ fontSize: '0.72rem', fontWeight: 700, color, whiteSpace: 'nowrap', textAlign: 'right' }}>
        {strengthWord(Math.abs(f.corr))}
      </span>
    </div>
  );
}

export function PlayerImpactList({ impacts }: PlayerImpactListProps) {
  if (impacts.length === 0) {
    return (
      <p style={{ color: '#64748B', fontSize: '0.78rem', margin: 0 }}>
        Impossible de dégager une tendance pour l'instant : il faut au moins 5 matchs évalués par joueur pour que le calcul ait du sens.
      </p>
    );
  }

  const winLeaning = impacts.filter(f => f.corr > 0);
  const lossLeaning = impacts.filter(f => f.corr <= 0).sort((a, b) => a.corr - b.corr);
  const top3 = [...impacts].sort((a, b) => b.avgEval - a.avgEval).slice(0, 3);
  const top3Ids = new Set(top3.map(f => f.playerId));

  return (
    <div>
      <div style={{
        marginBottom: 24, padding: '12px 14px', borderRadius: 8,
        backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderLeft: `3px solid ${LEADER_COLOR}`,
      }}>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: LEADER_COLOR, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          ★ Meilleures éval de la saison
        </span>
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 16px' }}>
          {top3.map(f => (
            <span key={f.playerId} style={{ fontSize: '0.8rem', color: '#F1F5F9', fontWeight: 600 }}>
              {f.label} <span style={{ color: '#64748B', fontWeight: 400 }}>({f.avgEval})</span>
            </span>
          ))}
        </div>
        <Link to="/performance-collective/classement-joueurs" style={{ fontSize: '0.68rem', color: '#64748B', display: 'inline-block', marginTop: 10 }}>
          Voir le classement complet →
        </Link>
      </div>

      {winLeaning.length > 0 && (
        <div style={{ marginBottom: lossLeaning.length > 0 ? 24 : 0 }}>
          <h4 style={{ color: WIN_COLOR, fontSize: '0.72rem', fontWeight: 700, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Facteur X — ses meilleurs matchs coïncident avec les victoires
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {winLeaning.map(f => <ImpactRow key={f.playerId} f={f} color={WIN_COLOR} isLeader={top3Ids.has(f.playerId)} />)}
          </div>
        </div>
      )}

      {lossLeaning.length > 0 && (
        <div>
          <h4 style={{ color: LOSS_COLOR, fontSize: '0.72rem', fontWeight: 700, margin: '0 0 10px', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
            Ses meilleurs matchs coïncident plutôt avec les défaites
          </h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {lossLeaning.map(f => <ImpactRow key={f.playerId} f={f} color={LOSS_COLOR} isLeader={top3Ids.has(f.playerId)} />)}
          </div>
        </div>
      )}

      <p style={{ color: '#475569', fontSize: '0.68rem', lineHeight: 1.7, margin: '24px 0 0' }}>
        Ces deux listes ne mesurent pas le niveau de jeu général d'un joueur : elles repèrent uniquement les écarts entre ses matchs, et si ses pics de forme tombent plutôt en victoire ou en défaite. Un joueur très régulier (bon tout le temps) peut donc apparaître en bas de liste sans que ce soit un signe négatif — le badge <span style={{ color: LEADER_COLOR, fontWeight: 700 }}>★ Top 3</span> le rappelle quand il fait partie des meilleures éval de la saison, quel que soit son classement ci-dessus. À lire comme une tendance, pas un jugement, surtout quand la mention « tendance fragile » apparaît.
      </p>
    </div>
  );
}

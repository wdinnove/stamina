import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from 'recharts';
import { useMatchTracking } from '../hooks/useMatchTracking';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { quarterSplits } from '../data/matchFlow';
import type { TeamTotals } from '../data/matchEvents';
import { periodLabel } from '../data/liveTrackingAnalysis';
import { EmptyState } from './EmptyState';
import type { Match } from '../data/types';

/**
 * Quart-temps par quart-temps, pour UN match — le pendant de « QT par QT » de l'analyse
 * collective, qui lui fait la moyenne sur une saison.
 *
 * Deux sources, dans cet ordre :
 *   1. `matches.quarter_scores` — le score par quart-temps, saisi à la main ou écrit à la
 *      publication d'une saisie. C'est la seule qui existe pour un match importé par feuille de
 *      marque, et c'est le cas le plus fréquent.
 *   2. `match_events` — le détail complet (tirs, rebonds, pertes, possessions), disponible
 *      uniquement pour un match pointé action par action.
 *
 * Les colonnes de détail n'apparaissent donc que quand elles existent. Afficher des tirets sur
 * huit colonnes pour un match importé donnerait l'impression d'une donnée perdue, alors qu'une
 * feuille de marque ne l'a jamais contenue.
 */

export interface MatchQuarterPanelProps {
  match: Match;
}

const PANEL: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 14,
};

const SECTION_TITLE: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.05em', margin: '0 0 10px',
};

interface QuarterRow {
  quarter: number;
  us: number;
  them: number;
  diff: number;
  /** Score cumulé APRÈS ce quart-temps — ce qu'affichait la table de marque à la sirène. */
  cumUs: number;
  cumThem: number;
  /** Détail de notre camp, seulement pour un match pointé action par action. */
  detail?: TeamTotals;
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n));
const diffColor = (n: number) => (n > 0 ? '#00E5A0' : n < 0 ? '#EF4444' : '#64748B');

export function MatchQuarterPanel({ match }: MatchQuarterPanelProps) {
  const { selected } = useTeamSeason();
  const teamColor   = selected?.team.color ?? '#00E5A0';
  const ourTeamName = selected?.team.name ?? 'Nous';
  const opponentName = match.opponent || 'Adversaire';

  const { events, hasData, loading, error } = useMatchTracking(match.id);

  const splits = useMemo(() => quarterSplits(events), [events]);

  const rows: QuarterRow[] = useMemo(() => {
    const detailByQuarter = new Map(splits.map(s => [s.quarter, s]));
    // Le score saisi fait foi sur le nombre de quart-temps : une saisie interrompue à la mi-temps
    // ne doit pas réduire un match déjà renseigné en entier.
    const scores = match.quarterScores?.length
      ? match.quarterScores.map((q, i) => ({ quarter: i + 1, us: q.us, them: q.them }))
      : splits.map(s => ({ quarter: s.quarter, us: s.pointsUs, them: s.pointsThem }));

    let cumUs = 0, cumThem = 0;
    return scores.map(s => {
      cumUs += s.us;
      cumThem += s.them;
      return {
        quarter: s.quarter, us: s.us, them: s.them, diff: s.us - s.them,
        cumUs, cumThem,
        detail: detailByQuarter.get(s.quarter)?.us,
      };
    });
  }, [match.quarterScores, splits]);

  const hasDetail = rows.some(r => r.detail);

  /** Le quart-temps le plus fort et le plus faible : c'est la lecture qu'on vient chercher ici,
   *  et la retrouver d'un coup d'œil évite de comparer huit lignes à la main. */
  const best  = useMemo(() => rows.reduce<QuarterRow | null>((b, r) => !b || r.diff > b.diff ? r : b, null), [rows]);
  const worst = useMemo(() => rows.reduce<QuarterRow | null>((w, r) => !w || r.diff < w.diff ? r : w, null), [rows]);

  const chartData = useMemo(
    () => rows.map(r => ({ label: periodLabel(r.quarter), [ourTeamName]: r.us, [opponentName]: r.them })),
    [rows, ourTeamName, opponentName],
  );

  if (loading) return <div style={{ color: '#64748B', padding: 24 }}>Chargement…</div>;
  if (error)   return <div style={{ color: '#EF4444', padding: 24 }}>{error}</div>;

  if (rows.length === 0) {
    return (
      <EmptyState message={
        hasData
          ? "Aucune action datée sur ce match : le détail par quart-temps se construit à partir du chrono."
          : "Aucun score par quart-temps. Renseignez-le dans la fiche du match, ou publiez une saisie en direct."
      } />
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <style>{`
        .qt-cell { padding: 8px 10px; font-size: 0.8rem; text-align: right; color: #CBD5E1; white-space: nowrap; }
        .qt-cell:first-child { text-align: left; color: #F1F5F9; font-weight: 700; }
        .qt-head { padding: 7px 10px; font-size: 0.62rem; text-align: right; color: #64748B;
          text-transform: uppercase; letter-spacing: 0.04em; font-weight: 700; white-space: nowrap; }
        .qt-head:first-child { text-align: left; }
      `}</style>

      {/* Meilleur et pire quart-temps — prolongations comprises, contrairement à la vue saison :
          sur UN match elles ont été jouées, il n'y a aucune moyenne à fausser. */}
      {best && worst && best.quarter !== worst.quarter && (
        <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 12 }}>
          {([['Meilleur quart-temps', best, '#00E5A0'], ['Plus difficile', worst, '#EF4444']] as const).map(([label, r, color]) => (
            <div key={label} style={{ ...PANEL, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <p style={{ ...SECTION_TITLE, margin: 0 }}>{label}</p>
                <p style={{ color: '#F1F5F9', fontSize: '1.1rem', fontWeight: 800, margin: '4px 0 0' }}>
                  {periodLabel(r.quarter)}
                </p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ color, fontSize: '1.6rem', fontWeight: 800, margin: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                  {signed(r.diff)}
                </p>
                <p style={{ color: '#475569', fontSize: '0.74rem', margin: '2px 0 0' }}>{r.us} — {r.them}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={PANEL}>
        <p style={SECTION_TITLE}>Points par quart-temps</p>
        <div style={{ width: '100%', height: 240 }}>
          <ResponsiveContainer>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#2A2F3A" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: '#64748B', fontSize: 12 }} axisLine={{ stroke: '#2A2F3A' }} tickLine={false} />
              <YAxis tick={{ fill: '#64748B', fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 8, fontSize: '0.8rem' }}
                labelStyle={{ color: '#F1F5F9' }} cursor={{ fill: '#FFFFFF08' }}
              />
              <Legend wrapperStyle={{ fontSize: '0.75rem', color: '#94A3B8' }} />
              <Bar dataKey={ourTeamName}  fill={teamColor} radius={[3, 3, 0, 0]} />
              <Bar dataKey={opponentName} fill="#475569"   radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div style={PANEL}>
        <p style={SECTION_TITLE}>Détail</p>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: hasDetail ? 700 : 380 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                {['', 'Marqués', 'Encaissés', 'Écart', 'Cumul',
                  ...(hasDetail ? ['2 pts', '3 pts', 'LF', 'RO', 'BP', 'Poss.'] : [])].map((h, i) => (
                  <th key={i} className="qt-head">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.quarter} style={{ borderBottom: '1px solid #1E2229' }}>
                  <td className="qt-cell">{periodLabel(r.quarter)}</td>
                  <td className="qt-cell" style={{ fontWeight: 700, color: '#F1F5F9' }}>{r.us}</td>
                  <td className="qt-cell">{r.them}</td>
                  <td className="qt-cell" style={{ fontWeight: 700, color: diffColor(r.diff) }}>{signed(r.diff)}</td>
                  <td className="qt-cell" style={{ fontFamily: 'JetBrains Mono, monospace', color: '#94A3B8' }}>
                    {r.cumUs} — {r.cumThem}
                  </td>
                  {hasDetail && (
                    <>
                      <td className="qt-cell">{r.detail ? `${r.detail.fg2m}/${r.detail.fg2a}` : '—'}</td>
                      <td className="qt-cell">{r.detail ? `${r.detail.fg3m}/${r.detail.fg3a}` : '—'}</td>
                      <td className="qt-cell">{r.detail ? `${r.detail.ftm}/${r.detail.fta}` : '—'}</td>
                      <td className="qt-cell">{r.detail ? r.detail.ro : '—'}</td>
                      <td className="qt-cell">{r.detail ? r.detail.bp : '—'}</td>
                      <td className="qt-cell">{r.detail ? r.detail.possessions.toFixed(1) : '—'}</td>
                    </>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p style={{ color: '#475569', fontSize: '0.73rem', margin: '10px 0 0', lineHeight: 1.5 }}>
          L'écart est celui du quart-temps seul, jamais le cumul.
          {hasDetail
            ? ' Les colonnes de tir sont les nôtres, dérivées de la saisie en direct.'
            : " Le détail par tir vient de l'onglet Prise statistiques : une feuille de marque ne le contient pas."}
        </p>
      </div>
    </div>
  );
}

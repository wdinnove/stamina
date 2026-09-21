import { Fragment } from 'react';
import type { TeamComparisonGroup } from '../pages/MatchDetailPage';

/**
 * Page 3 de l'export boxscore — la même comparaison collective que l'onglet « Comparaisons
 * équipes » à l'écran, imprimée : un tableau vertical à 3 colonnes (nous / statistique / eux),
 * groupé par thème. Paysage comme les deux pages boxscore qui précèdent — `exportPagesToPdf`
 * fixe une seule orientation pour tout le document ; le tableau est centré, il n'a pas besoin de
 * toute la largeur.
 */

export const TEAM_COMPARISON_PDF_PAGE_CLASS = 'team-comparison-pdf-page';

const INK = '#0F172A';
const MUTED = '#64748B';
const FAINT = '#94A3B8';
const LINE = '#E2E8F0';
const WIN = '#00815C';
const LOSS = '#DC2626';

export interface TeamComparisonPdfPageProps {
  ourLabel: string;
  theirLabel: string;
  subtitle: string;
  groups: TeamComparisonGroup[];
  pageNumber: number;
  totalPages: number;
}

export function TeamComparisonPdfPage({ ourLabel, theirLabel, subtitle, groups, pageNumber, totalPages }: TeamComparisonPdfPageProps) {
  const show = (v: number | null, fmt?: (v: number) => string) => v === null ? '—' : fmt ? fmt(v) : String(v);

  return (
    <div
      className={TEAM_COMPARISON_PDF_PAGE_CLASS}
      style={{
        width: 1123, height: 794,
        backgroundColor: '#FFFFFF', color: INK, boxSizing: 'border-box',
        padding: 40, flexShrink: 0, position: 'relative',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex', flexDirection: 'column', alignItems: 'center',
      }}
    >
      <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 14, marginBottom: 22, width: '100%', maxWidth: 480 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#00A67E' }}>
          Comparaison équipes
        </p>
        <h1 style={{ margin: '4px 0 6px', fontSize: 22, fontWeight: 800, letterSpacing: '-0.5px' }}>{ourLabel} — {theirLabel}</h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{subtitle}</p>
      </div>

      <table style={{ width: '100%', maxWidth: 480, borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'right', padding: '0 10px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: INK, width: '38%' }}>{ourLabel}</th>
            <th style={{ textAlign: 'center', padding: '0 10px 8px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: FAINT, width: '24%' }}>Statistique</th>
            <th style={{ textAlign: 'left', padding: '0 10px 8px', fontSize: 10, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: MUTED, width: '38%' }}>{theirLabel}</th>
          </tr>
        </thead>
        <tbody>
          {groups.map(g => (
            <Fragment key={g.title}>
              <tr>
                <td colSpan={3} style={{ padding: '10px 10px 5px', fontSize: 9.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: MUTED, borderBottom: `1px solid ${LINE}`, borderTop: `1px solid ${LINE}`, backgroundColor: '#F8FAFC' }}>
                  {g.title}
                </td>
              </tr>
              {g.rows.map(r => {
                const comparable = r.own !== null && r.opp !== null;
                const ownWins = comparable && (r.higherBetter === true ? r.own! > r.opp! : r.higherBetter === false ? r.own! < r.opp! : false);
                const oppWins = comparable && (r.higherBetter === true ? r.opp! > r.own! : r.higherBetter === false ? r.opp! < r.own! : false);
                return (
                  <tr key={r.label} style={{ borderBottom: `1px solid ${LINE}` }}>
                    <td style={{ textAlign: 'right', padding: '6px 10px', fontSize: 12, fontWeight: ownWins ? 700 : 400, color: ownWins ? WIN : oppWins ? LOSS : INK }}>{show(r.own, r.fmt)}</td>
                    <td style={{ textAlign: 'center', padding: '6px 10px', fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.03em', color: FAINT }}>{r.label}</td>
                    <td style={{ textAlign: 'left', padding: '6px 10px', fontSize: 12, fontWeight: oppWins ? 700 : 400, color: oppWins ? WIN : ownWins ? LOSS : INK }}>{show(r.opp, r.fmt)}</td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', maxWidth: 480,
        borderTop: `1px solid ${LINE}`, paddingTop: 8, marginTop: 'auto', fontSize: 9.5, color: FAINT,
      }}>
        <span>Stamina</span>
        <span>{pageNumber} / {totalPages}</span>
      </div>
    </div>
  );
}

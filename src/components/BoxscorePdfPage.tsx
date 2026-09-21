import { shotPct } from '../data/helpers';
import { formatMinutes, fmt1 } from '../utils/format';

/**
 * Page imprimée d'un boxscore — une page A4 PAYSAGE par équipe, capturée telle quelle par
 * `exportPagesToPdf`. Vingt colonnes ne tiennent pas lisiblement en portrait ; c'est le format
 * d'un vrai feuille de marque, pas un choix de confort.
 *
 * Fond blanc, encre sombre : comme le reste des documents exportés (`ReportKit`), un document
 * imprimé n'a pas la charte sombre de l'écran. Volontairement SANS le style du reste de
 * `ReportKit` (`ReportPage` est fixé en portrait) — reprendre ses couleurs suffit, sa mise en
 * page ne convient pas à un tableau large.
 *
 * ponytail: une seule page par équipe, sans pagination si le contenu déborde (`overflow: hidden`
 * coupe silencieusement au-delà). Sans risque avec un cinq de basket + un banc ; à revoir si des
 * effectifs de plus de ~20 joueurs par match doivent un jour être exportés — reprendre alors la
 * pagination par hauteur mesurée de `ReportKit`/`ReportsPage`.
 */

export const BOXSCORE_PDF_PAGE_CLASS = 'boxscore-pdf-page';

/** A4 paysage à 96 dpi — les dimensions portrait de `ReportKit.A4`, permutées. */
export const BOXSCORE_PDF_SIZE = { width: 1123, height: 794 };

const INK = '#0F172A';
const MUTED = '#64748B';
const FAINT = '#94A3B8';
const LINE = '#E2E8F0';

/** Une ligne de boxscore — joueur, ou ligne de synthèse (« Équipe », « Totaux »). Même forme pour
 *  les deux, pour que les colonnes s'écrivent une seule fois. */
export interface BoxscorePdfRow {
  name: string;
  /** `null` = pas de numéro à afficher (adversaire non numéroté, ligne de synthèse). */
  number: number | null;
  starter?: boolean;
  kind?: 'summary';
  /** Minutes en DÉCIMAL (comme en base). `null` = case vide (la ligne « Équipe » n'a pas de
   *  temps de jeu propre). Un joueur s'affiche en mm:ss ; une synthèse reste en décimal, comme
   *  à l'écran — un total de minutes n'est pas un temps de jeu, il ne se lit pas comme une durée. */
  min: number | null;
  pts: number;
  fg2m: number; fg2a: number;
  fg3m: number; fg3a: number;
  ftm: number; fta: number;
  ro: number; rd: number;
  pd: number; ct: number; intercepts: number; bp: number;
  fte: number; fpr: number;
  evalValue: number | null;
  plusMinus: number | null;
}

const pctCell = (m: number, a: number): string => {
  const p = shotPct(m, a);
  return p === null ? '—' : `${p}%`;
};

const signed = (v: number | null): string => {
  if (v === null) return '—';
  return v > 0 ? `+${v}` : String(v);
};

interface Col {
  key: string;
  label: string;
  width: number;
  render: (r: BoxscorePdfRow) => string;
  bold?: (r: BoxscorePdfRow) => boolean;
}

/** Les colonnes du boxscore imprimé, dans le même ordre et sous les mêmes libellés que
 *  l'onglet Boxscore à l'écran — le document doit se reconnaître au premier coup d'œil. */
export const BOXSCORE_PDF_COLUMNS: Col[] = [
  { key: 'num',   label: '#',    width: 26,  render: r => r.number !== null ? String(r.number) : '—' },
  { key: 'min',   label: 'MIN',  width: 52,  render: r => r.min === null ? '—' : (r.kind === 'summary' ? fmt1(r.min) : formatMinutes(r.min)) },
  { key: 'pts',   label: 'PTS',  width: 36,  render: r => String(r.pts), bold: () => true },
  { key: 'fg2',   label: '2PTS', width: 48,  render: r => `${r.fg2m}/${r.fg2a}` },
  { key: 'fg2p',  label: '2%',   width: 40,  render: r => pctCell(r.fg2m, r.fg2a) },
  { key: 'fg3',   label: '3PTS', width: 48,  render: r => `${r.fg3m}/${r.fg3a}` },
  { key: 'fg3p',  label: '3%',   width: 40,  render: r => pctCell(r.fg3m, r.fg3a) },
  { key: 'ft',    label: 'LF',   width: 42,  render: r => `${r.ftm}/${r.fta}` },
  { key: 'ftp',   label: 'LF%',  width: 40,  render: r => pctCell(r.ftm, r.fta) },
  { key: 'ro',    label: 'RO',   width: 30,  render: r => String(r.ro) },
  { key: 'rd',    label: 'RD',   width: 30,  render: r => String(r.rd) },
  { key: 'rt',    label: 'RT',   width: 30,  render: r => String(r.ro + r.rd), bold: () => true },
  { key: 'pd',    label: 'PD',   width: 30,  render: r => String(r.pd) },
  { key: 'ct',    label: 'CT',   width: 30,  render: r => String(r.ct) },
  { key: 'in',    label: 'IN',   width: 30,  render: r => String(r.intercepts) },
  { key: 'bp',    label: 'BP',   width: 30,  render: r => String(r.bp) },
  { key: 'fte',   label: 'FTE',  width: 34,  render: r => String(r.fte) },
  { key: 'fpr',   label: 'FPR',  width: 34,  render: r => String(r.fpr) },
  { key: 'eval',  label: 'ÉVAL', width: 40,  render: r => r.evalValue === null ? '—' : String(r.evalValue) },
  { key: 'pm',    label: '+/-',  width: 40,  render: r => signed(r.plusMinus) },
];

const NAME_COL_WIDTH = 190;

export interface BoxscorePdfPageProps {
  /** « NF2 » ou le nom de l'adversaire — le titre de la page. */
  teamLabel: string;
  /** Un sous-titre de repère : adversaire, date, score final. */
  subtitle: string;
  rows: BoxscorePdfRow[];
  pageNumber: number;
  totalPages: number;
}

export function BoxscorePdfPage({ teamLabel, subtitle, rows, pageNumber, totalPages }: BoxscorePdfPageProps) {
  return (
    <div
      className={BOXSCORE_PDF_PAGE_CLASS}
      style={{
        width: BOXSCORE_PDF_SIZE.width, height: BOXSCORE_PDF_SIZE.height,
        backgroundColor: '#FFFFFF', color: INK, boxSizing: 'border-box',
        padding: 40, flexShrink: 0, position: 'relative',
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 14, marginBottom: 18 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#00A67E' }}>
          Boxscore
        </p>
        <h1 style={{ margin: '4px 0 6px', fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px' }}>{teamLabel}</h1>
        <p style={{ margin: 0, fontSize: 12, color: MUTED }}>{subtitle}</p>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col style={{ width: NAME_COL_WIDTH }} />
            {BOXSCORE_PDF_COLUMNS.map(c => <col key={c.key} style={{ width: c.width }} />)}
          </colgroup>
          <thead>
            <tr style={{ borderBottom: `1.5px solid ${INK}` }}>
              <th style={{ textAlign: 'left', padding: '0 6px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
                Joueur
              </th>
              {BOXSCORE_PDF_COLUMNS.map(c => (
                <th key={c.key} style={{ textAlign: 'center', padding: '0 4px 7px', fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED }}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const summary = r.kind === 'summary';
              return (
                <tr key={i} style={{
                  borderBottom: `1px solid ${LINE}`,
                  backgroundColor: summary ? '#F8FAFC' : undefined,
                }}>
                  <td style={{
                    textAlign: 'left', padding: '6px 6px', fontSize: 11, whiteSpace: 'nowrap',
                    overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: NAME_COL_WIDTH,
                    fontWeight: summary ? 700 : 600,
                    color: summary ? MUTED : INK,
                    textTransform: summary ? 'uppercase' : undefined,
                    letterSpacing: summary ? '0.04em' : undefined,
                  }}>
                    {r.name}{r.starter && !summary && <span style={{ color: FAINT }}> ★</span>}
                  </td>
                  {BOXSCORE_PDF_COLUMNS.map(c => (
                    <td key={c.key} style={{
                      textAlign: 'center', padding: '6px 4px', fontSize: 11,
                      fontWeight: c.bold?.(r) ? 700 : 400,
                    }}>
                      {c.render(r)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: `1px solid ${LINE}`, paddingTop: 8, marginTop: 12, fontSize: 9.5, color: FAINT,
      }}>
        <span>Stamina</span>
        <span>{pageNumber} / {totalPages}</span>
      </div>
    </div>
  );
}

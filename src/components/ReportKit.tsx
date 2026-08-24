import type { ReactNode, CSSProperties } from 'react';

/**
 * Les briques de mise en page d'un rapport — un document, pas un écran.
 *
 * Rien ici ne réutilise la charte sombre de l'app : un rapport est imprimé, archivé, transmis à
 * un dirigeant. Il a donc sa propre identité visuelle (fond blanc, encre sombre, un seul accent),
 * son propre rythme typographique, et surtout sa propre sélection d'informations — un gabarit
 * choisit ce qui compte là où un écran laisse tout explorer.
 *
 * Les pages ont une taille A4 fixe en pixels (96 dpi) : c'est ce qui permet à l'export de
 * capturer page par page, sans jamais couper un tableau au milieu d'une ligne.
 */

export const INK    = '#0F172A';
export const MUTED  = '#64748B';
export const FAINT  = '#94A3B8';
export const LINE   = '#E2E8F0';
export const SOFT   = '#F8FAFC';
export const ACCENT = '#00A67E';

/** A4 portrait à 96 dpi. */
export const A4 = { width: 794, height: 1123 };
const PAD = 46;

export type Tone = 'neutral' | 'good' | 'warn' | 'bad';

/** "12 juillet 2026" — sans le jour de la semaine, qui n'apporte rien à une borne de période. */
export function reportDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

/** "12/07/2026" — la forme compacte, pour les colonnes de tableau où le mois en toutes lettres
 *  passerait à la ligne. */
export function reportDateNum(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** Un entier à la française : "39 530". */
export function reportInt(v: number): string {
  return Math.round(v).toLocaleString('fr-FR');
}

/** Une décimale à la française : "5,4" — `fmt1` de l'app produit un point, inadapté à un document. */
export function reportDec(v: number | null | undefined, fallback = '—'): string {
  return v === null || v === undefined ? fallback : v.toLocaleString('fr-FR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export const TONE_COLOR: Record<Tone, string> = {
  neutral: INK,
  good:    '#00875F',
  warn:    '#B45309',
  bad:     '#B91C1C',
};

/** Classe posée sur chaque page : l'export s'en sert pour les retrouver dans l'ordre. */
export const REPORT_PAGE_CLASS = 'report-page';

/**
 * Une page du document. Le bandeau de rappel en haut et le numéro en bas sont répétés partout :
 * une page détachée du reste doit rester identifiable.
 */
export function ReportPage({ running, pageNumber, totalPages, children }: {
  /** Rappel discret en tête de page (équipe, sujet, période). */
  running?: string;
  pageNumber: number;
  totalPages: number;
  children: ReactNode;
}) {
  return (
    <div
      className={REPORT_PAGE_CLASS}
      style={{
        width: A4.width, height: A4.height, backgroundColor: '#FFFFFF', color: INK,
        padding: PAD, boxSizing: 'border-box', position: 'relative', flexShrink: 0,
        fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
        display: 'flex', flexDirection: 'column',
      }}
    >
      {running && (
        <div style={{
          fontSize: 9.5, color: FAINT, letterSpacing: '0.06em', textTransform: 'uppercase',
          fontWeight: 600, marginBottom: 18,
        }}>
          {running}
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>

      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        borderTop: `1px solid ${LINE}`, paddingTop: 8, marginTop: 16, fontSize: 9.5, color: FAINT,
      }}>
        <span>Stamina</span>
        <span>{pageNumber} / {totalPages}</span>
      </div>
    </div>
  );
}

/** Le pavé d'ouverture du document : ce qu'on lit avant tout chiffre. */
export function ReportTitle({ title, subject, meta }: {
  title: string;
  subject: string;
  /** Lignes d'identification : période couverte, date d'établissement. */
  meta: { label: string; value: string }[];
}) {
  return (
    <div style={{ borderBottom: `2px solid ${INK}`, paddingBottom: 18, marginBottom: 24 }}>
      <p style={{ margin: 0, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ACCENT }}>
        {title}
      </p>
      <h1 style={{ margin: '6px 0 14px', fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', lineHeight: 1.1 }}>
        {subject}
      </h1>
      <div style={{ display: 'flex', gap: 28, flexWrap: 'wrap' }}>
        {meta.map(m => (
          <div key={m.label}>
            <p style={{ margin: 0, fontSize: 9, color: FAINT, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 700 }}>{m.label}</p>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, fontWeight: 600 }}>{m.value}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Le titre numéroté qui ouvre une section — un seul niveau, pour garder le document lisible. */
export function SectionHeading({ index, label, hint }: { index?: number; label: string; hint?: string }) {
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
        {index !== undefined && (
          <span style={{ fontSize: 13, fontWeight: 800, color: ACCENT }}>{String(index).padStart(2, '0')}</span>
        )}
        <h2 style={{ margin: 0, fontSize: 17, fontWeight: 800, letterSpacing: '-0.3px' }}>{label}</h2>
      </div>
      {hint && <p style={{ margin: '4px 0 0', fontSize: 10.5, color: MUTED }}>{hint}</p>}
      <div style={{ height: 2, backgroundColor: INK, marginTop: 8 }} />
    </div>
  );
}

/** Un sous-titre à l'intérieur d'une section. */
export function BlockTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <p style={{
      margin: '0 0 8px', fontSize: 9.5, fontWeight: 700, letterSpacing: '0.09em',
      textTransform: 'uppercase', color: MUTED, ...style,
    }}>
      {children}
    </p>
  );
}

/** Un chiffre clé. Le `hint` porte l'interprétation — un nombre nu ne se lit pas tout seul. */
export function StatBlock({ label, value, unit, hint, tone = 'neutral' }: {
  label: string;
  value: ReactNode;
  unit?: string;
  hint?: ReactNode;
  tone?: Tone;
}) {
  return (
    <div style={{ border: `1px solid ${LINE}`, borderTop: `3px solid ${TONE_COLOR[tone]}`, borderRadius: 4, padding: '11px 13px', backgroundColor: SOFT }}>
      <p style={{ margin: 0, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: MUTED, lineHeight: 1.3 }}>
        {label}
      </p>
      <p style={{ margin: '7px 0 0', fontSize: 25, fontWeight: 800, letterSpacing: '-0.8px', lineHeight: 1, color: TONE_COLOR[tone] }}>
        {value}
        {unit && <span style={{ fontSize: 11, fontWeight: 600, marginLeft: 3, color: MUTED }}>{unit}</span>}
      </p>
      {hint && <p style={{ margin: '6px 0 0', fontSize: 10, color: MUTED, lineHeight: 1.35 }}>{hint}</p>}
    </div>
  );
}

export function StatRow({ children, columns = 4 }: { children: ReactNode; columns?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: 10, marginBottom: 20 }}>
      {children}
    </div>
  );
}

/**
 * Les constats du rapport : ce que les chiffres disent, écrit en toutes lettres. C'est la
 * différence entre un export de données et un rapport — un dirigeant lit ça, pas le tableau.
 */
export function Findings({ items }: { items: { tone: Tone; text: string }[] }) {
  if (items.length === 0) return null;
  return (
    <div style={{ borderLeft: `3px solid ${ACCENT}`, backgroundColor: SOFT, padding: '12px 14px', borderRadius: '0 4px 4px 0' }}>
      <BlockTitle style={{ marginBottom: 7 }}>À retenir</BlockTitle>
      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map((f, i) => (
          <li key={i} style={{ display: 'flex', gap: 8, fontSize: 11.5, lineHeight: 1.45 }}>
            <span style={{ color: TONE_COLOR[f.tone], fontWeight: 800 }}>•</span>
            <span>{f.text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface Column<T> {
  key: string;
  label: string;
  align?: 'left' | 'right';
  width?: number | string;
  render: (row: T) => ReactNode;
}

/**
 * Un tableau de rapport. `cap` borne le nombre de lignes : un rapport retient les cas qui
 * comptent et annonce le reste, il ne déverse pas la base.
 */
export function DataTable<T>({ columns, rows, cap, emptyLabel = 'Aucune donnée sur la période.' }: {
  columns: Column<T>[];
  rows: T[];
  cap?: number;
  emptyLabel?: string;
}) {
  if (rows.length === 0) {
    return <p style={{ margin: 0, fontSize: 11, color: FAINT, fontStyle: 'italic' }}>{emptyLabel}</p>;
  }
  const shown = cap ? rows.slice(0, cap) : rows;
  const hidden = rows.length - shown.length;

  return (
    <div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ borderBottom: `1.5px solid ${INK}` }}>
            {columns.map(c => (
              <th key={c.key} style={{
                textAlign: c.align ?? 'left', width: c.width, padding: '0 6px 6px',
                fontSize: 8.5, fontWeight: 700, letterSpacing: '0.07em', textTransform: 'uppercase', color: MUTED,
              }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((row, i) => (
            <tr key={i} style={{ borderBottom: `1px solid ${LINE}` }}>
              {columns.map(c => (
                <td key={c.key} style={{
                  textAlign: c.align ?? 'left', padding: '6px', fontSize: 11, verticalAlign: 'middle',
                }}>
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {hidden > 0 && (
        <p style={{ margin: '7px 0 0', fontSize: 9.5, color: FAINT, fontStyle: 'italic' }}>
          + {hidden} autre{hidden > 1 ? 's' : ''} non détaillé{hidden > 1 ? 's' : ''}.
        </p>
      )}
    </div>
  );
}

/** Une barre horizontale par ligne — pour une évolution ou une répartition, sans librairie. */
export function BarList({ items, max, cap }: {
  items: { label: string; value: number; display: string; color?: string; note?: string }[];
  /** Référence de largeur : le maximum de l'échelle, pas forcément la plus grande valeur. */
  max: number;
  cap?: number;
}) {
  const shown = cap ? items.slice(0, cap) : items;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      {shown.map((it, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span style={{ fontSize: 10, color: MUTED, width: 74, flexShrink: 0 }}>{it.label}</span>
          <div style={{ flex: 1, height: 13, backgroundColor: SOFT, borderRadius: 2, overflow: 'hidden' }}>
            <div style={{
              width: `${max > 0 ? Math.min(100, (it.value / max) * 100) : 0}%`, height: '100%',
              backgroundColor: it.color ?? ACCENT, borderRadius: 2,
            }} />
          </div>
          <span style={{ fontSize: 10.5, fontWeight: 700, width: 58, textAlign: 'right', flexShrink: 0 }}>{it.display}</span>
          {it.note && <span style={{ fontSize: 9.5, color: FAINT, width: 48, flexShrink: 0 }}>{it.note}</span>}
        </div>
      ))}
    </div>
  );
}

/** Deux colonnes côte à côte dans une section. */
export function SplitRow({ left, right, gap = 22 }: { left: ReactNode; right: ReactNode; gap?: number }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap }}>
      <div>{left}</div>
      <div>{right}</div>
    </div>
  );
}

/** Petite étiquette colorée — statut, zone de charge, gravité. */
export function Tag({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-block', fontSize: 9, fontWeight: 700, letterSpacing: '0.03em',
      color, border: `1px solid ${color}55`, backgroundColor: `${color}12`,
      padding: '1.5px 6px', borderRadius: 3, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
}

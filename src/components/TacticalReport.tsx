import { useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import type { TacticalEvent, TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import { buildCategoryReport, rentabiliteColor, categoryThresholds } from '../data/tacticalAnalysis';
import type { DimensionTable, DimensionOptionRow, RentabiliteThresholds } from '../data/tacticalAnalysis';

export interface TacticalMatchRef {
  id: string;
  date: string;
  label: string;
}

const TH: React.CSSProperties = {
  padding: '6px 8px', color: '#475569', fontSize: '0.66rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
  whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A', backgroundColor: '#161920',
};
const TD: React.CSSProperties = {
  padding: '5px 8px', color: '#94A3B8', fontSize: '0.78rem', textAlign: 'center', whiteSpace: 'nowrap',
};
const OPTION_TD: React.CSSProperties = {
  ...TD, textAlign: 'left', overflow: 'hidden', textOverflow: 'ellipsis',
};

// Largeurs fixes partagées par toutes les tables de dimension, pour qu'elles
// s'alignent entre elles sur toute la page (colonnes numériques identiques
// d'une table à l'autre, quelle que soit la longueur des libellés d'option).
const COL_WIDTHS = { actions: 80, repartition: 100, valeur: 80, rentabilite: 100 };

function fmtRentabilite(v: number | null) {
  return v !== null ? v.toFixed(2) : '—';
}

function fmtValeur(v: number | null) {
  if (v === null) return '—';
  return Number.isInteger(v) ? String(v) : v.toFixed(2);
}

type SortKey = keyof Pick<DimensionOptionRow, 'label' | 'actions' | 'sharePct' | 'valeur' | 'rentabilite'>;
type SortDir = 'asc' | 'desc';

function compareRows(a: DimensionOptionRow, b: DimensionOptionRow, key: SortKey, dir: SortDir): number {
  const mul = dir === 'asc' ? 1 : -1;
  if (key === 'label') return a.label.localeCompare(b.label) * mul;
  const av = a[key];
  const bv = b[key];
  if (av === null && bv === null) return 0;
  if (av === null) return 1; // nulls toujours en fin, quel que soit le sens du tri
  if (bv === null) return -1;
  return (av - bv) * mul;
}

function SortableTh({ label, active, dir, onClick, textAlign }: { label: string; active: boolean; dir: SortDir; onClick: () => void; textAlign?: React.CSSProperties['textAlign'] }) {
  return (
    <th
      style={{ ...TH, textAlign: textAlign ?? TH.textAlign, cursor: 'pointer', userSelect: 'none' }}
      onClick={onClick}
    >
      {label}
      <span style={{ display: 'inline-block', width: 10, marginLeft: 2, color: active ? '#94A3B8' : '#2A2F3A' }}>
        {active ? (dir === 'asc' ? '▲' : '▼') : '▲'}
      </span>
    </th>
  );
}

/**
 * Rendu bas niveau d'une table Option/Actions/Répartition/Valeur/Rentabilité, indépendant du
 * concept de "dimension" — réutilisé par `DimensionTableView` (une dimension) et par les blocs
 * de tableau de bord "tableau personnalisé" (lignes composées librement, éventuellement fusionnées).
 */
export function DimensionRowsTable({ label, rows, totalActions, totalValeur, totalRentabilite, thresholds, borderColor }: {
  label: string;
  rows: DimensionOptionRow[];
  totalActions: number;
  totalValeur: number | null;
  totalRentabilite: number | null;
  thresholds?: RentabiliteThresholds;
  borderColor?: string;
}) {
  const [sortKey, setSortKey] = useState<SortKey | null>('sharePct');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  const sortedRows = useMemo(() => {
    if (!sortKey) return rows;
    return [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir));
  }, [rows, sortKey, sortDir]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (rows.length === 0) return null;
  return (
    <div style={{ marginBottom: 14 }}>
      <p style={{ color: '#64748B', fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 6px' }}>
        {label}
      </p>
      <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 6 }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
          <colgroup>
            <col />
            <col style={{ width: COL_WIDTHS.actions }} />
            <col style={{ width: COL_WIDTHS.repartition }} />
            <col style={{ width: COL_WIDTHS.valeur }} />
            <col style={{ width: COL_WIDTHS.rentabilite }} />
          </colgroup>
          <thead>
            <tr>
              <SortableTh label="Option" textAlign="left" active={sortKey === 'label'} dir={sortDir} onClick={() => handleSort('label')} />
              <SortableTh label="Actions" active={sortKey === 'actions'} dir={sortDir} onClick={() => handleSort('actions')} />
              <SortableTh label="Répartition" active={sortKey === 'sharePct'} dir={sortDir} onClick={() => handleSort('sharePct')} />
              <SortableTh label="Valeur" active={sortKey === 'valeur'} dir={sortDir} onClick={() => handleSort('valeur')} />
              <SortableTh label="Rentabilité" active={sortKey === 'rentabilite'} dir={sortDir} onClick={() => handleSort('rentabilite')} />
            </tr>
          </thead>
          <tbody>
            {sortedRows.map((r, i) => (
              <tr key={r.label} style={{ backgroundColor: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                <td style={{ ...OPTION_TD, color: '#F1F5F9', fontWeight: 600 }} title={r.label}>{r.label}</td>
                <td style={{ ...TD, fontWeight: 700 }}>{r.actions}</td>
                <td style={{ ...TD, color: '#475569', fontSize: '0.72rem' }}>{Math.round(r.sharePct * 100)}%</td>
                <td style={{ ...TD, color: '#F1F5F9' }}>{fmtValeur(r.valeur)}</td>
                <td style={{ ...TD, color: r.rentabilite !== null ? rentabiliteColor(r.rentabilite, thresholds) : '#334155', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>
                  {fmtRentabilite(r.rentabilite)}
                </td>
              </tr>
            ))}
            <tr style={{ borderTop: '2px solid #2A2F3A', backgroundColor: 'rgba(255,255,255,0.035)' }}>
              <td style={{ ...OPTION_TD, color: '#94A3B8', fontWeight: 700 }}>Total</td>
              <td style={{ ...TD, fontWeight: 700 }}>{totalActions}</td>
              <td style={TD}>—</td>
              <td style={{ ...TD, fontWeight: 700 }}>{fmtValeur(totalValeur)}</td>
              <td style={{ ...TD, color: totalRentabilite !== null ? rentabiliteColor(totalRentabilite, thresholds) : '#334155', fontWeight: 700 }}>
                {fmtRentabilite(totalRentabilite)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DimensionTableView({ table, thresholds, borderColor }: { table: DimensionTable; thresholds?: RentabiliteThresholds; borderColor?: string }) {
  if (table.rows.length === 0) return null;
  return (
    <DimensionRowsTable
      label={table.dimension.name}
      rows={table.rows}
      totalActions={table.totalActions}
      totalValeur={table.totalValeur}
      totalRentabilite={table.totalRentabilite}
      thresholds={thresholds}
      borderColor={borderColor}
    />
  );
}

/**
 * Rapport tactique complet — une carte par catégorie, une grille de tables par
 * dimension (la dimension "Valeur" elle-même n'est jamais affichée : seule sa
 * contribution aux autres dimensions, via Valeur/Rentabilité, est utile).
 * Agnostique du nombre de matchs représentés dans `events` (sert aussi bien la
 * fiche match que la vue agrégée saison). L'évolution match par match n'est
 * disponible qu'en widget de tableau de bord, pas dans ce rapport automatique.
 */
export function TacticalReport({ events, categories, dimensions, options = [] }: {
  events: TacticalEvent[];
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  /** Catalogue d'options attendues (toutes catégories confondues) — fait apparaître des lignes à 0 si configuré. */
  options?: TacticalDimensionOption[];
}) {
  if (events.length === 0) return null;

  const presentCategoryIds = new Set(events.map(e => e.categoryId));
  const orderedCategories = categories
    .filter(c => presentCategoryIds.has(c.id))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <div>
      <style>{`
        .tactical-report-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
        .tactical-report-grid > div { margin-bottom: 0 !important; }
        @media (max-width: 640px) { .tactical-report-grid { grid-template-columns: 1fr; } }
      `}</style>
      {orderedCategories.map(category => {
        const report = buildCategoryReport(events, category, dimensions, options);
        const thresholds = categoryThresholds(category);
        const globalRentabiliteColor = report.rentabilite !== null ? rentabiliteColor(report.rentabilite, thresholds) : undefined;
        return (
          <div key={category.id} style={{ backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderLeft: `4px solid ${category.color}`, borderRadius: 8, padding: 16, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, flexWrap: 'wrap', gap: 6 }}>
              <span style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.9rem' }}>{category.name}</span>
              <span style={{ color: '#475569', fontSize: '0.78rem' }}>
                {report.totalActions} actions
                {report.rentabilite !== null && (
                  <> · <span style={{ color: globalRentabiliteColor, fontWeight: 700 }}>{report.rentabilite.toFixed(2)} rentabilité</span></>
                )}
              </span>
            </div>
            {!report.hasValueDimension && (
              <p style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#F59E0B', fontSize: '0.76rem', margin: '0 0 10px', padding: '6px 10px', backgroundColor: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)', borderRadius: 5 }}>
                <AlertTriangle size={13} /> Aucune dimension "Valeur" détectée pour cette catégorie — rentabilité non calculée.
              </p>
            )}
            <div className="tactical-report-grid">
              {report.dimensionTables.map(table => (
                <DimensionTableView key={table.dimension.id} table={table} thresholds={thresholds} borderColor={globalRentabiliteColor} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

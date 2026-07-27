import { rentabiliteColor } from '../data/tacticalAnalysis';
import type { CrossMatrix, RentabiliteThresholds } from '../data/tacticalAnalysis';

const TH: React.CSSProperties = {
  padding: '6px 8px', color: '#475569', fontSize: '0.66rem', fontWeight: 700,
  textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'center',
  whiteSpace: 'nowrap', borderBottom: '1px solid #2A2F3A', backgroundColor: '#161920',
};
const TD: React.CSSProperties = {
  padding: '6px 8px', color: '#94A3B8', fontSize: '0.76rem', textAlign: 'center', whiteSpace: 'nowrap',
};

/** Matrice croisée de 2 dimensions d'une catégorie : lignes = optionsX, colonnes = optionsY. */
export function TacticalCrossMatrix({ matrix, labelX, labelY, thresholds }: {
  matrix: CrossMatrix; labelX: string; labelY: string; thresholds?: RentabiliteThresholds;
}) {
  if (matrix.optionsX.length === 0 || matrix.optionsY.length === 0) {
    return <p style={{ color: '#475569', fontSize: '0.8rem' }}>Aucune action n'a de valeur sur les deux dimensions.</p>;
  }
  return (
    <div style={{ overflowX: 'auto', border: '1px solid #2A2F3A', borderRadius: 6 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, textAlign: 'left', position: 'sticky', left: 0, zIndex: 2, minWidth: 120 }}>{labelX} \ {labelY}</th>
            {matrix.optionsY.map(y => <th key={y} style={TH}>{y}</th>)}
          </tr>
        </thead>
        <tbody>
          {matrix.optionsX.map((x, i) => {
            const rowBg = i % 2 === 0 ? '#1A1D24' : '#1E2229';
            return (
            <tr key={x} style={{ backgroundColor: rowBg }}>
              <td style={{ ...TD, textAlign: 'left', color: '#F1F5F9', fontWeight: 600, position: 'sticky', left: 0, zIndex: 1, minWidth: 120, backgroundColor: rowBg }}>{x}</td>
              {matrix.optionsY.map(y => {
                const cell = matrix.cells.get(`${x}::${y}`);
                return (
                  <td key={y} style={TD}>
                    {cell ? (
                      <div>
                        <div style={{ fontWeight: 700, color: '#F1F5F9' }}>{cell.actions}</div>
                        {cell.rentabilite !== null && (
                          <div style={{ fontSize: '0.65rem', color: rentabiliteColor(cell.rentabilite, thresholds), fontWeight: 700 }}>
                            {cell.rentabilite.toFixed(2)}
                          </div>
                        )}
                      </div>
                    ) : <span style={{ color: '#334155' }}>—</span>}
                  </td>
                );
              })}
            </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

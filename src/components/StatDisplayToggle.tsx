export type StatDisplayMode = 'blocks' | 'chart';

const OPTIONS: { key: StatDisplayMode; label: string }[] = [
  { key: 'blocks', label: 'Détaillé' },
  { key: 'chart',  label: 'Graphique' },
];

/** Bascule compacte Détaillé/Graphique — utilisée dans le titre "Filtres" des 4 onglets Comparer
 * (période/match/saison/joueur), à la place d'un select en FilterField trop haut à côté d'un titre. */
export function StatDisplayToggle({ value, onChange }: { value: StatDisplayMode; onChange: (v: StatDisplayMode) => void }) {
  return (
    <div style={{ display: 'flex', gap: 2, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2 }}>
      {OPTIONS.map(({ key, label }) => {
        const active = value === key;
        return (
          <button key={key} onClick={() => onChange(key)}
            style={{
              padding: '3px 8px', borderRadius: 4, border: 'none',
              cursor: 'pointer', fontSize: '0.68rem', fontWeight: active ? 600 : 400, transition: 'all 0.15s',
              backgroundColor: active ? 'rgba(0,229,160,0.08)' : 'transparent',
              color: active ? '#00E5A0' : '#94A3B8',
            }}>
            {label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Le chargeur de l'app — le même disque tournant que les pages écrivaient jusqu'ici à la
 * main, chacune avec sa copie de la même keyframe. `centered` ajoute la boîte de centrage
 * qui accompagnait presque toujours ces copies.
 */
export function Spinner({ centered = false }: { centered?: boolean }) {
  const disc = (
    <>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </>
  );
  if (!centered) return disc;
  return <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>{disc}</div>;
}

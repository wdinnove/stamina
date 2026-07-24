import { Lock } from 'lucide-react';

interface AccessRestrictedProps {
  title?:   string;
  message?: string;
}

/** Affiché quand un fetch par id revient vide alors que l'id existe côté route :
 *  la ressource appartient à une équipe hors du périmètre accessible à l'utilisateur. */
export function AccessRestricted({ title = 'Accès restreint', message = "Vous n'avez pas accès à cette équipe." }: AccessRestrictedProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 320 }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ width: 52, height: 52, borderRadius: '50%', backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
          <Lock size={22} style={{ color: '#EF4444' }} />
        </div>
        <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>{title}</h2>
        <p style={{ color: '#64748B', fontSize: '0.85rem', margin: 0 }}>{message}</p>
      </div>
    </div>
  );
}

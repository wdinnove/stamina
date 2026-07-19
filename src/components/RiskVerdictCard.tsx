import { ShieldAlert } from 'lucide-react';
import { Card } from './Card';
import type { CSSProperties } from 'react';

export interface RiskFactor { id: string; active: boolean; label: string }

interface RiskVerdictCardProps {
  title: string;
  atRisk: boolean;
  verdictLabel: string;
  factors: RiskFactor[];
  style?: CSSProperties;
}

/** Bandeau verdict "risque de blessure — maintenant" (joueur ou équipe) : icône + titre à gauche,
 * liste de facteurs à droite. En dessous de 1100px, le bloc de facteurs (largeur naturelle) n'a
 * plus la place de rester à droite du titre et se retrouve seul sur sa ligne quand flexWrap le
 * renvoie — on le force alors en pleine largeur pour qu'il reste collé au bord droit de la card
 * au lieu de flotter au milieu (même correctif que TrendHero, même défaut structurel). */
export function RiskVerdictCard({ title, atRisk, verdictLabel, factors, style }: RiskVerdictCardProps) {
  const color = atRisk ? '#EF4444' : '#00E5A0';
  return (
    <Card accentColor={color} style={style}>
      <style>{`
        @media (max-width: 1099px) {
          .risk-verdict-factors { width: 100%; }
        }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
        <div style={{
          width: 46, height: 46, borderRadius: '50%', flexShrink: 0, alignSelf: 'center',
          backgroundColor: atRisk ? 'rgba(239,68,68,0.12)' : 'rgba(0,229,160,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <ShieldAlert size={22} style={{ color }} />
        </div>
        <div style={{ flex: 1, minWidth: 200, alignSelf: 'center' }}>
          <div style={{ fontSize: '0.68rem', color: '#475569', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700, marginBottom: 3 }}>
            {title}
          </div>
          <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>
            {verdictLabel}
          </div>
        </div>
        <div className="risk-verdict-factors" style={{ display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0, alignSelf: 'center', justifyContent: 'center' }}>
          {factors.map(f => (
            <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
              <span style={{ fontSize: '0.78rem', color: f.active ? '#EF4444' : '#94A3B8', fontWeight: f.active ? 700 : 400, textAlign: 'right' }}>{f.label}</span>
              <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, backgroundColor: f.active ? '#EF4444' : '#00E5A0' }} />
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}

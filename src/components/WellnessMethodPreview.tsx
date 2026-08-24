import { Angry, Smile, Meh, Frown, Laugh } from 'lucide-react';
import { WELLNESS_DIMENSIONS, wellnessQuickScale, wellnessDimColor, wellnessRawValue } from '../utils/wellness';
import type { WellnessEntryMethod, WellnessQuickScaleSize } from '../data/types';

const QUICK_ICONS = { angry: Angry, frown: Frown, meh: Meh, smile: Smile, laugh: Laugh };

// Aperçu figé du formulaire bien-être tel qu'il apparaîtra au saisisseur, pour la méthode choisie.
// Valeurs "ressenties" (plus haut = mieux) arbitraires, juste là pour matérialiser une sélection
// sur chacun des 6 axes — volontairement variées pour montrer les 3 couleurs de l'échelle.
const PREVIEW_FELT: Record<string, number> = {
  fatigue: 5, mood: 9, stress: 6, motivation: 8, sleep: 7, soreness: 3,
};

/** Option de l'échelle rapide la plus proche du ressenti d'aperçu de cet axe. */
const nearestQuick = (scale: ReturnType<typeof wellnessQuickScale>, felt: number) =>
  scale.reduce((a, b) => Math.abs(b.v - felt) < Math.abs(a.v - felt) ? b : a);

const boxStyle: React.CSSProperties = {
  marginTop: 10, padding: '12px 14px', backgroundColor: '#12151B',
  border: '1px dashed #2A2F3A', borderRadius: 8,
  pointerEvents: 'none', userSelect: 'none',
};

const captionStyle: React.CSSProperties = {
  color: '#475569', fontSize: '0.68rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 8,
};

const footnoteStyle: React.CSSProperties = { color: '#475569', fontSize: '0.68rem', margin: '10px 0 0' };

/** Rendu non interactif du formulaire de saisie bien-être, pour la config d'équipe. */
export function WellnessMethodPreview({ method, quickScaleSize = 3 }: { method: WellnessEntryMethod; quickScaleSize?: WellnessQuickScaleSize }) {
  const quickScale = wellnessQuickScale(quickScaleSize);
  if (method === 'single') {
    return (
      <div style={boxStyle}>
        <div style={captionStyle}>Aperçu du formulaire</div>
        <p style={{ color: '#F1F5F9', fontSize: '0.82rem', fontWeight: 500, margin: '0 0 10px', textAlign: 'center' }}>
          Comment tu te sens aujourd'hui, globalement ?
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
          {quickScale.map(opt => {
            const Icon = QUICK_ICONS[opt.icon];
            const active = opt.v === 9;
            return (
              <div key={opt.v} style={{ width: 62, height: 62, borderRadius: 10, border: `2px solid ${active ? opt.color : '#2A2F3A'}`, backgroundColor: active ? opt.color + '22' : '#161920', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <Icon size={22} color={active ? opt.color : '#475569'} />
                <span style={{ fontSize: '0.62rem', color: active ? opt.color : '#94A3B8', fontWeight: 600 }}>{opt.label}</span>
              </div>
            );
          })}
        </div>
        <p style={{ ...footnoteStyle, textAlign: 'center' }}>Une seule valeur, répercutée sur les 6 axes.</p>
      </div>
    );
  }

  return (
    <div style={boxStyle}>
      <div style={captionStyle}>Aperçu du formulaire</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {WELLNESS_DIMENSIONS.map(dim => {
          const raw = wellnessRawValue(PREVIEW_FELT[dim.key], dim.inverted);
          return (
            <div key={dim.key}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                <span style={{ color: '#F1F5F9', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span>{dim.emoji}</span>{dim.label}
                </span>
                {method === 'detailed' && (
                  <span style={{ color: wellnessDimColor(raw, dim.inverted), fontWeight: 700, fontSize: '0.85rem', fontFamily: 'JetBrains Mono, monospace' }}>{raw}</span>
                )}
              </div>
              {method === 'emoji' ? (
                <div style={{ display: 'flex', gap: 6 }}>
                  {quickScale.map(opt => {
                    const Icon = QUICK_ICONS[opt.icon];
                    const active = opt.v === nearestQuick(quickScale, PREVIEW_FELT[dim.key]).v;
                    return (
                      <div key={opt.v} style={{ flex: 1, height: 34, borderRadius: 7, border: `1px solid ${active ? opt.color : '#2A2F3A'}`, backgroundColor: active ? opt.color + '22' : '#1E2229', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <Icon size={17} color={active ? opt.color : '#475569'} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 3 }}>
                  {Array.from({ length: 10 }, (_, i) => i + 1).map(v => {
                    const active = v === raw;
                    const color  = wellnessDimColor(v, dim.inverted);
                    return (
                      <div key={v} style={{ flex: 1, minWidth: 0, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 5, border: `1px solid ${active ? color : '#2A2F3A'}`, backgroundColor: active ? color + '22' : '#1E2229', color: active ? color : '#94A3B8', fontSize: '0.7rem', fontWeight: active ? 700 : 400 }}>{v}</div>
                    );
                  })}
                </div>
              )}
              <p style={{ color: '#475569', fontSize: '0.68rem', margin: '4px 0 0' }}>{dim.desc}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

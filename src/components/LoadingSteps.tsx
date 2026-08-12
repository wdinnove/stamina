import { Check, Rocket } from 'lucide-react';
import { LOAD_STEPS, type LoadStep } from '../hooks/usePerformanceData';

interface LoadingStepsProps {
  /** Étapes terminées, dans l'ordre — fourni par `usePerformanceData`. */
  done: readonly LoadStep[];
  /** Étapes attendues (défaut : celles du chargement de performance). */
  steps?: readonly LoadStep[];
}

/**
 * Écran d'attente des pages d'analyse : une fusée qui décolle au fur et à mesure, et surtout la
 * liste nommée des étapes franchies.
 *
 * Le choix de fond : ce qui rassure pendant une attente, c'est de savoir CE QUI se charge, pas
 * qu'une animation tourne. Un spinner opaque sur plusieurs secondes se lit comme un blocage. La
 * fusée n'est là que pour rendre l'attente moins sèche — d'où la durée bornée et le respect de
 * `prefers-reduced-motion`, pour ne pas devenir pénible au vingtième chargement de la journée.
 */
export function LoadingSteps({ done, steps = LOAD_STEPS }: LoadingStepsProps) {
  const progress = steps.length ? done.length / steps.length : 0;

  return (
    <div className="p-4 md:p-6" style={{ display: 'flex', justifyContent: 'center', minHeight: 320 }}>
      <div style={{ width: '100%', maxWidth: 320, paddingTop: 48 }}>
        <style>{`
          @keyframes rocket-rise {
            0%   { transform: translateY(6px);  }
            50%  { transform: translateY(-4px); }
            100% { transform: translateY(6px);  }
          }
          @keyframes rocket-trail { 0%, 100% { opacity: 0.25; } 50% { opacity: 0.7; } }
          .rocket      { animation: rocket-rise 1.8s ease-in-out infinite; }
          .rocket-glow { animation: rocket-trail 1.8s ease-in-out infinite; }
          @media (prefers-reduced-motion: reduce) {
            .rocket, .rocket-glow { animation: none; }
          }
        `}</style>

        {/* Fusée + traînée */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 22, position: 'relative', height: 52 }}>
          <div className="rocket" style={{
            width: 46, height: 46, borderRadius: '50%',
            backgroundColor: 'rgba(0,229,160,0.1)', border: '1px solid rgba(0,229,160,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <Rocket size={22} style={{ color: '#00E5A0' }} />
          </div>
          <div className="rocket-glow" style={{
            position: 'absolute', bottom: -6, width: 3, height: 18, borderRadius: 2,
            background: 'linear-gradient(180deg, #00E5A0 0%, transparent 100%)',
          }} />
        </div>

        {/* Barre de progression — proportion réelle d'étapes franchies, pas une animation décorative */}
        <div style={{ height: 4, backgroundColor: '#1E2229', borderRadius: 2, overflow: 'hidden', marginBottom: 18 }}>
          <div style={{
            height: '100%', width: `${Math.round(progress * 100)}%`,
            backgroundColor: '#00E5A0', borderRadius: 2, transition: 'width 0.4s ease',
          }} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {steps.map(step => {
            const isDone = done.includes(step);
            return (
              <div key={step} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                <span style={{
                  width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  backgroundColor: isDone ? 'rgba(0,229,160,0.14)' : '#1E2229',
                  border: `1px solid ${isDone ? 'rgba(0,229,160,0.4)' : '#2A2F3A'}`,
                }}>
                  {isDone && <Check size={10} style={{ color: '#00E5A0' }} />}
                </span>
                <span style={{ color: isDone ? '#94A3B8' : '#475569', fontSize: '0.82rem' }}>
                  {step}{isDone ? '' : '…'}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

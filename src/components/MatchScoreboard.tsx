import { useState } from 'react';
import { Play as PlayIcon, Pause, SkipForward, SkipBack } from 'lucide-react';
import { periodLabel, formatClock } from '../data/liveTrackingAnalysis';
import type { MatchClock } from '../hooks/useMatchClock';

/**
 * Table de marque + commandes du chrono — le bloc de tête PARTAGÉ par le suivi live et la prise de
 * statistiques. Il vit ici pour une raison simple : ce sont deux écrans du même produit, ouverts
 * pendant le même match, et deux tables de marque qui ne se ressemblent pas se lisent deux fois.
 *
 * Le quart-temps/chrono est traité au même gabarit que les scores (légende + gros chiffre), au
 * milieu : c'est la même information de match, pas un réglage à part.
 */

export interface MatchScoreboardProps {
  ourTeamName: string;
  /** Couleur d'identité de l'équipe — même convention que le point coloré du sélecteur en TopBar. */
  teamColor: string;
  opponentName: string;
  scoreUs: number;
  scoreThem: number;
  clock: MatchClock;
  canEdit: boolean;
  /** Boutons ajoutés à la ligne de commandes, après le chrono (raccourcis, réglages…). */
  extraControls?: React.ReactNode;
}

const panelSection: React.CSSProperties = {
  backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: 16,
};

/** Table de marque : les trois colonnes (nous / chrono / eux) tiennent TOUJOURS sur une ligne.
 *  Tailles fixes — l'app est cadrée PC pour l'instant, une taille qui suit la fenêtre décalait le
 *  chrono par rapport aux deux scores. */
const scoreLabel: React.CSSProperties = {
  fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase',
  letterSpacing: '0.04em', margin: '0 0 4px',
  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
};

const scoreValue: React.CSSProperties = {
  color: '#F1F5F9', fontSize: '2.6rem', fontWeight: 800, margin: 0, lineHeight: 1,
};

export const scoreboardBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', padding: '6px 10px', borderRadius: 6,
  backgroundColor: '#1E2229', border: '1px solid #2A2F3A', color: '#94A3B8',
  fontSize: '0.78rem', fontWeight: 600, cursor: 'pointer',
};

export function MatchScoreboard({
  ourTeamName, teamColor, opponentName, scoreUs, scoreThem, clock, canEdit, extraControls,
}: MatchScoreboardProps) {
  return (
    <>
      <div style={{ ...panelSection, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, padding: '22px 12px', flexWrap: 'nowrap' }}>
        <div style={{ textAlign: 'center', flex: '1 1 0', minWidth: 0 }}>
          <p style={{ ...scoreLabel, color: teamColor }}>{ourTeamName}</p>
          <p style={scoreValue}>{scoreUs}</p>
        </div>

        {/* Le chrono est en monospace sur 5 caractères : il lui faut un peu plus de place que les
            deux scores, d'où le `flex-grow` supérieur — sinon il se serre le premier. */}
        <div style={{ textAlign: 'center', flex: '1.4 1 0', minWidth: 0 }}>
          <p style={{ ...scoreLabel, color: '#00E5A0' }}>{periodLabel(clock.quarter)}</p>
          <ClockDisplay
            seconds={clock.remainingSeconds} onSet={clock.setRemainingSeconds} editable={canEdit}
            fontSize="2.2rem"
          />
        </div>

        <div style={{ textAlign: 'center', flex: '1 1 0', minWidth: 0 }}>
          <p style={{ ...scoreLabel, color: '#64748B' }}>{opponentName}</p>
          <p style={scoreValue}>{scoreThem}</p>
        </div>
      </div>

      {/* Grille 1fr / auto / 1fr plutôt qu'un flex centré : les commandes du chrono restent
          exactement au milieu du panneau quelle que soit la largeur de `extraControls`, qui
          s'aligne à droite sans les décaler. */}
      {canEdit && (
        <div style={{ ...panelSection, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 6 }}>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap' }}>
            <button onClick={clock.previousPeriod} disabled={clock.quarter <= 1} style={{ ...scoreboardBtn, width: 32, justifyContent: 'center', opacity: clock.quarter <= 1 ? 0.4 : 1, cursor: clock.quarter <= 1 ? 'not-allowed' : 'pointer' }} aria-label="Quart-temps précédent">
              <SkipBack size={13} />
            </button>
            <button onClick={() => clock.adjustRemaining(10)} style={scoreboardBtn} aria-label="Rendre 10 secondes">+10s</button>
            <button onClick={clock.running ? clock.pause : clock.start}
              aria-label={`${clock.running ? 'Arrêter' : 'Lancer'} le chrono`}
              style={{ ...scoreboardBtn, backgroundColor: clock.running ? '#EF444422' : '#00E5A022', borderColor: clock.running ? '#EF4444' : '#00E5A0', color: clock.running ? '#EF4444' : '#00E5A0', width: 36, justifyContent: 'center' }}>
              {clock.running ? <Pause size={14} /> : <PlayIcon size={14} />}
            </button>
            <button onClick={() => clock.adjustRemaining(-10)} style={scoreboardBtn} aria-label="Retirer 10 secondes">-10s</button>
            <button onClick={clock.nextPeriod} style={{ ...scoreboardBtn, width: 32, justifyContent: 'center' }} aria-label="Quart-temps suivant">
              <SkipForward size={13} />
            </button>
          </div>
          <div style={{ justifySelf: 'end', display: 'flex', alignItems: 'center', gap: 6 }}>{extraControls}</div>
        </div>
      )}
    </>
  );
}

/** Chrono affiché, corrigeable au clic : la table de marque officielle fait foi, il faut pouvoir
 *  se recaler dessus sans tout refaire. */
export function ClockDisplay({ seconds, onSet, editable, fontSize = '1.3rem' }: {
  seconds: number; onSet: (s: number) => void; editable: boolean; fontSize?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState('');

  function commit() {
    const m = value.match(/^(\d{1,2}):(\d{2})$/);
    if (m) onSet(Number(m[1]) * 60 + Number(m[2]));
    setEditing(false);
  }

  if (editing) {
    return (
      <input
        autoFocus value={value} onChange={e => setValue(e.target.value)}
        onBlur={commit} onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
        placeholder="mm:ss"
        style={{ width: '4.2em', padding: '4px 6px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', fontSize, fontFamily: 'monospace', textAlign: 'center' }}
      />
    );
  }

  return (
    <span
      onClick={editable ? () => { setValue(formatClock(seconds)); setEditing(true); } : undefined}
      style={{ color: '#F1F5F9', fontSize, fontFamily: 'monospace', fontWeight: 800, lineHeight: 1, cursor: editable ? 'pointer' : 'default' }}
      title={editable ? 'Cliquer pour corriger le temps' : undefined}
    >
      {formatClock(seconds)}
    </span>
  );
}

import { useState } from 'react';
import { Modal } from './Modal';
import { LAYER } from '../styles/layers';
import type { Play } from '../data/types';

/** 0 à 4 : 0 = possession ratée (peu importe la raison), 1 = lancer franc isolé, 2/3 = panier,
 *  4 = panier à 3 points + faute convertie. */
const POINTS_OPTIONS = [0, 1, 2, 3, 4] as const;

/** Play pas encore choisi ('Sans play' inclus, une fois cliqué) — distinct de `null` pour ne
 *  jamais présélectionner "Sans play" avant un vrai clic. */
type PlayChoice = { id: string | undefined } | null;

export interface LiveActionInput {
  points: number;
  playId?: string;
}

export interface LiveActionModalProps {
  /** Nom de l'équipe qui avait le ballon — pour le message "aucun play configuré pour X". */
  teamLabel: string;
  /** Filtre le catalogue de plays affiché, et le titre affiché (Attaque/Défense). */
  playsSide: 'offense' | 'defense';
  plays: Play[];
  saving: boolean;
  onCancel: () => void;
  onConfirm: (input: LiveActionInput) => void;
}

const chipStyle = (active: boolean, activeColor: string): React.CSSProperties => ({
  minHeight: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '6px 4px', borderRadius: 6, cursor: 'pointer', textAlign: 'center',
  border: `1px solid ${active ? activeColor : '#2A2F3A'}`,
  backgroundColor: active ? `${activeColor}18` : 'transparent',
  color: active ? activeColor : '#94A3B8',
  fontSize: '0.85rem', fontWeight: active ? 700 : 400,
});

/**
 * Modale partagée par les deux boutons "Attaque"/"Défense" — même formulaire pour les deux
 * équipes, seul le catalogue de plays proposé change (`playsSide`). Tout est visible et actif dès
 * l'ouverture, taille fixe, dans l'ordre voulu : points d'abord ou play d'abord, peu importe — la
 * possession se valide dès que les deux sont renseignés (pas de bouton "Valider").
 */
export function LiveActionModal({ teamLabel, playsSide, plays, saving, onCancel, onConfirm }: LiveActionModalProps) {
  const [points, setPoints]         = useState<number | null>(null);
  const [playChoice, setPlayChoice] = useState<PlayChoice>(null);
  const [firing, setFiring]         = useState(false);

  const sidePlays = plays.filter(p => p.side === playsSide && p.active);
  const disabled  = saving || firing;

  function submitIfReady(p: number | null, play: PlayChoice) {
    if (disabled || p === null || play === null) return;
    setFiring(true);
    onConfirm({ points: p, playId: play.id });
  }

  function pickPoints(v: number) {
    setPoints(v);
    submitIfReady(v, playChoice);
  }

  function pickPlay(id: string | undefined) {
    const choice = { id };
    setPlayChoice(choice);
    submitIfReady(points, choice);
  }

  return (
    <Modal onClose={saving ? undefined : onCancel} maxWidth={440} zIndex={LAYER.modal} style={{ padding: 24 }}>
      <h2 style={{ color: '#F1F5F9', margin: '0 0 18px', fontSize: '1rem', fontWeight: 700 }}>
        {playsSide === 'offense' ? 'Attaque' : 'Défense'}
      </h2>

      <div style={{ marginBottom: 16 }}>
        <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>Points marqués</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 6 }}>
          {POINTS_OPTIONS.map(v => (
            <button key={v} type="button" disabled={disabled} onClick={() => pickPoints(v)} style={chipStyle(points === v, '#00E5A0')}>
              {v}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 6 }}>Play</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
          <button type="button" disabled={disabled} onClick={() => pickPlay(undefined)} style={chipStyle(playChoice?.id === undefined && playChoice !== null, '#3B82F6')}>
            Sans play
          </button>
          {sidePlays.map(p => (
            <button key={p.id} type="button" disabled={disabled} onClick={() => pickPlay(p.id)} style={chipStyle(playChoice?.id === p.id, '#3B82F6')}>
              {p.name}
            </button>
          ))}
        </div>
        {sidePlays.length === 0 && (
          <p style={{ color: '#475569', fontSize: '0.78rem', margin: '6px 0 0' }}>Aucun play configuré pour {teamLabel}.</p>
        )}
      </div>

      <button onClick={onCancel} disabled={disabled}
        style={{ width: '100%', padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#94A3B8', cursor: 'pointer', fontSize: '0.88rem' }}>
        Annuler
      </button>
    </Modal>
  );
}

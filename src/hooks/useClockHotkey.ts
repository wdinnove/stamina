import { useEffect } from 'react';

/**
 * Raccourci « lancer / arrêter le chrono », partagé par les deux écrans de saisie — deux écrans du
 * même produit ne peuvent pas demander deux touches différentes pour le geste le plus urgent du
 * match.
 *
 * La touche est `S`, plus la barre espace. L'espace RÉACTIVE le dernier bouton cliqué : on tapait
 * espace pour arrêter le chrono au coup de sifflet et on réenregistrait l'action précédente, ou on
 * rouvrait la modale qu'on venait de fermer. L'ancien garde-fou — ignorer l'espace quand le focus
 * est sur un bouton — évitait le double-déclenchement mais rendait surtout le raccourci muet une
 * fois sur deux, ce qui est pire : on croyait le chrono arrêté.
 *
 * Toute frappe est ignorée dès qu'un champ a le focus : ces écrans portent des formulaires (nom
 * d'un joueur adverse, correction du temps), taper « Sara » ne doit pas lancer le chrono.
 */
export function useClockHotkey(
  clock: { running: boolean; start: () => void; pause: () => void },
  enabled: boolean,
) {
  const { running, start, pause } = clock;

  useEffect(() => {
    if (!enabled) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key !== 's' && e.key !== 'S') || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el?.isContentEditable) return;
      e.preventDefault();
      if (running) pause(); else start();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled, running, start, pause]);
}

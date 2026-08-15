/** Liens publics partagés aux joueurs (formulaires sans compte).
 *
 *  Côté navigateur l'origine est celle de la page ; côté serveur (emails) elle vient de
 *  APP_ORIGIN et n'est jamais dérivée des en-têtes — cf. api/send-wellness-links.js. */

export function mbtiPublicUrl(playerId: string): string {
  return `${window.location.origin}/joueur/${playerId}/mbti`;
}

export function wellnessPublicUrl(playerId: string): string {
  return `${window.location.origin}/joueur/${playerId}/bien-etre`;
}

/** Copie dans le presse-papier, avec repli sur les navigateurs sans API clipboard (http, vieux Safari). */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Permission refusée ou contexte non sécurisé — on tente le repli ci-dessous.
  }
  try {
    const el = document.createElement('textarea');
    el.value = text;
    el.setAttribute('readonly', '');
    el.style.position = 'fixed';
    el.style.opacity = '0';
    document.body.appendChild(el);
    el.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(el);
    return ok;
  } catch {
    return false;
  }
}

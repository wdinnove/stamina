/** Liens publics partagés aux joueurs (formulaires sans compte).
 *
 *  Côté navigateur l'origine est celle de la page ; côté serveur (emails) elle vient de
 *  APP_ORIGIN et n'est jamais dérivée des en-têtes — cf. api/send-wellness-links.js. */

/** Le chemin dit « personnalite », jamais le nom du modèle : c'est une URL que le joueur lit
 *  dans sa barre d'adresse. `/mbti` reste servi en redirection pour les liens déjà envoyés. */
export function mbtiPublicUrl(playerId: string): string {
  return `${window.location.origin}/joueur/${playerId}/personnalite`;
}

export function wellnessPublicUrl(playerId: string): string {
  return `${window.location.origin}/joueur/${playerId}/bien-etre`;
}

/** Même questionnaire que `mbtiPublicUrl`, pour un membre du staff. */
export function staffMbtiPublicUrl(staffId: string): string {
  return `${window.location.origin}/staff/${staffId}/personnalite`;
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

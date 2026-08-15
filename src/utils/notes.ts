import type { NoteCategory, PlayerNote } from '../data/types';

/** Texte brut d'une note, balises retirées — pour la recherche et les extraits.
 *  La recherche doit trouver « mental » dans `<p><strong>mental</strong></p>` sans que le mot
 *  « strong » compte comme du contenu. */
export function notePlainText(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

export interface NoteFilters {
  playerId?: string;
  category?: NoteCategory | '';
  /** Recherche insensible à la casse et aux accents, sur le texte de la note. */
  search?: string;
}

/** Vrai si au moins un filtre est actif — pilote l'affichage du bouton « Effacer ». */
export function hasNoteFilter(f: NoteFilters): boolean {
  return !!(f.playerId || f.category || f.search?.trim());
}

const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

/**
 * Filtre et trie les notes : les plus récentes d'abord, départage par date de saisie pour que
 * deux notes du même jour gardent l'ordre dans lequel elles ont été écrites.
 */
export function filterNotes(notes: PlayerNote[], filters: NoteFilters = {}): PlayerNote[] {
  const search = filters.search?.trim() ? norm(filters.search) : '';
  return notes
    .filter(n => {
      if (filters.playerId && n.playerId !== filters.playerId) return false;
      if (filters.category && n.category !== filters.category) return false;
      if (search && !norm(notePlainText(n.content)).includes(search)) return false;
      return true;
    })
    .sort((a, b) =>
      b.date.localeCompare(a.date) || (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
}

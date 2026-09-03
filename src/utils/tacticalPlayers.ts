/**
 * Rapprochement des joueuses taguées dans les CSV tactiques avec l'effectif de l'app.
 *
 * L'export vidéo écrit une cellule par action, avec plusieurs joueuses séparées par des virgules
 * et un numéro de maillot en tête : « #0 Cynthia, #14 Eva Ha ». On en fait des jetons, et chaque
 * jeton distinct est rapproché d'une joueuse — une fois pour tout l'import, pas une fois par
 * action : sur un match réel, 193 actions taguées ne contiennent que 11 joueuses distinctes.
 */
import type { Player } from '../data/types';
import { normalizeTacticalName } from './tacticalCsvParser';

/** Noms de colonne reconnus comme portant les joueuses. */
const PLAYER_COLUMN_NAMES = new Set(['joueuses', 'joueuse', 'joueurs', 'joueur', 'players', 'player']);

export function isPlayerColumnName(name: string): boolean {
  return PLAYER_COLUMN_NAMES.has(normalizeTacticalName(name));
}

/** Découpe une cellule en jetons, dans l'ordre du CSV, sans les vides. */
export function splitPlayerCell(cell: string): string[] {
  return cell.split(',').map(t => t.trim()).filter(t => t !== '');
}

export interface PlayerToken {
  /** Le jeton brut, tel qu'il sert de clé de rapprochement (ex. « #0 Cynthia »). */
  raw: string;
  /** Numéro de maillot lu en tête du jeton, si présent. */
  number: number | null;
  /** Ce qui reste une fois le numéro retiré (ex. « Cynthia »). */
  name: string;
}

/** Lit « #0 Cynthia » → { number: 0, name: 'Cynthia' }. Sans `#`, tout est pris comme nom. */
export function parsePlayerToken(raw: string): PlayerToken {
  const trimmed = raw.trim();
  const match = trimmed.match(/^#\s*(\d{1,3})\s*(.*)$/);
  if (!match) return { raw: trimmed, number: null, name: trimmed };
  return { raw: trimmed, number: Number.parseInt(match[1], 10), name: match[2].trim() };
}

/**
 * Joueuse correspondant à un jeton, ou null. Le numéro de maillot prime : c'est la seule donnée
 * que l'export vidéo et l'app partagent de façon fiable. À défaut, on retombe sur le prénom ou le
 * nom, comparés sans accents ni casse — un prénom seul suffit tant qu'il ne désigne qu'une
 * joueuse de l'effectif (deux « Eva » ne sont donc rapprochées que par leur numéro).
 */
export function matchPlayerToken(raw: string, players: Player[]): Player | null {
  const token = parsePlayerToken(raw);
  if (token.number !== null) {
    const byNumber = players.find(p => p.number === token.number);
    if (byNumber) return byNumber;
  }
  if (token.name === '') return null;
  const name = normalizeTacticalName(token.name);
  const candidates = players.filter(p =>
    normalizeTacticalName(p.firstName) === name
    || normalizeTacticalName(p.lastName) === name
    || normalizeTacticalName(`${p.firstName} ${p.lastName}`) === name,
  );
  return candidates.length === 1 ? candidates[0] : null;
}

/**
 * Jetons distincts d'un ensemble de blocs, avec leur nombre d'actions — dans l'ordre de première
 * apparition. `columnIndexOf` dit où est la colonne des joueuses dans chaque bloc (−1 = aucune).
 */
export function collectPlayerTokens(
  blocks: { dimensionNames: string[]; rows: string[][] }[],
): { raw: string; actions: number }[] {
  const counts = new Map<string, number>();
  for (const block of blocks) {
    const index = block.dimensionNames.findIndex(isPlayerColumnName);
    if (index === -1) continue;
    for (const row of block.rows) {
      for (const token of splitPlayerCell(row[index] ?? '')) {
        counts.set(token, (counts.get(token) ?? 0) + 1);
      }
    }
  }
  return [...counts.entries()].map(([raw, actions]) => ({ raw, actions }));
}

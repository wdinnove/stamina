/**
 * Écriture et téléchargement de CSV. Le pendant des imports, qui eux ont chacun leur parseur.
 *
 * Point de vigilance unique et non négociable : le BOM UTF-8 en tête. Sans lui, Excel sous Windows
 * lit le fichier en Latin-1 et tous les accents des noms de joueurs partent en charabia — ce qui
 * arrive au premier fichier ouvert par un dirigeant, pas au centième.
 */

/** Séparateur point-virgule : c'est celui qu'Excel attend en locale française, où la virgule est
 *  le séparateur décimal. */
const SEPARATOR = ';';

/** Échappe une cellule selon RFC 4180 : guillemets doublés, et cellule entourée dès qu'elle
 *  contient un séparateur, un guillemet ou un retour à la ligne. */
function escapeCell(value: string): string {
  return /[";\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map(r => r.map(escapeCell).join(SEPARATOR)).join('\r\n');
}

/** Déclenche le téléchargement d'un CSV déjà formaté. */
export function downloadCsv(csv: string, filename: string): void {
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** `play-by-play_ASVEL_2026-03-14.csv` — l'adversaire et la date suffisent à ranger un fichier. */
export function csvFilename(prefix: string, subject: string, date: string): string {
  const slug = subject.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_|_$/g, '');
  return `${prefix}_${slug || 'match'}_${date}.csv`;
}

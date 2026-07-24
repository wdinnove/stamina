// ─── Correction du mojibake ────────────────────────────────────────────────────
// Les exports du logiciel vidéo contiennent des caractères accentués mal encodés
// (ex: "FinalitÃ©" pour "Finalité") — un UTF-8 relu en Latin-1. C'est le
// retournement standard de ce problème (voir MDN `escape`/`decodeURIComponent`) ;
// sur un texte déjà correct, l'opération échoue généralement (séquence UTF-8
// invalide) — on retombe alors sur le texte d'origine, inchangé.
function fixMojibake(s: string): string {
  try {
    return decodeURIComponent(escape(s));
  } catch {
    return s;
  }
}

/** Clé de comparaison stable pour un nom de catégorie/dimension (accents/casse/espaces ignorés). */
export function normalizeTacticalName(raw: string): string {
  return raw
    .trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function splitCsvLine(line: string, sep: string): string[] {
  const result: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (c === sep && !inQ) {
      result.push(cur.trim());
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

export interface ParsedCategoryBlock {
  /** Nom brut de la catégorie tel qu'écrit dans le CSV (mojibake corrigé). */
  categoryName: string;
  /** Noms des dimensions, dans l'ordre des colonnes. */
  dimensionNames: string[];
  /** Une ligne = une valeur par dimension (même longueur que dimensionNames ; cellule vide = pas de valeur). */
  rows: string[][];
}

/**
 * Parse un CSV brut du logiciel vidéo (format "une colonne par dimension,
 * valeur en texte clair") en blocs par catégorie. Fonction pure : ne connaît
 * ni la config de l'équipe ni la base — juste la structure du fichier.
 */
export function parseTacticalCsv(text: string): ParsedCategoryBlock[] {
  const cleaned = fixMojibake(text.replace(/^﻿/, ''));
  const lines = cleaned.split(/\r?\n/);

  const blocks: ParsedCategoryBlock[] = [];
  let current: ParsedCategoryBlock | null = null;
  let expectHeader = false;
  // Déterminé une seule fois depuis la ligne d'en-tête de chaque bloc, jamais re-détecté par ligne
  // de données : les noms de dimensions ne contiennent normalement pas de virgule décimale,
  // contrairement à certaines valeurs numériques françaises ("2,5") qui pourraient sinon faire
  // choisir à tort la virgule comme séparateur pour une ligne de données et décaler toutes les
  // colonnes suivantes.
  let currentSep = ',';

  for (const rawLine of lines) {
    if (!rawLine.trim()) continue;

    const catMatch = rawLine.match(/^category:\s*([^,;\t]+)/i);
    if (catMatch) {
      current = { categoryName: catMatch[1].trim(), dimensionNames: [], rows: [] };
      blocks.push(current);
      expectHeader = true;
      continue;
    }
    if (!current) continue;

    if (expectHeader) {
      currentSep = rawLine.includes('\t') ? '\t' : rawLine.includes(';') ? ';' : ',';
      const cells = splitCsvLine(rawLine, currentSep);
      const trimmed = [...cells];
      while (trimmed.length && trimmed[trimmed.length - 1] === '') trimmed.pop();
      current.dimensionNames = trimmed;
      expectHeader = false;
      continue;
    }

    const cells = splitCsvLine(rawLine, currentSep);

    // Ligne "toutes cellules vides" : ignorée sans effet sur le bloc en cours (qu'il s'agisse d'un
    // séparateur visuel de certains exports, ou d'une ligne d'événement où rien n'a été tagué) —
    // un nouveau bloc démarre de toute façon explicitement à la prochaine ligne "Category:", pas
    // besoin de deviner une fin de bloc ici (ça faisait perdre à tort toutes les lignes suivantes).
    if (cells.every(c => c.trim() === '')) continue;

    current.rows.push(cells.slice(0, current.dimensionNames.length));
  }

  return blocks;
}

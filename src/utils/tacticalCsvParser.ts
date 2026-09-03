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

/** Décodage commun aux deux formats d'import : BOM retiré, mojibake corrigé. */
function decodeCsvText(text: string): string {
  return fixMojibake(text.replace(/^\uFEFF/, ''));
}

/** Séparateur de colonnes d'un fichier/bloc, déduit de sa ligne d'en-tête. */
function detectSeparator(headerLine: string): string {
  return headerLine.includes('\t') ? '\t' : headerLine.includes(';') ? ';' : ',';
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
  const lines = decodeCsvText(text).split(/\r?\n/);

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
      currentSep = detectSeparator(rawLine);
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

/** Seules valeurs valides pour la dimension "Valeur" (points marqués sur l'action : 0 à 4). */
const VALID_VALEUR_VALUES = new Set(['0', '1', '2', '3', '4']);

/** Marqueurs "rien à signaler" habituels des exports du logiciel vidéo, en plus d'une cellule
 *  réellement vide — normalisés en minuscules, espaces superflus ignorés. */
const BLANK_TOKENS = new Set(['', '/', '-', '--', '.', 'na', 'n/a']);

/** Points de code des espaces/caractères invisibles Unicode parfois collés en copiant depuis le
 *  logiciel vidéo (espace insécable, espaces de largeur zéro, marqueur d'ordre d'octets) —
 *  `String.trim()` ne les reconnaît pas tous. Exprimés en points de code plutôt qu'en littéral
 *  regex pour rester du texte ASCII lisible, sans caractère invisible réellement présent dans
 *  ce fichier source. */
const INVISIBLE_CODE_POINTS = new Set([0x00a0, 0x200b, 0x200c, 0x200d, 0xfeff]);

function stripInvisibleChars(raw: string): string {
  let out = '';
  for (const ch of raw) {
    out += INVISIBLE_CODE_POINTS.has(ch.codePointAt(0) ?? -1) ? ' ' : ch;
  }
  return out;
}

/**
 * Une cellule "vide" au sens de l'import : réellement vide, espaces seuls (y compris espace
 * insécable/caractères invisibles), ou un des marqueurs habituels ci-dessus ("/", "-", "n/a"...).
 * Insensible à la casse.
 */
export function isBlankTacticalCell(raw: string | undefined): boolean {
  const cleaned = stripInvisibleChars(raw ?? '').trim().toLowerCase();
  return BLANK_TOKENS.has(cleaned);
}

export interface ExcludedValeurRow {
  categoryName: string;
  /** Contenu brut de la cellule ayant causé l'exclusion (ex. "/", vide, texte). */
  rawValue: string;
}

/**
 * Retire les lignes qui ne représentent pas une vraie action :
 * - si la catégorie a une dimension "Valeur", la ligne doit valoir 0, 1, 2, 3 ou 4 — sinon
 *   (vide, "/", espace, texte...) elle est écartée ;
 * - sinon (catégorie sans dimension "Valeur", donc sans score à valider), une ligne où TOUTES
 *   les cellules sont vides ("/" partout, espaces...) est un espace réservé du logiciel vidéo,
 *   pas une action, et est écartée elle aussi.
 * Ces lignes ne doivent jamais devenir des actions en base.
 */
export function filterInvalidValeurRows(blocks: ParsedCategoryBlock[]): { blocks: ParsedCategoryBlock[]; excluded: ExcludedValeurRow[] } {
  const excluded: ExcludedValeurRow[] = [];
  const filtered = blocks.map(block => {
    const valeurIndex = block.dimensionNames.findIndex(d => normalizeTacticalName(d) === 'valeur');
    const rows = block.rows.filter(row => {
      if (valeurIndex !== -1) {
        const raw = (row[valeurIndex] ?? '').trim();
        if (VALID_VALEUR_VALUES.has(raw)) return true;
        excluded.push({ categoryName: block.categoryName, rawValue: isBlankTacticalCell(raw) ? '(vide)' : raw });
        return false;
      }
      if (row.every(isBlankTacticalCell)) {
        excluded.push({ categoryName: block.categoryName, rawValue: '(vide)' });
        return false;
      }
      return true;
    });
    return rows.length === block.rows.length ? block : { ...block, rows };
  });
  return { blocks: filtered, excluded };
}

// ─── Second format d'import : un fichier CSV par thème ─────────────────────────
// Certains exports du logiciel vidéo ne produisent pas un fichier unique découpé en
// blocs `Category:`, mais un fichier par thème (Defense_Pick.csv, Attaque_rapide.csv…) :
// une seule ligne d'en-tête, puis une ligne par action. Le nom de la catégorie vient
// alors du nom du fichier, et c'est l'écran d'import qui décide colonne par colonne de
// ce qui devient une dimension — le parseur ne fait que proposer une sélection de départ.

/** Colonnes de repérage du logiciel vidéo (timecodes de début/fin, numéro de clip) : une valeur
 *  unique par action, donc rien à analyser — décochées par défaut, mais importables si l'équipe
 *  le demande. */
const TECHNICAL_COLUMN_NAMES = new Set(['debut', 'fin', 'n°', 'no', 'numero', 'start', 'end']);

/** Noms de colonne susceptibles de porter les points de l'action, par ordre de préférence. */
const VALEUR_COLUMN_CANDIDATES = ['valeur', 'rentabilite', 'points', 'score'];

/** Pourquoi une colonne ne peut pas devenir une dimension — elle reste affichée dans l'écran
 *  d'import, mais non sélectionnable. */
export type UnavailableColumnReason =
  /** Une colonne de même nom est déjà retenue : une dimension ne porte qu'une valeur par action. */
  | 'duplicate'
  /** Colonne sans titre : rien pour nommer la dimension. */
  | 'unnamed';

export interface ParsedThemeColumn {
  /** Nom de la colonne tel qu'écrit dans l'en-tête (mojibake corrigé). */
  name: string;
  /** Proposée cochée dans l'écran d'import — false pour le repérage vidéo et les colonnes inutilisables. */
  importedByDefault: boolean;
  unavailableReason?: UnavailableColumnReason;
}

export interface ParsedThemeFile {
  /** Nom du fichier choisi par l'utilisateur (clé d'affichage et de dédoublonnage dans l'écran d'import). */
  fileName: string;
  /** Nom de la catégorie, déduit du nom de fichier. */
  categoryName: string;
  /** Toutes les colonnes du fichier, dans son ordre — y compris celles qu'on ne propose pas d'importer. */
  columns: ParsedThemeColumn[];
  /** Une ligne par action, une cellule par colonne de `columns` (même longueur). */
  rows: string[][];
}

/** Nom de catégorie déduit du nom de fichier : extension retirée, `_` rendus aux espaces
 *  (ex. `Defense_tout-terrain.csv` → `Defense tout-terrain`). Les tirets sont conservés,
 *  ils font partie des noms de systèmes. */
export function categoryNameFromFileName(fileName: string): string {
  return fileName
    .replace(/\.[^.]+$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Parse un fichier CSV correspondant à UNE catégorie (nom pris sur le fichier), avec une
 * ligne d'en-tête suivie d'une ligne par action. Fonction pure, comme `parseTacticalCsv` :
 * elle ne connaît ni la config de l'équipe ni la base, et n'écarte aucune colonne — le choix
 * des dimensions revient à l'écran d'import (`buildThemeBlock`).
 */
export function parseTacticalThemeCsv(fileName: string, text: string): ParsedThemeFile {
  const categoryName = categoryNameFromFileName(fileName);
  const lines = decodeCsvText(text).split(/\r?\n/);
  const headerIndex = lines.findIndex(l => l.trim() !== '');
  if (headerIndex === -1) return { fileName, categoryName, columns: [], rows: [] };

  const sep = detectSeparator(lines[headerIndex]);
  const header = splitCsvLine(lines[headerIndex], sep);
  while (header.length && header[header.length - 1] === '') header.pop();

  const seen = new Set<string>();
  const columns: ParsedThemeColumn[] = header.map(name => {
    const normalized = normalizeTacticalName(name);
    if (normalized === '')   return { name, importedByDefault: false, unavailableReason: 'unnamed' };
    if (seen.has(normalized)) return { name, importedByDefault: false, unavailableReason: 'duplicate' };
    seen.add(normalized);
    return { name, importedByDefault: !TECHNICAL_COLUMN_NAMES.has(normalized) };
  });

  const rows: string[][] = [];
  for (const rawLine of lines.slice(headerIndex + 1)) {
    if (!rawLine.trim()) continue;
    const cells = splitCsvLine(rawLine, sep);
    // Ligne entièrement vide : séparateur visuel de l'export, pas une action.
    if (cells.every(c => c.trim() === '')) continue;
    rows.push(columns.map((_, i) => cells[i] ?? ''));
  }

  return { fileName, categoryName, columns, rows };
}

/** Sélection de colonnes proposée à l'ouverture du fichier — indices dans `file.columns`. */
export function defaultThemeColumnSelection(file: ParsedThemeFile): number[] {
  return file.columns.flatMap((c, i) => (c.importedByDefault ? [i] : []));
}

/**
 * Index (dans `file.columns`) de la colonne sélectionnée qui porte le plus vraisemblablement
 * les points de l'action ("Valeur", à défaut "Rentabilité"…), ou null si aucune ne correspond —
 * proposition par défaut dans l'écran d'import, que l'utilisateur reste libre de changer.
 */
export function guessValeurColumnIndex(file: ParsedThemeFile, selected: readonly number[]): number | null {
  for (const candidate of VALEUR_COLUMN_CANDIDATES) {
    const found = selected.find(i => normalizeTacticalName(file.columns[i]?.name ?? '') === candidate);
    if (found !== undefined) return found;
  }
  return null;
}

/**
 * Construit le bloc à importer à partir des seules colonnes retenues (indices dans
 * `file.columns`, dans n'importe quel ordre : le bloc suit toujours l'ordre du fichier, qui
 * devient le `sort_order` des dimensions).
 *
 * `valeurIndex` désigne la colonne portant les points de l'action : elle est importée sous le
 * nom "Valeur", seul nom sous lequel l'analyse de rentabilité (moyennes, seuils de couleur,
 * objectifs) retrouve la dimension. null = catégorie sans rentabilité. Une catégorie ne peut
 * avoir qu'UNE dimension "Valeur" : si une autre colonne retenue s'appelle déjà ainsi, c'est
 * elle qui fait foi et le renommage est ignoré.
 */
export function buildThemeBlock(
  file: ParsedThemeFile,
  selected: readonly number[],
  valeurIndex: number | null,
): ParsedCategoryBlock {
  const kept = file.columns.flatMap((c, i) => (selected.includes(i) && !c.unavailableReason ? [i] : []));
  const renameValeur =
    valeurIndex !== null &&
    kept.includes(valeurIndex) &&
    !kept.some(i => i !== valeurIndex && normalizeTacticalName(file.columns[i].name) === 'valeur');
  return {
    categoryName: file.categoryName,
    dimensionNames: kept.map(i => (renameValeur && i === valeurIndex ? 'Valeur' : file.columns[i].name)),
    rows: file.rows.map(row => kept.map(i => row[i] ?? '')),
  };
}

// ─── Import de la configuration : catégories / dimensions / options ────────────
// Écran de configuration : un CSV pour pré-créer d'un coup la taxonomie d'une équipe,
// plutôt que de saisir chaque catégorie, dimension et option à la main. Une ligne =
// une catégorie, une dimension, puis les options attendues de cette dimension :
//
//   Categorie;Dimension;Options
//   Defense Pick;Forme de jeu;Protect;Step;Switch;Chase
//   Defense Pick;Zone;P-TOP 5;P-SIDE 5;P-SIDE 4
//
// Le format "une ligne par option" (3 colonnes, catégorie et dimension répétées) est
// accepté sans rien changer : les lignes d'une même catégorie/dimension sont fusionnées,
// dans l'ordre du fichier. Une ligne sans dimension ne crée que la catégorie ; une
// dimension sans option ne crée pas de catalogue (toute valeur restera acceptée).

/**
 * Séparateur d'un fichier de configuration. Contrairement aux CSV de match, sa première ligne
 * n'est pas forcément représentative — une catégorie seule tient sur une cellule, sans aucun
 * séparateur — donc on retient le candidat le plus présent dans tout le fichier, à précédence
 * égale à `detectSeparator` (tabulation, puis point-virgule, puis virgule).
 */
function detectConfigSeparator(lines: string[]): string {
  const count = (sep: string) => lines.reduce((n, line) => n + line.split(sep).length - 1, 0);
  const tab = count('\t'), semicolon = count(';'), comma = count(',');
  if (tab > 0 && tab >= semicolon && tab >= comma) return '\t';
  if (semicolon > 0 && semicolon >= comma) return ';';
  return ',';
}

/** Premières cellules reconnues comme ligne d'en-tête, pour ne pas la prendre pour une catégorie. */
const CONFIG_HEADER_FIRST_CELLS = new Set(['categorie', 'category', 'categories']);

export interface ParsedConfigDimension {
  name: string;
  /** Options attendues, dans l'ordre du fichier, dédoublonnées par libellé normalisé. */
  options: string[];
}

export interface ParsedConfigCategory {
  name: string;
  dimensions: ParsedConfigDimension[];
}

/**
 * Parse un CSV de configuration en catégories → dimensions → options. Fonction pure :
 * elle ne connaît ni la config déjà en base ni l'équipe — c'est l'import qui décide ensuite
 * ce qui est à créer et ce qui existe déjà.
 */
export function parseTacticalConfigCsv(text: string): ParsedConfigCategory[] {
  const lines = decodeCsvText(text).split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  const sep = detectConfigSeparator(lines);
  const rows = lines.map(l => splitCsvLine(l, sep));
  if (CONFIG_HEADER_FIRST_CELLS.has(normalizeTacticalName(rows[0][0] ?? ''))) rows.shift();

  const categories: ParsedConfigCategory[] = [];
  const categoryByKey = new Map<string, ParsedConfigCategory>();
  const dimensionByKey = new Map<string, ParsedConfigDimension>();
  const seenOptionKeys = new Set<string>();

  for (const cells of rows) {
    const categoryName = cells[0] ?? '';
    // Sans catégorie, ni la dimension ni les options de la ligne n'ont où se rattacher.
    if (isBlankTacticalCell(categoryName)) continue;
    const categoryKey = normalizeTacticalName(categoryName);
    let category = categoryByKey.get(categoryKey);
    if (!category) {
      category = { name: categoryName, dimensions: [] };
      categoryByKey.set(categoryKey, category);
      categories.push(category);
    }

    const dimensionName = cells[1] ?? '';
    if (isBlankTacticalCell(dimensionName)) continue;   // ligne "catégorie seule"
    const dimensionKey = `${categoryKey}::${normalizeTacticalName(dimensionName)}`;
    let dimension = dimensionByKey.get(dimensionKey);
    if (!dimension) {
      dimension = { name: dimensionName, options: [] };
      dimensionByKey.set(dimensionKey, dimension);
      category.dimensions.push(dimension);
    }

    for (const label of cells.slice(2)) {
      if (isBlankTacticalCell(label)) continue;
      const optionKey = `${dimensionKey}::${normalizeTacticalName(label)}`;
      if (seenOptionKeys.has(optionKey)) continue;
      seenOptionKeys.add(optionKey);
      dimension.options.push(label);
    }
  }

  return categories;
}

/** Séparateur des CSV produits par l'app (l'import, lui, accepte aussi `,` et la tabulation). */
const CONFIG_CSV_SEPARATOR = ';';

/** Échappe une cellule contenant le séparateur, un guillemet ou un saut de ligne. */
function escapeCsvCell(value: string): string {
  return /[";\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

/**
 * Écrit une configuration au format lu par `parseTacticalConfigCsv` — l'export est donc
 * réimportable tel quel : on exporte, on édite dans un tableur, on réimporte. Une catégorie sans
 * dimension occupe une ligne à elle seule, comme à la lecture.
 */
export function serializeTacticalConfigCsv(categories: ParsedConfigCategory[]): string {
  const lines = ['Categorie;Dimension;Options'];
  for (const category of categories) {
    if (category.dimensions.length === 0) {
      lines.push(escapeCsvCell(category.name));
      continue;
    }
    for (const dimension of category.dimensions) {
      lines.push([category.name, dimension.name, ...dimension.options].map(escapeCsvCell).join(CONFIG_CSV_SEPARATOR));
    }
  }
  return lines.join('\n') + '\n';
}

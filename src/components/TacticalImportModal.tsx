import { useState, useEffect, useRef, useMemo } from 'react';
import type { CSSProperties } from 'react';
import { X, Upload, AlertCircle, CheckCircle2, Download, AlertTriangle, FileText, Trash2, Users } from 'lucide-react';
import { tacticalConfigApi } from '../api/tacticalConfig';
import { tacticalImportApi } from '../api/tacticalImport';
import { notify } from '../api/notifications';
import {
  parseTacticalCsv, parseTacticalThemeCsv, normalizeTacticalName, filterInvalidValeurRows,
  isBlankTacticalCell, guessValeurColumnIndex, defaultThemeColumnSelection, buildThemeBlock,
} from '../utils/tacticalCsvParser';
import type {
  ParsedCategoryBlock, ParsedThemeFile, ExcludedValeurRow, UnavailableColumnReason,
} from '../utils/tacticalCsvParser';
import { collectPlayerTokens, matchPlayerToken, isPlayerColumnName } from '../utils/tacticalPlayers';
import { playerNameFull } from '../utils/playerName';
import type { Match, Player, TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import { Modal } from './Modal';
import { DropzoneEmptyState } from './DropzoneEmptyState';

/** Valeurs hors catalogue configuré (par catégorie/dimension déjà existantes — une catégorie/dimension
 *  nouvelle n'a par définition pas encore de catalogue à vérifier). Jamais bloquant, juste informatif. */
function computeUnexpectedValues(
  blocks: ParsedCategoryBlock[],
  categories: TacticalCategory[],
  dimensions: TacticalDimension[],
  options: TacticalDimensionOption[],
): { category: string; dimension: string; label: string }[] {
  const warnings: { category: string; dimension: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const category = categories.find(c => normalizeTacticalName(c.name) === normalizeTacticalName(block.categoryName));
    if (!category) continue;
    block.dimensionNames.forEach((dimName, di) => {
      const dimension = dimensions.find(d => d.categoryId === category.id && normalizeTacticalName(d.name) === normalizeTacticalName(dimName));
      if (!dimension) return;
      const expected = new Set(options.filter(o => o.dimensionId === dimension.id).map(o => normalizeTacticalName(o.label)));
      if (expected.size === 0) return;
      for (const row of block.rows) {
        const label = row[di];
        if (!label || isBlankTacticalCell(label) || expected.has(normalizeTacticalName(label))) continue;
        const key = `${category.id}::${dimension.id}::${normalizeTacticalName(label)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        warnings.push({ category: block.categoryName, dimension: dimName, label });
      }
    });
  }
  return warnings;
}

// ─── Modèle CSV téléchargeable ──────────────────────────────────────────────────
// 2 catégories avec un nombre de dimensions différent (4 puis 5), pour montrer
// que la structure est libre à chaque équipe — pas de format unique imposé.
const TACTICAL_CSV_TEMPLATE = `Category: Offense M2M
Valeur,Temps fort,Forme de jeu,Finalité
2,Drive & kick,Flow,Panier
0,Post-up,Flow,Perte de balle
3,Passing,Swing,Panier
1,Screen,Stack,Faute provoquee

Category: Offense Transition
Valeur,Temps fort,Forme de jeu,Finalité,Reconquête
2,Easy basket,Contre-attaque,Panier,Interception
0,Iso,Opportunité,Perte de balle,Rebond defensif
1,Passing,Contre-attaque,Faute provoquee,Rebond defensif
`;

function downloadTacticalCsvTemplate() {
  const blob = new Blob(['﻿' + TACTICAL_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'modele_donnees_tactiques.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Lecture d'un CSV en UTF-8 — encodage des exports du logiciel vidéo (le mojibake résiduel
 *  est rattrapé par le parseur). */
function readCsvText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = e => resolve((e.target?.result as string) ?? '');
    reader.onerror = () => reject(new Error(file.name));
    reader.readAsText(file, 'UTF-8');
  });
}

/**
 * Deux formats d'export acceptés :
 * - `single` : un seul fichier découpé en blocs `Category:` (toutes les catégories du match) ;
 * - `per-theme` : un fichier par thème, la catégorie étant donnée par le nom du fichier.
 */
type ImportMode = 'single' | 'per-theme';

const MODE_LABELS: Record<ImportMode, string> = {
  'single':    'Un fichier, toutes les catégories',
  'per-theme': 'Un fichier par thème',
};

const COLUMN_UNAVAILABLE_LABELS: Record<UnavailableColumnReason, string> = {
  duplicate: 'Colonne en double — une dimension ne peut porter qu\'une valeur par action',
  unnamed:   'Colonne sans titre — rien pour nommer la dimension',
};

interface ThemeFileEntry {
  parsed: ParsedThemeFile;
  /** Colonnes à importer comme dimensions — indices dans `parsed.columns`. */
  selected: number[];
  /** Colonne portant les points de l'action (index dans `parsed.columns`) — null = catégorie sans rentabilité. */
  valeurIndex: number | null;
}

function toThemeFileEntry(parsed: ParsedThemeFile): ThemeFileEntry {
  const selected = defaultThemeColumnSelection(parsed);
  return { parsed, selected, valeurIndex: guessValeurColumnIndex(parsed, selected) };
}

const selectStyle: CSSProperties = {
  padding: '3px 6px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
  borderRadius: 4, color: '#F1F5F9', fontSize: '0.72rem', maxWidth: 200,
};
const newBadgeStyle: CSSProperties = {
  fontSize: '0.65rem', padding: '1px 6px', borderRadius: 3,
  backgroundColor: 'rgba(0,229,160,0.1)', color: '#00E5A0',
};

interface Props {
  match: Match;
  /** Effectif de la saison, pour rapprocher les joueuses taguées dans les CSV. */
  players: Player[];
  hasExistingData: boolean;
  onClose: () => void;
  onSaved: () => void;
}

/** Valeur du select « joueuse » signifiant « ce jeton n'est pas dans l'effectif, ne rien stocker ». */
const SKIP_PLAYER = '__skip';

export function TacticalImportModal({ match, players, hasExistingData, onClose, onSaved }: Props) {
  const [categories, setCategories] = useState<TacticalCategory[]>([]);
  const [dimensions, setDimensions] = useState<TacticalDimension[]>([]);
  const [options, setOptions] = useState<TacticalDimensionOption[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [mode, setMode] = useState<ImportMode>('single');
  const [singleBlocks, setSingleBlocks] = useState<ParsedCategoryBlock[] | null>(null);
  const [themeFiles, setThemeFiles] = useState<ThemeFileEntry[]>([]);
  const [fileError, setFileError] = useState('');
  /** jeton du CSV -> id de joueuse, ou SKIP_PLAYER. Global à l'import : le même « #0 Cynthia »
   *  revient dans tous les fichiers, il ne se rapproche qu'une fois. */
  const [playerIdByToken, setPlayerIdByToken] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const themeFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tacticalConfigApi.getForTeam(match.teamId)
      .then(({ categories, dimensions, options }) => { setCategories(categories); setDimensions(dimensions); setOptions(options); })
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, [match.teamId]);

  async function loadSingleFile(file: File) {
    try {
      const result = parseTacticalCsv(await readCsvText(file));
      if (result.length === 0) {
        setFileError('Aucune catégorie détectée — vérifiez que le fichier est bien le CSV exporté par le logiciel vidéo.');
        return;
      }
      setFileError('');
      setSingleBlocks(result);
    } catch {
      setFileError("Erreur de lecture — vérifiez l'encodage du fichier (UTF-8).");
    }
  }

  /** Ajoute des fichiers à la sélection en cours (on peut donc les déposer en plusieurs fois).
   *  Un fichier visant une catégorie déjà sélectionnée remplace la sélection précédente, à sa
   *  place dans la liste : rejouer un fichier corrigé ne doit pas dédoubler la catégorie. */
  async function addThemeFiles(files: File[]) {
    const added: ThemeFileEntry[] = [];
    const empty: string[] = [];
    try {
      for (const file of files) {
        const parsed = parseTacticalThemeCsv(file.name, await readCsvText(file));
        if (parsed.columns.length === 0 || parsed.rows.length === 0) empty.push(file.name);
        else added.push(toThemeFileEntry(parsed));
      }
    } catch {
      setFileError("Erreur de lecture — vérifiez l'encodage des fichiers (UTF-8).");
      return;
    }
    setFileError(empty.length === 0 ? '' : `Aucune action détectée dans ${empty.join(', ')} — une ligne d'en-tête puis une ligne par action sont attendues.`);
    if (added.length === 0) return;
    setThemeFiles(prev => {
      const next = [...prev];
      for (const entry of added) {
        const key = normalizeTacticalName(entry.parsed.categoryName);
        const at = next.findIndex(f => normalizeTacticalName(f.parsed.categoryName) === key);
        if (at === -1) next.push(entry); else next[at] = entry;
      }
      return next;
    });
  }

  /** Bascule une colonne dans/hors de l'import pour un fichier. Décocher la colonne des points
   *  lui retire ce rôle ; la recocher fait reproposer la colonne la plus vraisemblable. */
  function toggleThemeColumn(fileName: string, index: number) {
    setThemeFiles(prev => prev.map(f => {
      if (f.parsed.fileName !== fileName) return f;
      const wasSelected = f.selected.includes(index);
      const selected = wasSelected ? f.selected.filter(i => i !== index) : [...f.selected, index];
      const valeurIndex = wasSelected
        ? (f.valeurIndex === index ? null : f.valeurIndex)
        : (f.valeurIndex ?? guessValeurColumnIndex(f.parsed, selected));
      return { ...f, selected, valeurIndex };
    }));
  }

  const sourceBlocks = useMemo<ParsedCategoryBlock[] | null>(() => {
    if (mode === 'single') return singleBlocks;
    if (themeFiles.length === 0) return null;
    // Un fichier dont toutes les colonnes sont décochées est laissé de côté : il bloque l'import
    // (message sur sa ligne) plutôt que de remplir l'aperçu de lignes "vides".
    return themeFiles.filter(f => f.selected.length > 0).map(f => buildThemeBlock(f.parsed, f.selected, f.valeurIndex));
  }, [mode, singleBlocks, themeFiles]);

  // Les lignes sans valeur exploitable sont écartées de l'aperçu comme de l'import — recalculé à
  // chaque changement de colonne "Valeur", qui déplace la frontière entre action et ligne vide.
  const { blocks, excludedRows } = useMemo(() => {
    if (!sourceBlocks) return { blocks: null as ParsedCategoryBlock[] | null, excludedRows: [] as ExcludedValeurRow[] };
    const { blocks, excluded } = filterInvalidValeurRows(sourceBlocks);
    return { blocks, excludedRows: excluded };
  }, [sourceBlocks]);

  // Colonne des joueuses : reconnue à son nom, la même dans tous les fichiers d'un export vidéo.
  const playersColumnName = blocks?.flatMap(b => b.dimensionNames).find(isPlayerColumnName) ?? null;
  const playerTokens = useMemo(
    () => (blocks ? collectPlayerTokens(blocks).sort((a, b) => b.actions - a.actions) : []),
    [blocks],
  );

  // Rapprochement automatique des jetons nouvellement apparus, sans jamais écraser un choix déjà
  // fait à la main (redéposer un fichier ne doit pas défaire le travail de rapprochement).
  useEffect(() => {
    if (playerTokens.length === 0) return;
    setPlayerIdByToken(prev => {
      const next = { ...prev };
      let changed = false;
      for (const { raw } of playerTokens) {
        if (raw in next) continue;
        next[raw] = matchPlayerToken(raw, players)?.id ?? SKIP_PLAYER;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [playerTokens, players]);

  const matchedPlayers = playerTokens.filter(t => playerIdByToken[t.raw] && playerIdByToken[t.raw] !== SKIP_PLAYER).length;

  const totalRows = blocks ? blocks.reduce((s, b) => s + b.rows.length, 0) : 0;
  const canImport = !!blocks && totalRows > 0 && themeFiles.every(f => f.selected.length > 0);

  async function handleSave() {
    if (!blocks || !canImport) return;
    setSaving(true);
    setSaveError('');
    try {
      const resolvedPlayers = Object.fromEntries(
        Object.entries(playerIdByToken).filter(([, id]) => id && id !== SKIP_PLAYER),
      );
      const result = await tacticalImportApi.importForMatch(
        match.id, match.teamId, blocks,
        mode === 'per-theme' ? 'imported-categories' : 'match',
        playersColumnName, resolvedPlayers,
      );
      notify(match.teamId, 'tactical_import_done', `Import tactique terminé — vs ${match.opponent}`, {
        body: `${result.totalActions} action${result.totalActions > 1 ? 's' : ''} importée${result.totalActions > 1 ? 's' : ''}`,
        entityType: 'match',
        entityId: match.id,
      });
      onSaved();
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  const isNewCategory = (name: string) => !categories.some(c => normalizeTacticalName(c.name) === normalizeTacticalName(name));
  const isNewDimension = (categoryName: string, dimName: string) => {
    const cat = categories.find(c => normalizeTacticalName(c.name) === normalizeTacticalName(categoryName));
    if (!cat) return true;
    return !dimensions.some(d => d.categoryId === cat.id && normalizeTacticalName(d.name) === normalizeTacticalName(dimName));
  };

  // La colonne des joueuses n'étant plus une dimension, ses valeurs n'ont pas à être rapprochées
  // d'un catalogue : on la retire de l'analyse des valeurs inconnues.
  const unexpectedValues = blocks
    ? computeUnexpectedValues(
        blocks.map(b => ({
          ...b,
          dimensionNames: b.dimensionNames.filter(d => !isPlayerColumnName(d)),
          rows: b.rows.map(row => row.filter((_, i) => !isPlayerColumnName(b.dimensionNames[i]))),
        })),
        categories, dimensions, options,
      )
    : [];

  const excludedRowGroups = Object.values(
    excludedRows.reduce<Record<string, { categoryName: string; rawValue: string; count: number }>>((acc, r) => {
      const key = `${r.categoryName}::${r.rawValue}`;
      if (!acc[key]) acc[key] = { categoryName: r.categoryName, rawValue: r.rawValue, count: 0 };
      acc[key].count++;
      return acc;
    }, {}),
  );

  return (
    <Modal maxWidth={720} overlayOpacity={0.85} align="flex-start" closeOnBackdropClick style={{ flexShrink: 0 }} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #2A2F3A' }}>
        <div>
          <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Importer les statistiques tactiques</h2>
          <p style={{ color: '#475569', margin: '2px 0 0', fontSize: '0.78rem' }}>vs {match.opponent} · {match.date}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      {hasExistingData && (
        <div style={{ padding: '8px 24px', backgroundColor: 'rgba(59,130,246,0.08)', borderBottom: '1px solid rgba(59,130,246,0.15)', fontSize: '0.75rem', color: '#60A5FA' }}>
          {mode === 'single'
            ? 'Des statistiques tactiques existent déjà pour ce match — elles seront remplacées.'
            : 'Des statistiques tactiques existent déjà pour ce match — seules les catégories des fichiers sélectionnés seront remplacées, les autres sont conservées.'}
        </div>
      )}

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loadingConfig ? (
          <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>
        ) : (
          <div>
            <div style={{ display: 'flex', gap: 2, backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 6, padding: 2, marginBottom: 12 }}>
              {(Object.keys(MODE_LABELS) as ImportMode[]).map(m => (
                <button key={m} type="button" onClick={() => { setMode(m); setFileError(''); }}
                  style={{
                    flex: 1, padding: '5px 8px', borderRadius: 4, border: 'none', cursor: 'pointer',
                    fontSize: '0.72rem', fontWeight: mode === m ? 600 : 400, transition: 'all 0.15s',
                    backgroundColor: mode === m ? 'rgba(0,229,160,0.08)' : 'transparent',
                    color: mode === m ? '#00E5A0' : '#94A3B8',
                  }}>
                  {MODE_LABELS[m]}
                </button>
              ))}
            </div>

            {mode === 'single' ? (
              <>
                <DropzoneEmptyState
                  label="Choisir le fichier CSV du match"
                  onClick={() => fileRef.current?.click()}
                  icon={<Upload size={14} color="#00E5A0" />}
                  style={{ gap: 8, padding: '10px 16px', minHeight: 'auto', backgroundColor: '#1E2229', color: '#94A3B8', fontSize: '0.82rem', width: '100%' }}
                />
                <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
                  onChange={e => { const f = e.target.files?.[0]; if (f) loadSingleFile(f); e.target.value = ''; }}
                />
              </>
            ) : (
              <>
                <DropzoneEmptyState
                  label="Choisir un ou plusieurs fichiers CSV (un par thème)"
                  onClick={() => themeFileRef.current?.click()}
                  icon={<Upload size={14} color="#00E5A0" />}
                  style={{ gap: 8, padding: '10px 16px', minHeight: 'auto', backgroundColor: '#1E2229', color: '#94A3B8', fontSize: '0.82rem', width: '100%' }}
                />
                <input ref={themeFileRef} type="file" accept=".csv,.txt" multiple style={{ display: 'none' }}
                  onChange={e => { const f = Array.from(e.target.files ?? []); if (f.length) addThemeFiles(f); e.target.value = ''; }}
                />
              </>
            )}

            {fileError && (
              <p style={{ color: '#EF4444', fontSize: '0.75rem', margin: '6px 0 0', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
                <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {fileError}
              </p>
            )}

            {mode === 'single' ? (
              <>
                <p style={{ color: '#475569', fontSize: '0.72rem', margin: '10px 0 0', lineHeight: 1.5 }}>
                  Une ligne <code>Category: &lt;nom&gt;</code> par système de jeu, suivie d'une ligne listant vos dimensions
                  (leurs noms sont libres, ex. Valeur, Temps fort, Finalité…), puis une ligne par action avec la valeur
                  choisie pour chaque dimension. Le nombre et les noms de dimensions peuvent différer d'une catégorie à l'autre.
                </p>
                <button type="button" onClick={downloadTacticalCsvTemplate}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '6px auto 0', padding: 0, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.72rem', textDecoration: 'underline' }}>
                  <Download size={11} /> Télécharger un exemple de fichier CSV
                </button>
              </>
            ) : (
              <p style={{ color: '#475569', fontSize: '0.72rem', margin: '10px 0 0', lineHeight: 1.5 }}>
                Un fichier par système de jeu (ex. <code>Defense_Pick.csv</code>, <code>Attaque_rapide.csv</code>) : le nom du
                fichier donne la catégorie, sa ligne d'en-tête donne les colonnes, puis une ligne par action. Chaque colonne est
                à cocher ou décocher fichier par fichier — le repérage vidéo (Début, Fin, N°) est décoché d'office. Les fichiers
                peuvent être déposés en plusieurs fois : seules les catégories importées remplacent les données déjà
                enregistrées pour ce match.
              </p>
            )}
          </div>
        )}

        {mode === 'per-theme' && themeFiles.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {themeFiles.map(f => {
              // Colonnes retenues dans l'ordre du fichier — celui du select comme celui du bloc importé.
              const selectedInOrder = f.parsed.columns.flatMap((_, i) => (f.selected.includes(i) ? [i] : []));
              // Une colonne retenue déjà nommée "Valeur" fait foi : plus rien à désigner.
              const explicitValeur = selectedInOrder.find(i => normalizeTacticalName(f.parsed.columns[i].name) === 'valeur');
              return (
                <div key={f.parsed.fileName} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8, padding: '10px 12px' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <FileText size={12} color="#475569" style={{ flexShrink: 0 }} />
                      <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.8rem' }}>{f.parsed.categoryName}</span>
                      {isNewCategory(f.parsed.categoryName) && <span style={newBadgeStyle}>nouvelle</span>}
                      <span style={{ color: '#475569', fontSize: '0.68rem' }}>· {f.parsed.fileName}</span>
                    </div>
                    <p style={{ color: '#64748B', fontSize: '0.7rem', margin: '10px 0 5px' }}>Colonnes à importer :</p>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {f.parsed.columns.map((c, i) => {
                        const checked = f.selected.includes(i);
                        const unavailable = c.unavailableReason;
                        return (
                          <label key={i} title={unavailable ? COLUMN_UNAVAILABLE_LABELS[unavailable] : undefined}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 4,
                              border: `1px solid ${checked ? 'rgba(0,229,160,0.35)' : '#2A2F3A'}`,
                              backgroundColor: checked ? 'rgba(0,229,160,0.08)' : 'transparent',
                              color: unavailable ? '#334155' : checked ? '#00E5A0' : '#94A3B8',
                              fontSize: '0.7rem', cursor: unavailable ? 'not-allowed' : 'pointer',
                              textDecoration: unavailable ? 'line-through' : undefined,
                            }}>
                            <input type="checkbox" checked={checked} disabled={!!unavailable}
                              onChange={() => toggleThemeColumn(f.parsed.fileName, i)}
                              style={{ width: 11, height: 11, margin: 0, accentColor: '#00E5A0', cursor: 'inherit' }} />
                            {c.name || 'sans titre'}
                          </label>
                        );
                      })}
                    </div>
                    {f.selected.length === 0 ? (
                      <p style={{ color: '#EF4444', fontSize: '0.7rem', margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                        <AlertCircle size={11} /> Aucune colonne sélectionnée — ce fichier ne peut pas être importé.
                      </p>
                    ) : (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', margin: '8px 0 0' }}>
                        <span style={{ color: '#64748B', fontSize: '0.7rem' }}>Colonne des points (importée comme «&nbsp;Valeur&nbsp;») :</span>
                        {explicitValeur !== undefined ? (
                          <span style={{ color: '#00E5A0', fontSize: '0.72rem' }}>{f.parsed.columns[explicitValeur].name}</span>
                        ) : (
                          <select
                            value={f.valeurIndex ?? ''}
                            onChange={e => {
                              const v = e.target.value === '' ? null : Number(e.target.value);
                              setThemeFiles(prev => prev.map(x => x.parsed.fileName === f.parsed.fileName ? { ...x, valeurIndex: v } : x));
                            }}
                            style={selectStyle}>
                            <option value="">Aucune (pas de rentabilité)</option>
                            {selectedInOrder.map(i => <option key={i} value={i}>{f.parsed.columns[i].name}</option>)}
                          </select>
                        )}
                      </div>
                    )}
                  </div>
                  <button type="button" title="Retirer ce fichier"
                    onClick={() => setThemeFiles(prev => prev.filter(x => x.parsed.fileName !== f.parsed.fileName))}
                    style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 2, flexShrink: 0 }}>
                    <Trash2 size={13} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {playerTokens.length > 0 && (
          <div style={{ backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16 }}>
            <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Users size={14} color="#00E5A0" /> {matchedPlayers} joueuse{matchedPlayers > 1 ? 's' : ''} rapprochée{matchedPlayers > 1 ? 's' : ''} sur {playerTokens.length}
            </p>
            <p style={{ color: '#475569', fontSize: '0.72rem', margin: '0 0 10px', lineHeight: 1.5 }}>
              La colonne «&nbsp;{playersColumnName}&nbsp;» est découpée en joueuses au lieu d'être comptée comme une
              dimension. Un jeton laissé «&nbsp;hors effectif&nbsp;» n'est pas enregistré ; le reste de l'action l'est
              quand même.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              {playerTokens.map(({ raw, actions }) => {
                const value = playerIdByToken[raw] ?? SKIP_PLAYER;
                const skipped = value === SKIP_PLAYER;
                return (
                  <div key={raw} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ color: '#F1F5F9', fontSize: '0.78rem', minWidth: 120 }}>{raw}</span>
                    <span style={{ color: '#475569', fontSize: '0.7rem', minWidth: 70 }}>{actions} action{actions > 1 ? 's' : ''}</span>
                    <select
                      value={value}
                      onChange={e => setPlayerIdByToken(prev => ({ ...prev, [raw]: e.target.value }))}
                      style={{
                        ...selectStyle, flex: 1, maxWidth: 260,
                        backgroundColor: skipped ? '#1E2229' : 'rgba(0,229,160,0.08)',
                        border: `1px solid ${skipped ? '#2A2F3A' : '#00E5A040'}`,
                        color: skipped ? '#475569' : '#00E5A0',
                      }}>
                      <option value={SKIP_PLAYER}>— Hors effectif</option>
                      {[...players].sort((a, b) => a.number - b.number).map(p => (
                        <option key={p.id} value={p.id}>#{p.number} {playerNameFull(p)}</option>
                      ))}
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {blocks && (
          <div style={{ backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16 }}>
            <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem', margin: '0 0 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color="#00E5A0" /> {totalRows} action{totalRows > 1 ? 's' : ''} détectée{totalRows > 1 ? 's' : ''} sur {blocks.length} catégorie{blocks.length > 1 ? 's' : ''}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {blocks.map((b, i) => (
                <div key={i} style={{ fontSize: '0.78rem' }}>
                  <span style={{ color: '#F1F5F9', fontWeight: 600 }}>{b.categoryName}</span>
                  {isNewCategory(b.categoryName) && (
                    <span style={{ marginLeft: 6, ...newBadgeStyle }}>nouvelle</span>
                  )}
                  <span style={{ color: '#475569' }}> · {b.rows.length} action{b.rows.length > 1 ? 's' : ''} · </span>
                  {b.dimensionNames.map((d, di) => (
                    <span key={di} style={{ fontSize: '0.7rem', marginRight: 4, color: isNewDimension(b.categoryName, d) ? '#00E5A0' : '#64748B' }}>
                      {d}{di < b.dimensionNames.length - 1 ? ',' : ''}
                    </span>
                  ))}
                </div>
              ))}
            </div>

            {excludedRows.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2A2F3A' }}>
                <p style={{ color: '#EF4444', fontSize: '0.75rem', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertCircle size={12} /> {excludedRows.length} ligne{excludedRows.length > 1 ? 's' : ''} vide{excludedRows.length > 1 ? 's' : ''} ou sans valeur exploitable (colonne "Valeur" absente du catalogue attendu 0 à 4, ou ligne entièrement vide) — non importée{excludedRows.length > 1 ? 's' : ''} :
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {excludedRowGroups.map((g, i) => (
                    <span key={i} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 3, backgroundColor: 'rgba(239,68,68,0.1)', color: '#EF4444', border: '1px solid rgba(239,68,68,0.3)' }}>
                      {g.categoryName} · "{g.rawValue}" × {g.count}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {unexpectedValues.length > 0 && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid #2A2F3A' }}>
                <p style={{ color: '#F59E0B', fontSize: '0.75rem', margin: '0 0 6px', display: 'flex', alignItems: 'center', gap: 4 }}>
                  <AlertTriangle size={12} /> {unexpectedValues.length} valeur{unexpectedValues.length > 1 ? 's' : ''} absente{unexpectedValues.length > 1 ? 's' : ''} du catalogue — elle{unexpectedValues.length > 1 ? 's y seront ajoutées' : ' y sera ajoutée'} automatiquement, à relire dans la configuration :
                </p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {unexpectedValues.map((u, i) => (
                    <span key={i} style={{ fontSize: '0.65rem', padding: '2px 6px', borderRadius: 3, backgroundColor: 'rgba(245,158,11,0.1)', color: '#F59E0B', border: '1px solid rgba(245,158,11,0.3)' }}>
                      {u.category} · {u.dimension} · {u.label}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <div style={{ padding: '14px 24px', borderTop: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', gap: 12 }}>
        {saveError && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, color: '#EF4444', fontSize: '0.8rem' }}>
            <AlertCircle size={13} /> {saveError}
          </div>
        )}
        <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
          <button type="button" onClick={onClose}
            style={{ padding: '9px 18px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.85rem' }}>
            Annuler
          </button>
          <button type="button" onClick={handleSave} disabled={!canImport || saving}
            style={{ padding: '9px 22px', backgroundColor: (!canImport || saving) ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: (!canImport || saving) ? '#475569' : '#0D0F14', fontWeight: 700, cursor: (!canImport || saving) ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
            {saving ? 'Enregistrement…' : 'Importer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

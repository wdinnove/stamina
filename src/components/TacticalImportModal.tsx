import { useState, useEffect, useRef } from 'react';
import { X, Upload, AlertCircle, CheckCircle2, Download, AlertTriangle } from 'lucide-react';
import { tacticalConfigApi } from '../api/tacticalConfig';
import { tacticalImportApi } from '../api/tacticalImport';
import { parseTacticalCsv, normalizeTacticalName, filterInvalidValeurRows, isBlankTacticalCell } from '../utils/tacticalCsvParser';
import type { ParsedCategoryBlock, ExcludedValeurRow } from '../utils/tacticalCsvParser';
import type { Match, TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
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

interface Props {
  match: Match;
  hasExistingData: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function TacticalImportModal({ match, hasExistingData, onClose, onSaved }: Props) {
  const [categories, setCategories] = useState<TacticalCategory[]>([]);
  const [dimensions, setDimensions] = useState<TacticalDimension[]>([]);
  const [options, setOptions] = useState<TacticalDimensionOption[]>([]);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [blocks, setBlocks] = useState<ParsedCategoryBlock[] | null>(null);
  const [excludedRows, setExcludedRows] = useState<ExcludedValeurRow[]>([]);
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    tacticalConfigApi.getForTeam(match.teamId)
      .then(({ categories, dimensions, options }) => { setCategories(categories); setDimensions(dimensions); setOptions(options); })
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, [match.teamId]);

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const text = e.target?.result as string;
        const result = parseTacticalCsv(text);
        if (result.length === 0) {
          setFileError('Aucune catégorie détectée — vérifiez que le fichier est bien le CSV exporté par le logiciel vidéo.');
          return;
        }
        const { blocks: validBlocks, excluded } = filterInvalidValeurRows(result);
        setFileError('');
        setBlocks(validBlocks);
        setExcludedRows(excluded);
      } catch {
        setFileError("Erreur de lecture — vérifiez l'encodage du fichier (UTF-8).");
      }
    };
    reader.readAsText(file, 'UTF-8');
  }

  async function handleSave() {
    if (!blocks) return;
    setSaving(true);
    setSaveError('');
    try {
      await tacticalImportApi.importForMatch(match.id, match.teamId, blocks);
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

  const totalRows = blocks ? blocks.reduce((s, b) => s + b.rows.length, 0) : 0;
  const unexpectedValues = blocks ? computeUnexpectedValues(blocks, categories, dimensions, options) : [];

  const excludedRowGroups = Object.values(
    excludedRows.reduce<Record<string, { categoryName: string; rawValue: string; count: number }>>((acc, r) => {
      const key = `${r.categoryName}::${r.rawValue}`;
      if (!acc[key]) acc[key] = { categoryName: r.categoryName, rawValue: r.rawValue, count: 0 };
      acc[key].count++;
      return acc;
    }, {}),
  );

  return (
    <Modal maxWidth={720} overlayOpacity={0.85} zIndex={200} align="flex-start" closeOnBackdropClick style={{ flexShrink: 0 }} onClose={onClose}>
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
          Des statistiques tactiques existent déjà pour ce match — elles seront remplacées.
        </div>
      )}

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {loadingConfig ? (
          <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>
        ) : (
          <div>
            <DropzoneEmptyState
              label="Choisir le fichier CSV du match"
              onClick={() => fileRef.current?.click()}
              icon={<Upload size={14} color="#00E5A0" />}
              style={{ gap: 8, padding: '10px 16px', minHeight: 'auto', backgroundColor: '#1E2229', color: '#94A3B8', fontSize: '0.82rem', width: '100%' }}
            />
            <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
              onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }}
            />
            {fileError && (
              <p style={{ color: '#EF4444', fontSize: '0.75rem', margin: '6px 0 0', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertCircle size={12} /> {fileError}
              </p>
            )}

            <p style={{ color: '#475569', fontSize: '0.72rem', margin: '10px 0 0', lineHeight: 1.5 }}>
              Une ligne <code>Category: &lt;nom&gt;</code> par système de jeu, suivie d'une ligne listant vos dimensions
              (leurs noms sont libres, ex. Valeur, Temps fort, Finalité…), puis une ligne par action avec la valeur
              choisie pour chaque dimension. Le nombre et les noms de dimensions peuvent différer d'une catégorie à l'autre.
            </p>
            <button type="button" onClick={downloadTacticalCsvTemplate}
              style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '6px auto 0', padding: 0, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.72rem', textDecoration: 'underline' }}>
              <Download size={11} /> Télécharger un exemple de fichier CSV
            </button>
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
                    <span style={{ marginLeft: 6, fontSize: '0.65rem', padding: '1px 6px', borderRadius: 3, backgroundColor: 'rgba(0,229,160,0.1)', color: '#00E5A0' }}>nouvelle</span>
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
                  <AlertTriangle size={12} /> {unexpectedValues.length} valeur{unexpectedValues.length > 1 ? 's' : ''} hors catalogue configuré — importée{unexpectedValues.length > 1 ? 's' : ''} quand même, à ajouter au catalogue si besoin :
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
          <button type="button" onClick={handleSave} disabled={!blocks || saving}
            style={{ padding: '9px 22px', backgroundColor: (!blocks || saving) ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: (!blocks || saving) ? '#475569' : '#0D0F14', fontWeight: 700, cursor: (!blocks || saving) ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
            {saving ? 'Enregistrement…' : 'Importer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

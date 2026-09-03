import { useState, useRef } from 'react';
import type { CSSProperties } from 'react';
import { X, Upload, AlertCircle, CheckCircle2, Download } from 'lucide-react';
import { tacticalConfigApi } from '../api/tacticalConfig';
import type { TacticalConfigImportResult } from '../api/tacticalConfig';
import { parseTacticalConfigCsv, normalizeTacticalName } from '../utils/tacticalCsvParser';
import type { ParsedConfigCategory } from '../utils/tacticalCsvParser';
import type { TacticalCategory, TacticalDimension, TacticalDimensionOption } from '../data/types';
import { Modal } from './Modal';
import { DropzoneEmptyState } from './DropzoneEmptyState';

// ─── Modèle CSV téléchargeable ──────────────────────────────────────────────────
// Deux catégories, des dimensions au nombre d'options différent, et une dimension
// "Valeur" sans catalogue — pour montrer que chaque ligne est libre.
const CONFIG_CSV_TEMPLATE = `Categorie;Dimension;Options
Defense Pick;Forme de jeu;Protect;Step;Switch;Chase
Defense Pick;Zone;P-TOP 5;P-SIDE 5;P-SIDE 4
Defense Pick;Finalite;Scoring;Faute;Perte de balle;Rebond defensif;Rebond offensif;Ballon mort
Defense Pick;Valeur
Attaque rapide;Temps fort;Easy basket;Drive & kick;Passing;Cut;Iso;Post-up
Attaque rapide;Finalite;Scoring;Faute;Perte de balle;Rebond defensif;Rebond offensif
Attaque rapide;Valeur
`;

function downloadConfigCsvTemplate() {
  const blob = new Blob(['﻿' + CONFIG_CSV_TEMPLATE], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url;
  a.download = 'modele_configuration_tactique.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const newBadgeStyle: CSSProperties = {
  fontSize: '0.65rem', padding: '1px 6px', borderRadius: 3,
  backgroundColor: 'rgba(0,229,160,0.1)', color: '#00E5A0',
};

interface Props {
  teamId: string;
  /** Configuration déjà en base, pour distinguer dans l'aperçu ce qui sera créé de ce qui existe. */
  categories: TacticalCategory[];
  dimensions: TacticalDimension[];
  options: TacticalDimensionOption[];
  onClose: () => void;
  onImported: (result: TacticalConfigImportResult) => void;
}

export function TacticalConfigImportModal({ teamId, categories, dimensions, options, onClose, onImported }: Props) {
  const [parsed, setParsed] = useState<ParsedConfigCategory[] | null>(null);
  const [fileError, setFileError] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function loadFile(file: File) {
    const reader = new FileReader();
    reader.onload = e => {
      try {
        const result = parseTacticalConfigCsv((e.target?.result as string) ?? '');
        if (result.length === 0) {
          setFileError('Aucune catégorie détectée — une ligne par dimension : catégorie, dimension, puis ses options.');
          return;
        }
        setFileError('');
        setParsed(result);
      } catch {
        setFileError("Erreur de lecture — vérifiez l'encodage du fichier (UTF-8).");
      }
    };
    reader.onerror = () => setFileError("Erreur de lecture — vérifiez l'encodage du fichier (UTF-8).");
    reader.readAsText(file, 'UTF-8');
  }

  const findCategory = (name: string) => categories.find(c => normalizeTacticalName(c.name) === normalizeTacticalName(name));
  const findDimension = (categoryId: string | undefined, name: string) =>
    categoryId === undefined ? undefined
      : dimensions.find(d => d.categoryId === categoryId && normalizeTacticalName(d.name) === normalizeTacticalName(name));
  const optionExists = (dimensionId: string | undefined, label: string) =>
    dimensionId !== undefined
    && options.some(o => o.dimensionId === dimensionId && normalizeTacticalName(o.label) === normalizeTacticalName(label));

  // Ce que l'import créerait réellement — les éléments déjà en base sont réutilisés tels quels.
  const toCreate = (parsed ?? []).reduce(
    (acc, pc) => {
      const category = findCategory(pc.name);
      if (!category) acc.categories++;
      for (const pd of pc.dimensions) {
        const dimension = findDimension(category?.id, pd.name);
        if (!dimension) acc.dimensions++;
        for (const label of pd.options) if (!optionExists(dimension?.id, label)) acc.options++;
      }
      return acc;
    },
    { categories: 0, dimensions: 0, options: 0 },
  );
  const nothingToCreate = !!parsed && toCreate.categories + toCreate.dimensions + toCreate.options === 0;

  async function handleSave() {
    if (!parsed) return;
    setSaving(true);
    setSaveError('');
    try {
      onImported(await tacticalConfigApi.importConfig(teamId, parsed));
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal maxWidth={720} overlayOpacity={0.85} align="flex-start" closeOnBackdropClick style={{ flexShrink: 0 }} onClose={onClose}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 24px', borderBottom: '1px solid #2A2F3A' }}>
        <div>
          <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>Importer une configuration tactique</h2>
          <p style={{ color: '#475569', margin: '2px 0 0', fontSize: '0.78rem' }}>Catégories, dimensions et options attendues</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', padding: 4 }}>
          <X size={18} />
        </button>
      </div>

      <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <DropzoneEmptyState
            label="Choisir le fichier CSV de configuration"
            onClick={() => fileRef.current?.click()}
            icon={<Upload size={14} color="#00E5A0" />}
            style={{ gap: 8, padding: '10px 16px', minHeight: 'auto', backgroundColor: '#1E2229', color: '#94A3B8', fontSize: '0.82rem', width: '100%' }}
          />
          <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) loadFile(f); e.target.value = ''; }}
          />
          {fileError && (
            <p style={{ color: '#EF4444', fontSize: '0.75rem', margin: '6px 0 0', display: 'flex', alignItems: 'flex-start', gap: 4 }}>
              <AlertCircle size={12} style={{ flexShrink: 0, marginTop: 2 }} /> {fileError}
            </p>
          )}

          <p style={{ color: '#475569', fontSize: '0.72rem', margin: '10px 0 0', lineHeight: 1.5 }}>
            Une ligne par dimension : <code>catégorie ; dimension ; option ; option ; …</code>. Répéter la catégorie et la
            dimension sur plusieurs lignes fonctionne aussi (une option par ligne), les lignes se rejoignent. Une ligne sans
            dimension ne crée que la catégorie, et une dimension sans option n'a pas de catalogue — toute valeur du CSV de
            match y sera alors acceptée sans avertissement. L'import n'écrase et ne supprime jamais rien : ce qui existe
            déjà est conservé tel quel.
          </p>
          <button type="button" onClick={downloadConfigCsvTemplate}
            style={{ display: 'flex', alignItems: 'center', gap: 5, margin: '6px auto 0', padding: 0, background: 'none', border: 'none', color: '#475569', cursor: 'pointer', fontSize: '0.72rem', textDecoration: 'underline' }}>
            <Download size={11} /> Télécharger un exemple de fichier CSV
          </button>
        </div>

        {parsed && (
          <div style={{ backgroundColor: '#1A1D24', border: '1px solid #2A2F3A', borderRadius: 8, padding: 16 }}>
            <p style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '0.85rem', margin: '0 0 12px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <CheckCircle2 size={14} color="#00E5A0" />
              {toCreate.categories} catégorie{toCreate.categories > 1 ? 's' : ''}, {toCreate.dimensions} dimension{toCreate.dimensions > 1 ? 's' : ''} et {toCreate.options} option{toCreate.options > 1 ? 's' : ''} à créer
            </p>
            {nothingToCreate && (
              <p style={{ color: '#F59E0B', fontSize: '0.75rem', margin: '-6px 0 12px' }}>
                Tout le contenu du fichier existe déjà dans la configuration — l'import ne changerait rien.
              </p>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {parsed.map((pc, ci) => {
                const category = findCategory(pc.name);
                return (
                  <div key={ci}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <span style={{ color: '#F1F5F9', fontWeight: 600, fontSize: '0.82rem' }}>{pc.name}</span>
                      {!category && <span style={newBadgeStyle}>nouvelle</span>}
                      {pc.dimensions.length === 0 && <span style={{ color: '#475569', fontSize: '0.7rem' }}>· aucune dimension</span>}
                    </div>
                    {pc.dimensions.map((pd, di) => {
                      const dimension = findDimension(category?.id, pd.name);
                      return (
                        <div key={di} style={{ margin: '6px 0 0 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <span style={{ color: '#94A3B8', fontSize: '0.78rem' }}>{pd.name}</span>
                            {!dimension && <span style={newBadgeStyle}>nouvelle</span>}
                            {pd.options.length === 0 && <span style={{ color: '#475569', fontSize: '0.7rem' }}>· sans catalogue</span>}
                          </div>
                          {pd.options.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                              {pd.options.map((label, oi) => {
                                const exists = optionExists(dimension?.id, label);
                                return (
                                  <span key={oi} style={{
                                    fontSize: '0.68rem', padding: '1px 6px', borderRadius: 3,
                                    border: `1px solid ${exists ? '#2A2F3A' : 'rgba(0,229,160,0.3)'}`,
                                    backgroundColor: exists ? 'transparent' : 'rgba(0,229,160,0.08)',
                                    color: exists ? '#475569' : '#00E5A0',
                                  }}>
                                    {label}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
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
          <button type="button" onClick={handleSave} disabled={!parsed || nothingToCreate || saving}
            style={{ padding: '9px 22px', backgroundColor: (!parsed || nothingToCreate || saving) ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: (!parsed || nothingToCreate || saving) ? '#475569' : '#0D0F14', fontWeight: 700, cursor: (!parsed || nothingToCreate || saving) ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
            {saving ? 'Création…' : 'Créer'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

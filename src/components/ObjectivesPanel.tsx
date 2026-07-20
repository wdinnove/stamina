import { useState } from 'react';
import type { FormEvent } from 'react';
import { Plus, Trash2, Pencil, X, CheckCircle2, XCircle, Target } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { IndicatorSelect } from './IndicatorSelect';
import { objectivesApi } from '../api';
import { useObjectives } from '../hooks/useObjectives';
import { evaluateObjectiveWindows } from '../utils/objectiveStatus';
import { fmt1 } from '../utils/format';
import { importanceConfig, comparatorConfig } from '../data/config';
import { DOMAIN_LABELS, indicatorByKey, type CrossScope } from '../data/crossAnalysis';
import type { Objective, ObjectiveImportance, ObjectiveComparator } from '../data/types';

interface ObjectivesPanelProps {
  playerId?: string;
  teamId?: string;
  scope: CrossScope;
  seasonStart?: string;
  seasonEnd?: string;
}

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

type FormState = {
  indicatorKey: string;
  importance: ObjectiveImportance;
  comparator: ObjectiveComparator;
  thresholdValue: string;
};

const emptyForm: FormState = { indicatorKey: '', importance: 'normal', comparator: 'gte', thresholdValue: '' };

// Ordre logique pour le picker d'indicateur : brutes d'abord (dans l'ordre des colonnes des
// tableaux de stats), puis avancées — le registre ne garantit pas cet ordre (il sert d'abord
// aux corrélations), donc on le fixe explicitement ici plutôt que de trier le registre partagé.
const PLAYER_MATCH_ORDER = [
  'min', 'pts', 'fg2Pct', 'fg3Pct', 'ftPct', 'ro', 'rd', 'reb', 'pd', 'ct', 'intercepts', 'bp', 'fte', 'fpr', 'eval', 'plusMinus',
  'adv_usagePct', 'adv_offRating', 'adv_efgPct', 'adv_ftRate', 'adv_ptsProd', 'adv_astPct', 'adv_tovPct', 'adv_trebPct', 'adv_drebPct', 'adv_orebPct',
];
const TEAM_MATCH_ORDER = [
  'team_ptsFor', 'team_fg2Pct', 'team_fg3Pct', 'team_ftPct', 'team_ro', 'team_rd', 'team_pd', 'team_ct', 'team_intercepts', 'team_bp',
  'team_scorediff', 'team_ptsAgainst', 'team_possessions',
  'team_offRating', 'team_defRating', 'team_efgPct', 'team_ftRate', 'team_toPct', 'team_orebPct', 'team_drebPct',
  'team_opp_efgPct', 'team_opp_toPct', 'team_opp_orebPct',
];

export function ObjectivesPanel({ playerId, teamId, scope, seasonStart, seasonEnd }: ObjectivesPanelProps) {
  const { objectives, loading, reload } = useObjectives({ playerId, teamId });
  const indicators = (playerId ? PLAYER_MATCH_ORDER : TEAM_MATCH_ORDER)
    .map(indicatorByKey)
    .filter((i): i is NonNullable<typeof i> => i != null);

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Objective | null>(null);
  const [deleting, setDeleting] = useState(false);

  const openCreate = () => { setEditing(null); setForm(emptyForm); setFormError(''); setShowForm(true); };
  const openEdit = (o: Objective) => {
    setEditing(o);
    setForm({ indicatorKey: o.indicatorKey, importance: o.importance, comparator: o.comparator, thresholdValue: String(o.thresholdValue) });
    setFormError('');
    setShowForm(true);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!form.indicatorKey) { setFormError('Choisis un indicateur.'); return; }
    const thresholdValue = Number(form.thresholdValue);
    if (Number.isNaN(thresholdValue)) { setFormError('Le seuil doit être un nombre.'); return; }
    setSaving(true);
    setFormError('');
    try {
      if (editing) {
        await objectivesApi.update(editing.id, {
          indicatorKey: form.indicatorKey, importance: form.importance, comparator: form.comparator, thresholdValue,
        });
      } else {
        await objectivesApi.create({
          playerId, teamId, indicatorKey: form.indicatorKey, importance: form.importance,
          comparator: form.comparator, thresholdValue, active: true,
        });
      }
      setShowForm(false);
      reload();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : "Erreur lors de l'enregistrement.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await objectivesApi.delete(confirmDelete.id);
      setConfirmDelete(null);
      reload();
    } finally {
      setDeleting(false);
    }
  };

  const grouped = new Map<string, Objective[]>();
  objectives.forEach(o => {
    const def = indicatorByKey(o.indicatorKey);
    const group = def ? (def.group ?? DOMAIN_LABELS[def.domain]) : 'Autre';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(o);
  });

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <CardTitle icon={<Target size={12} style={{ color: '#3B82F6' }} />} mb={0} right={
          <button onClick={openCreate} style={{ padding: '8px 14px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Plus size={16} /><span>Ajouter un objectif</span>
          </button>
        }>
          Objectifs
        </CardTitle>
      </Card>

      {loading ? (
        <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>
      ) : objectives.length === 0 ? (
        <EmptyState message="Aucun objectif défini pour le moment." />
      ) : (
        [...grouped.entries()].map(([group, objs]) => (
          <Card key={group} style={{ marginBottom: 14 }}>
            <CardTitle mb={10}>{group}</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {objs.map(o => {
                const def = indicatorByKey(o.indicatorKey);
                const { windows } = evaluateObjectiveWindows(o, scope, seasonStart, seasonEnd);
                const imp = importanceConfig[o.importance];
                const cmp = comparatorConfig[o.comparator];
                return (
                  <div key={o.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '9px 10px', flexWrap: 'wrap',
                    backgroundColor: imp.bg, borderRadius: 6, borderLeft: `3px solid ${imp.color}`,
                  }}>
                    <Badge color={imp.color} label={imp.label} size="sm" />
                    <div style={{ flex: 1, minWidth: 140 }}>
                      <div style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600 }}>{def?.label ?? o.indicatorKey}</div>
                      <div style={{ color: '#64748B', fontSize: '0.72rem' }}>
                        Objectif : {cmp.symbol} {o.thresholdValue}{def?.unit ? ` ${def.unit}` : ''}
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 16 }}>
                      {windows.map(w => (
                        <div key={w.label} style={{ textAlign: 'center', minWidth: 82 }}>
                          <div style={{ color: '#64748B', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3, whiteSpace: 'nowrap' }}>{w.label}</div>
                          <div style={{ color: '#F1F5F9', fontSize: '0.9rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace' }}>{fmt1(w.value)}</div>
                          <div style={{ marginTop: 2, display: 'flex', justifyContent: 'center' }}>
                            {w.met === null ? <span style={{ color: '#475569', fontSize: '0.7rem' }}>—</span>
                              : w.met ? <CheckCircle2 size={14} style={{ color: '#00E5A0' }} />
                              : <XCircle size={14} style={{ color: '#EF4444' }} />}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button onClick={() => openEdit(o)} title="Modifier"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: 2, display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#3B82F6')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#334155')}>
                        <Pencil size={14} />
                      </button>
                      <button onClick={() => setConfirmDelete(o)} title="Supprimer"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#334155', padding: 2, display: 'flex' }}
                        onMouseEnter={e => (e.currentTarget.style.color = '#EF4444')}
                        onMouseLeave={e => (e.currentTarget.style.color = '#334155')}>
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </Card>
        ))
      )}

      {showForm && (
        <Modal maxWidth={480} scrollOverlay={false} onClose={() => setShowForm(false)}>
          <div className="px-4 sm:px-7" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingTop: 20, paddingBottom: 16, borderBottom: '1px solid #2A2F3A' }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              {editing ? "Modifier l'objectif" : 'Nouvel objectif'}
            </h2>
            <button onClick={() => setShowForm(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', display: 'flex' }}>
              <X size={18} />
            </button>
          </div>
          <form className="px-4 sm:px-7" style={{ paddingTop: 18, paddingBottom: 20 }} onSubmit={handleSubmit}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ display: 'block', color: '#94A3B8', fontSize: '0.75rem', marginBottom: 4 }}>Indicateur</label>
              <IndicatorSelect indicators={indicators} value={form.indicatorKey} onChange={key => setForm(f => ({ ...f, indicatorKey: key }))} />
            </div>
            <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#94A3B8', fontSize: '0.75rem', marginBottom: 4 }}>Importance</label>
                <select value={form.importance} onChange={e => setForm(f => ({ ...f, importance: e.target.value as ObjectiveImportance }))} style={inputStyle}>
                  {Object.entries(importanceConfig).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                </select>
              </div>
              <div style={{ flex: 1 }}>
                <label style={{ display: 'block', color: '#94A3B8', fontSize: '0.75rem', marginBottom: 4 }}>Comparateur</label>
                <select value={form.comparator} onChange={e => setForm(f => ({ ...f, comparator: e.target.value as ObjectiveComparator }))} style={inputStyle}>
                  {Object.entries(comparatorConfig).map(([k, v]) => <option key={k} value={k}>{v.symbol} {v.label}</option>)}
                </select>
              </div>
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', color: '#94A3B8', fontSize: '0.75rem', marginBottom: 4 }}>Seuil attendu</label>
              <input type="number" step="any" value={form.thresholdValue} onChange={e => setForm(f => ({ ...f, thresholdValue: e.target.value }))} style={inputStyle} />
            </div>
            {formError && <p style={{ color: '#EF4444', fontSize: '0.78rem', margin: '0 0 12px' }}>{formError}</p>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button type="button" onClick={() => setShowForm(false)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.88rem' }}>Annuler</button>
              <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
                {saving ? 'Enregistrement…' : editing ? 'Enregistrer' : 'Créer'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {confirmDelete && (
        <Modal maxWidth={400} zIndex={200} scrollOverlay={false} style={{ padding: 24 }} onClose={() => setConfirmDelete(null)}>
          <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Supprimer cet objectif ?</h2>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 6px' }}>
            <strong style={{ color: '#F1F5F9' }}>{indicatorByKey(confirmDelete.indicatorKey)?.label ?? confirmDelete.indicatorKey}</strong>
          </p>
          <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 20px' }}>Cet objectif sera définitivement supprimé.</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => setConfirmDelete(null)} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer', fontSize: '0.88rem' }}>Annuler</button>
            <button onClick={handleDelete} disabled={deleting} style={{ flex: 1, padding: '10px', backgroundColor: deleting ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: deleting ? '#475569' : '#F1F5F9', cursor: deleting ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}>
              {deleting ? 'Suppression…' : 'Supprimer'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

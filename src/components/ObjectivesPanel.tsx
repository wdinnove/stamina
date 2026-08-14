import { useState, useMemo } from 'react';
import type { FormEvent } from 'react';
import { Trash2, Pencil, X, CheckCircle2, XCircle, Target, AlertTriangle, CopyPlus } from 'lucide-react';
import { Card, CardTitle } from './Card';
import { Modal } from './Modal';
import { Badge } from './Badge';
import { EmptyState } from './EmptyState';
import { IndicatorSelect } from './IndicatorSelect';
import { objectivesApi } from '../api';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { useObjectives } from '../hooks/useObjectives';
import { evaluateObjectiveWindows } from '../utils/objectiveStatus';
import { fmt1 } from '../utils/format';
import { importanceConfig, comparatorConfig } from '../data/config';
import { DOMAIN_LABELS, indicatorByKey, buildTacticalIndicators, type CrossScope } from '../data/crossAnalysis';
import type { Objective, ObjectiveImportance, ObjectiveComparator } from '../data/types';
import { LAYER } from '../styles/layers';
import { AddButton } from './AddButton';

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
  'adv_usagePctRaw', 'adv_usagePct', 'adv_offRating', 'adv_efgPct', 'adv_ftRate', 'adv_ptsProd', 'adv_astPct', 'adv_tovPct', 'adv_trebPct', 'adv_drebPct', 'adv_orebPct',
];
const TEAM_MATCH_ORDER = [
  'team_ptsFor', 'team_fg2Pct', 'team_fg3Pct', 'team_ftPct', 'team_ro', 'team_rd', 'team_pd', 'team_ct', 'team_intercepts', 'team_bp',
  'team_scorediff', 'team_ptsAgainst', 'team_possessions',
  'team_offRating', 'team_defRating', 'team_efgPct', 'team_ftRate', 'team_toPct', 'team_orebPct', 'team_drebPct',
  'team_opp_efgPct', 'team_opp_toPct', 'team_opp_orebPct',
];

// Un objectif tactique dont la catégorie/dimension/option a été supprimée entretemps ne doit
// jamais afficher la clé technique brute (`tactical_<uuid>_<uuid>_...`) comme s'il s'agissait
// d'un nom de stat — un message explicite est plus clair qu'un identifiant opaque.
function orphanIndicatorLabel(indicatorKey: string): string {
  return indicatorKey.startsWith('tactical_') ? 'Attribut tactique supprimé' : 'Attribut supprimé';
}

export function ObjectivesPanel({ playerId, teamId, scope, seasonStart, seasonEnd }: ObjectivesPanelProps) {
  const { canEditTeamData, selected, options } = useTeamSeason();
  const seasonId = selected?.season.id;
  const { objectives, loading, reload } = useObjectives({ playerId, teamId, seasonId });
  // Mémoïsé comme dans CorrelationsPanel : sans ça, ce scan (catégories × dimensions × événements)
  // est refait à chaque rendu — y compris à chaque frappe dans le formulaire de création/édition,
  // qui vit dans ce même composant et déclenche donc un re-render de tout l'écran.
  const tacticalIndicators = useMemo(() => buildTacticalIndicators(scope.team?.tactical), [scope.team?.tactical]);
  const indicators = playerId
    ? PLAYER_MATCH_ORDER.map(key => indicatorByKey(key)).filter((i): i is NonNullable<typeof i> => i != null)
    : [
        ...TEAM_MATCH_ORDER.map(key => indicatorByKey(key)).filter((i): i is NonNullable<typeof i> => i != null),
        ...tacticalIndicators,
      ];

  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Objective | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<Objective | null>(null);
  const [deleting, setDeleting] = useState(false);

  /** Saison précédente de la même équipe — source du report d'objectifs en début de saison. */
  const previousSeasonId = useMemo(() => {
    if (!selected) return null;
    const sameTeam = options
      .filter(o => o.team.id === selected.team.id)
      .sort((a, b) => b.season.startDate.localeCompare(a.season.startDate));
    const i = sameTeam.findIndex(o => o.season.id === selected.season.id);
    return i >= 0 && i + 1 < sameTeam.length ? sameTeam[i + 1].season.id : null;
  }, [options, selected?.team.id, selected?.season.id]);

  const [copying, setCopying] = useState(false);
  const [copyMsg, setCopyMsg] = useState('');

  /** Report explicite : un objectif de l'an passé n'est pas forcément encore pertinent. */
  async function handleCopyPrevious() {
    if (!previousSeasonId || !seasonId) return;
    setCopying(true);
    setCopyMsg('');
    try {
      const created = await objectivesApi.copyFromSeason({ playerId, teamId }, previousSeasonId, seasonId);
      setCopyMsg(created.length
        ? `${created.length} objectif${created.length > 1 ? 's' : ''} repris.`
        : 'Rien à reprendre : ces objectifs existent déjà.');
      reload();
    } catch (err) {
      setCopyMsg(err instanceof Error ? err.message : 'Erreur lors du report.');
    } finally {
      setCopying(false);
    }
  }

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
          playerId, teamId, seasonId, indicatorKey: form.indicatorKey, importance: form.importance,
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
    const def = indicatorByKey(o.indicatorKey, tacticalIndicators);
    const group = def ? (def.group ?? DOMAIN_LABELS[def.domain]) : 'Autre';
    if (!grouped.has(group)) grouped.set(group, []);
    grouped.get(group)!.push(o);
  });

  return (
    <div>
      <Card style={{ marginBottom: 14 }}>
        <CardTitle icon={<Target size={12} style={{ color: '#3B82F6' }} />} mb={0} right={
          canEditTeamData && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {/* Les objectifs sont rattachés à une saison : sans ce report, chaque début de saison
                obligerait à tout resaisir, et la migration se vivrait comme une perte. */}
            {previousSeasonId && (
              <button onClick={handleCopyPrevious} disabled={copying}
                title="Recopier les objectifs actifs de la saison précédente"
                style={{ padding: '8px 12px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 6, color: copying ? '#475569' : '#94A3B8', cursor: copying ? 'not-allowed' : 'pointer', fontWeight: 600, fontSize: '0.82rem', display: 'flex', alignItems: 'center', gap: 6 }}>
                <CopyPlus size={14} /><span>{copying ? 'Report…' : 'Reprendre la saison passée'}</span>
              </button>
            )}
            <AddButton label="Ajouter un objectif" onClick={openCreate} />
          </div>
          )
        }>
          Objectifs
        </CardTitle>
        {copyMsg && <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '10px 0 0' }}>{copyMsg}</p>}
      </Card>

      {loading ? (
        <div style={{ color: '#64748B', fontSize: '0.85rem' }}>Chargement…</div>
      ) : objectives.length === 0 ? (
        <EmptyState message={canEditTeamData ? 'Aucun objectif défini pour le moment.' : 'Aucun objectif. Seuls les rôles Admin et Éditeur peuvent en créer.'} />
      ) : (
        [...grouped.entries()].map(([group, objs]) => (
          <Card key={group} style={{ marginBottom: 14 }}>
            <CardTitle mb={10}>{group}</CardTitle>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {objs.map(o => {
                const def = indicatorByKey(o.indicatorKey, tacticalIndicators);
                const { windows } = evaluateObjectiveWindows(o, scope, seasonStart, seasonEnd, tacticalIndicators);
                const imp = importanceConfig[o.importance];
                const cmp = comparatorConfig[o.comparator];
                return (
                  /* Grille et non flex+flexWrap : le flexWrap faisait retomber le badge, le
                     libellé, les 3 fenêtres et les 2 boutons en lignes bancales sous 400 px.
                     Sous md, deux lignes nettes : identité de l'objectif, puis les 3 fenêtres
                     alignées en grid-cols-3. */
                  <div key={o.id} className="grid grid-cols-1 md:flex md:items-center" style={{
                    gap: 10, padding: '10px 12px',
                    backgroundColor: imp.bg, borderRadius: 6, borderLeft: `3px solid ${imp.color}`,
                  }}>
                    {/* Ligne 1 — importance, indicateur, et le SEUIL, qui est l'information
                        centrale de la ligne : il était noyé dans un sous-titre gris 0,72rem
                        alors que les valeurs mesurées s'affichaient deux fois plus gros. */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <Badge color={imp.color} label={imp.label} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {def ? (
                          <div style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600 }}>{def.label}</div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#F59E0B', fontSize: '0.85rem', fontWeight: 600, fontStyle: 'italic' }}>
                            <AlertTriangle size={13} />{orphanIndicatorLabel(o.indicatorKey)}
                          </div>
                        )}
                        <div style={{ color: '#475569', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>
                          Objectif
                        </div>
                      </div>
                      <div style={{
                        display: 'flex', alignItems: 'baseline', gap: 3, flexShrink: 0,
                        padding: '4px 10px', borderRadius: 6,
                        backgroundColor: `${imp.color}1A`, border: `1px solid ${imp.color}55`,
                      }}>
                        <span style={{ color: imp.color, fontSize: '0.78rem', fontWeight: 700 }}>{cmp.symbol}</span>
                        <span style={{ color: imp.color, fontSize: '1rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>
                          {o.thresholdValue}
                        </span>
                        {def?.unit && <span style={{ color: imp.color, fontSize: '0.68rem', opacity: 0.8 }}>{def.unit}</span>}
                      </div>
                    </div>

                    {/* Ligne 2 — les 3 fenêtres. La couleur atteint/manqué porte sur la VALEUR
                        elle-même, l'icône ne fait plus que confirmer. */}
                    <div className="grid grid-cols-3 md:flex" style={{ gap: 8 }}>
                      {windows.map(w => {
                        const color = w.met === null ? '#475569' : w.met ? '#00E5A0' : '#EF4444';
                        return (
                          <div key={w.label} style={{ textAlign: 'center', minWidth: 78 }}>
                            <div style={{ color: '#64748B', fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 3, whiteSpace: 'nowrap' }}>{w.label}</div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <span style={{ color, fontSize: '0.95rem', fontWeight: 800, fontFamily: 'JetBrains Mono, monospace' }}>{fmt1(w.value)}</span>
                              {w.met === true  && <CheckCircle2 size={12} style={{ color, flexShrink: 0 }} />}
                              {w.met === false && <XCircle size={12} style={{ color, flexShrink: 0 }} />}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {canEditTeamData && (
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
                    )}
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
        <Modal maxWidth={400} zIndex={LAYER.modalOverModal} scrollOverlay={false} style={{ padding: 24 }} onClose={() => setConfirmDelete(null)}>
          <h2 style={{ color: '#F1F5F9', margin: '0 0 8px', fontSize: '1rem', fontWeight: 700 }}>Supprimer cet objectif ?</h2>
          <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 6px' }}>
            <strong style={{ color: '#F1F5F9' }}>{indicatorByKey(confirmDelete.indicatorKey, tacticalIndicators)?.label ?? orphanIndicatorLabel(confirmDelete.indicatorKey)}</strong>
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

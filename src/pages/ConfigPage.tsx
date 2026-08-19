import { useState, useEffect } from 'react';
import { Sliders, Shield, TrendingUp, Tag, Plus, Pencil, Trash2, Check, X, ChevronUp, ChevronDown, ClipboardList, Search, UserCheck, UserPlus, AlertCircle, Heart, Video, Lock, Bell } from 'lucide-react';
import { TacticalConfigManager } from '../components/TacticalConfigManager';
import { TeamNotificationsTab } from '../components/TeamNotificationsTab';
import { teamsApi, teamRolesApi } from '../api';
import type { AssignableProfile } from '../api/teamRoles';
import { playersApi } from '../api/players';
import { staffApi } from '../api/staff';
import { notify } from '../api/notifications';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import type { StatThresholds } from '../contexts/TeamSeasonContext';
import { buildWeekTiers, DEFAULT_THRESHOLDS } from '../utils/weeklyLoad';
import { ConfigCard, ConfigStack, ConfigAction, ConfigSaveAction, ConfigMessage, StatusBadge, CategoryManager, EmptyState, Modal, PlayerEditModal, PlayerAvatar, WellnessMethodPreview, AddButton } from '../components';
import { playerNameFull, playerNameShort } from '../utils/playerName';
import type { Player, StaffMember, TeamRole, TeamRoleAssignment, WellnessEntryMethod } from '../data/types';
import { LAYER } from '../styles/layers';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  color: '#94A3B8', fontSize: '0.72rem', fontWeight: 600,
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5, display: 'block',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  );
}

function ThresholdPreview({ lightMax, normalMax }: { lightMax: number; normalMax: number }) {
  const tiers = buildWeekTiers(lightMax, normalMax);
  const total = normalMax * 1.5;
  return (
    <div style={{ margin: '14px 0 4px' }}>
      <div style={{ display: 'flex', height: 24, borderRadius: 6, overflow: 'hidden', gap: 2 }}>
        {tiers.map((t, i) => {
          const prev  = i === 0 ? 0 : tiers[i - 1].max;
          const width = t.max === Infinity ? normalMax * 0.5 : t.max - prev;
          const pct   = (width / total) * 100;
          return (
            <div key={t.label} style={{ flex: `${pct} 0 0`, backgroundColor: t.bg, border: `1px solid ${t.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span style={{ color: t.color, fontSize: '0.62rem', fontWeight: 700 }}>{t.label}</span>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ color: '#475569', fontSize: '0.65rem' }}>0 UA</span>
        <span style={{ color: '#F9731680', fontSize: '0.65rem' }}>≤{Math.round(normalMax / 2)} UA</span>
        <span style={{ color: '#EF444480', fontSize: '0.65rem' }}>≤{normalMax} UA</span>
        <span style={{ color: '#EF444480', fontSize: '0.65rem' }}>{'>'} {normalMax} UA</span>
      </div>
    </div>
  );
}

const DEFAULT_STAT: StatThresholds = {
  evalTOrange: 0, evalTBlue: 5, evalTGreen: 10,
  ortgTAmber: 60, ortgTGreen: 90,
  drtgTAmber: 100, drtgTRed: 115,
};

function StatColorPreview({ t }: { t: StatThresholds }) {
  const evalZones = [
    { label: `< ${t.evalTOrange}`, color: '#EF4444', bg: '#EF444418' },
    { label: `${t.evalTOrange}–${t.evalTBlue}`, color: '#F59E0B', bg: '#F59E0B18' },
    { label: `${t.evalTBlue}–${t.evalTGreen}`, color: '#3B82F6', bg: '#3B82F618' },
    { label: `≥ ${t.evalTGreen}`, color: '#00E5A0', bg: '#00E5A018' },
  ];
  const ortgZones = [
    { label: `< ${t.ortgTAmber}`, color: '#EF4444', bg: '#EF444418' },
    { label: `${t.ortgTAmber}–${t.ortgTGreen}`, color: '#F59E0B', bg: '#F59E0B18' },
    { label: `> ${t.ortgTGreen}`, color: '#00E5A0', bg: '#00E5A018' },
  ];
  const drtgZones = [
    { label: `< ${t.drtgTAmber}`, color: '#00E5A0', bg: '#00E5A018' },
    { label: `${t.drtgTAmber}–${t.drtgTRed}`, color: '#F59E0B', bg: '#F59E0B18' },
    { label: `≥ ${t.drtgTRed}`, color: '#EF4444', bg: '#EF444418' },
  ];
  const ZoneBar = ({ zones }: { zones: { label: string; color: string; bg: string }[] }) => (
    <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', gap: 2, marginTop: 6 }}>
      {zones.map(z => (
        <div key={z.label} style={{ flex: 1, backgroundColor: z.bg, border: `1px solid ${z.color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ color: z.color, fontSize: '0.6rem', fontWeight: 700 }}>{z.label}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ color: '#64748B', fontSize: '0.68rem', marginBottom: 2 }}>Éval</div>
      <ZoneBar zones={evalZones} />
      <div style={{ marginTop: 10 }}>
        <div style={{ color: '#64748B', fontSize: '0.68rem', marginBottom: 2 }}>ORtg</div>
        <ZoneBar zones={ortgZones} />
      </div>
      <div style={{ marginTop: 10 }}>
        <div style={{ color: '#64748B', fontSize: '0.68rem', marginBottom: 2 }}>DRtg</div>
        <ZoneBar zones={drtgZones} />
      </div>
    </div>
  );
}

export type TeamSection = 'info' | 'roster' | 'staff' | 'thresholds' | 'wellness' | 'notifs' | 'categories' | 'tactical' | 'roles';
type Tab = TeamSection;

const TABS: { key: Tab; label: string; icon: typeof Shield }[] = [
  { key: 'info',       label: 'Informations', icon: Shield },
  { key: 'roster',     label: 'Effectif',     icon: ClipboardList },
  { key: 'staff',      label: 'Staff',        icon: UserCheck },
  { key: 'thresholds', label: 'Seuils',       icon: Sliders },
  { key: 'wellness',   label: 'Bien-être',    icon: Heart },
  { key: 'notifs',     label: 'Notifications', icon: Bell },
  { key: 'categories', label: 'Catégories',   icon: Tag },
  { key: 'tactical',   label: 'Tactique',     icon: Video },
  { key: 'roles',      label: 'Rôles',        icon: Lock },
];

// La donnée tactique est éditable par editor+ en base (writable_team_ids()), pas
// seulement admin/superadmin — un editor qui n'a pas accès au reste de la config
// équipe doit quand même pouvoir atteindre cet onglet.
const EDITOR_ONLY_TABS: Tab[] = ['tactical'];

/** Sections équipe visibles selon les droits — la navigation vit dans ConfigurationPage. */
export function teamSections(canConfigureTeam: boolean, canEditTeamData: boolean): { key: TeamSection; label: string }[] {
  if (canConfigureTeam) return TABS.map(t => ({ key: t.key, label: t.label }));
  if (canEditTeamData)  return TABS.filter(t => EDITOR_ONLY_TABS.includes(t.key)).map(t => ({ key: t.key, label: t.label }));
  return [];
}

const thStyle: React.CSSProperties = {
  padding: '10px 14px', textAlign: 'left', color: '#94A3B8', fontSize: '0.72rem',
  fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
};

const tdStyle: React.CSSProperties = { padding: '10px 14px', color: '#F1F5F9', fontSize: '0.85rem' };

// Colonnes partagées avec la table Joueurs (ClubPage.tsx) — mêmes largeurs, seule la colonne Actions diffère.
const ROSTER_COL_WIDTHS = { player: '34%', position: '20%', number: '10%', status: '16%', actions: '20%' };

// ── Modale d'ajout de joueur à l'effectif ───────────────────────────────────
interface RosterAddModalProps {
  teamId: string;
  seasonId: string;
  teamName: string;
  seasonLabel: string;
  rosterIds: Set<string>;
  onClose: () => void;
  onSaved: () => void;
}

function RosterAddModal({ teamId, seasonId, teamName, seasonLabel, rosterIds, onClose, onSaved }: RosterAddModalProps) {
  const [allPlayers, setAllPlayers] = useState<Player[]>([]);
  const [loading, setLoading]       = useState(true);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [search, setSearch]         = useState('');
  const [selected, setSelected]     = useState<Set<string>>(new Set());

  useEffect(() => {
    playersApi.list()
      .then(players => setAllPlayers(players.filter(p => !rosterIds.has(p.id))))
      .catch(err => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  const filtered = allPlayers.filter(p => {
    const q = search.toLowerCase();
    return (
      p.firstName.toLowerCase().includes(q) ||
      p.lastName.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q) ||
      String(p.number).includes(q)
    );
  });

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (selected.size === 0) return;
    setSaving(true);
    setError('');
    try {
      await playersApi.linkToSeason(Array.from(selected), seasonId);
      onSaved();
      const names = allPlayers.filter(p => selected.has(p.id)).map(p => playerNameFull(p)).join(', ');
      notify(teamId, 'player_added', `${selected.size} joueur${selected.size > 1 ? 's' : ''} ajouté${selected.size > 1 ? 's' : ''} à l'effectif`, { body: names || undefined, entityType: 'player' });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue');
      setSaving(false);
    }
  }

  return (
    <Modal onClose={onClose} maxWidth={520} maxHeight="80vh" overlayOpacity={0.65} style={{ boxShadow: '0 24px 60px rgba(0,0,0,0.6)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 20px', borderBottom: '1px solid #1E2229' }}>
          <div>
            <div style={{ color: '#F1F5F9', fontWeight: 700, fontSize: '1rem' }}>Ajouter à l'effectif</div>
            <div style={{ color: '#475569', fontSize: '0.78rem', marginTop: 2 }}>{teamName} · {seasonLabel}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#475569', cursor: 'pointer', padding: 4, display: 'flex' }}><X size={18} /></button>
        </div>

        <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #1E2229' }}>
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569', pointerEvents: 'none' }} />
            <input autoFocus type="text" placeholder="Rechercher un joueur…" value={search} onChange={e => setSearch(e.target.value)}
              style={{ width: '100%', paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 7, color: '#F1F5F9', fontSize: '0.85rem', outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {selected.size > 0 && (
            <div style={{ color: '#00E5A0', fontSize: '0.75rem', marginTop: 8, fontWeight: 600 }}>
              {selected.size} joueur{selected.size > 1 ? 's' : ''} sélectionné{selected.size > 1 ? 's' : ''}
            </div>
          )}
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {loading && <div style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '32px 0' }}>Chargement…</div>}
          {!loading && filtered.length === 0 && (
            <div style={{ color: '#475569', fontSize: '0.85rem', textAlign: 'center', padding: '32px 0' }}>
              {allPlayers.length === 0 ? 'Tous les joueurs sont déjà dans l\'effectif.' : 'Aucun résultat.'}
            </div>
          )}
          {!loading && filtered.map(player => {
            const isSelected = selected.has(player.id);
            return (
              <button key={player.id} onClick={() => toggle(player.id)}
                style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '10px 10px', marginBottom: 2, background: isSelected ? 'rgba(0,229,160,0.08)' : 'none', border: `1px solid ${isSelected ? 'rgba(0,229,160,0.25)' : 'transparent'}`, borderRadius: 8, cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s' }}
                onMouseEnter={e => { if (!isSelected) e.currentTarget.style.backgroundColor = '#1E2229'; }}
                onMouseLeave={e => { if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent'; }}>
                <div style={{ width: 20, height: 20, borderRadius: 5, flexShrink: 0, border: `2px solid ${isSelected ? '#00E5A0' : '#2A2F3A'}`, backgroundColor: isSelected ? '#00E5A0' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.12s' }}>
                  {isSelected && <Check size={12} color="#0a0e14" strokeWidth={3} />}
                </div>
                <span style={{ width: 28, height: 28, borderRadius: 5, flexShrink: 0, backgroundColor: '#1E2229', border: '1px solid #2A2F3A', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748B', fontSize: '0.75rem', fontWeight: 700 }}>
                  {player.number}
                </span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ color: '#F1F5F9', fontSize: '0.88rem', fontWeight: 600 }}>
                    {playerNameFull(player)}
                  </div>
                  <div style={{ color: '#475569', fontSize: '0.75rem' }}>{player.position}</div>
                </div>
                <StatusBadge status={player.status} size="sm" />
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px', borderTop: '1px solid #1E2229', gap: 10 }}>
          {error && <span style={{ color: '#EF4444', fontSize: '0.78rem', flex: 1 }}>{error}</span>}
          {!error && <span />}
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 7, border: '1px solid #2A2F3A', background: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem' }}>Annuler</button>
            <button onClick={handleSave} disabled={selected.size === 0 || saving}
              style={{ padding: '8px 18px', borderRadius: 7, border: 'none', backgroundColor: selected.size === 0 || saving ? '#1E2229' : '#00E5A0', color: selected.size === 0 || saving ? '#475569' : '#0a0e14', cursor: selected.size === 0 || saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem', fontWeight: 600, transition: 'all 0.15s' }}>
              {saving ? 'Enregistrement…' : `Ajouter${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </button>
          </div>
        </div>
    </Modal>
  );
}

// ── Onglet Effectif ──────────────────────────────────────────────────────────
function RosterTab() {
  const { selected } = useTeamSeason();
  const [players, setPlayers]     = useState<Player[]>([]);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [search, setSearch]       = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingPlayer, setEditingPlayer] = useState<Player | null>(null);
  const [unlinkTarget, setUnlinkTarget] = useState<Player | null>(null);
  const [removing, setRemoving]         = useState(false);
  const [removeError, setRemoveError]   = useState('');

  function loadRoster(seasonId: string) {
    setLoading(true); setError('');
    playersApi.listBySeason(seasonId)
      .then(setPlayers)
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    if (!selected) return;
    loadRoster(selected.season.id);
  }, [selected?.season.id]);

  const filtered = players.filter(p => {
    const q = search.toLowerCase();
    return p.firstName.toLowerCase().includes(q) || p.lastName.toLowerCase().includes(q) ||
      p.position.toLowerCase().includes(q) || String(p.number).includes(q);
  });

  const rosterIds = new Set(players.map(p => p.id));

  async function handleRemove() {
    if (!selected || !unlinkTarget) return;
    setRemoving(true); setRemoveError('');
    try {
      await playersApi.unlinkFromSeason(unlinkTarget.id, selected.season.id);
      notify(selected.team.id, 'player_removed', `${playerNameFull(unlinkTarget)} retiré de l'effectif`, { entityType: 'player', entityId: unlinkTarget.id });
      setPlayers(prev => prev.filter(p => p.id !== unlinkTarget.id));
      setUnlinkTarget(null);
    } catch (e) {
      setRemoveError(e instanceof Error ? e.message : 'Erreur');
    } finally {
      setRemoving(false);
    }
  }

  if (!selected) {
    return <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sélectionnez une équipe dans la barre du haut.</p>;
  }

  return (
    <ConfigCard
      icon={<ClipboardList size={14} color="#00E5A0" />}
      title="Effectif"
      action={
        <ConfigAction icon={<Plus size={14} />} onClick={() => setShowAddModal(true)} hideLabelOnMobile>
          Ajouter un joueur
        </ConfigAction>
      }>
      <div style={{ position: 'relative', marginBottom: 14 }}>
        <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
        <input placeholder="Rechercher un joueur…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ ...inputStyle, paddingLeft: 32 }} />
      </div>

      {error && <p style={{ color: '#EF4444', fontSize: '0.82rem', marginBottom: 10 }}>{error}</p>}
      {loading && <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>}
      {!loading && filtered.length === 0 && (
        <p style={{ color: '#475569', fontSize: '0.82rem' }}>{search ? 'Aucun résultat.' : 'Aucun joueur dans l\'effectif.'}</p>
      )}

      {!loading && filtered.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <colgroup>
              <col style={{ width: ROSTER_COL_WIDTHS.player }} />
              <col style={{ width: ROSTER_COL_WIDTHS.position }} />
              <col style={{ width: ROSTER_COL_WIDTHS.number }} />
              <col style={{ width: ROSTER_COL_WIDTHS.status }} />
              <col style={{ width: ROSTER_COL_WIDTHS.actions }} />
            </colgroup>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th style={thStyle}>Joueur</th>
                <th style={thStyle}>Poste</th>
                <th style={{ ...thStyle, textAlign: 'center' }}>N°</th>
                <th style={thStyle}>Statut</th>
                <th style={{ ...thStyle, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p, i) => (
                <tr key={p.id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #1E2229' : 'none' }}>
                  <td style={tdStyle}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <PlayerAvatar player={p} size={30} />
                      <div style={{ fontWeight: 600 }}><span className="hidden md:inline">{playerNameFull(p)}</span><span className="md:hidden">{playerNameShort(p)}</span></div>
                    </div>
                  </td>
                  <td style={tdStyle}>{p.position}</td>
                  <td style={{ ...tdStyle, textAlign: 'center' }}>#{p.number}</td>
                  <td style={tdStyle}><StatusBadge status={p.status} size="sm" /></td>
                  <td style={{ ...tdStyle, textAlign: 'right' }}>
                    <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button onClick={() => setEditingPlayer(p)}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', backgroundColor: 'transparent', border: '1px solid #2A2F3A', borderRadius: 4, color: '#94A3B8', cursor: 'pointer', fontSize: '0.72rem' }}>
                        <Pencil size={11} /> Modifier
                      </button>
                      <button onClick={() => { setUnlinkTarget(p); setRemoveError(''); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', backgroundColor: 'transparent', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 4, color: '#EF4444', cursor: 'pointer', fontSize: '0.72rem' }}>
                        <Trash2 size={11} /> Délier
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal && (
        <RosterAddModal
          teamId={selected.team.id}
          seasonId={selected.season.id}
          teamName={selected.team.name}
          seasonLabel={selected.season.label}
          rosterIds={rosterIds}
          onClose={() => setShowAddModal(false)}
          onSaved={() => { setShowAddModal(false); loadRoster(selected.season.id); }}
        />
      )}

      {editingPlayer && (
        <PlayerEditModal
          player={editingPlayer}
          teamId={selected.team.id}
          onClose={() => setEditingPlayer(null)}
          onSaved={updated => {
            setPlayers(prev => prev.map(p => p.id === updated.id ? updated : p));
            setEditingPlayer(null);
          }}
        />
      )}

      {unlinkTarget && (
        <Modal onClose={() => setUnlinkTarget(null)} maxWidth={380} zIndex={LAYER.modalOverModal} overlayOpacity={0.7} scrollOverlay={false} style={{ padding: '24px' }}>
            <h3 style={{ color: '#F1F5F9', margin: '0 0 8px' }}>Retirer de l'effectif ?</h3>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', margin: '0 0 6px' }}>
              <strong style={{ color: '#F1F5F9' }}>{playerNameFull(unlinkTarget)}</strong> sera retiré de l'effectif de cette saison.
            </p>
            <p style={{ color: '#64748B', fontSize: '0.78rem', margin: '0 0 16px' }}>
              Son profil et ses statistiques ne sont pas supprimés.
            </p>
            {removeError && <div style={{ color: '#EF4444', fontSize: '0.78rem', marginBottom: 12 }}>{removeError}</div>}
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setUnlinkTarget(null)}
                style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                Annuler
              </button>
              <button onClick={handleRemove} disabled={removing}
                style={{ flex: 1, padding: '10px', backgroundColor: removing ? '#1E2229' : '#EF4444', border: 'none', borderRadius: 6, color: removing ? '#475569' : '#fff', cursor: removing ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                {removing ? 'Retrait…' : 'Retirer'}
              </button>
            </div>
        </Modal>
      )}
    </ConfigCard>
  );
}

// ── Onglet Staff ─────────────────────────────────────────────────────────────
const ROLES = [
  { value: 'coach',         label: 'Coach',                color: '#3B82F6' },
  { value: 'kine',          label: 'Kinésithérapeute',     color: '#10B981' },
  { value: 'medecin',       label: 'Médecin',              color: '#EF4444' },
  { value: 'prep_physique', label: 'Préparateur physique', color: '#8B5CF6' },
  { value: 'assistant',     label: 'Assistant',            color: '#F59E0B' },
  { value: 'autre',         label: 'Autre',                color: '#64748B' },
];

const roleLabel = (role: string) => ROLES.find(r => r.value === role)?.label ?? role;
const roleColor = (role: string) => ROLES.find(r => r.value === role)?.color ?? '#64748B';

const emptyStaffForm = { firstName: '', lastName: '', role: 'coach' };

function StaffTab() {
  const { selected, orgId } = useTeamSeason();
  const [staff,     setStaff]     = useState<StaffMember[]>([]);
  /** Le staff du club qui n'est PAS encore sur cette équipe — une personne intervient sur
   *  plusieurs équipes, on la rattache au lieu de la recréer. */
  const [available, setAvailable] = useState<StaffMember[]>([]);
  const [showPick,  setShowPick]  = useState(false);
  const [busyId,    setBusyId]    = useState<string | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [showForm,  setShowForm]  = useState(false);
  const [form,      setForm]      = useState(emptyStaffForm);
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState('');
  const [inviting,     setInviting]     = useState<StaffMember | null>(null);
  const [inviteForm,   setInviteForm]   = useState({ email: '', password: '' });
  const [inviteError,  setInviteError]  = useState('');
  const [inviteSaving, setInviteSaving] = useState(false);

  useEffect(() => {
    if (!selected) return;
    setLoading(true);
    setStaff([]);
    setAvailable([]);
    setError('');
    const teamId = selected.team.id;
    Promise.all([staffApi.listByTeam(teamId), staffApi.listByOrganization()])
      .then(([teamStaff, orgStaff]) => {
        setStaff(teamStaff);
        setAvailable(orgStaff.filter(m => !(m.teamIds ?? []).includes(teamId)));
      })
      .catch(err => setError(err?.message ?? String(err)))
      .finally(() => setLoading(false));
  }, [selected?.team.id]);

  async function handleAssign(member: StaffMember) {
    if (!selected) return;
    setBusyId(member.id);
    setError('');
    try {
      await staffApi.assign(member.id, selected.team.id);
      setStaff(prev => [...prev, member].sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setAvailable(prev => prev.filter(m => m.id !== member.id));
      setShowPick(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors du rattachement.');
    } finally {
      setBusyId(null);
    }
  }

  // Retirer, ce n'est pas supprimer : la personne reste au club, avec ses tâches et ses
  // dossiers. Elle quitte seulement cette équipe.
  async function handleUnassign(member: StaffMember) {
    if (!selected) return;
    setBusyId(member.id);
    setError('');
    try {
      await staffApi.unassign(member.id, selected.team.id);
      setStaff(prev => prev.filter(m => m.id !== member.id));
      setAvailable(prev => [...prev, member].sort((a, b) => a.lastName.localeCompare(b.lastName)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur lors du retrait.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected) return;
    if (!form.firstName || !form.lastName || !form.role) {
      setFormError('Tous les champs sont obligatoires.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (!orgId) throw new Error('Aucune organisation associée à votre compte.');
      const created = await staffApi.create({
        organizationId: orgId,
        teamId:         selected.team.id,
        firstName:      form.firstName,
        lastName:       form.lastName,
        role:           form.role,
      });
      setStaff(prev => [...prev, created].sort((a, b) => a.lastName.localeCompare(b.lastName)));
      setShowForm(false);
      setForm(emptyStaffForm);
    } catch (err: unknown) {
      setFormError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setSaving(false);
    }
  }

  function closeForm() {
    setShowForm(false);
    setFormError('');
    setForm(emptyStaffForm);
  }

  function closeInvite() {
    setInviting(null);
    setInviteForm({ email: '', password: '' });
    setInviteError('');
  }

  async function handleInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!inviting) return;
    if (!inviteForm.email || !inviteForm.password) {
      setInviteError('Email et mot de passe obligatoires.');
      return;
    }
    setInviteSaving(true);
    setInviteError('');
    try {
      const profileId = await staffApi.inviteAndLink({
        staffId:   inviting.id,
        email:     inviteForm.email,
        password:  inviteForm.password,
        firstName: inviting.firstName,
        lastName:  inviting.lastName,
        role:      inviting.role,
      });
      setStaff(prev => prev.map(s => s.id === inviting.id ? { ...s, profileId } : s));
      closeInvite();
    } catch (err: unknown) {
      setInviteError(err instanceof Error ? err.message : 'Erreur lors de la création.');
    } finally {
      setInviteSaving(false);
    }
  }

  if (!selected) {
    return <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sélectionnez une équipe dans la barre du haut.</p>;
  }

  return (
    <ConfigCard
      icon={<UserCheck size={14} color="#00E5A0" />}
      title="Staff"
      action={
        <>
          {available.length > 0 && (
            <ConfigAction icon={<UserPlus size={14} />} onClick={() => setShowPick(true)} tone="neutral" hideLabelOnMobile>
              Rattacher du club
            </ConfigAction>
          )}
          <ConfigAction icon={<Plus size={14} />} onClick={() => setShowForm(true)} hideLabelOnMobile>
            Nouveau membre
          </ConfigAction>
        </>
      }>
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '10px 14px', marginBottom: 16 }}>
          <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
          <span style={{ color: '#EF4444', fontSize: '0.82rem' }}>{error}</span>
        </div>
      )}

      {loading && <p style={{ color: '#475569', fontSize: '0.82rem' }}>Chargement…</p>}

      {!loading && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th style={thStyle}>Nom</th>
                <th style={thStyle}>Rôle</th>
                <th style={thStyle}>Compte</th>
                <th style={thStyle}></th>
              </tr>
            </thead>
            <tbody>
              {staff.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ color: '#475569', textAlign: 'center', padding: '40px 0', fontSize: '0.88rem' }}>
                    Aucun membre du staff sur cette équipe. Rattachez quelqu'un du club, ou créez une nouvelle personne.
                  </td>
                </tr>
              ) : staff.map((member, idx) => {
                const color = roleColor(member.role);
                return (
                  <tr key={member.id} style={{ borderBottom: idx < staff.length - 1 ? '1px solid #1E2229' : 'none' }}>
                    <td style={tdStyle}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{
                          width: 36, height: 36, borderRadius: '50%',
                          backgroundColor: color + '22', border: `2px solid ${color}`,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: color, fontSize: '0.78rem', fontWeight: 700, flexShrink: 0,
                        }}>
                          {member.firstName[0]}{member.lastName[0]}
                        </div>
                        <span style={{ fontWeight: 600 }}>{member.firstName} {member.lastName}</span>
                      </div>
                    </td>
                    <td style={tdStyle}>{roleLabel(member.role)}</td>
                    <td style={tdStyle}>
                      {member.profileId ? (
                        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#00E5A0', fontSize: '0.75rem', fontWeight: 600 }}>
                          <UserCheck size={14} /> Lié
                        </span>
                      ) : (
                        <button
                          onClick={() => setInviting(member)}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#94A3B8', fontSize: '0.75rem', background: 'none', border: '1px solid #2A2F3A', borderRadius: 5, padding: '4px 8px', cursor: 'pointer' }}
                        >
                          <UserPlus size={13} /> Créer
                        </button>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button
                        onClick={() => handleUnassign(member)}
                        disabled={busyId === member.id}
                        title="Retirer de cette équipe — la personne reste au club"
                        style={{ color: '#475569', fontSize: '0.75rem', background: 'none', border: '1px solid #2A2F3A', borderRadius: 5, padding: '4px 8px', cursor: busyId === member.id ? 'not-allowed' : 'pointer', whiteSpace: 'nowrap' }}>
                        {busyId === member.id ? '…' : 'Retirer'}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Rattachement d'une personne déjà connue du club */}
      {showPick && (
        <Modal onClose={() => setShowPick(false)} maxWidth={440} overlayOpacity={0.7} style={{ padding: '28px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
            <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Rattacher à l'équipe</h2>
            <button onClick={() => setShowPick(false)} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
          </div>
          <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: '0 0 18px' }}>
            Ces personnes appartiennent déjà au club. Les rattacher ici ne les retire d'aucune autre équipe.
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 320, overflowY: 'auto' }}>
            {available.map(member => {
              const color = roleColor(member.role);
              return (
                <button key={member.id} onClick={() => handleAssign(member)} disabled={busyId === member.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, cursor: busyId === member.id ? 'not-allowed' : 'pointer', textAlign: 'left' }}>
                  <div style={{
                    width: 30, height: 30, borderRadius: '50%', backgroundColor: color + '22', border: `2px solid ${color}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', color, fontSize: '0.7rem', fontWeight: 700, flexShrink: 0,
                  }}>
                    {member.firstName[0]}{member.lastName[0]}
                  </div>
                  <span style={{ color: '#F1F5F9', fontSize: '0.85rem', fontWeight: 600, flex: 1 }}>{member.firstName} {member.lastName}</span>
                  <span style={{ color: '#64748B', fontSize: '0.75rem' }}>{roleLabel(member.role)}</span>
                  <span style={{ color: '#475569', fontSize: '0.72rem', whiteSpace: 'nowrap' }}>
                    {(member.teamIds ?? []).length} équipe{(member.teamIds ?? []).length > 1 ? 's' : ''}
                  </span>
                </button>
              );
            })}
          </div>
        </Modal>
      )}

      {/* Modal création de compte */}
      {inviting && (
        <Modal onClose={closeInvite} maxWidth={420} overlayOpacity={0.7} style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Créer un compte</h2>
              <button onClick={closeInvite} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}><X size={18} /></button>
            </div>
            <p style={{ color: '#94A3B8', fontSize: '0.8rem', margin: '0 0 18px' }}>
              Pour <strong style={{ color: '#F1F5F9' }}>{inviting.firstName} {inviting.lastName}</strong> — un email de confirmation sera envoyé.
            </p>

            {inviteError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{inviteError}</span>
              </div>
            )}

            <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleInvite}>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Email *</label>
                <input
                  type="email" required autoFocus
                  value={inviteForm.email}
                  onChange={e => setInviteForm(f => ({ ...f, email: e.target.value }))}
                  style={inputStyle}
                  placeholder="marie.dupont@club.fr"
                />
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Mot de passe temporaire *</label>
                <input
                  type="password" required
                  value={inviteForm.password}
                  onChange={e => setInviteForm(f => ({ ...f, password: e.target.value }))}
                  style={inputStyle}
                  placeholder="8 caractères minimum"
                  minLength={8}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={closeInvite} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={inviteSaving} style={{ flex: 1, padding: '10px', backgroundColor: inviteSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: inviteSaving ? '#475569' : '#0D0F14', cursor: inviteSaving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {inviteSaving ? 'Création…' : 'Créer le compte'}
                </button>
              </div>
            </form>
        </Modal>
      )}

      {/* Modal ajout membre */}
      {showForm && (
        <Modal onClose={closeForm} maxWidth={440} overlayOpacity={0.7} style={{ padding: '28px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <h2 style={{ color: '#F1F5F9', margin: 0, fontSize: '1.1rem' }}>Nouveau membre du staff</h2>
              <button onClick={closeForm} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            {formError && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
                <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
                <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{formError}</span>
              </div>
            )}

            <form style={{ display: 'flex', flexDirection: 'column', gap: 12 }} onSubmit={handleSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2" style={{ gap: 10 }}>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Prénom *</label>
                  <input
                    type="text" required autoFocus
                    value={form.firstName}
                    onChange={e => setForm(f => ({ ...f, firstName: e.target.value }))}
                    style={inputStyle}
                    placeholder="Marie"
                  />
                </div>
                <div>
                  <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nom *</label>
                  <input
                    type="text" required
                    value={form.lastName}
                    onChange={e => setForm(f => ({ ...f, lastName: e.target.value }))}
                    style={inputStyle}
                    placeholder="Dupont"
                  />
                </div>
              </div>
              <div>
                <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Rôle *</label>
                <select
                  required
                  value={form.role}
                  onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                  style={inputStyle}
                >
                  {ROLES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={closeForm} style={{ flex: 1, padding: '10px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}>
                  Annuler
                </button>
                <button type="submit" disabled={saving} style={{ flex: 1, padding: '10px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700 }}>
                  {saving ? 'Création…' : 'Ajouter'}
                </button>
              </div>
            </form>
        </Modal>
      )}
    </ConfigCard>
  );
}

export function TeamConfigSection({ section }: { section: TeamSection }) {
  const { selected, reload, thresholds, statThresholds, defaultWellnessMethod, publicWellnessMethod, isSuperadmin, canConfigureTeam } = useTeamSeason();

  const [teamForm, setTeamForm] = useState({ name: '', category: '', color: '#3B82F6', description: '' });
  const [teamSaving, setTeamSaving] = useState(false);
  const [teamMsg, setTeamMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [lightMax,  setLightMax]  = useState(DEFAULT_THRESHOLDS.lightMax);
  const [normalMax, setNormalMax] = useState(DEFAULT_THRESHOLDS.normalMax);
  const [sessionsPerWeek, setSessionsPerWeek] = useState(DEFAULT_THRESHOLDS.sessionsPerWeek);
  const [thrSaving, setThrSaving] = useState(false);
  const [thrMsg,    setThrMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  const [stat, setStat] = useState<StatThresholds>(DEFAULT_STAT);
  const [statSaving, setStatSaving] = useState(false);
  const [statMsg, setStatMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [wellnessDefaultMethod, setWellnessDefaultMethod] = useState<WellnessEntryMethod>('detailed');
  const [wellnessPublicMethod,  setWellnessPublicMethod]  = useState<WellnessEntryMethod>('emoji');
  const [wellnessSaving, setWellnessSaving] = useState(false);
  const [wellnessMsg,    setWellnessMsg]    = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!selected) return;
    const t = selected.team;
    setTeamForm({ name: t.name, category: t.category, color: t.color, description: '' });
    setTeamMsg(null);
    teamsApi.getById(t.id).then(full => {
      if (full) setTeamForm(f => ({ ...f, description: (full as unknown as { description?: string }).description ?? '' }));
    });
  }, [selected?.team.id]);

  useEffect(() => {
    setLightMax(thresholds.lightMax);
    setNormalMax(thresholds.normalMax);
    setSessionsPerWeek(thresholds.sessionsPerWeek);
  }, [thresholds.lightMax, thresholds.normalMax, thresholds.sessionsPerWeek]);

  useEffect(() => {
    setStat({ ...statThresholds });
  }, [selected?.team.id]);

  useEffect(() => {
    setWellnessDefaultMethod(defaultWellnessMethod);
    setWellnessPublicMethod(publicWellnessMethod);
  }, [selected?.team.id, defaultWellnessMethod, publicWellnessMethod]);

  async function saveTeam() {
    if (!selected) return;
    setTeamSaving(true); setTeamMsg(null);
    try {
      await teamsApi.update(selected.team.id, teamForm);
      setTeamMsg({ ok: true, text: 'Équipe mise à jour.' });
      reload();
    } catch (e) {
      setTeamMsg({ ok: false, text: String(e) });
    } finally { setTeamSaving(false); }
  }

  async function saveStatThresholds() {
    if (!selected) return;
    if (stat.evalTOrange >= stat.evalTBlue || stat.evalTBlue >= stat.evalTGreen) {
      setStatMsg({ ok: false, text: 'Les seuils éval doivent être croissants : rouge < orange < bleu < vert.' }); return;
    }
    if (stat.ortgTAmber >= stat.ortgTGreen) {
      setStatMsg({ ok: false, text: 'Le seuil ORtg amber doit être inférieur au seuil vert.' }); return;
    }
    if (stat.drtgTAmber >= stat.drtgTRed) {
      setStatMsg({ ok: false, text: 'Le seuil DRtg amber doit être inférieur au seuil rouge.' }); return;
    }
    setStatSaving(true); setStatMsg(null);
    try {
      await teamsApi.updateStatThresholds(selected.team.id, stat);
      setStatMsg({ ok: true, text: 'Seuils enregistrés.' });
      reload();
    } catch (e) {
      setStatMsg({ ok: false, text: String(e) });
    } finally { setStatSaving(false); }
  }

  async function saveThresholds() {
    if (!selected) return;
    if (!Number.isInteger(lightMax) || !Number.isInteger(normalMax)) {
      setThrMsg({ ok: false, text: 'Les seuils doivent être des nombres entiers.' }); return;
    }
    if (lightMax >= normalMax) {
      setThrMsg({ ok: false, text: 'Le seuil "légère" doit être strictement inférieur au seuil "normale".' }); return;
    }
    if (!Number.isInteger(sessionsPerWeek) || sessionsPerWeek < 1) {
      setThrMsg({ ok: false, text: 'Le nombre de séances par semaine doit être un entier d\'au moins 1.' }); return;
    }
    setThrSaving(true); setThrMsg(null);
    try {
      await teamsApi.updateThresholds(selected.team.id, lightMax, normalMax, sessionsPerWeek);
      setThrMsg({ ok: true, text: 'Seuils enregistrés.' });
      reload();
    } catch (e) {
      setThrMsg({ ok: false, text: String(e) });
    } finally { setThrSaving(false); }
  }

  async function saveWellnessMethods() {
    if (!selected) return;
    setWellnessSaving(true); setWellnessMsg(null);
    try {
      await teamsApi.updateWellnessMethods(selected.team.id, { defaultMethod: wellnessDefaultMethod, publicMethod: wellnessPublicMethod });
      setWellnessMsg({ ok: true, text: 'Méthodes de saisie enregistrées.' });
      reload();
    } catch (e) {
      setWellnessMsg({ ok: false, text: String(e) });
    } finally { setWellnessSaving(false); }
  }

  // Chargement des rôles et accès refusé sont gérés en amont par ConfigurationPage,
  // qui n'affiche la section Équipe que si l'utilisateur y a droit.
  if (!selected) {
    return (
      <div>
        <p style={{ color: '#475569', fontSize: '0.85rem' }}>Sélectionnez une équipe dans la barre du haut.</p>
      </div>
    );
  }

  // teamSections() filtre déjà en amont : un editor (sans droit de config équipe) ne
  // reçoit ici que les sections ouvertes à editor+ (ex: Tactique).
  const tab: Tab = section;

  return (
    <>
      {/* Infos équipe */}
      {tab === 'info' && (
      <ConfigCard
        icon={<Shield size={14} color="#00E5A0" />}
        title="Informations de l'équipe"
        action={<ConfigSaveAction loading={teamSaving} onClick={saveTeam} />}>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
          <Field label="Nom de l'équipe">
            <input style={inputStyle} value={teamForm.name}
              onChange={e => setTeamForm(f => ({ ...f, name: e.target.value }))}
              placeholder="NF2 Féminine" />
          </Field>
          <Field label="Catégorie / Division">
            <input style={inputStyle} value={teamForm.category}
              onChange={e => setTeamForm(f => ({ ...f, category: e.target.value }))}
              placeholder="NF2" />
          </Field>
          <Field label="Couleur de l'équipe">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input type="color" value={teamForm.color}
                onChange={e => setTeamForm(f => ({ ...f, color: e.target.value }))}
                style={{ width: 40, height: 36, border: '1px solid #2A2F3A', borderRadius: 6, padding: 2, backgroundColor: '#1E2229', cursor: 'pointer' }} />
              <input style={{ ...inputStyle, flex: 1 }} value={teamForm.color}
                onChange={e => setTeamForm(f => ({ ...f, color: e.target.value }))}
                placeholder="#3B82F6" />
            </div>
          </Field>
          <Field label="Description">
            <input style={inputStyle} value={teamForm.description}
              onChange={e => setTeamForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Description optionnelle" />
          </Field>
        </div>
        <ConfigMessage msg={teamMsg} />
      </ConfigCard>
      )}

      {/* Effectif */}
      {tab === 'roster' && <RosterTab />}

      {/* Staff */}
      {tab === 'staff' && <StaffTab />}

      {/* Seuils */}
      {tab === 'thresholds' && (
      <ConfigStack>
      <ConfigCard
        icon={<Sliders size={14} color="#F59E0B" />}
        title="Seuils de charge physique"
        description="Les seuils définissent les zones de charge hebdomadaire (RPE × minutes). Ils s'appliquent à toutes les vues de charge de cette équipe."
        action={<ConfigSaveAction loading={thrSaving} onClick={saveThresholds} />}>
        <ThresholdPreview lightMax={lightMax} normalMax={normalMax} />

        <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16, marginTop: 20 }}>
          <div>
            <label style={{ ...labelStyle, color: '#00E5A0' }}>Légère — max (UA)</label>
            <input type="number" min={0} max={99999} step={50} value={lightMax}
              onChange={e => setLightMax(Math.max(0, Math.trunc(Number(e.target.value))))}
              style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : zone verte</p>
          </div>
          <div>
            <label style={{ ...labelStyle, color: '#3B82F6' }}>Normale — max (UA)</label>
            <input type="number" min={0} max={99999} step={50} value={normalMax}
              onChange={e => setNormalMax(Math.max(0, Math.trunc(Number(e.target.value))))}
              style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : zone bleue</p>
          </div>
          <div>
            <label style={{ ...labelStyle, color: '#EF4444' }}>Surcharge</label>
            <div style={{ ...inputStyle, display: 'flex', alignItems: 'center', justifyContent: 'flex-end', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700, color: '#EF4444' }}>
              {'>'} {normalMax} UA
            </div>
            <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>Au-dessus : zone rouge</p>
          </div>
        </div>

        <div style={{ borderTop: '1px solid #2A2F3A', marginTop: 20, paddingTop: 18 }}>
          <div className="grid grid-cols-1 md:grid-cols-3" style={{ gap: 16 }}>
            <div>
              <label style={labelStyle}>Séances par semaine</label>
              <input type="number" min={1} max={14} step={1} value={sessionsPerWeek}
                onChange={e => setSessionsPerWeek(Math.max(1, Math.trunc(Number(e.target.value))))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>
                Utilisé pour dériver le seuil de charge « par séance » à partir du seuil hebdomadaire (≈ {Math.round(normalMax / Math.max(1, sessionsPerWeek))} UA/séance en zone normale).
              </p>
            </div>
          </div>
        </div>

        <ConfigMessage msg={thrMsg} />
      </ConfigCard>

      <ConfigCard
        icon={<TrendingUp size={14} color="#3B82F6" />}
        title="Seuils statistiques"
        description="Ces seuils définissent les couleurs des colonnes Éval, ORtg et DRtg dans l'analyse collective."
        action={<ConfigSaveAction loading={statSaving} onClick={saveStatThresholds} />}>
        <StatColorPreview t={stat} />

        {/* Éval */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Éval</div>
          <div className="grid grid-cols-1 sm:grid-cols-3" style={{ gap: 12 }}>
            <div>
              <label style={{ ...labelStyle, color: '#F59E0B' }}>Min orange</label>
              <input type="number" step={0.5} value={stat.evalTOrange}
                onChange={e => setStat(s => ({ ...s, evalTOrange: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : rouge</p>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#3B82F6' }}>Min bleu</label>
              <input type="number" step={0.5} value={stat.evalTBlue}
                onChange={e => setStat(s => ({ ...s, evalTBlue: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : orange</p>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#00E5A0' }}>Min vert</label>
              <input type="number" step={0.5} value={stat.evalTGreen}
                onChange={e => setStat(s => ({ ...s, evalTGreen: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : bleu</p>
            </div>
          </div>
        </div>

        {/* ORtg */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>ORtg</div>
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            <div>
              <label style={{ ...labelStyle, color: '#F59E0B' }}>Min amber</label>
              <input type="number" step={1} value={stat.ortgTAmber}
                onChange={e => setStat(s => ({ ...s, ortgTAmber: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : rouge</p>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#00E5A0' }}>Min vert</label>
              <input type="number" step={1} value={stat.ortgTGreen}
                onChange={e => setStat(s => ({ ...s, ortgTGreen: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : amber</p>
            </div>
          </div>
        </div>

        {/* DRtg */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ color: '#94A3B8', fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>DRtg</div>
          <div className="grid grid-cols-2" style={{ gap: 12 }}>
            <div>
              <label style={{ ...labelStyle, color: '#00E5A0' }}>Max vert</label>
              <input type="number" step={1} value={stat.drtgTAmber}
                onChange={e => setStat(s => ({ ...s, drtgTAmber: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : vert</p>
            </div>
            <div>
              <label style={{ ...labelStyle, color: '#EF4444' }}>Min rouge</label>
              <input type="number" step={1} value={stat.drtgTRed}
                onChange={e => setStat(s => ({ ...s, drtgTRed: Number(e.target.value) }))}
                style={{ ...inputStyle, textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontWeight: 700 }} />
              <p style={{ color: '#475569', fontSize: '0.68rem', marginTop: 3 }}>En-dessous : amber</p>
            </div>
          </div>
        </div>

        <ConfigMessage msg={statMsg} />
      </ConfigCard>
      </ConfigStack>
      )}

      {/* Bien-être */}
      {tab === 'wellness' && (
      <ConfigCard
        icon={<Heart size={14} color="#F472B6" />}
        title="Bien-être — méthode de saisie"
        description="Méthode utilisée à l'ouverture du formulaire — Détaillé (6 axes précis), Rapide (6 axes via icône/couleur) ou Note unique (1 seule valeur globale). Ce choix n'est modifiable qu'ici, pas depuis le formulaire lui-même."
        action={<ConfigSaveAction loading={wellnessSaving} onClick={saveWellnessMethods} />}>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 16 }}>
          <div>
            <label style={labelStyle}>Saisie interne (staff)</label>
            <select value={wellnessDefaultMethod} onChange={e => setWellnessDefaultMethod(e.target.value as WellnessEntryMethod)} style={inputStyle}>
              <option value="detailed">Détaillé</option>
              <option value="emoji">Rapide (icône/couleur)</option>
              <option value="single">Note unique</option>
            </select>
            <WellnessMethodPreview method={wellnessDefaultMethod} />
          </div>
          <div>
            <label style={labelStyle}>Lien public joueur</label>
            <select value={wellnessPublicMethod} onChange={e => setWellnessPublicMethod(e.target.value as WellnessEntryMethod)} style={inputStyle}>
              <option value="detailed">Détaillé</option>
              <option value="emoji">Rapide (icône/couleur)</option>
              <option value="single">Note unique</option>
            </select>
            <WellnessMethodPreview method={wellnessPublicMethod} />
          </div>
        </div>

        <ConfigMessage msg={wellnessMsg} />
      </ConfigCard>
      )}

      {/* Notifications */}
      {tab === 'notifs' && <TeamNotificationsTab />}

      {/* Catégories — un même écran pour les trois portées : c'est le même objet, et le club
          gagne à régler son vocabulaire au même endroit. */}
      {tab === 'categories' && selected && (
        <ConfigStack>
          <CategoryManager
            teamId={selected.team.id} scope="exercise"
            title="Catégories d'exercices"
            description={'Elles classent les exercices de la bibliothèque, et alimentent aussi la catégorie des séquences d\'une séance. Supprimer une catégorie ne supprime pas les exercices qui l\'utilisent : ils deviennent simplement "sans catégorie".'} />

          <CategoryManager
            teamId={selected.team.id} scope="meeting"
            title="Catégories de réunion"
            description={'Elles classent les réunions de l\'équipe. Supprimer une catégorie laisse les réunions concernées sans catégorie.'} />

          <CategoryManager
            teamId={selected.team.id} scope="session"
            title="Catégories de séance"
            description="Elles qualifient les séances — c'est ce qui s'affiche en étiquette dans le planning et sur la fiche. Une catégorie encore utilisée ne peut pas être supprimée : renommez-la, ou déplacez d'abord les séances concernées."
            guardDelete />

          <CategoryManager
            teamId={selected.team.id} scope="system"
            title="Catégories de systèmes"
            description={'Elles classent les systèmes tactiques de la bibliothèque. Supprimer une catégorie ne supprime pas les systèmes qui l\'utilisent : ils deviennent simplement "sans catégorie".'} />
        </ConfigStack>
      )}

      {/* Données tactiques */}
      {tab === 'tactical' && selected && (
        <TacticalConfigManager teamId={selected.team.id} />
      )}

      {/* Rôles de l'équipe */}
      {tab === 'roles' && selected && canConfigureTeam && (
        <TeamRolesTab teamId={selected.team.id} isSuperadmin={isSuperadmin} />
      )}
    </>
  );
}

// ── Onglet Rôles : lecture seule pour l'admin d'équipe, édition réservée au superadmin ──
function TeamRolesTab({ teamId, isSuperadmin }: { teamId: string; isSuperadmin: boolean }) {
  const [assignments, setAssignments] = useState<TeamRoleAssignment[]>([]);
  const [profiles,    setProfiles]    = useState<AssignableProfile[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [saving,      setSaving]      = useState(false);
  const [form, setForm] = useState({ profileId: '', role: 'editor' as TeamRole });

  function load() {
    setLoading(true);
    Promise.all([
      teamRolesApi.listByTeam(teamId),
      isSuperadmin ? teamsApi.getById(teamId).then(t => t?.organizationId ? teamRolesApi.listAssignableProfiles(t.organizationId) : []) : Promise.resolve([]),
    ])
      .then(([a, p]) => { setAssignments(a); setProfiles(p); })
      .catch(e => setError(e instanceof Error ? e.message : 'Erreur'))
      .finally(() => setLoading(false));
  }

  useEffect(load, [teamId, isSuperadmin]);

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!form.profileId) return;
    setSaving(true);
    setError('');
    try {
      await teamRolesApi.upsert(teamId, form.profileId, form.role);
      setForm(f => ({ ...f, profileId: '' }));
      load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  async function handleRoleChange(profileId: string, role: TeamRole) {
    try {
      await teamRolesApi.upsert(teamId, profileId, role);
      setAssignments(prev => prev.map(a => a.profileId === profileId ? { ...a, role } : a));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  async function handleRemove(profileId: string) {
    try {
      await teamRolesApi.remove(teamId, profileId);
      setAssignments(prev => prev.filter(a => a.profileId !== profileId));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Erreur.');
    }
  }

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '48px 0' }}>
      <div style={{ width: 24, height: 24, border: '3px solid #1E2229', borderTopColor: '#00E5A0', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }}>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    </div>
  );

  return (
    <ConfigCard
      icon={<Lock size={14} color="#00E5A0" />}
      title="Rôles de l'équipe"
      description={isSuperadmin ? undefined : 'Lecture seule — seul le superadmin de l\'organisation peut modifier les rôles d\'une équipe.'}>
      {error && <p style={{ color: '#EF4444', fontSize: '0.8rem', margin: '0 0 14px' }}>{error}</p>}

      {isSuperadmin && (
        <form onSubmit={handleAssign} className="flex flex-col sm:flex-row" style={{ gap: 8, marginBottom: 16 }}>
          <select required value={form.profileId} onChange={e => setForm(f => ({ ...f, profileId: e.target.value }))} style={{ ...inputStyle, flex: 1 }}>
            <option value="">Utilisateur…</option>
            {profiles.filter(p => !assignments.some(a => a.profileId === p.id)).map(p => (
              <option key={p.id} value={p.id}>{p.firstName} {p.lastName}</option>
            ))}
          </select>
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value as TeamRole }))} style={{ ...inputStyle, flex: 1 }}>
            <option value="admin">Admin</option>
            <option value="editor">Éditeur</option>
            <option value="viewer">Lecture seule</option>
          </select>
          <button type="submit" disabled={saving}
            style={{ padding: '8px 16px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.82rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, opacity: saving ? 0.6 : 1 }}>
            <Plus size={14} />Assigner
          </button>
        </form>
      )}

      {assignments.length === 0 ? (
        <EmptyState message="Aucun rôle assigné sur cette équipe." size="lg" />
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #2A2F3A' }}>
                <th style={thStyle}>Utilisateur</th>
                <th style={thStyle}>Rôle</th>
                {isSuperadmin && <th style={thStyle} />}
              </tr>
            </thead>
            <tbody>
              {assignments.map(a => (
                <tr key={a.profileId} style={{ borderBottom: '1px solid #1E2229' }}>
                  <td style={tdStyle}>{a.firstName} {a.lastName}</td>
                  <td style={tdStyle}>
                    {isSuperadmin ? (
                      <select value={a.role} onChange={e => handleRoleChange(a.profileId, e.target.value as TeamRole)} style={{ ...inputStyle, padding: '4px 8px', width: 'auto' }}>
                        <option value="admin">Admin</option>
                        <option value="editor">Éditeur</option>
                        <option value="viewer">Lecture seule</option>
                      </select>
                    ) : (
                      a.role === 'admin' ? 'Admin' : a.role === 'editor' ? 'Éditeur' : 'Lecture seule'
                    )}
                  </td>
                  {isSuperadmin && (
                    <td style={{ ...tdStyle, textAlign: 'right' }}>
                      <button onClick={() => handleRemove(a.profileId)} title="Retirer"
                        style={{ background: 'none', border: 'none', color: '#EF4444', cursor: 'pointer', padding: 4 }}>
                        <Trash2 size={14} />
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ConfigCard>
  );
}

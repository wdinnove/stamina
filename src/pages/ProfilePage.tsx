import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router';
import { AlertCircle, CheckCircle, User, Lock, Save, LogOut } from 'lucide-react';
import { profileApi } from '../api/profile';
import { authApi } from '../api';
import { Card, CardTitle } from '../components';
import { ResponsiveTabNav, type TabNavGroup } from '../components/ResponsiveTabNav';
import { useTeamSeason } from '../contexts/TeamSeasonContext';
import { NotificationPreferencesSection } from './NotificationPreferencesPage';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
};

const readonlyStyle: React.CSSProperties = { ...inputStyle, color: '#475569', cursor: 'default' };

const SECTIONS = [
  { key: 'informations',  label: 'Mes informations' },
  { key: 'mot-de-passe',  label: 'Mot de passe' },
  { key: 'notifications', label: 'Notifications' },
] as const;

type Section = typeof SECTIONS[number]['key'];

const isSection = (v: string | undefined): v is Section =>
  SECTIONS.some(s => s.key === v);

/* ── Bandeaux de retour, partagés par les deux formulaires ───────────────── */

function Feedback({ ok, err }: { ok?: string; err?: string }) {
  if (!ok && !err) return null;
  const success = Boolean(ok);
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      backgroundColor: success ? 'rgba(0,229,160,0.08)' : 'rgba(239,68,68,0.1)',
      border: `1px solid ${success ? 'rgba(0,229,160,0.25)' : 'rgba(239,68,68,0.3)'}`,
      borderRadius: 6, padding: '8px 12px', marginBottom: 14,
    }}>
      {success
        ? <CheckCircle size={13} style={{ color: '#00E5A0', flexShrink: 0 }} />
        : <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />}
      <span style={{ color: success ? '#00E5A0' : '#EF4444', fontSize: '0.8rem' }}>{ok ?? err}</span>
    </div>
  );
}

function SubmitButton({ saving }: { saving: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
      <button
        type="submit" disabled={saving}
        style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', backgroundColor: saving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: saving ? '#475569' : '#0D0F14', cursor: saving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
      >
        <Save size={14} />
        {saving ? 'Enregistrement…' : 'Enregistrer'}
      </button>
    </div>
  );
}

/* ── Section « Mes informations » ────────────────────────────────────────── */

interface Identity { email: string; orgName: string; firstName: string; lastName: string }

function ProfileInfoSection({ identity, onNamesSaved }: {
  identity: Identity;
  onNamesSaved: (firstName: string, lastName: string) => void;
}) {
  const [firstName, setFirstName] = useState(identity.firstName);
  const [lastName,  setLastName]  = useState(identity.lastName);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  // L'identité arrive après un fetch : on réaligne les champs à son arrivée.
  useEffect(() => { setFirstName(identity.firstName); setLastName(identity.lastName); },
    [identity.firstName, identity.lastName]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(''); setErr('');
    try {
      await profileApi.updateNames(firstName, lastName);
      onNamesSaved(firstName, lastName);
      setMsg('Informations mises à jour.');
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ padding: '20px 24px', borderRadius: 10 }}>
      <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
        <CardTitle icon={<User size={14} color="#00E5A0" />}>Mes informations</CardTitle>
      </div>
      <Feedback ok={msg} err={err} />
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 12 }}>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Prénom</label>
            <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nom</label>
            <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Email</label>
          <input type="email" value={identity.email} readOnly style={readonlyStyle} />
        </div>
        {identity.orgName && (
          <div>
            <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Organisation</label>
            <input type="text" value={identity.orgName} readOnly style={readonlyStyle} />
          </div>
        )}
        <SubmitButton saving={saving} />
      </form>
    </Card>
  );
}

/* ── Section « Mot de passe » ────────────────────────────────────────────── */

function ProfilePasswordSection({ email }: { email: string }) {
  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) { setErr('Les mots de passe ne correspondent pas.'); return; }
    if (newPwd.length < 8)     { setErr('Le mot de passe doit faire au moins 8 caractères.'); return; }
    setSaving(true); setMsg(''); setErr('');
    try {
      await profileApi.changePassword(email, currentPwd, newPwd);
      setMsg('Mot de passe mis à jour.');
      setCurrentPwd(''); setNewPwd(''); setConfirmPwd('');
    } catch (e2: unknown) {
      setErr(e2 instanceof Error ? e2.message : 'Erreur.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card style={{ padding: '20px 24px', borderRadius: 10 }}>
      <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
        <CardTitle icon={<Lock size={14} color="#00E5A0" />}>Changer le mot de passe</CardTitle>
      </div>
      <Feedback ok={msg} err={err} />
      <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Mot de passe actuel</label>
          <input type="password" required value={currentPwd} onChange={e => setCurrentPwd(e.target.value)} style={inputStyle} autoComplete="current-password" />
        </div>
        <div>
          <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nouveau mot de passe</label>
          <input type="password" required value={newPwd} onChange={e => setNewPwd(e.target.value)} style={inputStyle} autoComplete="new-password" minLength={8} />
        </div>
        <div>
          <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Confirmer</label>
          <input type="password" required value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} style={inputStyle} autoComplete="new-password" minLength={8} />
        </div>
        <SubmitButton saving={saving} />
      </form>
    </Card>
  );
}

/* ── Coquille ────────────────────────────────────────────────────────────── */

/**
 * Page « Mon profil » à sous-menu latéral, sur le même modèle que `ConfigurationPage` — c'est le
 * pattern de navigation de toutes les pages à sections de l'app.
 *
 * Chaque section a son URL (`/profil/<section>`), donc rechargeable et partageable.
 * `/profil/notifications` existait déjà comme page autonome : l'URL est conservée à l'identique,
 * elle sélectionne désormais l'onglet. Elle remplace la carte « Notifications » qui ne contenait
 * qu'un lien vers elle-même.
 */
export default function ProfilePage() {
  const navigate = useNavigate();
  const { section: slug } = useParams<{ section?: string }>();
  const { isSuperadmin, teamRole } = useTeamSeason();

  const roleLabel = isSuperadmin ? 'Superadmin'
    : teamRole === 'admin' ? 'Admin'
    : teamRole === 'editor' ? 'Éditeur'
    : teamRole === 'viewer' ? 'Lecture seule'
    : null;

  const [identity, setIdentity] = useState<Identity>({ email: '', orgName: '', firstName: '', lastName: '' });

  useEffect(() => {
    profileApi.getCurrent().then(profile => {
      if (profile) setIdentity({
        email: profile.email, orgName: profile.orgName,
        firstName: profile.firstName, lastName: profile.lastName,
      });
    });
  }, []);

  // `/profil` nu ou section inconnue → on réécrit l'URL sur la première section, pour que
  // l'adresse reflète toujours l'onglet affiché (même logique que ConfigurationPage).
  const current: Section = isSection(slug) ? slug : 'informations';
  useEffect(() => {
    if (!isSection(slug)) navigate(`/profil/${current}`, { replace: true });
  }, [slug, current, navigate]);

  async function handleSignOut() {
    await authApi.signOut();
    navigate('/connexion', { replace: true });
  }

  const initials = `${identity.firstName[0] ?? ''}${identity.lastName[0] ?? ''}`.toUpperCase();
  const groups: TabNavGroup[] = [{
    tabs: SECTIONS.map(s => ({ key: s.key, slug: `/profil/${s.key}`, label: s.label })),
  }];

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 24, flexWrap: 'wrap' }}>
        <h1 style={{ color: '#F1F5F9', margin: 0 }}>Mon profil</h1>
        <button
          onClick={handleSignOut}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', backgroundColor: '#EF4444', border: 'none', borderRadius: 6, color: '#FFFFFF', cursor: 'pointer', fontWeight: 700, fontSize: '0.85rem' }}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#DC2626')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#EF4444')}
        >
          <LogOut size={14} />
          Déconnexion
        </button>
      </div>

      {/* Identité — hors sections : c'est le contexte de la page, pas une de ses parties. */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          backgroundColor: '#1E2229', border: '2px solid #2A2F3A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#00E5A0', fontSize: '1.1rem', fontWeight: 700, flexShrink: 0,
        }}>
          {initials || '?'}
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ color: '#F1F5F9', fontWeight: 600, margin: '0 0 2px', fontSize: '1rem' }}>
              {identity.firstName} {identity.lastName}
            </p>
            {roleLabel && (
              <span style={{
                color: isSuperadmin ? '#00E5A0' : '#94A3B8',
                backgroundColor: isSuperadmin ? 'rgba(0,229,160,0.1)' : 'rgba(148,163,184,0.1)',
                border: `1px solid ${isSuperadmin ? 'rgba(0,229,160,0.3)' : 'rgba(148,163,184,0.25)'}`,
                fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '2px 8px', borderRadius: 4, marginBottom: 2,
              }}>
                {roleLabel}
              </span>
            )}
          </div>
          <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>{identity.email}</p>
          {identity.orgName && <p style={{ color: '#3B82F6', fontSize: '0.75rem', margin: '2px 0 0' }}>{identity.orgName}</p>}
        </div>
      </div>

      <div className="flex flex-col lg:flex-row" style={{ gap: 20 }}>
        <div style={{ marginBottom: 4 }}>
          <ResponsiveTabNav groups={groups} activeKey={current} onSelect={path => navigate(path)} />
        </div>

        <div style={{ width: '100%', minWidth: 0, flex: 1 }}>
          {current === 'informations' && (
            <ProfileInfoSection
              identity={identity}
              onNamesSaved={(firstName, lastName) => setIdentity(p => ({ ...p, firstName, lastName }))}
            />
          )}
          {current === 'mot-de-passe'  && <ProfilePasswordSection email={identity.email} />}
          {current === 'notifications' && <NotificationPreferencesSection />}
        </div>
      </div>
    </div>
  );
}

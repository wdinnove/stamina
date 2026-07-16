import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router';
import { AlertCircle, CheckCircle, User, Lock, Save, LogOut, Bell } from 'lucide-react';
import { profileApi } from '../api/profile';
import { authApi, isPushSupported, getExistingSubscription, subscribeToPush, unsubscribeFromPush } from '../api';
import { Card, CardTitle } from '../components';
import { useTeamSeason } from '../contexts/TeamSeasonContext';

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', backgroundColor: '#1E2229',
  border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9',
  fontSize: '0.88rem', outline: 'none', boxSizing: 'border-box',
};

const readonlyStyle: React.CSSProperties = {
  ...inputStyle,
  color: '#475569',
  cursor: 'default',
};

export default function ProfilePage() {
  const navigate = useNavigate();
  const { orgRole } = useTeamSeason();
  const [email,     setEmail]     = useState('');
  const [orgName,   setOrgName]   = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName,  setLastName]  = useState('');
  const [infoMsg,   setInfoMsg]   = useState('');
  const [infoErr,   setInfoErr]   = useState('');
  const [infoSaving, setInfoSaving] = useState(false);

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd,     setNewPwd]     = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [pwdMsg,     setPwdMsg]     = useState('');
  const [pwdErr,     setPwdErr]     = useState('');
  const [pwdSaving,  setPwdSaving]  = useState(false);

  useEffect(() => {
    profileApi.getCurrent().then(profile => {
      if (!profile) return;
      setEmail(profile.email);
      setFirstName(profile.firstName);
      setLastName(profile.lastName);
      setOrgName(profile.orgName);
    });
  }, []);

  async function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInfoSaving(true);
    setInfoMsg('');
    setInfoErr('');
    try {
      await profileApi.updateNames(firstName, lastName);
      setInfoMsg('Informations mises à jour.');
    } catch (err: unknown) {
      setInfoErr(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setInfoSaving(false);
    }
  }

  async function handlePwdSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (newPwd !== confirmPwd) {
      setPwdErr('Les mots de passe ne correspondent pas.');
      return;
    }
    if (newPwd.length < 8) {
      setPwdErr('Le mot de passe doit faire au moins 8 caractères.');
      return;
    }
    setPwdSaving(true);
    setPwdMsg('');
    setPwdErr('');
    try {
      await profileApi.changePassword(email, currentPwd, newPwd);
      setPwdMsg('Mot de passe mis à jour.');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
    } catch (err: unknown) {
      setPwdErr(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setPwdSaving(false);
    }
  }

  async function handleSignOut() {
    await authApi.signOut();
    navigate('/login', { replace: true });
  }

  const [pushSupported, setPushSupported] = useState(true);
  const [pushSubscribed, setPushSubscribed] = useState(false);
  const [pushLoading, setPushLoading] = useState(true);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushMsg, setPushMsg] = useState('');
  const [pushErr, setPushErr] = useState('');

  useEffect(() => {
    if (!isPushSupported()) { setPushSupported(false); setPushLoading(false); return; }
    getExistingSubscription().then(sub => { setPushSubscribed(!!sub); setPushLoading(false); });
  }, []);

  async function handleTogglePush() {
    setPushBusy(true);
    setPushErr('');
    setPushMsg('');
    try {
      if (pushSubscribed) {
        await unsubscribeFromPush();
        setPushSubscribed(false);
        setPushMsg('Notifications désactivées sur cet appareil.');
      } else {
        await subscribeToPush();
        setPushSubscribed(true);
        setPushMsg('Notifications activées sur cet appareil.');
      }
    } catch (err: unknown) {
      setPushErr(err instanceof Error ? err.message : 'Erreur.');
    } finally {
      setPushBusy(false);
    }
  }

  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();

  return (
    <div className="p-4 md:p-6">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 28, flexWrap: 'wrap' }}>
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

      {/* Avatar + email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          backgroundColor: '#1E2229', border: '2px solid #2A2F3A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#00E5A0', fontSize: '1.1rem', fontWeight: 700,
        }}>
          {initials || '?'}
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <p style={{ color: '#F1F5F9', fontWeight: 600, margin: '0 0 2px', fontSize: '1rem' }}>
              {firstName} {lastName}
            </p>
            {orgRole && (
              <span style={{
                color: orgRole === 'admin' ? '#00E5A0' : '#94A3B8',
                backgroundColor: orgRole === 'admin' ? 'rgba(0,229,160,0.1)' : 'rgba(148,163,184,0.1)',
                border: `1px solid ${orgRole === 'admin' ? 'rgba(0,229,160,0.3)' : 'rgba(148,163,184,0.25)'}`,
                fontSize: '0.68rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
                padding: '2px 8px', borderRadius: 4, marginBottom: 2,
              }}>
                {orgRole === 'admin' ? 'Admin' : 'Éditeur'}
              </span>
            )}
          </div>
          <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>{email}</p>
          {orgName && <p style={{ color: '#3B82F6', fontSize: '0.75rem', margin: '2px 0 0' }}>{orgName}</p>}
        </div>
      </div>

      {/* Sections : informations + mot de passe */}
      <div className="grid grid-cols-1 md:grid-cols-2" style={{ gap: 20, alignItems: 'start' }}>

      <Card style={{ padding: '20px 24px', borderRadius: 10 }}>
        <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
          <CardTitle icon={<User size={14} color="#00E5A0" />}>Mes informations</CardTitle>
        </div>

        {infoMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <CheckCircle size={13} style={{ color: '#00E5A0', flexShrink: 0 }} />
            <span style={{ color: '#00E5A0', fontSize: '0.8rem' }}>{infoMsg}</span>
          </div>
        )}
        {infoErr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{infoErr}</span>
          </div>
        )}

        <form onSubmit={handleInfoSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
            <input type="email" value={email} readOnly style={readonlyStyle} />
          </div>
          {orgName && (
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Organisation</label>
              <input type="text" value={orgName} readOnly style={readonlyStyle} />
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <button
              type="submit" disabled={infoSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', backgroundColor: infoSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: infoSaving ? '#475569' : '#0D0F14', cursor: infoSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
            >
              <Save size={14} />
              {infoSaving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Card>

      <Card style={{ padding: '20px 24px', borderRadius: 10 }}>
        <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
          <CardTitle icon={<Lock size={14} color="#00E5A0" />}>Changer le mot de passe</CardTitle>
        </div>

        {pwdMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <CheckCircle size={13} style={{ color: '#00E5A0', flexShrink: 0 }} />
            <span style={{ color: '#00E5A0', fontSize: '0.8rem' }}>{pwdMsg}</span>
          </div>
        )}
        {pwdErr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{pwdErr}</span>
          </div>
        )}

        <form onSubmit={handlePwdSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 2 }}>
            <button
              type="submit" disabled={pwdSaving}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', backgroundColor: pwdSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: pwdSaving ? '#475569' : '#0D0F14', cursor: pwdSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
            >
              <Save size={14} />
              {pwdSaving ? 'Enregistrement…' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </Card>

      </div>{/* fin grille 2 cards */}

      <Card style={{ padding: '20px 24px', borderRadius: 10, marginTop: 20 }}>
        <div style={{ borderBottom: '1px solid #2A2F3A', marginBottom: 18, paddingBottom: 14 }}>
          <CardTitle icon={<Bell size={14} color="#00E5A0" />}>Notifications</CardTitle>
        </div>

        {pushMsg && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(0,229,160,0.08)', border: '1px solid rgba(0,229,160,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <CheckCircle size={13} style={{ color: '#00E5A0', flexShrink: 0 }} />
            <span style={{ color: '#00E5A0', fontSize: '0.8rem' }}>{pushMsg}</span>
          </div>
        )}
        {pushErr && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px', marginBottom: 14 }}>
            <AlertCircle size={13} style={{ color: '#EF4444', flexShrink: 0 }} />
            <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{pushErr}</span>
          </div>
        )}

        {!pushSupported ? (
          <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>
            Les notifications push ne sont pas supportées par ce navigateur.
          </p>
        ) : pushLoading ? (
          <p style={{ color: '#475569', fontSize: '0.85rem', margin: 0 }}>Vérification du statut…</p>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: pushSubscribed ? '#00E5A0' : '#475569', flexShrink: 0 }} />
              <span style={{ color: pushSubscribed ? '#00E5A0' : '#94A3B8', fontSize: '0.85rem', fontWeight: 600 }}>
                {pushSubscribed ? 'Notifications activées' : 'Notifications désactivées'}
              </span>
            </div>
            <button
              onClick={handleTogglePush} disabled={pushBusy}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '8px 20px', borderRadius: 6,
                border: pushSubscribed ? '1px solid #2A2F3A' : 'none',
                backgroundColor: pushBusy ? '#1E2229' : pushSubscribed ? 'transparent' : '#00E5A0',
                color: pushBusy ? '#475569' : pushSubscribed ? '#94A3B8' : '#0D0F14',
                cursor: pushBusy ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem',
              }}
            >
              {pushBusy ? 'Patientez…' : pushSubscribed ? 'Désactiver' : 'Activer'}
            </button>
          </div>
        )}

        <p style={{ margin: '14px 0 0' }}>
          <Link to="/notifications/test" style={{ color: '#3B82F6', fontSize: '0.8rem', textDecoration: 'none' }}>
            Page de test avancée →
          </Link>
        </p>
      </Card>
    </div>
  );
}

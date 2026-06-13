import { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle } from 'lucide-react';
import { supabase } from '../api/client';

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
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setEmail(user.email ?? '');

      const { data } = await supabase
        .from('profiles')
        .select('first_name, last_name, organizations(name)')
        .eq('id', user.id)
        .single();
      if (data) {
        setFirstName(data.first_name ?? '');
        setLastName(data.last_name ?? '');
        const org = data.organizations as { name: string } | null;
        setOrgName(org?.name ?? '');
      }
    })();
  }, []);

  async function handleInfoSubmit(e: React.FormEvent) {
    e.preventDefault();
    setInfoSaving(true);
    setInfoMsg('');
    setInfoErr('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Non authentifié.');
      const { error } = await supabase
        .from('profiles')
        .update({ first_name: firstName, last_name: lastName })
        .eq('id', user.id);
      if (error) throw error;
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
      // Vérification du mot de passe actuel via re-signin
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: currentPwd });
      if (signInErr) throw new Error('Mot de passe actuel incorrect.');
      const { error } = await supabase.auth.updateUser({ password: newPwd });
      if (error) throw error;
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

  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();

  return (
    <div style={{ padding: '24px', maxWidth: 560 }}>
      <h1 style={{ color: '#F1F5F9', margin: '0 0 28px' }}>Mon profil</h1>

      {/* Avatar + email */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 32 }}>
        <div style={{
          width: 56, height: 56, borderRadius: '50%',
          backgroundColor: '#1E2229', border: '2px solid #2A2F3A',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#00E5A0', fontSize: '1.1rem', fontWeight: 700,
        }}>
          {initials || '?'}
        </div>
        <div>
          <p style={{ color: '#F1F5F9', fontWeight: 600, margin: '0 0 2px', fontSize: '1rem' }}>
            {firstName} {lastName}
          </p>
          <p style={{ color: '#475569', fontSize: '0.82rem', margin: 0 }}>{email}</p>
          {orgName && <p style={{ color: '#3B82F6', fontSize: '0.75rem', margin: '2px 0 0' }}>{orgName}</p>}
        </div>
      </div>

      {/* Section : informations */}
      <section style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '22px', marginBottom: 20 }}>
        <h2 style={{ color: '#F1F5F9', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 18px' }}>Mes informations</h2>

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
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
          <button
            type="submit" disabled={infoSaving}
            style={{ alignSelf: 'flex-end', padding: '8px 20px', backgroundColor: infoSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: infoSaving ? '#475569' : '#0D0F14', cursor: infoSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
          >
            {infoSaving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </form>
      </section>

      {/* Section : mot de passe */}
      <section style={{ backgroundColor: '#161920', border: '1px solid #2A2F3A', borderRadius: 10, padding: '22px' }}>
        <h2 style={{ color: '#F1F5F9', fontSize: '0.95rem', fontWeight: 700, margin: '0 0 18px' }}>Changer le mot de passe</h2>

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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Nouveau mot de passe</label>
              <input type="password" required value={newPwd} onChange={e => setNewPwd(e.target.value)} style={inputStyle} autoComplete="new-password" minLength={8} />
            </div>
            <div>
              <label style={{ color: '#94A3B8', fontSize: '0.78rem', display: 'block', marginBottom: 4 }}>Confirmer</label>
              <input type="password" required value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} style={inputStyle} autoComplete="new-password" minLength={8} />
            </div>
          </div>
          <button
            type="submit" disabled={pwdSaving}
            style={{ alignSelf: 'flex-end', padding: '8px 20px', backgroundColor: pwdSaving ? '#1E2229' : '#00E5A0', border: 'none', borderRadius: 6, color: pwdSaving ? '#475569' : '#0D0F14', cursor: pwdSaving ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: '0.88rem' }}
          >
            {pwdSaving ? 'Mise à jour…' : 'Mettre à jour'}
          </button>
        </form>
      </section>
    </div>
  );
}

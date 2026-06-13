import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Eye, EyeOff, Mail, Lock, AlertCircle, CheckCircle } from 'lucide-react';
import { StaminaLogo } from '../components';
import { authApi } from '../api';

type AuthView = 'login' | 'forgot' | 'reset';

export default function LoginPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<AuthView>('login');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email)    { setError('Veuillez saisir votre email.'); return; }
    if (!password) { setError('Veuillez saisir votre mot de passe.'); return; }
    setLoading(true);
    try {
      await authApi.signIn(email, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur de connexion.';
      setError(msg === 'Invalid login credentials' ? 'Email ou mot de passe incorrect.' : msg);
    } finally {
      setLoading(false);
    }
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Veuillez saisir votre email.'); return; }
    setLoading(true);
    try {
      await authApi.resetPassword(email);
      setSuccess(`Un lien de réinitialisation a été envoyé à ${email}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erreur lors de l\'envoi.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

const input = {
    width: '100%', padding: '10px 12px 10px 40px',
    backgroundColor: '#1E2229', border: '1px solid #2A2F3A',
    borderRadius: 6, color: '#F1F5F9', outline: 'none',
    fontSize: '0.88rem', boxSizing: 'border-box' as const,
    transition: 'border-color 0.15s',
  };

  return (
    <div style={{
      minHeight: '100vh', backgroundColor: '#0D0F14',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      padding: '20px',
      backgroundImage: 'radial-gradient(ellipse at 20% 50%, rgba(0,229,160,0.04) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(59,130,246,0.05) 0%, transparent 50%)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 32 }}>
        <StaminaLogo size={44} />
        <div>
          <div style={{ color: '#F1F5F9', fontWeight: 900, fontSize: '1.4rem', letterSpacing: '0.14em', lineHeight: 1 }}>STAMINA</div>
          <div style={{ color: '#00E5A066', fontSize: '0.65rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 2 }}>Management App</div>
        </div>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 400,
        backgroundColor: '#161920', border: '1px solid #2A2F3A',
        borderRadius: 12, padding: '32px 28px',
        boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
      }}>
        {view === 'login' && (
          <>
            <h1 style={{ color: '#F1F5F9', marginBottom: 4, textAlign: 'center' }}>Bienvenue</h1>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', textAlign: 'center', marginBottom: 28 }}>
              Chaque donnée compte. Chaque joueur compte.
            </p>

            <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div>
                <label style={{ color: '#94A3B8', display: 'block', marginBottom: 6 }}>Email</label>
                <div style={{ position: 'relative' }}>
                  <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                  <input
                    type="email" placeholder="votre@email.com"
                    value={email} onChange={e => setEmail(e.target.value)}
                    style={input}
                    onFocus={e => (e.target.style.borderColor = '#00E5A0')}
                    onBlur={e => (e.target.style.borderColor = '#2A2F3A')}
                  />
                </div>
              </div>

              <div>
                <label style={{ color: '#94A3B8', display: 'block', marginBottom: 6 }}>Mot de passe</label>
                <div style={{ position: 'relative' }}>
                  <Lock size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                  <input
                    type={showPassword ? 'text' : 'password'} placeholder="••••••••"
                    value={password} onChange={e => setPassword(e.target.value)}
                    style={{ ...input, paddingRight: 40 }}
                    onFocus={e => (e.target.style.borderColor = '#00E5A0')}
                    onBlur={e => (e.target.style.borderColor = '#2A2F3A')}
                  />
                  <button
                    type="button" onClick={() => setShowPassword(!showPassword)}
                    style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: '#475569', cursor: 'pointer' }}
                  >
                    {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', color: '#94A3B8', fontSize: '0.82rem', fontWeight: 400 }}>
                  <input
                    type="checkbox" checked={rememberMe} onChange={e => setRememberMe(e.target.checked)}
                    style={{ accentColor: '#00E5A0', width: 14, height: 14 }}
                  />
                  Se souvenir de moi
                </label>
                <button
                  type="button" onClick={() => { setView('forgot'); setError(''); }}
                  style={{ background: 'none', border: 'none', color: '#3B82F6', cursor: 'pointer', fontSize: '0.82rem' }}
                >
                  Mot de passe oublié ?
                </button>
              </div>

              {error && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, backgroundColor: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 6, padding: '8px 12px' }}>
                  <AlertCircle size={14} style={{ color: '#EF4444', flexShrink: 0 }} />
                  <span style={{ color: '#EF4444', fontSize: '0.8rem' }}>{error}</span>
                </div>
              )}

              <button
                type="submit" disabled={loading}
                style={{
                  padding: '11px', backgroundColor: loading ? '#1E2229' : '#00E5A0',
                  border: 'none', borderRadius: 6, color: loading ? '#475569' : '#0D0F14',
                  fontWeight: 700, fontSize: '0.9rem', cursor: loading ? 'not-allowed' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                  transition: 'all 0.15s',
                }}
              >
                {loading ? (
                  <>
                    <div style={{
                      width: 16, height: 16, border: '2px solid #475569',
                      borderTopColor: '#00E5A0', borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }} />
                    Connexion...
                  </>
                ) : 'SE CONNECTER'}
              </button>

            </form>
          </>
        )}

        {view === 'forgot' && (
          <>
            <h2 style={{ color: '#F1F5F9', marginBottom: 8, textAlign: 'center' }}>Mot de passe oublié</h2>
            <p style={{ color: '#94A3B8', fontSize: '0.85rem', textAlign: 'center', marginBottom: 24 }}>
              Saisissez votre email pour recevoir un lien de réinitialisation.
            </p>

            {success ? (
              <div style={{ textAlign: 'center' }}>
                <CheckCircle size={40} style={{ color: '#00E5A0', margin: '0 auto 16px' }} />
                <p style={{ color: '#00E5A0', fontSize: '0.88rem' }}>{success}</p>
                <button
                  onClick={() => { setView('login'); setSuccess(''); setEmail(''); }}
                  style={{ marginTop: 20, padding: '10px 24px', backgroundColor: '#1E2229', border: '1px solid #2A2F3A', borderRadius: 6, color: '#F1F5F9', cursor: 'pointer' }}
                >
                  Retour à la connexion
                </button>
              </div>
            ) : (
              <form onSubmit={handleForgot} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ color: '#94A3B8', display: 'block', marginBottom: 6 }}>Email</label>
                  <div style={{ position: 'relative' }}>
                    <Mail size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#475569' }} />
                    <input type="email" placeholder="votre@email.com" value={email} onChange={e => setEmail(e.target.value)} style={input} />
                  </div>
                </div>
                {error && <p style={{ color: '#EF4444', fontSize: '0.8rem' }}>{error}</p>}
                <button
                  type="submit" disabled={loading}
                  style={{ padding: '11px', backgroundColor: '#00E5A0', border: 'none', borderRadius: 6, color: '#0D0F14', fontWeight: 700, cursor: 'pointer' }}
                >
                  {loading ? 'Envoi...' : 'Envoyer le lien'}
                </button>
                <button type="button" onClick={() => setView('login')} style={{ background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '0.85rem' }}>
                  ← Retour
                </button>
              </form>
            )}
          </>
        )}
      </div>

      <p style={{ marginTop: 24, color: '#475569', fontSize: '0.75rem' }}>
        STAMINA · Version 1.0
      </p>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        input::placeholder { color: #475569; }
      `}</style>
    </div>
  );
}

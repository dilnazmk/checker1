import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api } from './api';
import { ErrorMessage } from './components';

export default function Auth({ user, onLogin }) {
  const { pathname } = useLocation();
  const [query] = useSearchParams();
  const navigate = useNavigate();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const signup = pathname === '/register';
  const forgot = pathname === '/forgot';
  const reset = pathname === '/reset';
  if (user && !forgot && !reset) return <Navigate to={user.role === 'teacher' ? '/teacher' : '/'} replace />;
  async function submit(event) {
    event.preventDefault(); setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    if (reset && data.password !== data.confirm) return setError('Passwords do not match.');
    setBusy(true);
    try {
      const value = await api(forgot ? '/forgot-password' : reset ? '/reset-password' : signup ? '/register' : '/login', { ...data, ...(reset ? { token: query.get('token') } : {}) });
      if (forgot || reset) { setResult(value); if (reset) onLogin(null); }
      else { onLogin(value.user); navigate(value.user.role === 'teacher' ? '/teacher' : '/', { replace: true }); }
    } catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><div className="auth-intro"><p className="eyebrow">Assignment checker / SDU</p><h1>{forgot || reset ? 'A fresh' : 'Your work.'}<br /><em>{forgot || reset ? 'start.' : 'Your progress.'}</em></h1><p className="page-lede">{forgot ? 'Enter your SDU email to receive a password reset link.' : reset ? 'Choose a new password for your account.' : 'Check practical assignments, review feedback, and keep track of your grades.'}</p></div>
    <section className="auth-card">
      {!forgot && !reset && <div className="auth-tabs"><Link className={`auth-tab ${!signup ? 'active' : ''}`} to="/auth">Log in</Link><Link className={`auth-tab ${signup ? 'active' : ''}`} to="/register">Sign up</Link></div>}
      {result ? <div role="status"><p>{result.message}</p>{result.development_reset_url && <p><a href={result.development_reset_url}>Open development reset link ↗</a></p>}<Link to="/auth">Back to log in</Link></div> : <form onSubmit={submit}>
        <div className="form-heading"><span className="section-label">{forgot ? 'Recover account' : reset ? 'Reset password' : signup ? 'Create account' : 'Welcome back'}</span><span className="shared-badge">SDU email</span></div>
        {signup && <label>Full name<input name="name" autoComplete="name" maxLength="250" required /></label>}
        {!reset && <label>Email<input name="email" type="email" autoComplete="email" placeholder="250000000@sdu.edu.kz" maxLength="250" required /></label>}
        {!forgot && <label>Password<input name="password" type="password" autoComplete={signup || reset ? 'new-password' : 'current-password'} minLength={signup || reset ? 8 : undefined} maxLength="1024" required /></label>}
        {reset && <label>Confirm password<input name="confirm" type="password" autoComplete="new-password" minLength="8" maxLength="1024" required /></label>}
        <ErrorMessage error={error} /><button className="analyze-button" disabled={busy}><span>{busy ? 'Please wait…' : forgot ? 'Send reset link' : reset ? 'Update password' : signup ? 'Create account' : 'Log in'}</span><span aria-hidden="true">↗</span></button>
        {!signup && !forgot && !reset && <Link className="forgot-link" to="/forgot">Forgot password?</Link>}
        {(forgot || reset) && <Link className="forgot-link" to="/auth">Back to log in</Link>}
      </form>}
      {!forgot && !reset && <p className="auth-note">Students use a numeric SDU email ID. Teachers use an SDU email beginning with a letter.</p>}
    </section></main>;
}

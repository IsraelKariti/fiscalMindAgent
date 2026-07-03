import { useState, type FormEvent } from 'react';
import { api, ApiError } from '../api';

export function Login({ onSuccess }: { onSuccess: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.login(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Login failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="screen-center">
      <form className="card login-card" onSubmit={submit}>
        <div className="brand login-brand">
          <span className="brand-mark">FM</span>
          <span>FiscalMind</span>
        </div>
        <p className="muted">Sign in to manage the Form 106 collection agent.</p>
        <label className="field">
          <span>Password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
            required
          />
        </label>
        {error && <div className="error-banner">{error}</div>}
        <button className="btn btn-primary" type="submit" disabled={busy || password.length === 0}>
          {busy ? 'Signing in…' : 'Log in'}
        </button>
      </form>
    </div>
  );
}

interface Props {
  userEmail: string | null;
  onLogout: () => void;
}

/**
 * Shown to signed-in users whose email is not on the paid-access whitelist.
 * The API rejects everything for them anyway (403); this is the friendly face
 * of that gate.
 */
export function AccessPending({ userEmail, onLogout }: Props) {
  return (
    <div className="screen-center">
      <div className="card login-card">
        <div className="brand login-brand">
          <img className="brand-mark" src="/logo.png" alt="FiscalMind logo" />
          <span>FiscalMind</span>
        </div>
        <div className="access-pending-icon" aria-hidden="true">
          🔒
        </div>
        <h2 className="access-pending-title">Your account isn't activated yet</h2>
        <p className="muted">
          FiscalMind is available to paying customers only. Contact the administrator to activate access for
          {userEmail ? <strong> {userEmail}</strong> : ' your account'}. Once you're activated, sign in again and
          your dashboard will be ready.
        </p>
        <button className="btn btn-ghost" onClick={onLogout}>
          Sign in with a different account
        </button>
      </div>
    </div>
  );
}

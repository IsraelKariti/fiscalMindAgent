import { useT } from '../i18n';

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
  const { t } = useT();
  return (
    <div className="screen-center">
      <div className="card login-card">
        <div className="brand login-brand">
          <img className="brand-mark" src="/logo.png" alt={t.logoAlt} />
          <span>FiscalMind</span>
        </div>
        <div className="access-pending-icon" aria-hidden="true">
          🔒
        </div>
        <h2 className="access-pending-title">{t.accessPendingTitle}</h2>
        <p className="muted">
          {t.accessPendingLead}
          {userEmail ? <strong> {userEmail}</strong> : t.accessPendingYourAccount}
          {t.accessPendingTail}
        </p>
        <button className="btn btn-ghost" onClick={onLogout}>
          {t.accessPendingSwitchAccount}
        </button>
      </div>
    </div>
  );
}

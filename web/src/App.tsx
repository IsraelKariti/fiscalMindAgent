import { useEffect, useState } from 'react';
import { api, type AccountTier, type Me } from './api';
import { Login } from './components/Login';
import { Workspace } from './components/Workspace';
import { AdminDashboard } from './components/AdminDashboard';
import { AccessPending } from './components/AccessPending';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { useT } from './i18n';

export function App() {
  const { t } = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<Me['user'] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [whitelisted, setWhitelisted] = useState(false);
  const [tier, setTier] = useState<AccountTier | null>(null);
  const [contactEmail, setContactEmail] = useState<string | null>(null);
  const [impersonating, setImpersonating] = useState<Me['impersonating'] | null>(null);
  const [envName, setEnvName] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);

  // Admins have no agent, clients, or mailbox of their own — they get the platform
  // overview shell instead, and only enter the accountant workspace by impersonating.
  const adminMode = isAdmin && !impersonating;

  useEffect(() => {
    api
      .me()
      .then(({ authenticated, user: me, isAdmin: admin, whitelisted: allowed, tier: planTier, contactEmail: contact, impersonating: viewing, envName: env }) => {
        setAuthed(authenticated);
        setEnvName(env ?? null);
        setUser(me ?? null);
        setIsAdmin(admin ?? false);
        setWhitelisted(allowed ?? false);
        setTier(planTier ?? null);
        setContactEmail(contact ?? null);
        setImpersonating(viewing ?? null);
        // Drop a stale ?login_error= once signed in.
        if (authenticated && window.location.search) window.history.replaceState(null, '', '/');
      })
      .catch(() => setAuthed(false));
  }, []);

  // Persistent strip on non-production stacks so a sandbox tab can never be
  // mistaken for the real dashboard.
  const envBanner = envName && (
    <div className="env-banner" role="status">
      {envName.toUpperCase()} — {t.envBannerNotProduction}
    </div>
  );

  if (authed === null) return <div className="screen-center muted">{t.loading}</div>;
  if (!authed)
    return (
      <>
        {envBanner}
        <Login />
      </>
    );

  const logout = async () => {
    await api.logout();
    setConfirmingLogout(false);
    setAuthed(false);
    setUser(null);
    setIsAdmin(false);
    setWhitelisted(false);
    setImpersonating(null);
  };

  // The logout buttons only open the confirmation modal; `logout` runs on confirm.
  const requestLogout = () => setConfirmingLogout(true);
  const logoutModal = confirmingLogout && (
    <LogoutConfirmModal onConfirm={logout} onClose={() => setConfirmingLogout(false)} />
  );

  if (!whitelisted)
    return (
      <>
        {envBanner}
        <AccessPending userEmail={user?.email ?? null} onLogout={logout} />
      </>
    );

  if (adminMode)
    return (
      <>
        {envBanner}
        <AdminDashboard userEmail={user?.email ?? null} onLogout={requestLogout} />
        {logoutModal}
      </>
    );

  const stopImpersonating = async () => {
    await api.stopImpersonating();
    // Full reload so the admin lands back on their own dashboard with fresh state.
    window.location.reload();
  };

  return (
    <>
      {envBanner}
      <Workspace
        userEmail={user?.email ?? null}
        tier={tier}
        contactEmail={contactEmail}
        impersonatingEmail={impersonating?.email ?? null}
        onStopImpersonating={stopImpersonating}
        onLogout={requestLogout}
      />
      {logoutModal}
    </>
  );
}

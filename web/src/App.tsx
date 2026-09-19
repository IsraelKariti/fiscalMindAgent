import { useEffect, useState } from 'react';
import { api, setViewAs, type Me } from './api';
import { Login } from './components/Login';
import { Workspace } from './components/Workspace';
import { ViewerProvider } from './agents/ApiContext';
import { AdminDashboard } from './components/AdminDashboard';
import { AccessPending } from './components/AccessPending';
import { ImpersonationEndedModal } from './components/ImpersonationEndedModal';
import { LogoutConfirmModal } from './components/LogoutConfirmModal';
import { StepLinkPage } from './components/StepLinkPage';
import { isStepHash } from './components/stepLink';
import { useT } from './i18n';

export function App() {
  const { t } = useT();
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [user, setUser] = useState<Me['user'] | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [whitelisted, setWhitelisted] = useState(false);
  const [impersonating, setImpersonating] = useState<Me['impersonating'] | null>(null);
  const [envName, setEnvName] = useState<string | null>(null);
  const [confirmingLogout, setConfirmingLogout] = useState(false);
  // The server rejected a workspace request because the view-as session ended.
  const [impersonationEnded, setImpersonationEnded] = useState(false);

  // Admins have no agent, clients, or mailbox of their own — they get the platform
  // overview shell instead, and only enter the accountant workspace by impersonating.
  const adminMode = isAdmin && !impersonating;

  // A step link (#/steps/:id) is handled here, before the admin / workspace
  // split: an impersonating admin sees the workspace, whose router treats an
  // unknown hash as boot and would rewrite it.
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => setHash(window.location.hash);
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
  }, []);

  useEffect(() => {
    api
      .me()
      .then(({ authenticated, user: me, isAdmin: admin, whitelisted: allowed, impersonating: viewing, envName: env }) => {
        setAuthed(authenticated);
        setEnvName(env ?? null);
        setUser(me ?? null);
        setIsAdmin(admin ?? false);
        setWhitelisted(allowed ?? false);
        // Before the workspace mounts and fires its first requests: they must
        // name the accountant, so an ended session is reported instead of served
        // under the admin's own identity. Many rejected requests → one dialog.
        setViewAs(viewing?.id ?? null, () => setImpersonationEnded(true));
        setImpersonating(viewing ?? null);
        // Drop a stale ?login_error= once signed in (keep any workspace deep link).
        if (authenticated && window.location.search)
          window.history.replaceState(null, '', '/' + window.location.hash);
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

  // Admin only (impersonating or not). Anyone else falls through to their own
  // workspace, which boots past the unknown hash. Closing goes to #/: the admin
  // overview, or the workspace's default agent while impersonating.
  if (isAdmin && isStepHash(hash))
    return (
      <>
        {envBanner}
        <StepLinkPage
          hash={hash}
          onClose={() => {
            window.location.hash = '#/';
          }}
        />
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

  // The #/as/:email/agents/:id/clients/:id hash survives the reload, so the
  // workspace reopens on the same agent + client under the new session.
  const restartImpersonating = async () => {
    if (!impersonating) return;
    await api.impersonate(impersonating.id);
    window.location.reload();
  };

  return (
    <>
      {envBanner}
      {/* isAdmin here always means "an admin impersonating" — admins never see the
          workspace otherwise (adminMode above). Reveals the LLM trace toggle. */}
      <ViewerProvider value={{ isAdmin }}>
        <Workspace
          userEmail={user?.email ?? null}
          impersonatingEmail={impersonating?.email ?? null}
          onStopImpersonating={stopImpersonating}
          onLogout={requestLogout}
          hashRouting
        />
      </ViewerProvider>
      {logoutModal}
      {impersonationEnded && impersonating && (
        <ImpersonationEndedModal email={impersonating.email} onRestart={restartImpersonating} onExit={stopImpersonating} />
      )}
    </>
  );
}

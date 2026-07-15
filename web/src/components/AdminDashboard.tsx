import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, type Accountant, type WhitelistEntry } from '../api';
import { useT } from '../i18n';
import { AccountantPage } from './admin/AccountantPage';
import { AccountantsTable } from './admin/AccountantsTable';
import { AdminAgents } from './admin/AdminAgents';
import { AdminOverview } from './admin/AdminOverview';
import { AdminSettings } from './admin/AdminSettings';
import { AdminUsage } from './admin/AdminUsage';
import { AgentPage } from './admin/AgentPage';
import { useAdminRoute } from './admin/route';
import { buildAccountantRows, type AccountantRow } from './admin/shared';

interface Props {
  userEmail: string | null;
  onLogout: () => void;
}

/**
 * The admin shell: admins don't run an agent of their own, so instead of the
 * accountant workspace they get a platform overview, the accountant roster
 * (each accountant and each of their agents on its own screen, hash-routed so
 * refresh and back/forward work), and platform settings. Impersonate is the
 * entry point into an accountant's own dashboard.
 */
export function AdminDashboard({ userEmail, onLogout }: Props) {
  const { t } = useT();
  const [route, navigate] = useAdminRoute();
  const [accountants, setAccountants] = useState<Accountant[] | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const [{ accountants: users }, { entries }] = await Promise.all([
      api.adminListAccountants(),
      api.adminListWhitelist(),
    ]);
    setAccountants(users);
    setWhitelist(entries);
  }, []);

  useEffect(() => {
    refresh().catch(() => setError(t.accountantsLoadFailed));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const rows = useMemo<AccountantRow[] | null>(
    () => (accountants && whitelist ? buildAccountantRows(accountants, whitelist) : null),
    [accountants, whitelist],
  );

  const rowByEmail = (email: string): AccountantRow | null => rows?.find((r) => r.email === email) ?? null;

  // The routed screen highlights its top-level tab; accountant/agent pages
  // belong under the Accountants tab.
  const activeTab =
    route.screen === 'settings' || route.screen === 'usage' || route.screen === 'overview' || route.screen === 'agents'
      ? route.screen
      : 'accountants';

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <img className="brand-mark" src="/petal-seal.svg" alt={t.logoAlt} />
          <span>FiscalMind</span>
          <span className="badge badge-neutral">{t.adminBadge}</span>
        </div>
        <div className="admin-topbar-account" title={t.googleAccountTitle}>
          <span className="muted">{userEmail ?? '…'}</span>
          <button className="btn btn-ghost btn-small" onClick={onLogout}>
            {t.logout}
          </button>
        </div>
      </header>

      <main className="admin-main">
        <nav className="client-tabs" role="tablist">
          <button
            className={`client-tab ${activeTab === 'overview' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'overview'}
            onClick={() => navigate({ screen: 'overview' })}
          >
            {t.tabDashboard}
          </button>
          <button
            className={`client-tab ${activeTab === 'accountants' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'accountants'}
            onClick={() => navigate({ screen: 'accountants' })}
          >
            {t.accountantsLabel}
          </button>
          <button
            className={`client-tab ${activeTab === 'agents' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'agents'}
            onClick={() => navigate({ screen: 'agents' })}
          >
            {t.adminAgentsTitle}
          </button>
          <button
            className={`client-tab ${activeTab === 'usage' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'usage'}
            onClick={() => navigate({ screen: 'usage' })}
          >
            {t.adminUsageTab}
          </button>
          <button
            className={`client-tab ${activeTab === 'settings' ? 'active' : ''}`}
            role="tab"
            aria-selected={activeTab === 'settings'}
            onClick={() => navigate({ screen: 'settings' })}
          >
            {t.settings}
          </button>
        </nav>

        {error && <div className="error-banner">{error}</div>}
        {!rows && !error && route.screen !== 'settings' && <div className="muted">{t.loading}</div>}

        {route.screen === 'overview' && accountants && <AdminOverview accountants={accountants} />}

        {route.screen === 'accountants' && rows && (
          <AccountantsTable
            rows={rows}
            onOpen={(email) => navigate({ screen: 'accountant', email })}
            onAdded={() => refresh().catch(() => setError(t.accountantsRefreshFailed))}
          />
        )}

        {route.screen === 'accountant' && rows && (
          <AccountantPage
            row={rowByEmail(route.email)}
            onBack={() => navigate({ screen: 'accountants' })}
            onOpenAgent={(agentType) => navigate({ screen: 'agent', email: route.email, agentType })}
            onChanged={refresh}
          />
        )}

        {route.screen === 'agent' && rows && (
          <AgentPage
            row={rowByEmail(route.email)}
            agentType={route.agentType}
            onBackToList={() => navigate({ screen: 'accountants' })}
            onBackToAccountant={() => navigate({ screen: 'accountant', email: route.email })}
          />
        )}

        {route.screen === 'agents' && accountants && <AdminAgents accountants={accountants} />}

        {route.screen === 'usage' && accountants && <AdminUsage accountants={accountants} />}

        {route.screen === 'settings' && <AdminSettings />}
      </main>
    </div>
  );
}

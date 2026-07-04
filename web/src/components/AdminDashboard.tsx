import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Accountant, type WhitelistEntry } from '../api';
import { AddAccountantModal } from './AddAccountantModal';

interface Props {
  userEmail: string | null;
  onLogout: () => void;
}

type AdminTab = 'dashboard' | 'accountants';

/**
 * One row per person: a whitelist entry, the signed-up user account behind it,
 * or both. Emails are the join key (whitelist entries are stored lowercase).
 */
interface AccountantRow {
  email: string;
  name: string | null;
  whitelisted: boolean;
  user: Accountant | null;
}

/**
 * The admin shell: admins don't run an agent of their own, so instead of the
 * accountant workspace they get a platform overview (Dashboard tab) and the
 * accountant roster with paid-access management (Accountants tab). Impersonate
 * is the entry point into an accountant's own dashboard.
 */
export function AdminDashboard({ userEmail, onLogout }: Props) {
  const [tab, setTab] = useState<AdminTab>(
    () => (sessionStorage.getItem('fm.adminTab') === 'accountants' ? 'accountants' : 'dashboard'),
  );
  const [accountants, setAccountants] = useState<Accountant[] | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const selectTab = (next: AdminTab) => {
    setTab(next);
    sessionStorage.setItem('fm.adminTab', next);
  };

  const refresh = useCallback(async () => {
    const [{ accountants: users }, { entries }] = await Promise.all([
      api.adminListAccountants(),
      api.adminListWhitelist(),
    ]);
    setAccountants(users);
    setWhitelist(entries);
  }, []);

  useEffect(() => {
    refresh().catch(() => setError('Failed to load accountants.'));
  }, [refresh]);

  const rows = useMemo<AccountantRow[] | null>(() => {
    if (!accountants || !whitelist) return null;
    const byEmail = new Map<string, AccountantRow>();
    for (const entry of whitelist) {
      byEmail.set(entry.email, { email: entry.email, name: entry.name, whitelisted: true, user: null });
    }
    for (const user of accountants) {
      const key = user.email.toLowerCase();
      const existing = byEmail.get(key);
      if (existing) {
        existing.user = user;
        existing.name = existing.name ?? user.name;
      } else {
        byEmail.set(key, { email: key, name: user.name, whitelisted: user.whitelisted, user });
      }
    }
    return [...byEmail.values()];
  }, [accountants, whitelist]);

  const totals = useMemo(() => {
    if (!accountants) return null;
    return accountants.reduce(
      (acc, a) => ({
        clients: acc.clients + a.clientCount,
        clientsComplete: acc.clientsComplete + a.clientsComplete,
        docs: acc.docs + a.docsTotal,
        docsCollected: acc.docsCollected + a.docsCollected,
      }),
      { clients: 0, clientsComplete: 0, docs: 0, docsCollected: 0 },
    );
  }, [accountants]);

  const impersonate = async (row: AccountantRow) => {
    if (!row.user) return;
    setBusyEmail(row.email);
    setError(null);
    try {
      await api.impersonate(row.user.id);
      // Full reload so every view refetches under the impersonated identity.
      window.location.reload();
    } catch {
      setError('Failed to start impersonation.');
      setBusyEmail(null);
    }
  };

  const activate = async (row: AccountantRow) => {
    setBusyEmail(row.email);
    setError(null);
    try {
      await api.adminAddToWhitelist(row.email, row.name ?? undefined);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to activate the account.');
    } finally {
      setBusyEmail(null);
    }
  };

  const revoke = async (row: AccountantRow) => {
    if (!window.confirm(`Revoke access for ${row.email}? They will be locked out immediately.`)) return;
    setBusyEmail(row.email);
    setError(null);
    try {
      await api.adminRemoveFromWhitelist(row.email);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Failed to revoke access.');
    } finally {
      setBusyEmail(null);
    }
  };

  const statusBadge = (row: AccountantRow) => {
    if (!row.whitelisted) {
      return (
        <span className="badge badge-pending" title="Signed in with Google but not whitelisted — they only see the contact-admin screen.">
          No access
        </span>
      );
    }
    return row.user ? (
      <span className="badge badge-success">Active</span>
    ) : (
      <span className="badge badge-neutral" title="Whitelisted but hasn't signed in yet.">
        Invited
      </span>
    );
  };

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt="FiscalMind logo" />
          <span>FiscalMind</span>
          <span className="badge badge-neutral">Admin</span>
        </div>
        <div className="admin-topbar-account" title="Google account you are signed in with">
          <span className="muted">{userEmail ?? '…'}</span>
          <button className="btn btn-ghost btn-small" onClick={onLogout}>
            Log out
          </button>
        </div>
      </header>

      <main className="admin-main">
        <nav className="client-tabs" role="tablist">
          <button
            className={`client-tab ${tab === 'dashboard' ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === 'dashboard'}
            onClick={() => selectTab('dashboard')}
          >
            Dashboard
          </button>
          <button
            className={`client-tab ${tab === 'accountants' ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === 'accountants'}
            onClick={() => selectTab('accountants')}
          >
            Accountants
          </button>
        </nav>

        {error && <div className="error-banner">{error}</div>}
        {!rows && !error && <div className="muted">Loading…</div>}

        {tab === 'dashboard' && rows && accountants && totals && (
          <div className="stat-row">
            <div className="card stat-tile">
              <span className="stat-label">Accountants</span>
              <span className="stat-value">{accountants.length}</span>
              <span className="stat-context">
                {accountants.filter((a) => a.mailbox).length} with an agent mailbox
              </span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Clients</span>
              <span className="stat-value">{totals.clients}</span>
              <span className="stat-context">across all accountants</span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Clients complete</span>
              <span className="stat-value">
                {totals.clients === 0 ? '—' : `${totals.clientsComplete} / ${totals.clients}`}
              </span>
              <span className="stat-context">
                {totals.clients === 0 ? 'No clients yet' : `${totals.clients - totals.clientsComplete} still pending`}
              </span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">Documents collected</span>
              <span className="stat-value">{totals.docs === 0 ? '—' : `${totals.docsCollected} / ${totals.docs}`}</span>
              {totals.docs > 0 && (
                <div className="stat-meter">
                  <div
                    className={`stat-meter-fill ${totals.docsCollected === totals.docs ? 'complete' : ''}`}
                    style={{ width: `${(totals.docsCollected / totals.docs) * 100}%` }}
                  />
                </div>
              )}
              <span className="stat-context">
                {totals.docs === 0 ? 'No documents requested yet' : `${totals.docs - totals.docsCollected} outstanding`}
              </span>
            </div>
          </div>
        )}

        {tab === 'accountants' && rows && (
          <section className="card admin-table-card">
            <div className="card-header">
              <div>
                <h2>Accountants</h2>
                <span className="badge badge-neutral">
                  {rows.length} account{rows.length === 1 ? '' : 's'}
                </span>
              </div>
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                + Add Accountant
              </button>
            </div>
            <p className="muted">
              Only whitelisted accountants can use the app. Impersonate opens their dashboard exactly as they see
              it — while impersonating, everything you do applies to their account.
            </p>
            {rows.length === 0 ? (
              <div className="muted">No accountants yet — add a paying customer's Gmail to give them access.</div>
            ) : (
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>Accountant</th>
                    <th>Status</th>
                    <th>Agent mailbox</th>
                    <th>Clients complete</th>
                    <th>Documents collected</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.email}>
                      <td>
                        <span className="client-item-text">
                          <span className="client-item-name">{row.name ?? row.email}</span>
                          <span className="client-item-email muted">{row.email}</span>
                        </span>
                      </td>
                      <td>{statusBadge(row)}</td>
                      <td>
                        {row.user?.mailbox ?? <span className="muted">{row.user ? 'Not set' : '—'}</span>}
                      </td>
                      <td>
                        {!row.user || row.user.clientCount === 0 ? (
                          <span className="muted">{row.user ? 'No clients' : '—'}</span>
                        ) : (
                          `${row.user.clientsComplete} / ${row.user.clientCount}`
                        )}
                      </td>
                      <td>
                        {!row.user || row.user.docsTotal === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <span
                            className="table-meter"
                            title={`${row.user.docsCollected} of ${row.user.docsTotal} documents collected`}
                          >
                            <span className="stat-meter table-meter-track">
                              <span
                                className={`stat-meter-fill ${row.user.docsCollected === row.user.docsTotal ? 'complete' : ''}`}
                                style={{ width: `${(row.user.docsCollected / row.user.docsTotal) * 100}%` }}
                              />
                            </span>
                            <span className="table-meter-count">
                              {row.user.docsCollected} / {row.user.docsTotal}
                            </span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="btn-row admin-row-actions">
                          {row.user && (
                            <button
                              className="btn btn-ghost btn-small"
                              disabled={busyEmail !== null}
                              onClick={() => impersonate(row)}
                            >
                              {busyEmail === row.email ? 'Working…' : 'Impersonate'}
                            </button>
                          )}
                          {row.whitelisted ? (
                            <button
                              className="btn btn-ghost btn-small"
                              disabled={busyEmail !== null}
                              onClick={() => revoke(row)}
                            >
                              Revoke access
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost btn-small"
                              disabled={busyEmail !== null}
                              onClick={() => activate(row)}
                            >
                              Activate
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        )}
      </main>

      {adding && (
        <AddAccountantModal
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refresh().catch(() => setError('Failed to reload accountants.'));
          }}
        />
      )}
    </div>
  );
}

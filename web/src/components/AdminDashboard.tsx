import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Accountant, type WhitelistEntry } from '../api';

interface Props {
  userEmail: string | null;
  onLogout: () => void;
}

/**
 * The admin shell: admins don't run an agent of their own, so instead of the
 * accountant workspace they get a platform overview — the paid-access
 * whitelist, every accountant with their collection progress, and an
 * Impersonate entry point into each one's dashboard.
 */
export function AdminDashboard({ userEmail, onLogout }: Props) {
  const [accountants, setAccountants] = useState<Accountant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[] | null>(null);
  const [whitelistError, setWhitelistError] = useState<string | null>(null);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [addingEntry, setAddingEntry] = useState(false);
  const [removingEmail, setRemovingEmail] = useState<string | null>(null);

  const loadAccountants = useCallback(() => {
    api
      .adminListAccountants()
      .then(({ accountants: list }) => setAccountants(list))
      .catch(() => setError('Failed to load accountants.'));
  }, []);

  useEffect(() => {
    loadAccountants();
    api
      .adminListWhitelist()
      .then(({ entries }) => setWhitelist(entries))
      .catch(() => setWhitelistError('Failed to load the whitelist.'));
  }, [loadAccountants]);

  const addToWhitelist = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEmail.trim() || addingEntry) return;
    setAddingEntry(true);
    setWhitelistError(null);
    try {
      await api.adminAddToWhitelist(newEmail.trim().toLowerCase(), newName.trim() || undefined);
      setNewEmail('');
      setNewName('');
      const { entries } = await api.adminListWhitelist();
      setWhitelist(entries);
      // The new accountant may already have signed in — refresh their access badge.
      loadAccountants();
    } catch (err) {
      setWhitelistError(err instanceof ApiError ? err.message : 'Failed to add the email.');
    } finally {
      setAddingEntry(false);
    }
  };

  const removeFromWhitelist = async (email: string) => {
    if (removingEmail) return;
    if (!window.confirm(`Revoke access for ${email}? They will be locked out immediately.`)) return;
    setRemovingEmail(email);
    setWhitelistError(null);
    try {
      await api.adminRemoveFromWhitelist(email);
      setWhitelist((list) => list?.filter((entry) => entry.email !== email) ?? null);
      loadAccountants();
    } catch (err) {
      setWhitelistError(err instanceof ApiError ? err.message : 'Failed to remove the email.');
    } finally {
      setRemovingEmail(null);
    }
  };

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

  const impersonate = async (userId: string) => {
    setBusyId(userId);
    setError(null);
    try {
      await api.impersonate(userId);
      // Full reload so every view refetches under the impersonated identity.
      window.location.reload();
    } catch {
      setError('Failed to start impersonation.');
      setBusyId(null);
    }
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
        {error && <div className="error-banner">{error}</div>}

        <section className="card admin-table-card">
          <div className="card-header">
            <div>
              <h2>Accountant access</h2>
              {whitelist && (
                <span className="badge badge-neutral">
                  {whitelist.length} whitelisted email{whitelist.length === 1 ? '' : 's'}
                </span>
              )}
            </div>
          </div>
          <p className="muted">
            Only whitelisted emails can use the app. When a customer pays, add the Gmail they'll sign in with —
            removing an email locks that account out immediately.
          </p>
          <form className="whitelist-add-form" onSubmit={addToWhitelist}>
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="accountant@gmail.com"
              spellCheck={false}
              required
            />
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (optional)"
              maxLength={200}
            />
            <button className="btn btn-primary" type="submit" disabled={addingEntry || !newEmail.trim()}>
              {addingEntry ? 'Adding…' : 'Add accountant'}
            </button>
          </form>
          {whitelistError && <div className="error-banner">{whitelistError}</div>}
          {!whitelist && !whitelistError && <div className="muted">Loading…</div>}
          {whitelist && whitelist.length === 0 && (
            <div className="muted">No emails whitelisted yet — nobody but admins can use the app.</div>
          )}
          {whitelist && whitelist.length > 0 && (
            <table className="admin-users-table">
              <thead>
                <tr>
                  <th>Email</th>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {whitelist.map((entry) => (
                  <tr key={entry.email}>
                    <td>{entry.email}</td>
                    <td>{entry.name ?? <span className="muted">—</span>}</td>
                    <td>
                      {entry.signedUp ? (
                        <span className="badge badge-success">Signed up</span>
                      ) : (
                        <span className="badge badge-neutral">Hasn't signed in yet</span>
                      )}
                    </td>
                    <td>{new Date(entry.createdAt).toLocaleDateString()}</td>
                    <td>
                      <button
                        className="btn btn-ghost btn-small"
                        disabled={removingEmail !== null}
                        onClick={() => removeFromWhitelist(entry.email)}
                      >
                        {removingEmail === entry.email ? 'Removing…' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {!accountants && !error && <div className="muted">Loading…</div>}
        {accountants && totals && (
          <>
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

            <section className="card admin-table-card">
              <div className="card-header">
                <div>
                  <h2>Accountants</h2>
                  <span className="badge badge-neutral">
                    {accountants.length} account{accountants.length === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
              <p className="muted">
                Impersonate an accountant to open their dashboard exactly as they see it. While impersonating,
                everything you do applies to their account.
              </p>
              {accountants.length === 0 ? (
                <div className="muted">No accountants have signed up yet.</div>
              ) : (
                <table className="admin-users-table">
                  <thead>
                    <tr>
                      <th>Accountant</th>
                      <th>Agent mailbox</th>
                      <th>Clients complete</th>
                      <th>Documents collected</th>
                      <th>Joined</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {accountants.map((a) => (
                      <tr key={a.id}>
                        <td>
                          <span className="client-item-text">
                            <span className="client-item-name">
                              {a.name ?? a.email}
                              {!a.whitelisted && (
                                <span className="badge badge-pending" title="Not on the whitelist — they can sign in but only see the contact-admin screen.">
                                  No access
                                </span>
                              )}
                            </span>
                            <span className="client-item-email muted">{a.email}</span>
                          </span>
                        </td>
                        <td>{a.mailbox ?? <span className="muted">Not set</span>}</td>
                        <td>{a.clientCount === 0 ? <span className="muted">No clients</span> : `${a.clientsComplete} / ${a.clientCount}`}</td>
                        <td>
                          {a.docsTotal === 0 ? (
                            <span className="muted">—</span>
                          ) : (
                            <span className="table-meter" title={`${a.docsCollected} of ${a.docsTotal} documents collected`}>
                              <span className="stat-meter table-meter-track">
                                <span
                                  className={`stat-meter-fill ${a.docsCollected === a.docsTotal ? 'complete' : ''}`}
                                  style={{ width: `${(a.docsCollected / a.docsTotal) * 100}%` }}
                                />
                              </span>
                              <span className="table-meter-count">
                                {a.docsCollected} / {a.docsTotal}
                              </span>
                            </span>
                          )}
                        </td>
                        <td>{new Date(a.createdAt).toLocaleDateString()}</td>
                        <td>
                          <button
                            className="btn btn-ghost btn-small"
                            disabled={busyId !== null}
                            onClick={() => impersonate(a.id)}
                          >
                            {busyId === a.id ? 'Opening…' : 'Impersonate'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

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
    refresh().catch(() => setError('טעינת רואי החשבון נכשלה.'));
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
      setError('הכניסה לחשבון נכשלה.');
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
      setError(err instanceof ApiError ? err.message : 'הפעלת החשבון נכשלה.');
    } finally {
      setBusyEmail(null);
    }
  };

  const revoke = async (row: AccountantRow) => {
    if (!window.confirm(`לבטל את הגישה של ${row.email}? הניתוק ייכנס לתוקף מייד.`)) return;
    setBusyEmail(row.email);
    setError(null);
    try {
      await api.adminRemoveFromWhitelist(row.email);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'ביטול הגישה נכשל.');
    } finally {
      setBusyEmail(null);
    }
  };

  const statusBadge = (row: AccountantRow) => {
    if (!row.whitelisted) {
      return (
        <span className="badge badge-pending" title="התחברו עם Google אבל אינם ברשימת ההיתרים — הם רואים רק את מסך הפנייה למנהל.">
          ללא גישה
        </span>
      );
    }
    return row.user ? (
      <span className="badge badge-success">פעיל</span>
    ) : (
      <span className="badge badge-neutral" title="ברשימת ההיתרים אך טרם התחברו.">
        הוזמן
      </span>
    );
  };

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt="הלוגו של FiscalMind" />
          <span>FiscalMind</span>
          <span className="badge badge-neutral">מנהל</span>
        </div>
        <div className="admin-topbar-account" title="חשבון Google שאיתו התחברתם">
          <span className="muted">{userEmail ?? '…'}</span>
          <button className="btn btn-ghost btn-small" onClick={onLogout}>
            התנתקות
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
            דשבורד
          </button>
          <button
            className={`client-tab ${tab === 'accountants' ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === 'accountants'}
            onClick={() => selectTab('accountants')}
          >
            רואי חשבון
          </button>
        </nav>

        {error && <div className="error-banner">{error}</div>}
        {!rows && !error && <div className="muted">טוען…</div>}

        {tab === 'dashboard' && rows && accountants && totals && (
          <div className="stat-row">
            <div className="card stat-tile">
              <span className="stat-label">רואי חשבון</span>
              <span className="stat-value">{accountants.length}</span>
              <span className="stat-context">
                {accountants.filter((a) => a.mailbox).length} עם תיבת סוכן
              </span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">לקוחות</span>
              <span className="stat-value">{totals.clients}</span>
              <span className="stat-context">בכל רואי החשבון</span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">לקוחות שהושלמו</span>
              <span className="stat-value">
                {totals.clients === 0 ? '—' : `${totals.clientsComplete} / ${totals.clients}`}
              </span>
              <span className="stat-context">
                {totals.clients === 0 ? 'אין עדיין לקוחות' : `${totals.clients - totals.clientsComplete} עדיין בתהליך`}
              </span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">מסמכים שנאספו</span>
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
                {totals.docs === 0 ? 'עדיין לא התבקשו מסמכים' : `${totals.docs - totals.docsCollected} חסרים`}
              </span>
            </div>
          </div>
        )}

        {tab === 'accountants' && rows && (
          <section className="card admin-table-card">
            <div className="card-header">
              <div>
                <h2>רואי חשבון</h2>
                <span className="badge badge-neutral">
                  {rows.length === 1 ? 'חשבון אחד' : `${rows.length} חשבונות`}
                </span>
              </div>
              <button className="btn btn-primary" onClick={() => setAdding(true)}>
                + הוספת רואה חשבון
              </button>
            </div>
            <p className="muted">
              רק רואי חשבון ברשימת ההיתרים יכולים להשתמש באפליקציה. "כניסה לחשבון" פותחת את הדשבורד שלהם בדיוק
              כפי שהם רואים אותו — ובזמן הכניסה, כל פעולה שלכם חלה על החשבון שלהם.
            </p>
            {rows.length === 0 ? (
              <div className="muted">אין עדיין רואי חשבון — הוסיפו כתובת Gmail של לקוח משלם כדי לתת לו גישה.</div>
            ) : (
              <table className="admin-users-table">
                <thead>
                  <tr>
                    <th>רואה חשבון</th>
                    <th>סטטוס</th>
                    <th>תיבת הסוכן</th>
                    <th>לקוחות שהושלמו</th>
                    <th>מסמכים שנאספו</th>
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
                        {row.user?.mailbox ?? <span className="muted">{row.user ? 'לא הוגדרה' : '—'}</span>}
                      </td>
                      <td>
                        {!row.user || row.user.clientCount === 0 ? (
                          <span className="muted">{row.user ? 'אין לקוחות' : '—'}</span>
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
                            title={`נאספו ${row.user.docsCollected} מתוך ${row.user.docsTotal} מסמכים`}
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
                              {busyEmail === row.email ? 'רק רגע…' : 'כניסה לחשבון'}
                            </button>
                          )}
                          {row.whitelisted ? (
                            <button
                              className="btn btn-ghost btn-small"
                              disabled={busyEmail !== null}
                              onClick={() => revoke(row)}
                            >
                              ביטול גישה
                            </button>
                          ) : (
                            <button
                              className="btn btn-ghost btn-small"
                              disabled={busyEmail !== null}
                              onClick={() => activate(row)}
                            >
                              הפעלה
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
            refresh().catch(() => setError('רענון רשימת רואי החשבון נכשל.'));
          }}
        />
      )}
    </div>
  );
}

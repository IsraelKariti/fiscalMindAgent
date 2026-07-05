import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type Accountant, type LlmPricing, type WhitelistEntry } from '../api';
import { formatTimestamp, formatUsd } from '../format';
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
  const [pricing, setPricing] = useState<LlmPricing | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);

  const selectTab = (next: AdminTab) => {
    setTab(next);
    sessionStorage.setItem('fm.adminTab', next);
  };

  const refresh = useCallback(async () => {
    const [{ accountants: users, pricing: prices }, { entries }] = await Promise.all([
      api.adminListAccountants(),
      api.adminListWhitelist(),
    ]);
    setAccountants(users);
    setPricing(prices);
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

  // The selected row, falling back to the first one so the detail pane is
  // never empty while there are accountants (e.g. after a revoke removes the
  // selected entry).
  const selected = useMemo<AccountantRow | null>(() => {
    if (!rows || rows.length === 0) return null;
    return rows.find((r) => r.email === selectedEmail) ?? rows[0] ?? null;
  }, [rows, selectedEmail]);

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

  // Lifetime Gemini spend of one accountant in USD; null while prices haven't loaded.
  const geminiCost = (a: Accountant | null | undefined): number | null =>
    pricing && a
      ? a.llmInputTokens * pricing.inputCostPerToken +
        a.llmOutputTokens * pricing.outputCostPerToken +
        a.llmThinkingTokens * pricing.thinkingCostPerToken
      : null;

  // Full-precision USD price of a single token (e.g. $0.0000003) — the regular
  // currency formatter would round it away.
  const perToken = (costPerToken: number) => `$${costPerToken.toFixed(12).replace(/0+$/, '')}`;

  const selectedCost = geminiCost(selected?.user);

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

  // One token category as a row of the token-breakdown grid: label, then
  // "price-per-token × tokens = cost" split into one grid cell per part, so the
  // × and = operators line up across rows. The grid is RTL, so cells are
  // emitted label-first and price last; visually each row reads
  // "price × count = cost" with the label on the right. Every row emits all
  // six cells so grid auto-placement keeps the columns in sync. A count of
  // zero (or no account yet) shows as a dash, and the bare count while prices
  // are unavailable.
  const tokenRow = (label: string, value: number | undefined, costPerToken: number | undefined) => {
    const count = value ?? 0;
    const priced = count > 0 && costPerToken !== undefined;
    return (
      <>
        <span className="token-label">{label}</span>
        {priced ? (
          <>
            <span className="token-cost" dir="ltr">
              {formatUsd(count * costPerToken)}
            </span>
            <span className="token-op muted">=</span>
            <span className="token-count muted" dir="ltr">
              {count.toLocaleString('he-IL')}
            </span>
            <span className="token-op muted">×</span>
            <span className="token-price muted" dir="ltr">
              {perToken(costPerToken)}
            </span>
          </>
        ) : (
          <>
            <span className="token-cost" dir="ltr">
              {count > 0 ? count.toLocaleString('he-IL') : <span className="muted">—</span>}
            </span>
            <span />
            <span />
            <span />
            <span />
          </>
        )}
      </>
    );
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
          <div className="admin-split">
            <section className="card admin-split-list">
              <div className="card-header">
                <div>
                  <h2>רואי חשבון</h2>
                  <span className="badge badge-neutral">
                    {rows.length === 1 ? 'חשבון אחד' : `${rows.length} חשבונות`}
                  </span>
                </div>
                <button className="btn btn-primary" onClick={() => setAdding(true)}>
                  + הוספה
                </button>
              </div>
              {rows.length === 0 ? (
                <div className="muted">
                  אין עדיין רואי חשבון — הוסיפו כתובת Gmail של לקוח משלם כדי לתת לו גישה.
                </div>
              ) : (
                <ul className="admin-accountant-list">
                  {rows.map((row) => (
                    <li key={row.email}>
                      <button
                        className={`client-item ${selected?.email === row.email ? 'selected' : ''}`}
                        onClick={() => setSelectedEmail(row.email)}
                      >
                        <span className="client-item-text">
                          <span className="client-item-name">{row.name ?? row.email}</span>
                          <span className="client-item-email muted" dir="ltr">
                            {row.email}
                          </span>
                        </span>
                        <span className="admin-list-badge">{statusBadge(row)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="card admin-split-detail">
              {!selected ? (
                <div className="muted">בחרו רואה חשבון מהרשימה כדי לראות את הפרטים שלו.</div>
              ) : (
                <>
                  <div className="card-header">
                    <div>
                      <h2>{selected.name ?? selected.email}</h2>
                      {statusBadge(selected)}
                    </div>
                    <span className="btn-row admin-row-actions">
                      {selected.user && (
                        <button
                          className="btn btn-ghost btn-small"
                          disabled={busyEmail !== null}
                          onClick={() => impersonate(selected)}
                        >
                          {busyEmail === selected.email ? 'רק רגע…' : 'כניסה לחשבון'}
                        </button>
                      )}
                      {selected.whitelisted ? (
                        <button
                          className="btn btn-ghost btn-small"
                          disabled={busyEmail !== null}
                          onClick={() => revoke(selected)}
                        >
                          ביטול גישה
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost btn-small"
                          disabled={busyEmail !== null}
                          onClick={() => activate(selected)}
                        >
                          הפעלה
                        </button>
                      )}
                    </span>
                  </div>
                  <dl className="detail-grid">
                    <div>
                      <dt>אימייל</dt>
                      <dd dir="ltr">{selected.email}</dd>
                    </div>
                    <div>
                      <dt>תיבת הסוכן</dt>
                      <dd>
                        {selected.user?.mailbox ?? (
                          <span className="muted">{selected.user ? 'לא הוגדרה' : '—'}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>הצטרפות</dt>
                      <dd>
                        {selected.user ? (
                          formatTimestamp(selected.user.createdAt)
                        ) : (
                          <span className="muted">טרם התחברו</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>לקוחות שהושלמו</dt>
                      <dd>
                        {!selected.user || selected.user.clientCount === 0 ? (
                          <span className="muted">{selected.user ? 'אין לקוחות' : '—'}</span>
                        ) : (
                          `${selected.user.clientsComplete} / ${selected.user.clientCount}`
                        )}
                      </dd>
                    </div>
                    <div className="detail-wide">
                      <dt>מסמכים שנאספו</dt>
                      <dd>
                        {!selected.user || selected.user.docsTotal === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <span
                            className="table-meter"
                            title={`נאספו ${selected.user.docsCollected} מתוך ${selected.user.docsTotal} מסמכים`}
                          >
                            <span className="stat-meter table-meter-track">
                              <span
                                className={`stat-meter-fill ${selected.user.docsCollected === selected.user.docsTotal ? 'complete' : ''}`}
                                style={{
                                  width: `${(selected.user.docsCollected / selected.user.docsTotal) * 100}%`,
                                }}
                              />
                            </span>
                            <span className="table-meter-count">
                              {selected.user.docsCollected} / {selected.user.docsTotal}
                            </span>
                          </span>
                        )}
                      </dd>
                    </div>
                  </dl>
                  <div className="token-breakdown">
                    {tokenRow('טוקני קלט', selected.user?.llmInputTokens, pricing?.inputCostPerToken)}
                    {tokenRow('טוקני פלט', selected.user?.llmOutputTokens, pricing?.outputCostPerToken)}
                    {tokenRow('טוקני חשיבה', selected.user?.llmThinkingTokens, pricing?.thinkingCostPerToken)}
                    <span className="token-label">עלות כוללת</span>
                    <span className="token-cost token-total" dir="ltr">
                      {selectedCost !== null && selectedCost > 0 ? (
                        formatUsd(selectedCost)
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </span>
                  </div>
                  <p className="muted admin-detail-note">
                    רק רואי חשבון ברשימת ההיתרים יכולים להשתמש באפליקציה. "כניסה לחשבון" פותחת את הדשבורד
                    שלהם בדיוק כפי שהם רואים אותו — ובזמן הכניסה, כל פעולה שלכם חלה על החשבון שלהם.
                  </p>
                </>
              )}
            </section>
          </div>
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

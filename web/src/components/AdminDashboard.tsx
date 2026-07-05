import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type Accountant,
  type GeminiModelState,
  type LlmPricing,
  type WhitelistEntry,
} from '../api';
import { formatTimestamp, formatUsd, LOCALE } from '../format';
import { useT } from '../i18n';
import { AddAccountantModal } from './AddAccountantModal';

interface Props {
  userEmail: string | null;
  onLogout: () => void;
}

type AdminTab = 'dashboard' | 'accountants' | 'settings';

const ADMIN_TABS: AdminTab[] = ['dashboard', 'accountants', 'settings'];

/** Display names for the pickable model ids (brand names, not translated). */
const MODEL_LABELS: Record<string, string> = {
  'gemini-2.5-flash': 'Gemini 2.5 Flash',
  'gemini-3-flash-preview': 'Gemini 3 Flash (Preview)',
  'gemini-3.5-flash': 'Gemini 3.5 Flash',
  'gemini-3.1-pro-preview': 'Gemini 3.1 Pro (Preview)',
};

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
  const { t } = useT();
  const [tab, setTab] = useState<AdminTab>(() => {
    const stored = sessionStorage.getItem('fm.adminTab');
    return ADMIN_TABS.includes(stored as AdminTab) ? (stored as AdminTab) : 'dashboard';
  });
  const [accountants, setAccountants] = useState<Accountant[] | null>(null);
  const [pricing, setPricing] = useState<LlmPricing | null>(null);
  const [whitelist, setWhitelist] = useState<WhitelistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [selectedEmail, setSelectedEmail] = useState<string | null>(null);
  const [modelState, setModelState] = useState<GeminiModelState | null>(null);
  const [modelNotice, setModelNotice] = useState<'saved' | 'load_failed' | 'save_failed' | null>(null);
  const [modelSaving, setModelSaving] = useState(false);
  const modelNoticeTimer = useRef<ReturnType<typeof setTimeout>>();

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
    refresh().catch(() => setError(t.accountantsLoadFailed));
    api.adminGetModel().then(setModelState).catch(() => setModelNotice('load_failed'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refresh]);

  const changeModel = async (model: string) => {
    setModelSaving(true);
    setModelNotice(null);
    clearTimeout(modelNoticeTimer.current);
    try {
      setModelState(await api.adminSetModel(model));
      setModelNotice('saved');
      modelNoticeTimer.current = setTimeout(() => setModelNotice(null), 3000);
    } catch {
      setModelNotice('save_failed');
    } finally {
      setModelSaving(false);
    }
  };

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
      setError(t.impersonateFailed);
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
      setError(err instanceof ApiError ? err.message : t.activateFailed);
    } finally {
      setBusyEmail(null);
    }
  };

  const revoke = async (row: AccountantRow) => {
    if (!window.confirm(t.revokeConfirm(row.email))) return;
    setBusyEmail(row.email);
    setError(null);
    try {
      await api.adminRemoveFromWhitelist(row.email);
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.revokeFailed);
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
              {count.toLocaleString(LOCALE)}
            </span>
            <span className="token-op muted">×</span>
            <span className="token-price muted" dir="ltr">
              {perToken(costPerToken)}
            </span>
          </>
        ) : (
          <>
            <span className="token-cost" dir="ltr">
              {count > 0 ? count.toLocaleString(LOCALE) : <span className="muted">—</span>}
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
        <span className="badge badge-pending" title={t.noAccessTitle}>
          {t.noAccessBadge}
        </span>
      );
    }
    return row.user ? (
      <span className="badge badge-success">{t.activeBadge}</span>
    ) : (
      <span className="badge badge-neutral" title={t.invitedTitle}>
        {t.invitedBadge}
      </span>
    );
  };

  return (
    <div className="admin-shell">
      <header className="admin-topbar">
        <div className="brand">
          <img className="brand-mark" src="/logo.png" alt={t.logoAlt} />
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
            className={`client-tab ${tab === 'dashboard' ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === 'dashboard'}
            onClick={() => selectTab('dashboard')}
          >
            {t.tabDashboard}
          </button>
          <button
            className={`client-tab ${tab === 'accountants' ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === 'accountants'}
            onClick={() => selectTab('accountants')}
          >
            {t.accountantsLabel}
          </button>
          <button
            className={`client-tab ${tab === 'settings' ? 'active' : ''}`}
            role="tab"
            aria-selected={tab === 'settings'}
            onClick={() => selectTab('settings')}
          >
            {t.settings}
          </button>
        </nav>

        {error && <div className="error-banner">{error}</div>}
        {!rows && !error && <div className="muted">{t.loading}</div>}

        {tab === 'dashboard' && rows && accountants && totals && (
          <div className="stat-row">
            <div className="card stat-tile">
              <span className="stat-label">{t.accountantsLabel}</span>
              <span className="stat-value">{accountants.length}</span>
              <span className="stat-context">
                {t.withAgentMailbox(accountants.filter((a) => a.mailbox).length)}
              </span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">{t.clientsLabel}</span>
              <span className="stat-value">{totals.clients}</span>
              <span className="stat-context">{t.acrossAllAccountants}</span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">{t.clientsCompleteLabel}</span>
              <span className="stat-value">
                {totals.clients === 0 ? '—' : `${totals.clientsComplete} / ${totals.clients}`}
              </span>
              <span className="stat-context">
                {totals.clients === 0
                  ? t.sidebarNoClients
                  : t.stillInProgress(totals.clients - totals.clientsComplete)}
              </span>
            </div>
            <div className="card stat-tile">
              <span className="stat-label">{t.docsCollectedLabel}</span>
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
                {totals.docs === 0 ? t.noDocsRequestedYet : t.nMissing(totals.docs - totals.docsCollected)}
              </span>
            </div>
          </div>
        )}

        {tab === 'accountants' && rows && (
          <div className="admin-split">
            <section className="card admin-split-list">
              <div className="card-header">
                <div>
                  <h2>{t.accountantsLabel}</h2>
                  <span className="badge badge-neutral">
                    {rows.length === 1 ? t.oneAccount : t.nAccounts(rows.length)}
                  </span>
                </div>
                <button className="btn btn-primary" onClick={() => setAdding(true)}>
                  {t.addShort}
                </button>
              </div>
              {rows.length === 0 ? (
                <div className="muted">{t.noAccountantsYet}</div>
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
                <div className="muted">{t.selectAccountant}</div>
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
                          {busyEmail === selected.email ? t.justAMoment : t.enterAccount}
                        </button>
                      )}
                      {selected.whitelisted ? (
                        <button
                          className="btn btn-ghost btn-small"
                          disabled={busyEmail !== null}
                          onClick={() => revoke(selected)}
                        >
                          {t.revokeAccess}
                        </button>
                      ) : (
                        <button
                          className="btn btn-ghost btn-small"
                          disabled={busyEmail !== null}
                          onClick={() => activate(selected)}
                        >
                          {t.activate}
                        </button>
                      )}
                    </span>
                  </div>
                  <dl className="detail-grid">
                    <div>
                      <dt>{t.emailLabel}</dt>
                      <dd dir="ltr">{selected.email}</dd>
                    </div>
                    <div>
                      <dt>{t.agentMailbox}</dt>
                      <dd>
                        {selected.user?.mailbox ?? (
                          <span className="muted">{selected.user ? t.mailboxNotSet : '—'}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.joinedLabel}</dt>
                      <dd>
                        {selected.user ? (
                          formatTimestamp(selected.user.createdAt)
                        ) : (
                          <span className="muted">{t.notSignedInYet}</span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t.clientsCompleteLabel}</dt>
                      <dd>
                        {!selected.user || selected.user.clientCount === 0 ? (
                          <span className="muted">{selected.user ? t.noClients : '—'}</span>
                        ) : (
                          `${selected.user.clientsComplete} / ${selected.user.clientCount}`
                        )}
                      </dd>
                    </div>
                    <div className="detail-wide">
                      <dt>{t.docsCollectedLabel}</dt>
                      <dd>
                        {!selected.user || selected.user.docsTotal === 0 ? (
                          <span className="muted">—</span>
                        ) : (
                          <span
                            className="table-meter"
                            title={t.collectedOfTitle(selected.user.docsCollected, selected.user.docsTotal)}
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
                    {tokenRow(t.inputTokens, selected.user?.llmInputTokens, pricing?.inputCostPerToken)}
                    {tokenRow(t.outputTokens, selected.user?.llmOutputTokens, pricing?.outputCostPerToken)}
                    {tokenRow(t.thinkingTokens, selected.user?.llmThinkingTokens, pricing?.thinkingCostPerToken)}
                    <span className="token-label">{t.totalCost}</span>
                    <span className="token-cost token-total" dir="ltr">
                      {selectedCost !== null && selectedCost > 0 ? (
                        formatUsd(selectedCost)
                      ) : (
                        <span className="muted">—</span>
                      )}
                    </span>
                  </div>
                  <p className="muted admin-detail-note">{t.adminDetailNote}</p>
                </>
              )}
            </section>
          </div>
        )}

        {tab === 'settings' && (
          <section className="card">
            <div className="settings-section">
              <h3>{t.llmModelTitle}</h3>
              <p className="muted">{t.llmModelDesc}</p>
              {!modelState ? (
                modelNotice === 'load_failed' ? (
                  <div className="error-banner">{t.llmModelLoadFailed}</div>
                ) : (
                  <p className="muted">{t.loading}</p>
                )
              ) : (
                <>
                  <div className="model-picker" dir="ltr">
                    <select
                      value={modelState.model}
                      disabled={modelSaving}
                      aria-label={t.llmModelTitle}
                      onChange={(e) => changeModel(e.target.value)}
                    >
                      {/* The env-default model may predate the options list; keep it selectable. */}
                      {!modelState.options.includes(modelState.model) && (
                        <option value={modelState.model}>{modelState.model}</option>
                      )}
                      {modelState.options.map((m) => (
                        <option key={m} value={m}>
                          {MODEL_LABELS[m] ?? m}
                        </option>
                      ))}
                    </select>
                    {modelSaving && <span className="muted">{t.saving}</span>}
                  </div>
                  {!modelState.isCustom && (
                    <p className="muted">
                      {t.llmModelEnvDefault}: <span dir="ltr">{modelState.model}</span>
                    </p>
                  )}
                  {modelNotice === 'saved' && <div className="ok-banner">{t.llmModelSaved}</div>}
                  {modelNotice === 'save_failed' && <div className="error-banner">{t.llmModelSaveFailed}</div>}
                </>
              )}
            </div>
          </section>
        )}
      </main>

      {adding && (
        <AddAccountantModal
          onClose={() => setAdding(false)}
          onAdded={() => {
            setAdding(false);
            refresh().catch(() => setError(t.accountantsRefreshFailed));
          }}
        />
      )}
    </div>
  );
}

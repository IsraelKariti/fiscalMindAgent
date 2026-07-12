import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type Accountant,
  type AccountTier,
  type AgentInstance,
  type GeminiModelState,
  type OrphanedWaNumber,
  type WhitelistEntry,
} from '../api';
import { getAgentUI } from '../agents/registry';
import { formatTimestamp, formatUsd, LOCALE } from '../format';
import { useT } from '../i18n';
import { AddAccountantModal } from './AddAccountantModal';
import { ConfirmModal } from './ConfirmModal';
import { UpgradeAccountModal } from './UpgradeAccountModal';

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
  /** Null when not whitelisted (the tier lives on the whitelist entry). */
  tier: AccountTier | null;
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
  const [whitelist, setWhitelist] = useState<WhitelistEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [upgradeEmail, setUpgradeEmail] = useState<string | null>(null);
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
    const [{ accountants: users }, { entries }] = await Promise.all([
      api.adminListAccountants(),
      api.adminListWhitelist(),
    ]);
    setAccountants(users);
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
      byEmail.set(entry.email, { email: entry.email, name: entry.name, whitelisted: true, tier: entry.tier, user: null });
    }
    for (const user of accountants) {
      const key = user.email.toLowerCase();
      const existing = byEmail.get(key);
      if (existing) {
        existing.user = user;
        existing.name = existing.name ?? user.name;
      } else {
        byEmail.set(key, { email: key, name: user.name, whitelisted: user.whitelisted, tier: user.tier, user });
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

  // The selected accountant's agent instances (incl. disabled) + enableable types.
  const selectedUserId = selected?.user?.id ?? null;
  const [agentInfo, setAgentInfo] = useState<{ agents: AgentInstance[]; availableTypes: string[] } | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  useEffect(() => {
    setAgentInfo(null);
    if (!selectedUserId) return;
    api.adminListAccountantAgents(selectedUserId).then(setAgentInfo).catch(() => {});
  }, [selectedUserId]);

  const toggleAgent = async (agentType: string, enable: boolean) => {
    if (!selectedUserId) return;
    setAgentBusy(true);
    setError(null);
    try {
      if (enable) await api.adminEnableAgent(selectedUserId, agentType);
      else await api.adminDisableAgent(selectedUserId, agentType);
      setAgentInfo(await api.adminListAccountantAgents(selectedUserId));
    } catch {
      setError(t.adminAgentsUpdateFailed);
    } finally {
      setAgentBusy(false);
    }
  };

  // One row per agent type: the accountant's instance when it exists, else the
  // enableable type itself (named from the frontend registry). A WhatsApp
  // number can only attach to a real instance, so placeholder rows are marked.
  const agentRows = useMemo(() => {
    if (!agentInfo) return [];
    const instantiated = new Set(agentInfo.agents.map((a) => a.agentType));
    return [
      ...agentInfo.agents.map((a) => ({ ...a, instantiated: true })),
      ...agentInfo.availableTypes
        .filter((type) => !instantiated.has(type))
        .map((type) => ({
          id: type,
          agentType: type,
          name: null as string | null,
          enabled: false,
          waPhoneNumber: null as string | null,
          instantiated: false,
        })),
    ];
  }, [agentInfo]);

  // Per-instance WhatsApp number drafts, keyed by instance id; unset = show
  // the currently assigned number.
  const [waDrafts, setWaDrafts] = useState<Record<string, string>>({});
  useEffect(() => setWaDrafts({}), [selectedUserId]);

  const saveWaNumber = async (agentInstanceId: string, phoneNumber: string) => {
    if (!selectedUserId) return;
    setAgentBusy(true);
    setError(null);
    try {
      await api.adminSetWaSender(agentInstanceId, phoneNumber);
      setWaDrafts(({ [agentInstanceId]: _saved, ...rest }) => rest);
      setAgentInfo(await api.adminListAccountantAgents(selectedUserId));
    } catch (err) {
      setError(err instanceof ApiError && err.status === 409 ? t.adminWaNumberConflict : t.adminWaNumberSaveFailed);
    } finally {
      setAgentBusy(false);
    }
  };

  // Instance a Twilio number purchase is in flight for — the whole flow (buy +
  // WhatsApp sender registration) can take up to a minute.
  const [provisioningId, setProvisioningId] = useState<string | null>(null);
  // Instance awaiting purchase confirmation in the ConfirmModal.
  const [buyConfirmId, setBuyConfirmId] = useState<string | null>(null);

  const buyWaNumber = async (agentInstanceId: string) => {
    if (!selectedUserId) return;
    setAgentBusy(true);
    setProvisioningId(agentInstanceId);
    setError(null);
    try {
      await api.adminProvisionWaSender(agentInstanceId);
      setWaDrafts(({ [agentInstanceId]: _bought, ...rest }) => rest);
      setAgentInfo(await api.adminListAccountantAgents(selectedUserId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.adminWaNumberBuyFailed);
    } finally {
      setAgentBusy(false);
      setProvisioningId(null);
    }
  };

  const removeWaNumber = async (agentInstanceId: string) => {
    if (!selectedUserId) return;
    setAgentBusy(true);
    setError(null);
    try {
      await api.adminDeleteWaSender(agentInstanceId);
      setWaDrafts(({ [agentInstanceId]: _removed, ...rest }) => rest);
      setAgentInfo(await api.adminListAccountantAgents(selectedUserId));
    } catch {
      setError(t.adminWaNumberSaveFailed);
    } finally {
      setAgentBusy(false);
    }
  };

  // Instance whose number release (Twilio deregister + release) is in flight,
  // and the one awaiting confirmation in the ConfirmModal.
  const [releasingId, setReleasingId] = useState<string | null>(null);
  const [releaseConfirm, setReleaseConfirm] = useState<{ id: string; phoneNumber: string } | null>(null);

  const releaseWaNumber = async (agentInstanceId: string) => {
    if (!selectedUserId) return;
    setAgentBusy(true);
    setReleasingId(agentInstanceId);
    setError(null);
    try {
      await api.adminReleaseWaSender(agentInstanceId);
      setWaDrafts(({ [agentInstanceId]: _released, ...rest }) => rest);
      setAgentInfo(await api.adminListAccountantAgents(selectedUserId));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.adminWaNumberReleaseFailed);
    } finally {
      setAgentBusy(false);
      setReleasingId(null);
    }
  };

  // Twilio-owned numbers not assigned to any agent (still billed monthly).
  // Loaded when the Settings tab opens; null = still loading.
  const [orphans, setOrphans] = useState<OrphanedWaNumber[] | null>(null);
  const [orphansError, setOrphansError] = useState<string | null>(null);
  const [orphanReleasing, setOrphanReleasing] = useState<string | null>(null);
  const [orphanReleaseConfirm, setOrphanReleaseConfirm] = useState<string | null>(null);

  const loadOrphans = useCallback(async () => {
    setOrphans(null);
    setOrphansError(null);
    try {
      setOrphans((await api.adminListOrphanedWaNumbers()).numbers);
    } catch (err) {
      setOrphans([]);
      setOrphansError(err instanceof ApiError ? err.message : t.adminOrphanNumbersLoadFailed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (tab === 'settings') loadOrphans();
  }, [tab, loadOrphans]);

  const releaseOrphan = async (phoneNumber: string) => {
    setOrphanReleasing(phoneNumber);
    setOrphansError(null);
    try {
      await api.adminReleaseOrphanedWaNumber(phoneNumber);
      setOrphans((await api.adminListOrphanedWaNumbers()).numbers);
    } catch (err) {
      setOrphansError(err instanceof ApiError ? err.message : t.adminWaNumberReleaseFailed);
    } finally {
      setOrphanReleasing(null);
    }
  };

  // Per-model usage of the selected accountant, its total spend, and whether any
  // model's tokens are still unpriced (missing registry entry — cost incomplete).
  const selectedUsage = selected?.user?.llmUsage ?? [];
  const selectedCost = selectedUsage.reduce((sum, u) => sum + (u.cost ?? 0), 0);
  const selectedHasUnpriced = selectedUsage.some((u) => u.cost === null);

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

  // Email awaiting revoke confirmation in the ConfirmModal.
  const [revokeEmail, setRevokeEmail] = useState<string | null>(null);

  const revoke = async (row: AccountantRow) => {
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

  const tierBadge = (row: AccountantRow) =>
    row.tier === 'premium' ? <span className="badge badge-premium">{t.tierPremium}</span> : null;

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
                        <span className="admin-list-badge">
                          {tierBadge(row)}
                          {statusBadge(row)}
                        </span>
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
                      {tierBadge(selected)}
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
                          onClick={() => setRevokeEmail(selected.email)}
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
                      <dt>{t.tierLabel}</dt>
                      <dd>
                        {!selected.tier ? (
                          <span className="muted">—</span>
                        ) : selected.tier === 'premium' ? (
                          t.tierPremium
                        ) : (
                          <span className="tier-inline">
                            {t.tierNormal}
                            <button
                              className="btn btn-ghost btn-small"
                              disabled={busyEmail !== null}
                              onClick={() => setUpgradeEmail(selected.email)}
                            >
                              {t.upgradeAction}
                            </button>
                          </span>
                        )}
                      </dd>
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
                  {selected.user && agentRows.length > 0 && (
                    <div className="settings-section">
                      <h3>{t.adminAgentsTitle}</h3>
                      <ul className="doc-list">
                        {agentRows.map((row) => (
                          <li key={row.id} className="doc-row">
                            <span className="doc-text">
                              <span className="doc-name">{row.name ?? t[getAgentUI(row.agentType).nameKey]}</span>
                              <span className="doc-desc muted">{t[getAgentUI(row.agentType).descriptionKey]}</span>
                              {row.instantiated && (
                                <span className="admin-wa-editor">
                                  <input
                                    dir="ltr"
                                    aria-label={t.adminWaNumberLabel}
                                    placeholder={t.adminWaNumberNone}
                                    value={waDrafts[row.id] ?? row.waPhoneNumber ?? ''}
                                    disabled={agentBusy}
                                    onChange={(e) => setWaDrafts((d) => ({ ...d, [row.id]: e.target.value }))}
                                  />
                                  <button
                                    className="btn btn-ghost btn-small"
                                    disabled={
                                      agentBusy ||
                                      !(waDrafts[row.id] ?? '').trim() ||
                                      (waDrafts[row.id] ?? '').trim() === row.waPhoneNumber
                                    }
                                    onClick={() => saveWaNumber(row.id, (waDrafts[row.id] ?? '').trim())}
                                  >
                                    {t.adminWaNumberSave}
                                  </button>
                                  {row.waPhoneNumber ? (
                                    <>
                                      <button
                                        className="btn btn-ghost btn-small"
                                        disabled={agentBusy}
                                        title={t.adminWaNumberRemoveTitle}
                                        onClick={() => removeWaNumber(row.id)}
                                      >
                                        {t.adminWaNumberRemove}
                                      </button>
                                      <button
                                        className="btn btn-ghost btn-small"
                                        disabled={agentBusy}
                                        title={t.adminWaNumberReleaseTitle}
                                        onClick={() =>
                                          setReleaseConfirm({ id: row.id, phoneNumber: row.waPhoneNumber! })
                                        }
                                      >
                                        {releasingId === row.id ? t.adminWaNumberReleasing : t.adminWaNumberRelease}
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      className="btn btn-ghost btn-small"
                                      disabled={agentBusy}
                                      onClick={() => setBuyConfirmId(row.id)}
                                    >
                                      {provisioningId === row.id ? t.adminWaNumberBuying : t.adminWaNumberBuy}
                                    </button>
                                  )}
                                </span>
                              )}
                            </span>
                            {row.enabled && <span className="badge badge-success">{t.activeBadge}</span>}
                            <button
                              className="btn btn-ghost btn-small"
                              disabled={agentBusy}
                              onClick={() => toggleAgent(row.agentType, !row.enabled)}
                            >
                              {row.enabled ? t.adminAgentDisable : t.adminAgentEnable}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  {selectedUsage.length > 0 && (
                    <table className="usage-table">
                      <thead>
                        <tr>
                          <th>{t.modelLabel}</th>
                          <th>{t.inputTokens}</th>
                          <th>{t.outputTokens}</th>
                          <th>{t.thinkingTokens}</th>
                          <th>{t.totalCost}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {selectedUsage.map((u) => (
                          <tr key={u.model}>
                            <td>{MODEL_LABELS[u.model] ?? u.model}</td>
                            <td dir="ltr">{u.inputTokens.toLocaleString(LOCALE)}</td>
                            <td dir="ltr">{u.outputTokens.toLocaleString(LOCALE)}</td>
                            <td dir="ltr">{u.thinkingTokens.toLocaleString(LOCALE)}</td>
                            <td dir="ltr">{u.cost !== null ? formatUsd(u.cost) : <span className="muted">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                      {selectedUsage.length > 1 && (
                        <tfoot>
                          <tr>
                            <td>{t.totalCost}</td>
                            <td colSpan={3} />
                            <td dir="ltr">
                              {formatUsd(selectedCost)}
                              {selectedHasUnpriced && '+'}
                            </td>
                          </tr>
                        </tfoot>
                      )}
                    </table>
                  )}
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
            <div className="settings-section">
              <h3>{t.adminOrphanNumbersTitle}</h3>
              <p className="muted">{t.adminOrphanNumbersDesc}</p>
              {orphansError && <div className="error-banner">{orphansError}</div>}
              {orphans === null ? (
                <p className="muted">{t.loading}</p>
              ) : orphans.length === 0 ? (
                !orphansError && <p className="muted">{t.adminOrphanNumbersEmpty}</p>
              ) : (
                <ul className="doc-list">
                  {orphans.map((n) => (
                    <li key={n.phoneNumber} className="doc-row">
                      <span className="doc-text">
                        <span className="doc-name" dir="ltr">
                          {n.phoneNumber}
                        </span>
                        <span className="doc-desc muted">
                          {n.friendlyName && n.friendlyName !== n.phoneNumber ? `${n.friendlyName} · ` : ''}
                          {formatTimestamp(n.dateCreated)}
                        </span>
                      </span>
                      <button
                        className="btn btn-ghost btn-small"
                        disabled={orphanReleasing !== null}
                        title={t.adminWaNumberReleaseTitle}
                        onClick={() => setOrphanReleaseConfirm(n.phoneNumber)}
                      >
                        {orphanReleasing === n.phoneNumber ? t.adminWaNumberReleasing : t.adminWaNumberRelease}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
        )}
      </main>

      {upgradeEmail && (
        <UpgradeAccountModal
          email={upgradeEmail}
          onClose={() => setUpgradeEmail(null)}
          onUpgraded={() => {
            setUpgradeEmail(null);
            refresh().catch(() => setError(t.accountantsRefreshFailed));
          }}
        />
      )}

      {buyConfirmId && (
        <ConfirmModal
          title={t.adminWaNumberBuy}
          note={t.adminWaNumberBuyConfirm}
          confirmLabel={t.adminWaNumberBuy}
          onConfirm={() => buyWaNumber(buyConfirmId)}
          onClose={() => setBuyConfirmId(null)}
        />
      )}

      {releaseConfirm && (
        <ConfirmModal
          title={t.adminWaNumberRelease}
          note={t.adminWaNumberReleaseConfirm(releaseConfirm.phoneNumber)}
          confirmLabel={t.adminWaNumberRelease}
          danger
          onConfirm={() => releaseWaNumber(releaseConfirm.id)}
          onClose={() => setReleaseConfirm(null)}
        />
      )}

      {orphanReleaseConfirm && (
        <ConfirmModal
          title={t.adminWaNumberRelease}
          note={t.adminWaNumberReleaseConfirm(orphanReleaseConfirm)}
          confirmLabel={t.adminWaNumberRelease}
          danger
          onConfirm={() => releaseOrphan(orphanReleaseConfirm)}
          onClose={() => setOrphanReleaseConfirm(null)}
        />
      )}

      {revokeEmail && (
        <ConfirmModal
          title={t.revokeAccess}
          note={t.revokeConfirm(revokeEmail)}
          confirmLabel={t.revokeAccess}
          danger
          onConfirm={() => {
            const row = rows?.find((r) => r.email === revokeEmail);
            if (row) revoke(row);
          }}
          onClose={() => setRevokeEmail(null)}
        />
      )}

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

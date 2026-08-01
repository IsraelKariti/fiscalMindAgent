import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type AgentInstance, type AgentTypeEmailInfo } from '../../api';
import { getAgentUI, getAllAgentUIs } from '../../agents/registry';
import { formatTimestamp, formatUsd, LOCALE } from '../../format';
import { useT } from '../../i18n';
import { AddAgentModal } from './AddAgentModal';
import { ConfirmModal } from '../ConfirmModal';
import { CopyButton } from '../CopyButton';
import { MODEL_LABELS, StatusBadge, type AccountantRow } from './shared';

interface Props {
  /** Null when the routed email matches no known accountant (stale link). */
  row: AccountantRow | null;
  onBack: () => void;
  onOpenAgent: (agentType: string) => void;
  /** Re-fetches the roster after access changes. */
  onChanged: () => Promise<void>;
}

/**
 * One accountant's full page: identity + access actions, per-account stats,
 * the agent roster (summaries only — configuration lives on the agent page),
 * LLM usage, and the revoke-access danger zone.
 */
export function AccountantPage({ row, onBack, onOpenAgent, onChanged }: Props) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);
  // 'activate' collects the Hebrew name while whitelisting; 'edit' updates it later.
  const [nameModal, setNameModal] = useState<'activate' | 'edit' | null>(null);
  const [addingAgent, setAddingAgent] = useState(false);

  // The agents summary (incl. disabled instances) + what the add-agent modal needs.
  const userId = row?.user?.id ?? null;
  const [agentInfo, setAgentInfo] = useState<{
    agents: AgentInstance[];
    availableTypes: string[];
    emailInfoByType: Record<string, AgentTypeEmailInfo>;
    emailDomain: string;
    defaultTaxYear: number;
  } | null>(null);
  const loadAgentInfo = useCallback(async () => {
    if (!userId) return;
    setAgentInfo(await api.adminListAccountantAgents(userId));
  }, [userId]);
  useEffect(() => {
    setAgentInfo(null);
    loadAgentInfo().catch(() => {});
  }, [loadAgentInfo]);

  // Only agents the admin actually created show here — a type with no instance
  // is added through the add-agent modal, never listed as a phantom row. Rows
  // follow the registry order (doc collector first), not creation order.
  const registryOrder = useMemo(() => new Map(getAllAgentUIs().map((ui, i) => [ui.agentType, i])), []);
  const agentRows = useMemo(
    () =>
      [...(agentInfo?.agents ?? [])].sort(
        (a, b) => (registryOrder.get(a.agentType) ?? Infinity) - (registryOrder.get(b.agentType) ?? Infinity),
      ),
    [agentInfo, registryOrder],
  );
  const addableTypes = useMemo(() => {
    if (!agentInfo) return [];
    const instantiated = new Set(agentInfo.agents.map((a) => a.agentType));
    return agentInfo.availableTypes
      .filter((type) => !instantiated.has(type))
      .sort((a, b) => (registryOrder.get(a) ?? Infinity) - (registryOrder.get(b) ?? Infinity));
  }, [agentInfo, registryOrder]);

  const enabledAgents = useMemo(() => (row?.user?.agents ?? []).filter((a) => a.enabled), [row]);
  const clientTotal = enabledAgents.reduce((sum, a) => sum + a.clientCount, 0);
  const clientCountByType = useMemo(
    () => new Map((row?.user?.agents ?? []).map((a) => [a.agentType, a.clientCount])),
    [row],
  );

  const usage = row?.user?.llmUsage ?? [];
  const totalCost = usage.reduce((sum, u) => sum + (u.cost ?? 0), 0);
  const hasUnpriced = usage.some((u) => u.cost === null);

  const breadcrumbs = (
    <nav className="breadcrumbs" aria-label={t.accountantsLabel}>
      <button className="breadcrumb-link" onClick={onBack}>
        {t.accountantsLabel}
      </button>
      <span className="breadcrumb-sep">/</span>
      <span className="breadcrumb-current">{row ? (row.hebrewName ?? row.name ?? row.email) : '…'}</span>
    </nav>
  );

  if (!row) {
    return (
      <>
        {breadcrumbs}
        <section className="card">
          <p className="muted">{t.adminAccountantNotFound}</p>
          <button className="btn btn-ghost" onClick={onBack}>
            {t.adminBackToList}
          </button>
        </section>
      </>
    );
  }

  const impersonate = async () => {
    if (!row.user) return;
    setBusy(true);
    setError(null);
    try {
      await api.impersonate(row.user.id);
      // Full reload so every view refetches under the impersonated identity.
      window.location.reload();
    } catch {
      setError(t.impersonateFailed);
      setBusy(false);
    }
  };

  const revoke = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminRemoveFromWhitelist(row.email);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.revokeFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {breadcrumbs}
      {error && <div className="error-banner">{error}</div>}

      <section className="card">
        <div className="card-header">
          <div className="card-title-row">
            <h2>{row.hebrewName ?? row.name ?? row.email}</h2>
            <StatusBadge row={row} />
          </div>
          <span className="btn-row admin-row-actions">
            {row.user && (
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={impersonate}>
                {busy ? t.justAMoment : t.enterAccount}
              </button>
            )}
            {!row.whitelisted && (
              <button className="btn btn-primary btn-small" disabled={busy} onClick={() => setNameModal('activate')}>
                {t.activate}
              </button>
            )}
          </span>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>{t.emailLabel}</dt>
            <dd className="detail-copy-row">
              <span dir="ltr">{row.email}</span>
              <CopyButton text={row.email} />
            </dd>
          </div>
          <div>
            <dt>{t.hebrewNameLabel}</dt>
            <dd className="detail-copy-row">
              {row.hebrewName ?? <span className="muted">{t.hebrewNameNotSet}</span>}
              {row.whitelisted && (
                <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => setNameModal('edit')}>
                  {t.edit}
                </button>
              )}
            </dd>
          </div>
          <div>
            <dt>{t.agentMailbox}</dt>
            <dd>{row.user?.mailbox ?? <span className="muted">{row.user ? t.mailboxNotSet : '—'}</span>}</dd>
          </div>
          <div>
            <dt>{t.joinedLabel}</dt>
            <dd>
              {row.user?.signedIn ? (
                formatTimestamp(row.user.createdAt)
              ) : (
                <span className="muted">{t.notSignedInYet}</span>
              )}
            </dd>
          </div>
        </dl>
      </section>

      {row.user && (
        <div className="stat-row">
          <div className="card stat-tile">
            <span className="stat-label">{t.adminActiveAgentsLabel}</span>
            <span className="stat-value">{enabledAgents.length === 0 ? '—' : enabledAgents.length}</span>
            <span className="stat-context">
              {enabledAgents.length === 0
                ? t.adminNoActiveAgents
                : enabledAgents.map((a) => a.name ?? t[getAgentUI(a.agentType).nameKey]).join(' · ')}
            </span>
          </div>
          <div className="card stat-tile">
            <span className="stat-label">{t.clientsLabel}</span>
            <span className="stat-value">{clientTotal}</span>
            <span className="stat-context">{clientTotal === 0 ? t.noClients : t.acrossAllAgents}</span>
          </div>
          <div className="card stat-tile">
            <span className="stat-label">{t.adminLlmSpendLabel}</span>
            <span className="stat-value" dir="ltr">
              {usage.length === 0 ? '—' : `${formatUsd(totalCost)}${hasUnpriced ? '+' : ''}`}
            </span>
            <span className="stat-context">{usage.length === 0 ? t.adminLlmSpendNone : ''}</span>
          </div>
        </div>
      )}

      {row.user && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t.adminAgentsTitle}</h2>
            </div>
            {agentInfo && addableTypes.length > 0 && (
              <button className="btn btn-primary btn-small" disabled={busy} onClick={() => setAddingAgent(true)}>
                {t.adminAddAgent}
              </button>
            )}
          </div>
          {!agentInfo && <p className="muted">{t.loading}</p>}
          {agentInfo && agentRows.length === 0 && <p className="muted">{t.adminNoAgentsConfigured}</p>}
          {agentRows.length > 0 && (
            <ul className="doc-list">
              {agentRows.map((agent) => (
                <li key={agent.id} className="doc-row admin-agent-summary">
                  <span className="doc-text">
                    <span className="doc-name">{agent.name ?? t[getAgentUI(agent.agentType).nameKey]}</span>
                    <span className="doc-desc muted">{t[getAgentUI(agent.agentType).descriptionKey]}</span>
                  </span>
                  <span className="admin-agent-summary-meta">
                    <span className="muted">{t.nClientsTitle(clientCountByType.get(agent.agentType) ?? 0)}</span>
                    {agent.waPhoneNumber ? (
                      <span className="muted" dir="ltr">
                        {agent.waPhoneNumber}
                      </span>
                    ) : (
                      <span className="muted">{t.adminWaNumberNone}</span>
                    )}
                    {agent.enabled && <span className="badge badge-success">{t.activeBadge}</span>}
                  </span>
                  <button className="btn btn-ghost btn-small" onClick={() => onOpenAgent(agent.agentType)}>
                    {t.adminManageAgent}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {usage.length > 0 && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t.adminLlmSpendLabel}</h2>
            </div>
          </div>
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
              {usage.map((u) => (
                <tr key={u.model}>
                  <td>{MODEL_LABELS[u.model] ?? u.model}</td>
                  <td dir="ltr">{u.inputTokens.toLocaleString(LOCALE)}</td>
                  <td dir="ltr">{u.outputTokens.toLocaleString(LOCALE)}</td>
                  <td dir="ltr">{u.thinkingTokens.toLocaleString(LOCALE)}</td>
                  <td dir="ltr">{u.cost !== null ? formatUsd(u.cost) : <span className="muted">—</span>}</td>
                </tr>
              ))}
            </tbody>
            {usage.length > 1 && (
              <tfoot>
                <tr>
                  <td>{t.totalCost}</td>
                  <td colSpan={3} />
                  <td dir="ltr">
                    {formatUsd(totalCost)}
                    {hasUnpriced && '+'}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </section>
      )}

      {row.whitelisted && (
        <section className="card danger-zone">
          <h3>{t.adminDangerZone}</h3>
          <div className="danger-zone-row">
            <p className="muted">{t.adminRevokeDesc}</p>
            <button className="btn btn-ghost btn-small danger-action" disabled={busy} onClick={() => setConfirmingRevoke(true)}>
              {t.revokeAccess}
            </button>
          </div>
        </section>
      )}

      <p className="muted admin-detail-note">{t.adminDetailNote}</p>

      {confirmingRevoke && (
        <ConfirmModal
          title={t.revokeAccess}
          note={t.revokeConfirm(row.email)}
          confirmLabel={t.revokeAccess}
          danger
          onConfirm={revoke}
          onClose={() => setConfirmingRevoke(false)}
        />
      )}

      {addingAgent && userId && agentInfo && (
        <AddAgentModal
          userId={userId}
          addableTypes={addableTypes}
          emailInfoByType={agentInfo.emailInfoByType}
          emailDomain={agentInfo.emailDomain}
          defaultTaxYear={agentInfo.defaultTaxYear}
          onAdded={async () => {
            await loadAgentInfo();
            await onChanged();
          }}
          onClose={() => setAddingAgent(false)}
        />
      )}

      {nameModal && (
        <HebrewNameModal
          title={nameModal === 'activate' ? t.activateAccountTitle : t.hebrewNameLabel}
          confirmLabel={nameModal === 'activate' ? t.activate : t.save}
          fallbackError={nameModal === 'activate' ? t.activateFailed : t.hebrewNameSaveFailed}
          initialValue={row.hebrewName ?? ''}
          onSubmit={async (hebrewName) => {
            if (nameModal === 'activate') {
              await api.adminAddToWhitelist(row.email, row.name ?? undefined, hebrewName);
            } else {
              await api.adminSetHebrewName(row.email, hebrewName);
            }
            await onChanged();
          }}
          onClose={() => setNameModal(null)}
        />
      )}
    </>
  );
}

interface HebrewNameModalProps {
  title: string;
  confirmLabel: string;
  fallbackError: string;
  initialValue: string;
  onSubmit: (hebrewName: string) => Promise<void>;
  onClose: () => void;
}

/** Collects the Hebrew name agents sign with — on account activation and when editing it later. */
function HebrewNameModal({ title, confirmLabel, fallbackError, initialValue, onSubmit, onClose }: HebrewNameModalProps) {
  const { t } = useT();
  const [value, setValue] = useState(initialValue);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value.trim());
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : fallbackError);
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <form className="card modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <h2>{title}</h2>
        <label className="field">
          <span>{t.hebrewNameFieldLabel}</span>
          <input value={value} onChange={(e) => setValue(e.target.value)} maxLength={200} autoFocus required />
        </label>
        <p className="muted">{t.hebrewNameHint}</p>
        {error && <div className="error-banner">{error}</div>}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" type="submit" disabled={busy}>
            {busy ? t.saving : confirmLabel}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

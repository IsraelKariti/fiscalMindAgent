import { useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AgentInstance } from '../../api';
import { getAgentUI } from '../../agents/registry';
import { formatTimestamp, formatUsd, LOCALE } from '../../format';
import { useT } from '../../i18n';
import { ConfirmModal } from '../ConfirmModal';
import { UpgradeAccountModal } from '../UpgradeAccountModal';
import { MODEL_LABELS, StatusBadge, TierBadge, type AccountantRow } from './shared';

interface Props {
  /** Null when the routed email matches no known accountant (stale link). */
  row: AccountantRow | null;
  onBack: () => void;
  onOpenAgent: (agentType: string) => void;
  /** Re-fetches the roster after access/tier changes. */
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
  const [upgrading, setUpgrading] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState(false);

  // The agents summary (incl. disabled instances and not-yet-created types).
  const userId = row?.user?.id ?? null;
  const [agentInfo, setAgentInfo] = useState<{ agents: AgentInstance[]; availableTypes: string[] } | null>(null);
  useEffect(() => {
    setAgentInfo(null);
    if (!userId) return;
    api.adminListAccountantAgents(userId).then(setAgentInfo).catch(() => {});
  }, [userId]);

  // One row per agent type: the accountant's instance when it exists, else the
  // enableable type itself (named from the frontend registry).
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
      <span className="breadcrumb-current">{row ? (row.name ?? row.email) : '…'}</span>
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

  const activate = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.adminAddToWhitelist(row.email, row.name ?? undefined);
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.activateFailed);
    } finally {
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
            <h2>{row.name ?? row.email}</h2>
            <TierBadge row={row} />
            <StatusBadge row={row} />
          </div>
          <span className="btn-row admin-row-actions">
            {row.user && (
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={impersonate}>
                {busy ? t.justAMoment : t.enterAccount}
              </button>
            )}
            {row.tier === 'normal' && (
              <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => setUpgrading(true)}>
                {t.upgradeAction}
              </button>
            )}
            {!row.whitelisted && (
              <button className="btn btn-primary btn-small" disabled={busy} onClick={activate}>
                {t.activate}
              </button>
            )}
          </span>
        </div>
        <dl className="detail-grid">
          <div>
            <dt>{t.emailLabel}</dt>
            <dd dir="ltr">{row.email}</dd>
          </div>
          <div>
            <dt>{t.tierLabel}</dt>
            <dd>{row.tier ? (row.tier === 'premium' ? t.tierPremium : t.tierNormal) : <span className="muted">—</span>}</dd>
          </div>
          <div>
            <dt>{t.agentMailbox}</dt>
            <dd>{row.user?.mailbox ?? <span className="muted">{row.user ? t.mailboxNotSet : '—'}</span>}</dd>
          </div>
          <div>
            <dt>{t.joinedLabel}</dt>
            <dd>{row.user ? formatTimestamp(row.user.createdAt) : <span className="muted">{t.notSignedInYet}</span>}</dd>
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

      {row.user && agentRows.length > 0 && (
        <section className="card">
          <div className="card-header">
            <div>
              <h2>{t.adminAgentsTitle}</h2>
            </div>
          </div>
          <ul className="doc-list">
            {agentRows.map((agent) => (
              <li key={agent.id} className="doc-row admin-agent-summary">
                <span className="doc-text">
                  <span className="doc-name">{agent.name ?? t[getAgentUI(agent.agentType).nameKey]}</span>
                  <span className="doc-desc muted">{t[getAgentUI(agent.agentType).descriptionKey]}</span>
                </span>
                <span className="admin-agent-summary-meta">
                  {agent.instantiated && (
                    <span className="muted">{t.nClientsTitle(clientCountByType.get(agent.agentType) ?? 0)}</span>
                  )}
                  {agent.waPhoneNumber ? (
                    <span className="muted" dir="ltr">
                      {agent.waPhoneNumber}
                    </span>
                  ) : (
                    agent.instantiated && <span className="muted">{t.adminWaNumberNone}</span>
                  )}
                  {agent.enabled && <span className="badge badge-success">{t.activeBadge}</span>}
                </span>
                <button className="btn btn-ghost btn-small" onClick={() => onOpenAgent(agent.agentType)}>
                  {t.adminManageAgent}
                </button>
              </li>
            ))}
          </ul>
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

      {upgrading && (
        <UpgradeAccountModal
          email={row.email}
          onClose={() => setUpgrading(false)}
          onUpgraded={() => {
            setUpgrading(false);
            void onChanged();
          }}
        />
      )}

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
    </>
  );
}

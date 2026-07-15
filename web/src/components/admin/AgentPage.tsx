import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { api, ApiError, type AgentInstance, type AgentTypeEmailInfo, type OrphanedWaNumber } from '../../api';
import { getAgentUI } from '../../agents/registry';
import { useT } from '../../i18n';
import { ConfirmModal } from '../ConfirmModal';
import { WaPoolModal } from '../WaPoolModal';
import type { AccountantRow } from './shared';

/**
 * Activation is deliberate: an agent that emails clients cannot be turned on
 * without an address the admin agreed on with the accountant, so the modal
 * explains the implications and (on first activation) demands the address.
 * A re-enable keeps the instance's existing address and just explains that.
 */
function ActivateAgentModal({
  agentName,
  existingEmail,
  suggestedLocalPart,
  emailDomain,
  onConfirm,
  onClose,
}: {
  agentName: string;
  /** Non-null on re-enable: the instance already has an address that will keep working. */
  existingEmail: string | null;
  suggestedLocalPart: string | null;
  emailDomain: string;
  onConfirm: (emailLocalPart: string | null) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [localPart, setLocalPart] = useState(suggestedLocalPart ?? '');
  const needsEmail = !existingEmail;

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{`${t.adminAgentActivateTitle} — ${agentName}`}</h2>
        <p className="muted">
          {existingEmail ? t.adminAgentActivateResumeExplain(existingEmail) : t.adminAgentActivateEmailExplain}
        </p>
        {needsEmail && (
          <span className="wa-manual-entry" dir="ltr">
            <input
              dir="ltr"
              autoFocus
              aria-label={t.adminAgentActivateEmailLabel}
              placeholder={suggestedLocalPart ?? ''}
              value={localPart}
              onChange={(e) => setLocalPart(e.target.value)}
            />
            <span className="muted">@{emailDomain}</span>
          </span>
        )}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={needsEmail && !localPart.trim()}
            onClick={() => {
              onClose();
              onConfirm(needsEmail ? localPart.trim() : null);
            }}
          >
            {t.adminAgentActivateConfirm}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

interface Props {
  /** Null when the routed email matches no known accountant (stale link). */
  row: AccountantRow | null;
  agentType: string;
  onBackToList: () => void;
  onBackToAccountant: () => void;
}

/**
 * One agent of one accountant: the enable/disable toggle and the WhatsApp
 * number lifecycle. The number UI is state-driven — an assigned number offers
 * detach/release, an unassigned agent offers the three acquisition paths.
 */
export function AgentPage({ row, agentType, onBackToList, onBackToAccountant }: Props) {
  const { t } = useT();
  const ui = getAgentUI(agentType);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const userId = row?.user?.id ?? null;
  const [agentInfo, setAgentInfo] = useState<{
    agents: AgentInstance[];
    availableTypes: string[];
    emailInfoByType: Record<string, AgentTypeEmailInfo>;
    emailDomain: string;
  } | null>(null);
  const loadAgents = useCallback(async () => {
    if (!userId) return;
    setAgentInfo(await api.adminListAccountantAgents(userId));
  }, [userId]);
  useEffect(() => {
    setAgentInfo(null);
    loadAgents().catch(() => {});
  }, [loadAgents]);

  const instance = useMemo(() => agentInfo?.agents.find((a) => a.agentType === agentType) ?? null, [agentInfo, agentType]);

  // Email facts must exist before the instance does — first activation is
  // where the mandatory address gets collected.
  const typeEmailInfo = agentInfo?.emailInfoByType[agentType] ?? null;
  const emailCapable = instance ? Boolean(instance.emailCapable) : Boolean(typeEmailInfo?.emailCapable);
  const suggestedLocalPart = instance?.suggestedEmailLocalPart ?? typeEmailInfo?.suggestedEmailLocalPart ?? null;

  // The address input starts from the assigned local part, else the derived
  // suggestion, so "enable → confirm the default" is a single click.
  const [emailLocalPart, setEmailLocalPart] = useState('');
  const [confirmingEmailChange, setConfirmingEmailChange] = useState(false);
  const [confirmingEmailAssign, setConfirmingEmailAssign] = useState(false);
  const [activating, setActivating] = useState(false);
  useEffect(() => {
    setEmailLocalPart(instance?.emailAddress?.split('@')[0] ?? instance?.suggestedEmailLocalPart ?? '');
  }, [instance?.emailAddress, instance?.suggestedEmailLocalPart]);

  // The unassigned-numbers pool: shown as a count on the pool option and
  // offered in the picker modal.
  const [orphans, setOrphans] = useState<OrphanedWaNumber[] | null>(null);
  const [orphansError, setOrphansError] = useState<string | null>(null);
  const loadOrphans = useCallback(async () => {
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
    void loadOrphans();
  }, [loadOrphans]);

  const [manualNumber, setManualNumber] = useState('');
  const [poolPicking, setPoolPicking] = useState(false);
  const [confirmingBuy, setConfirmingBuy] = useState(false);
  const [buying, setBuying] = useState(false);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const [releasing, setReleasing] = useState(false);

  const run = async (op: () => Promise<unknown>, failMessage: string, conflictMessage?: string) => {
    setBusy(true);
    setError(null);
    try {
      await op();
      setManualNumber('');
      await loadAgents();
      void loadOrphans();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(conflictMessage ?? t.adminWaNumberConflict);
      else setError(err instanceof ApiError ? err.message : failMessage);
    } finally {
      setBusy(false);
    }
  };

  const saveAgentEmail = () =>
    run(
      () => api.adminSetAgentEmail(instance!.id, emailLocalPart.trim()),
      t.adminAgentEmailSaveFailed,
      t.adminAgentEmailConflict,
    );

  const toggleEnabled = async () => {
    if (!userId) return;
    const enable = !(instance?.enabled ?? false);
    // Email-capable agents activate through the modal: it explains the
    // implications and (on first activation) collects the mandatory address.
    if (enable && emailCapable) {
      setActivating(true);
      return;
    }
    await run(
      () => (enable ? api.adminEnableAgent(userId, agentType) : api.adminDisableAgent(userId, agentType)),
      t.adminAgentsUpdateFailed,
    );
  };

  const activate = (chosenLocalPart: string | null) => {
    if (!userId) return;
    void run(
      () => api.adminEnableAgent(userId, agentType, chosenLocalPart ?? undefined),
      t.adminAgentsUpdateFailed,
      t.adminAgentEmailConflict,
    );
  };

  const breadcrumbs = (
    <nav className="breadcrumbs" aria-label={t.accountantsLabel}>
      <button className="breadcrumb-link" onClick={onBackToList}>
        {t.accountantsLabel}
      </button>
      <span className="breadcrumb-sep">/</span>
      <button className="breadcrumb-link" onClick={onBackToAccountant}>
        {row ? (row.name ?? row.email) : '…'}
      </button>
      <span className="breadcrumb-sep">/</span>
      <span className="breadcrumb-current">{instance?.name ?? t[ui.nameKey]}</span>
    </nav>
  );

  if (!row || !row.user) {
    return (
      <>
        {breadcrumbs}
        <section className="card">
          <p className="muted">{t.adminAccountantNotFound}</p>
          <button className="btn btn-ghost" onClick={onBackToList}>
            {t.adminBackToList}
          </button>
        </section>
      </>
    );
  }

  return (
    <>
      {breadcrumbs}
      {error && <div className="error-banner">{error}</div>}

      <section className="card">
        <div className="card-header">
          <div className="card-title-row">
            <h2>{instance?.name ?? t[ui.nameKey]}</h2>
            {instance?.enabled && <span className="badge badge-success">{t.activeBadge}</span>}
          </div>
          {agentInfo && (
            <button className="btn btn-ghost btn-small" disabled={busy} onClick={toggleEnabled}>
              {instance?.enabled ? t.adminAgentDisable : t.adminAgentEnable}
            </button>
          )}
        </div>
        <p className="muted">{t[ui.descriptionKey]}</p>
        {agentInfo && !instance && (
          <p className="muted">
            {t.adminAgentNotInstantiated}
            {emailCapable ? ` ${t.adminAgentNotInstantiatedEmail}` : ''}
          </p>
        )}
        {!agentInfo && <p className="muted">{t.loading}</p>}
      </section>

      {instance && instance.emailCapable && (
        <section className="card">
          <div className="settings-section">
            <h3>{t.adminAgentEmailTitle}</h3>
            <p className="muted">{t.adminAgentEmailDesc}</p>

            {instance.emailAddress && (
              <div className="wa-number-display" dir="ltr">
                {instance.emailAddress}
              </div>
            )}

            <div className="wa-action-row">
              <span className="doc-text">
                <span className="doc-name">
                  {instance.emailAddress ? t.adminAgentEmailChange : t.adminAgentEmailAssign}
                </span>
                <span className="doc-desc muted">
                  {instance.emailAddress ? t.adminAgentEmailChangeDesc : t.adminAgentEmailAssignDesc}
                </span>
              </span>
              <span className="wa-manual-entry" dir="ltr">
                <input
                  dir="ltr"
                  aria-label={t.adminAgentEmailTitle}
                  placeholder={instance.suggestedEmailLocalPart ?? ''}
                  value={emailLocalPart}
                  disabled={busy}
                  onChange={(e) => setEmailLocalPart(e.target.value)}
                />
                <span className="muted">@{agentInfo?.emailDomain}</span>
                <button
                  className="btn btn-ghost btn-small"
                  disabled={
                    busy ||
                    !emailLocalPart.trim() ||
                    `${emailLocalPart.trim().toLowerCase()}@${agentInfo?.emailDomain}` === instance.emailAddress
                  }
                  onClick={() => (instance.emailAddress ? setConfirmingEmailChange(true) : setConfirmingEmailAssign(true))}
                >
                  {t.adminAgentEmailSave}
                </button>
              </span>
            </div>
          </div>
        </section>
      )}

      {instance && (
        <section className="card">
          <div className="settings-section">
            <h3>{t.agentWhatsApp}</h3>
            <p className="muted">{t.agentWhatsAppDesc}</p>

            {instance.waPhoneNumber ? (
              <>
                <div className="wa-number-display" dir="ltr">
                  {instance.waPhoneNumber}
                </div>
                <div className="wa-action-row">
                  <span className="doc-text">
                    <span className="doc-name">{t.adminWaDetachAction}</span>
                    <span className="doc-desc muted">{t.adminWaDetachDesc}</span>
                  </span>
                  <button
                    className="btn btn-ghost btn-small"
                    disabled={busy}
                    onClick={() => run(() => api.adminDeleteWaSender(instance.id), t.adminWaNumberSaveFailed)}
                  >
                    {t.adminWaDetachAction}
                  </button>
                </div>
                <div className="wa-action-row danger">
                  <span className="doc-text">
                    <span className="doc-name">{t.adminWaNumberRelease}</span>
                    <span className="doc-desc muted">{t.adminWaNumberReleaseTitle}</span>
                  </span>
                  <button
                    className="btn btn-ghost btn-small danger-action"
                    disabled={busy}
                    onClick={() => setConfirmingRelease(true)}
                  >
                    {releasing ? t.adminWaNumberReleasing : t.adminWaNumberRelease}
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="muted">{t.adminWaAssignLead}</p>
                {orphansError && <div className="error-banner">{orphansError}</div>}

                <div className="wa-action-row">
                  <span className="doc-text">
                    <span className="doc-name">{t.adminWaPoolButton}</span>
                    <span className="doc-desc muted">
                      {orphans === null
                        ? t.loading
                        : orphans.length === 0
                          ? t.adminWaOptionPoolEmpty
                          : t.adminWaOptionPoolDesc(orphans.length)}
                    </span>
                  </span>
                  <button
                    className="btn btn-ghost btn-small"
                    disabled={busy || orphans?.length === 0}
                    onClick={() => setPoolPicking(true)}
                  >
                    {t.adminWaPoolSelect}
                  </button>
                </div>

                <div className="wa-action-row">
                  <span className="doc-text">
                    <span className="doc-name">{t.adminWaNumberBuy}</span>
                    <span className="doc-desc muted">{t.adminWaOptionBuyDesc}</span>
                  </span>
                  <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => setConfirmingBuy(true)}>
                    {buying ? t.adminWaNumberBuying : t.adminWaNumberBuy}
                  </button>
                </div>

                <div className="wa-action-row">
                  <span className="doc-text">
                    <span className="doc-name">{t.adminWaOptionManualTitle}</span>
                    <span className="doc-desc muted">{t.adminWaOptionManualDesc}</span>
                  </span>
                  <span className="wa-manual-entry">
                    <input
                      dir="ltr"
                      aria-label={t.adminWaNumberLabel}
                      placeholder="+15551234567"
                      value={manualNumber}
                      disabled={busy}
                      onChange={(e) => setManualNumber(e.target.value)}
                    />
                    <button
                      className="btn btn-ghost btn-small"
                      disabled={busy || !manualNumber.trim()}
                      onClick={() =>
                        run(() => api.adminSetWaSender(instance.id, manualNumber.trim()), t.adminWaNumberSaveFailed)
                      }
                    >
                      {t.adminWaNumberSave}
                    </button>
                  </span>
                </div>
              </>
            )}
          </div>
        </section>
      )}

      {poolPicking && instance && (
        <WaPoolModal
          numbers={orphans}
          error={orphansError}
          onSelect={(phoneNumber) => {
            setPoolPicking(false);
            void run(() => api.adminSetWaSender(instance.id, phoneNumber), t.adminWaNumberSaveFailed);
          }}
          onClose={() => setPoolPicking(false)}
        />
      )}

      {activating && userId && (
        <ActivateAgentModal
          agentName={instance?.name ?? t[ui.nameKey]}
          existingEmail={instance?.emailAddress ?? null}
          suggestedLocalPart={suggestedLocalPart}
          emailDomain={agentInfo?.emailDomain ?? ''}
          onConfirm={activate}
          onClose={() => setActivating(false)}
        />
      )}

      {confirmingEmailAssign && instance && (
        <ConfirmModal
          title={t.adminAgentEmailAssign}
          note={t.adminAgentEmailAssignConfirm(`${emailLocalPart.trim().toLowerCase()}@${agentInfo?.emailDomain}`)}
          confirmLabel={t.adminAgentEmailSave}
          onConfirm={() => {
            setConfirmingEmailAssign(false);
            void saveAgentEmail();
          }}
          onClose={() => setConfirmingEmailAssign(false)}
        />
      )}

      {confirmingEmailChange && instance?.emailAddress && (
        <ConfirmModal
          title={t.adminAgentEmailChange}
          note={t.adminAgentEmailChangeConfirm(instance.emailAddress)}
          confirmLabel={t.adminAgentEmailChange}
          danger
          onConfirm={() => {
            setConfirmingEmailChange(false);
            void saveAgentEmail();
          }}
          onClose={() => setConfirmingEmailChange(false)}
        />
      )}

      {confirmingBuy && instance && (
        <ConfirmModal
          title={t.adminWaNumberBuy}
          note={t.adminWaNumberBuyConfirm}
          confirmLabel={t.adminWaNumberBuy}
          onConfirm={() => {
            setBuying(true);
            void run(() => api.adminProvisionWaSender(instance.id), t.adminWaNumberBuyFailed).finally(() =>
              setBuying(false),
            );
          }}
          onClose={() => setConfirmingBuy(false)}
        />
      )}

      {confirmingRelease && instance?.waPhoneNumber && (
        <ConfirmModal
          title={t.adminWaNumberRelease}
          note={t.adminWaNumberReleaseConfirm(instance.waPhoneNumber)}
          confirmLabel={t.adminWaNumberRelease}
          danger
          onConfirm={() => {
            setReleasing(true);
            void run(() => api.adminReleaseWaSender(instance.id), t.adminWaNumberReleaseFailed).finally(() =>
              setReleasing(false),
            );
          }}
          onClose={() => setConfirmingRelease(false)}
        />
      )}
    </>
  );
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, ApiError, type AgentInstance, type OrphanedWaNumber } from '../../api';
import { getAgentUI } from '../../agents/registry';
import { useT } from '../../i18n';
import { ConfirmModal } from '../ConfirmModal';
import { WaPoolModal } from '../WaPoolModal';
import type { AccountantRow } from './shared';

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
  const [agentInfo, setAgentInfo] = useState<{ agents: AgentInstance[]; availableTypes: string[] } | null>(null);
  const loadAgents = useCallback(async () => {
    if (!userId) return;
    setAgentInfo(await api.adminListAccountantAgents(userId));
  }, [userId]);
  useEffect(() => {
    setAgentInfo(null);
    loadAgents().catch(() => {});
  }, [loadAgents]);

  const instance = useMemo(() => agentInfo?.agents.find((a) => a.agentType === agentType) ?? null, [agentInfo, agentType]);

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

  const run = async (op: () => Promise<unknown>, failMessage: string) => {
    setBusy(true);
    setError(null);
    try {
      await op();
      setManualNumber('');
      await loadAgents();
      void loadOrphans();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) setError(t.adminWaNumberConflict);
      else setError(err instanceof ApiError ? err.message : failMessage);
    } finally {
      setBusy(false);
    }
  };

  const toggleEnabled = async () => {
    if (!userId) return;
    const enable = !(instance?.enabled ?? false);
    await run(
      () => (enable ? api.adminEnableAgent(userId, agentType) : api.adminDisableAgent(userId, agentType)),
      t.adminAgentsUpdateFailed,
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
        {agentInfo && !instance && <p className="muted">{t.adminAgentNotInstantiated}</p>}
        {!agentInfo && <p className="muted">{t.loading}</p>}
      </section>

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

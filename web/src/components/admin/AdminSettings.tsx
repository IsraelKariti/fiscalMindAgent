import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  LLM_CALL_PURPOSES,
  type AdminUser,
  type AppLogoState,
  type CacheTtl,
  type GeminiModelState,
  type KillSwitchState,
  type LlmOutageState,
  type LlmBudgetState,
  type MessageTimingState,
  type LlmCallPurpose,
  type OrphanedWaNumber,
} from '../../api';
import { formatTimestamp, humanizePurpose } from '../../format';
import { useT } from '../../i18n';
import { HeldProviderChip } from './OutageBar';
import { ConfirmModal } from '../ConfirmModal';
import { Spinner } from '../Spinner';
import { MODEL_LABELS, providerOfModel } from './shared';
import { PictureCard } from './PictureCard';

interface Props {
  /** The signed-in admin's email — their own row hides its remove button. */
  userEmail: string | null;
}

/** Platform settings: admin access, the emergency kill switch, the global LLM model and the orphaned Twilio number pool. */
export function AdminSettings({ userEmail }: Props) {
  const { t } = useT();

  // Org-wide emergency stop: silences every agent at once (inbound, queued
  // sends, document fetches, daily scans) until switched back on.
  const [killSwitch, setKillSwitch] = useState<KillSwitchState | null>(null);
  const [killNotice, setKillNotice] = useState<'load_failed' | 'save_failed' | null>(null);
  const [killSaving, setKillSaving] = useState(false);
  const [killConfirmOpen, setKillConfirmOpen] = useState(false);

  useEffect(() => {
    api.adminGetKillSwitch().then(setKillSwitch).catch(() => setKillNotice('load_failed'));
  }, []);

  const changeKillSwitch = async (on: boolean) => {
    setKillSaving(true);
    setKillNotice(null);
    try {
      setKillSwitch(await api.adminSetKillSwitch(on));
    } catch {
      setKillNotice('save_failed');
    } finally {
      setKillSaving(false);
    }
  };

  const [modelState, setModelState] = useState<GeminiModelState | null>(null);
  // The open provider outage holds (openspec `llm-provider-outage`): a chip next to a held provider's models.
  const [outage, setOutage] = useState<LlmOutageState | null>(null);
  useEffect(() => {
    api.adminGetLlmOutage().then(setOutage).catch(() => {});
  }, []);
  // A refused save keeps the server's message (e.g. "backup must be from a
  // different provider"), so the admin reads why; the pickers stay on the
  // saved state because the state is only replaced by a successful answer.
  const [modelNotice, setModelNotice] = useState<'saved' | 'load_failed' | { error: string } | null>(null);
  const [modelSaving, setModelSaving] = useState(false);
  const modelNoticeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.adminGetModel().then(setModelState).catch(() => setModelNotice('load_failed'));
    return () => clearTimeout(modelNoticeTimer.current);
  }, []);

  const saveModelSetting = async (save: () => Promise<GeminiModelState>) => {
    setModelSaving(true);
    setModelNotice(null);
    if (modelNoticeTimer.current) clearTimeout(modelNoticeTimer.current);
    try {
      setModelState(await save());
      setModelNotice('saved');
      modelNoticeTimer.current = setTimeout(() => setModelNotice(null), 3000);
    } catch (err) {
      const message = err instanceof ApiError && err.status === 400 ? err.message : t.llmModelSaveFailed;
      setModelNotice({ error: message.includes('different provider') ? t.llmBackupSameProvider : message });
    } finally {
      setModelSaving(false);
    }
  };

  const changePurposeModel = (purpose: LlmCallPurpose, model: string) =>
    saveModelSetting(() => api.adminSetPurposeModel(purpose, model));

  /** The backup model of one stage (openspec `llm-model-settings`); '' clears it. */
  const changePurposeBackup = (purpose: LlmCallPurpose, model: string) =>
    saveModelSetting(() => api.adminSetPurposeBackupModel(purpose, model === '' ? null : model));

  /** The Anthropic prompt-cache lifetime, one value for every stage (openspec `llm-model-settings`). */
  const changeCacheTtl = (cacheTtl: CacheTtl) => saveModelSetting(() => api.adminSetCacheTtl(cacheTtl));

  /** The model a stage actually runs on: its own pick, else the global model. */
  const effectiveModel = (state: GeminiModelState, purpose: LlmCallPurpose) => state.purposes[purpose] ?? state.model;

  // The LLM spend cap: daily USD ceilings, platform-wide and per agent instance.
  const [budget, setBudget] = useState<LlmBudgetState | null>(null);
  const [budgetDraft, setBudgetDraft] = useState<{ platform: string; instance: string }>({ platform: '', instance: '' });
  const [budgetNotice, setBudgetNotice] = useState<'saved' | 'load_failed' | 'save_failed' | null>(null);
  const [budgetSaving, setBudgetSaving] = useState(false);

  useEffect(() => {
    api
      .adminGetLlmBudget()
      .then((b) => {
        setBudget(b);
        setBudgetDraft({ platform: String(b.platformDailyUsd), instance: String(b.instanceDailyUsd) });
      })
      .catch(() => setBudgetNotice('load_failed'));
  }, []);

  // Message timing (openspec `admin-timing-settings`): three waits in seconds,
  // same shape as the budget section; a refused save shows the server's reason
  // and puts the inputs back on the saved values.
  const [timing, setTiming] = useState<MessageTimingState | null>(null);
  const [timingDraft, setTimingDraft] = useState<{ quiet: string; maxWait: string; afterSend: string }>({ quiet: '', maxWait: '', afterSend: '' });
  const [timingNotice, setTimingNotice] = useState<'saved' | 'load_failed' | 'save_failed' | null>(null);
  const [timingError, setTimingError] = useState<string | null>(null);
  const [timingSaving, setTimingSaving] = useState(false);
  const timingToDraft = (v: MessageTimingState) => ({ quiet: String(v.quietSeconds), maxWait: String(v.maxWaitSeconds), afterSend: String(v.afterSendDelaySeconds) });

  useEffect(() => {
    api
      .adminGetMessageTiming()
      .then((v) => {
        setTiming(v);
        setTimingDraft(timingToDraft(v));
      })
      .catch(() => setTimingNotice('load_failed'));
  }, []);

  const saveTiming = async () => {
    const next = { quietSeconds: Number(timingDraft.quiet), maxWaitSeconds: Number(timingDraft.maxWait), afterSendDelaySeconds: Number(timingDraft.afterSend) };
    setTimingSaving(true);
    setTimingNotice(null);
    setTimingError(null);
    try {
      const saved = await api.adminSetMessageTiming(next);
      setTiming(saved);
      setTimingDraft(timingToDraft(saved));
      setTimingNotice('saved');
    } catch (err) {
      setTimingNotice('save_failed');
      setTimingError(err instanceof ApiError ? err.message : null);
      if (timing) setTimingDraft(timingToDraft(timing));
    } finally {
      setTimingSaving(false);
    }
  };

  const saveBudget = async () => {
    const platformDailyUsd = Number(budgetDraft.platform);
    const instanceDailyUsd = Number(budgetDraft.instance);
    if (!Number.isFinite(platformDailyUsd) || !Number.isFinite(instanceDailyUsd) || platformDailyUsd < 0 || instanceDailyUsd < 0) {
      setBudgetNotice('save_failed');
      return;
    }
    setBudgetSaving(true);
    setBudgetNotice(null);
    try {
      setBudget(await api.adminSetLlmBudget({ platformDailyUsd, instanceDailyUsd }));
      setBudgetNotice('saved');
    } catch {
      setBudgetNotice('save_failed');
    } finally {
      setBudgetSaving(false);
    }
  };

  // Twilio-owned numbers not assigned to any agent (still billed monthly).
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
    void loadOrphans();
  }, [loadOrphans]);

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

  // The app logo: the default WhatsApp picture of every agent without an own
  // icon. A change is pushed to those senders by the server in the same call.
  const [appLogo, setAppLogo] = useState<AppLogoState | null>(null);
  const [appLogoBusy, setAppLogoBusy] = useState(false);
  const [appLogoNotice, setAppLogoNotice] = useState<{ kind: 'error' | 'info'; text: string } | null>(null);

  useEffect(() => {
    api
      .adminGetAppLogo()
      .then(setAppLogo)
      .catch(() => setAppLogoNotice({ kind: 'error', text: t.appLogoLoadFailed }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const changeAppLogo = async (op: () => Promise<AppLogoState>) => {
    setAppLogoBusy(true);
    setAppLogoNotice(null);
    try {
      const next = await op();
      setAppLogo(next);
      setAppLogoNotice({ kind: 'info', text: t.appLogoSendersResult(next.sendersUpdated ?? 0, next.sendersFailed ?? 0) });
    } catch (err) {
      setAppLogoNotice({ kind: 'error', text: err instanceof ApiError ? err.message : t.appLogoSaveFailed });
    } finally {
      setAppLogoBusy(false);
    }
  };

  // Admin access is DB-managed (users.is_admin) and edited only here; every
  // grant/revoke goes through the audited admin API.
  const [admins, setAdmins] = useState<AdminUser[] | null>(null);
  const [adminsError, setAdminsError] = useState<string | null>(null);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminRemoveConfirm, setAdminRemoveConfirm] = useState<AdminUser | null>(null);

  const loadAdmins = useCallback(async () => {
    setAdmins(null);
    setAdminsError(null);
    try {
      setAdmins((await api.adminListAdmins()).admins);
    } catch (err) {
      setAdmins([]);
      setAdminsError(err instanceof ApiError ? err.message : t.adminAdminsLoadFailed);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void loadAdmins();
  }, [loadAdmins]);

  const grantAdmin = async () => {
    const email = adminEmail.trim();
    if (!email) return;
    setAdminSaving(true);
    setAdminsError(null);
    try {
      await api.adminGrantAdmin(email);
      setAdminEmail('');
      setAdmins((await api.adminListAdmins()).admins);
    } catch (err) {
      setAdminsError(err instanceof ApiError ? err.message : t.adminAdminsAddFailed);
    } finally {
      setAdminSaving(false);
    }
  };

  const revokeAdmin = async (admin: AdminUser) => {
    setAdminSaving(true);
    setAdminsError(null);
    try {
      await api.adminRevokeAdmin(admin.id);
      setAdmins((await api.adminListAdmins()).admins);
    } catch (err) {
      setAdminsError(err instanceof ApiError ? err.message : t.adminAdminsRemoveFailed);
    } finally {
      setAdminSaving(false);
    }
  };

  return (
    <section className="card">
      <div className="settings-section">
        <h3>{t.adminAdminsTitle}</h3>
        <p className="muted">{t.adminAdminsDesc}</p>
        {adminsError && <div className="error-banner">{adminsError}</div>}
        {admins === null ? (
          <p className="muted">{t.loading}</p>
        ) : (
          <ul className="doc-list">
            {admins.map((a) => {
              const isSelf = userEmail !== null && a.email.toLowerCase() === userEmail.toLowerCase();
              return (
                <li key={a.id} className="doc-row">
                  <span className="doc-text">
                    <span className="doc-name" dir="ltr">
                      {a.email}
                    </span>
                    <span className="doc-desc muted">
                      {isSelf ? `${t.adminAdminsYou} · ` : a.name ? `${a.name} · ` : ''}
                      {formatTimestamp(a.createdAt)}
                    </span>
                  </span>
                  {!isSelf && (
                    <button
                      className="btn btn-ghost btn-small"
                      disabled={adminSaving}
                      onClick={() => setAdminRemoveConfirm(a)}
                    >
                      {t.adminAdminsRemove}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="model-picker" dir="ltr">
          <input
            type="email"
            value={adminEmail}
            placeholder={t.adminAdminsEmailPlaceholder}
            disabled={adminSaving}
            aria-label={t.adminAdminsEmailPlaceholder}
            onChange={(e) => setAdminEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void grantAdmin();
            }}
          />
          <button className="btn btn-small" disabled={adminSaving || !adminEmail.trim()} onClick={() => void grantAdmin()}>
            {adminSaving ? t.saving : t.adminAdminsAdd}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t.killSwitchTitle}</h3>
        <p className="muted">{t.killSwitchDesc}</p>
        {killNotice === 'load_failed' && <div className="error-banner">{t.killSwitchLoadFailed}</div>}
        {killSwitch && (
          <>
            {killSwitch.on ? (
              <div className="error-banner">
                {t.killSwitchOnBanner}
                {killSwitch.updatedAt && <> ({formatTimestamp(killSwitch.updatedAt)})</>}
              </div>
            ) : (
              <p className="muted">{t.killSwitchOffStatus}</p>
            )}
            <button
              className={`btn ${killSwitch.on ? 'btn-primary' : 'btn-danger'}`}
              disabled={killSaving}
              onClick={() => (killSwitch.on ? changeKillSwitch(false) : setKillConfirmOpen(true))}
            >
              {killSaving ? t.saving : killSwitch.on ? t.killSwitchTurnOff : t.killSwitchTurnOn}
            </button>
            {killNotice === 'save_failed' && <div className="error-banner">{t.killSwitchSaveFailed}</div>}
          </>
        )}
      </div>

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
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 12 }}>
              {LLM_CALL_PURPOSES.map((purpose) => {
                const primary = effectiveModel(modelState, purpose);
                const primaryProvider = providerOfModel(primary);
                const backup = modelState.backups[purpose] ?? '';
                const stageLabel = t.llmPurposeLabels[purpose] ?? humanizePurpose(purpose);
                return (
                  <div key={purpose} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span>
                        {stageLabel} <HeldProviderChip provider={primaryProvider} holds={outage?.holds ?? null} />
                      </span>
                      <div className="model-picker model-picker--fill" dir="ltr">
                        <select
                          value={primary}
                          disabled={modelSaving}
                          aria-label={stageLabel}
                          onChange={(e) => changePurposeModel(purpose, e.target.value)}
                        >
                          {/* The env-default model may predate the options list; keep it selectable. */}
                          {!modelState.options.includes(primary) && <option value={primary}>{primary}</option>}
                          {modelState.options.map((m) => (
                            <option key={m} value={m}>
                              {MODEL_LABELS[m] ?? m}
                            </option>
                          ))}
                        </select>
                      </div>
                    </label>
                    {/* The backup takes the call when the primary does not answer; only other providers are offered (openspec `llm-model-settings`). */}
                    <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <span className="muted" style={{ fontSize: '0.85em' }}>{t.llmBackupLabel}</span>
                      <div className="model-picker model-picker--fill" dir="ltr">
                        <select
                          value={backup}
                          disabled={modelSaving}
                          aria-label={`${stageLabel} — ${t.llmBackupLabel}`}
                          onChange={(e) => changePurposeBackup(purpose, e.target.value)}
                        >
                          <option value="">{t.llmBackupNone}</option>
                          {modelState.options
                            .filter((m) => providerOfModel(m) !== primaryProvider)
                            .map((m) => (
                              <option key={m} value={m}>
                                {MODEL_LABELS[m] ?? m}
                              </option>
                            ))}
                        </select>
                      </div>
                    </label>
                  </div>
                );
              })}
            </div>
            {/* How long Anthropic keeps the cached start of a prompt; shown only when Anthropic can be called. */}
            {modelState.anthropicAvailable && (
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 12, maxWidth: 420 }}>
                <span>{t.llmCacheTtlLabel}</span>
                <div className="model-picker model-picker--fill">
                  <select
                    value={modelState.cacheTtl}
                    disabled={modelSaving}
                    aria-label={t.llmCacheTtlLabel}
                    onChange={(e) => changeCacheTtl(e.target.value as CacheTtl)}
                  >
                    <option value="5m">{t.cacheTtl5m}</option>
                    <option value="1h">{t.cacheTtl1h}</option>
                  </select>
                </div>
                <span className="muted" style={{ fontSize: '0.85em' }}>{t.llmCacheTtlDesc}</span>
              </label>
            )}
            {modelSaving && <span className="muted">{t.saving}</span>}
            {modelNotice === 'saved' && <div className="ok-banner">{t.llmModelSaved}</div>}
            {modelNotice !== null && typeof modelNotice === 'object' && <div className="error-banner">{modelNotice.error}</div>}
          </>
        )}
      </div>

      <div className="settings-section">
        <h3>{t.llmBudgetTitle}</h3>
        <p className="muted">{t.llmBudgetDesc}</p>
        {budgetNotice === 'load_failed' && !budget ? (
          <div className="error-banner">{t.llmBudgetLoadFailed}</div>
        ) : !budget ? (
          <p className="muted">{t.loading}</p>
        ) : (
          <>
            <p className="muted">{t.llmBudgetSpentToday(budget.spentTodayUsd, budget.platformDailyUsd)}</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>{t.llmBudgetPlatformLabel}</span>
                <input
                  id="llm-budget-platform"
                  type="number"
                  min={0}
                  step={1}
                  dir="ltr"
                  value={budgetDraft.platform}
                  disabled={budgetSaving}
                  onChange={(e) => setBudgetDraft((d) => ({ ...d, platform: e.target.value }))}
                />
              </label>
              <label style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span>{t.llmBudgetInstanceLabel}</span>
                <input
                  id="llm-budget-instance"
                  type="number"
                  min={0}
                  step={1}
                  dir="ltr"
                  value={budgetDraft.instance}
                  disabled={budgetSaving}
                  onChange={(e) => setBudgetDraft((d) => ({ ...d, instance: e.target.value }))}
                />
              </label>
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-primary" disabled={budgetSaving} onClick={() => void saveBudget()}>
                {budgetSaving ? t.saving : t.save}
              </button>
            </div>
            {budgetNotice === 'saved' && <div className="ok-banner">{t.llmBudgetSaved}</div>}
            {budgetNotice === 'save_failed' && <div className="error-banner">{t.llmBudgetSaveFailed}</div>}
          </>
        )}
      </div>

      <div className="settings-section">
        <h3>{t.messageTimingTitle}</h3>
        <p className="muted">{t.messageTimingDesc}</p>
        {timingNotice === 'load_failed' && !timing ? (
          <div className="error-banner">{t.messageTimingLoadFailed}</div>
        ) : !timing ? (
          <p className="muted">{t.loading}</p>
        ) : (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
              {(
                [
                  ['quiet', 'message-timing-quiet', t.messageTimingQuietLabel, 1],
                  ['maxWait', 'message-timing-max-wait', t.messageTimingMaxWaitLabel, 1],
                  ['afterSend', 'message-timing-after-send', t.messageTimingAfterSendLabel, 0],
                ] as const
              ).map(([key, id, label, min]) => (
                <label key={key} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span>{label}</span>
                  <input
                    id={id}
                    type="number"
                    min={min}
                    step={1}
                    dir="ltr"
                    value={timingDraft[key]}
                    disabled={timingSaving}
                    onChange={(e) => setTimingDraft((d) => ({ ...d, [key]: e.target.value }))}
                  />
                </label>
              ))}
            </div>
            <div style={{ marginTop: 8 }}>
              <button className="btn btn-primary" disabled={timingSaving} onClick={() => void saveTiming()}>
                {timingSaving ? t.saving : t.save}
              </button>
            </div>
            {timingNotice === 'saved' && <div className="ok-banner">{t.messageTimingSaved}</div>}
            {timingNotice === 'save_failed' && (
              <div className="error-banner">{timingError ? `${t.messageTimingSaveFailed} ${timingError}` : t.messageTimingSaveFailed}</div>
            )}
          </>
        )}
      </div>

      {appLogo && (
        <PictureCard
          title={t.appLogoTitle}
          description={t.appLogoDesc}
          pictureUrl={appLogo.logoUrl ?? appLogo.defaultLogoUrl}
          levelLabel={appLogo.logoUrl ? t.appLogoLevelOwn : t.appLogoLevelDefault}
          hasOwn={appLogo.logoUrl !== null}
          busy={appLogoBusy}
          onUpload={(file) => void changeAppLogo(() => api.adminUploadAppLogo(file))}
          onRemove={() => void changeAppLogo(() => api.adminDeleteAppLogo())}
          notice={appLogoNotice}
        />
      )}
      {!appLogo && appLogoNotice && <div className="error-banner">{appLogoNotice.text}</div>}

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
              <li key={n.phoneNumber} className={n.claimedElsewhere ? 'doc-row doc-row-disabled' : 'doc-row'}>
                <span className="doc-text">
                  <span className="doc-name" dir="ltr">
                    {n.phoneNumber}
                  </span>
                  <span className="doc-desc muted">
                    {n.friendlyName && n.friendlyName !== n.phoneNumber ? `${n.friendlyName} · ` : ''}
                    {formatTimestamp(n.dateCreated)}
                  </span>
                </span>
                {n.claimedElsewhere ? (
                  <span className="muted">{t.adminWaNumberClaimedElsewhere}</span>
                ) : (
                  <button
                    className="btn btn-ghost btn-small"
                    disabled={orphanReleasing !== null}
                    title={t.adminWaNumberReleaseTitle}
                    onClick={() => setOrphanReleaseConfirm(n.phoneNumber)}
                  >
                    {orphanReleasing === n.phoneNumber ? (
                      <>
                        <Spinner />
                        {t.adminWaNumberReleasing}
                      </>
                    ) : (
                      t.adminWaNumberRelease
                    )}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {adminRemoveConfirm && (
        <ConfirmModal
          title={t.adminAdminsRemove}
          note={t.adminAdminsRemoveConfirm(adminRemoveConfirm.email)}
          confirmLabel={t.adminAdminsRemove}
          danger
          onConfirm={() => revokeAdmin(adminRemoveConfirm)}
          onClose={() => setAdminRemoveConfirm(null)}
        />
      )}

      {killConfirmOpen && (
        <ConfirmModal
          title={t.killSwitchTurnOn}
          note={t.killSwitchConfirmOn}
          confirmLabel={t.killSwitchTurnOn}
          danger
          onConfirm={() => changeKillSwitch(true)}
          onClose={() => setKillConfirmOpen(false)}
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
    </section>
  );
}

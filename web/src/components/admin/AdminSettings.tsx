import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type AdminUser, type GeminiModelState, type KillSwitchState, type OrphanedWaNumber } from '../../api';
import { formatTimestamp } from '../../format';
import { useT } from '../../i18n';
import { ConfirmModal } from '../ConfirmModal';
import { Spinner } from '../Spinner';
import { MODEL_LABELS } from './shared';

interface Props {
  /** The signed-in admin's email — their own row hides its remove button. */
  userEmail: string | null;
}

/** Platform settings: admin access, the emergency kill switch, the global Gemini model and the orphaned Twilio number pool. */
export function AdminSettings({ userEmail }: Props) {
  const { t } = useT();

  // Org-wide emergency stop: silences every agent at once (inbound, queued
  // sends, tax fetches, daily scans) until switched back on.
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
  const [modelNotice, setModelNotice] = useState<'saved' | 'load_failed' | 'save_failed' | null>(null);
  const [modelSaving, setModelSaving] = useState(false);
  const modelNoticeTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    api.adminGetModel().then(setModelState).catch(() => setModelNotice('load_failed'));
    return () => clearTimeout(modelNoticeTimer.current);
  }, []);

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
                  {orphanReleasing === n.phoneNumber ? (
                    <>
                      <Spinner />
                      {t.adminWaNumberReleasing}
                    </>
                  ) : (
                    t.adminWaNumberRelease
                  )}
                </button>
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

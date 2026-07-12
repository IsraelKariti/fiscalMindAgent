import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, type GeminiModelState, type OrphanedWaNumber } from '../../api';
import { formatTimestamp } from '../../format';
import { useT } from '../../i18n';
import { ConfirmModal } from '../ConfirmModal';
import { MODEL_LABELS } from './shared';

/** Platform settings: the global Gemini model and the orphaned Twilio number pool. */
export function AdminSettings() {
  const { t } = useT();

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

  return (
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

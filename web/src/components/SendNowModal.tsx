import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, type MessageChannel } from '../api';
import { useT } from '../i18n';

interface Props {
  /** The scheduled message's channel — the confirm copy names it. */
  channel: MessageChannel;
  /**
   * The draft awaits admin approval (openspec `review-wait-visibility`): the
   * modal explains that and offers no send. Decided from the page's data at
   * click time; a stale page learns it from the server's `awaiting_review`.
   */
  waitingForAdmin?: boolean;
  onSendNow: () => Promise<void>;
  onClose: () => void;
}

export function SendNowModal({ channel, waitingForAdmin = false, onSendNow, onClose }: Props) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(waitingForAdmin);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSendNow();
      onClose();
    } catch (err) {
      if (err instanceof ApiError && err.code === 'awaiting_review') {
        // The page was stale: the draft went into review after it loaded.
        setWaiting(true);
      } else {
        setError(err instanceof ApiError ? err.message : t.sendNowFailed);
      }
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        {waiting ? (
          <>
            <h2>{t.sendNowWaitingTitle}</h2>
            <p>{t.sendNowWaitingBody}</p>
            <div className="btn-row modal-actions">
              <button className="btn btn-primary" type="button" onClick={onClose} autoFocus>
                {t.close}
              </button>
            </div>
          </>
        ) : (
          <>
            <h2>{t.sendNowConfirm(channel)}</h2>
            {error && <div className="error-banner">{error}</div>}
            <div className="btn-row modal-actions">
              <button className="btn btn-ghost" type="button" onClick={onClose} disabled={busy}>
                {t.cancel}
              </button>
              <button className="btn btn-primary" type="button" onClick={confirm} disabled={busy} autoFocus>
                {busy ? t.sendingNow : t.sendNow}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { ApiError, type MessageChannel } from '../api';
import { useT } from '../i18n';

interface Props {
  /** The scheduled message's channel — the confirm copy names it. */
  channel: MessageChannel;
  onSendNow: () => Promise<void>;
  onClose: () => void;
}

export function SendNowModal({ channel, onSendNow, onClose }: Props) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onSendNow();
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.sendNowFailed);
      setBusy(false);
    }
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
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
      </div>
    </div>,
    document.body,
  );
}

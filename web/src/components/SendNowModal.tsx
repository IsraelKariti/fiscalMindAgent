import { useState } from 'react';
import { ApiError } from '../api';
import { formatTimestamp } from '../format';
import { useT } from '../i18n';

interface Props {
  scheduledFor: string;
  onSendNow: () => Promise<void>;
  onClose: () => void;
}

export function SendNowModal({ scheduledFor, onSendNow, onClose }: Props) {
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{t.sendNowConfirm}</h2>
        <p className="muted">{t.willBeSentAt(formatTimestamp(scheduledFor))}</p>
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
    </div>
  );
}

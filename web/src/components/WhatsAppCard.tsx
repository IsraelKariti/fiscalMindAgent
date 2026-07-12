import { useState } from 'react';
import { ApiError, type Client } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { formatPhoneForDisplay, LOCALE } from '../format';
import { useT } from '../i18n';
import { ConfirmModal } from './ConfirmModal';
import { UpgradeModal } from './UpgradeModal';

interface Props {
  client: Client;
  onSaved: (client: Client) => Promise<void>;
  /** True on the Standard plan: the card stays visible but enabling opens the upgrade modal. */
  premiumLocked: boolean;
  contactEmail: string | null;
}

/**
 * Per-client WhatsApp opt-in. Enabling asserts the accountant obtained the
 * client's consent; the server records who enabled it and when, and lets the
 * agent start using the channel.
 */
export function WhatsAppCard({ client, onSaved, premiumLocked, contactEmail }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  // Prefill in local Israeli format; the server normalizes either form to E.164.
  const [phone, setPhone] = useState(formatPhoneForDisplay(client.wa_phone ?? client.phone ?? ''));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showUpgrade, setShowUpgrade] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const requestEnable = () => {
    // Turning the channel on is premium-only; turning it off always works.
    if (premiumLocked) {
      setShowUpgrade(true);
      return;
    }
    setShowConfirm(true);
  };

  const setEnabled = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    try {
      const { client: updated } = await api.setWhatsApp(client.id, enabled ? { enabled, phone } : { enabled });
      if (updated.wa_phone) setPhone(updated.wa_phone);
      await onSaved(updated);
    } catch (err) {
      // Server messages carry the actionable detail (no sender assigned,
      // invalid phone, number already used by another client).
      setError(err instanceof ApiError ? err.message : t.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>{t.waTitle}</h2>
          <p className="muted">{t.waDesc}</p>
        </div>
        <span className={`badge ${client.wa_enabled ? 'badge-success' : 'badge-pending'}`}>
          {client.wa_enabled ? t.waStatusOn : t.waStatusOff}
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {client.wa_enabled ? (
        <div className="btn-row">
          <span className="settings-mailbox-address" dir="ltr">
            {client.wa_phone && formatPhoneForDisplay(client.wa_phone)}
          </span>
          {client.wa_opted_in_at && (
            <span className="muted">{t.waOptedInOn(new Date(client.wa_opted_in_at).toLocaleDateString(LOCALE))}</span>
          )}
          <button className="btn btn-ghost" onClick={() => setEnabled(false)} disabled={busy}>
            {busy ? t.saving : t.waDisable}
          </button>
        </div>
      ) : (
        <div className="btn-row">
          <label className="field">
            <span>{t.waPhoneLabel}</span>
            <input
              dir="ltr"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder={t.waPhonePlaceholder}
            />
          </label>
          <button className="btn btn-primary" onClick={requestEnable} disabled={busy || !phone.trim()}>
            {busy ? t.saving : t.waEnable}
          </button>
        </div>
      )}
      {showConfirm && (
        <ConfirmModal
          title={t.waConfirmTitle(phone.replace(/[\s\-().]/g, ''))}
          note={
            <>
              {t.waConfirmNote} <strong>{t.waConfirmWarning}</strong>
            </>
          }
          confirmLabel={t.waEnable}
          warning
          onConfirm={() => setEnabled(true)}
          onClose={() => setShowConfirm(false)}
        />
      )}
      {showUpgrade && <UpgradeModal contactEmail={contactEmail} onClose={() => setShowUpgrade(false)} />}
    </section>
  );
}

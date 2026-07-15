import { useState } from 'react';
import { ApiError, type Client } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { LOCALE } from '../format';
import { useT } from '../i18n';

interface Props {
  client: Client;
  onSaved: (client: Client) => Promise<void>;
}

/**
 * Mute switch for inbound-only agents: muting disables the client's WhatsApp
 * channel, which the reply path checks before answering — inbound messages
 * still land in the timeline, the agent just stays silent. Unmuting re-enables
 * the channel with the client's stored number.
 */
export function MuteSenderCard({ client, onSaved }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const muted = !client.wa_enabled;

  const setMuted = async (mute: boolean) => {
    setBusy(true);
    setError(null);
    try {
      // enabled:true without a phone re-enables with the stored wa_phone.
      const { client: updated } = await api.setWhatsApp(client.id, { enabled: !mute });
      await onSaved(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.saveFailed);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="card">
      <div className="card-header">
        <div>
          <h2>{t.muteSenderTitle}</h2>
          <p className="muted">{t.muteSenderDesc}</p>
        </div>
        <span className={`badge ${muted ? 'badge-pending' : 'badge-success'}`}>
          {muted ? t.muteStatusMuted : t.muteStatusAnswering}
        </span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      <div className="btn-row">
        {muted && client.wa_opted_out_at && (
          <span className="muted">{t.muteMutedOn(new Date(client.wa_opted_out_at).toLocaleDateString(LOCALE))}</span>
        )}
        <button className={muted ? 'btn btn-primary' : 'btn btn-ghost'} onClick={() => setMuted(!muted)} disabled={busy}>
          {busy ? t.saving : muted ? t.unmuteSenderBtn : t.muteSenderBtn}
        </button>
      </div>
    </section>
  );
}

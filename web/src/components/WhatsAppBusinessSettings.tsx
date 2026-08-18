import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type WaBusinessStatus } from '../api';
import { useT } from '../i18n';
import { SettingsGroup, SettingsRow } from './SettingsUI';

/** Minimal slice of the Facebook JS SDK the Embedded Signup popup needs. */
interface FbSdk {
  init: (opts: { appId: string; autoLogAppEvents: boolean; xfbml: boolean; version: string }) => void;
  login: (
    cb: (response: { authResponse: unknown }) => void,
    opts: {
      config_id: string;
      response_type: string;
      override_default_response_type: boolean;
      extras: { sessionInfoVersion: string };
    },
  ) => void;
}

const fbWindow = window as unknown as { FB?: FbSdk; fbAsyncInit?: () => void };

/** Loads the Facebook JS SDK once and resolves when FB.init has run. */
function loadFbSdk(appId: string): Promise<FbSdk> {
  if (fbWindow.FB) return Promise.resolve(fbWindow.FB);
  return new Promise((resolve, reject) => {
    fbWindow.fbAsyncInit = () => {
      fbWindow.FB!.init({ appId, autoLogAppEvents: false, xfbml: false, version: 'v21.0' });
      resolve(fbWindow.FB!);
    };
    const script = document.createElement('script');
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.async = true;
    script.defer = true;
    script.onerror = () => reject(new Error('Facebook SDK failed to load'));
    document.head.appendChild(script);
  });
}

/**
 * Settings → Integrations: the accountant's own WhatsApp Business Account
 * (WABA). Connect via Meta's Embedded Signup popup (when META_APP_ID /
 * META_ES_CONFIG_ID are configured) or by pasting a WABA id that was already
 * shared with Twilio. Once connected, admin number provisioning registers this
 * accountant's agent numbers under their own WABA instead of the platform one.
 */
export function WhatsAppBusinessSettings() {
  const { t } = useT();
  const [status, setStatus] = useState<WaBusinessStatus | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [manualId, setManualId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The Embedded Signup popup reports the new WABA through a window message;
  // the listener outlives renders, so route saves through a ref.
  const saveRef = useRef<(wabaId: string, source: 'embedded_signup' | 'manual') => void>();

  const load = useCallback(async () => {
    try {
      setStatus(await api.waBusiness());
    } catch {
      setLoadFailed(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (wabaId: string, source: 'embedded_signup' | 'manual') => {
      setBusy(true);
      setError(null);
      try {
        await api.waBusinessConnect(wabaId, source);
        setManualId('');
        await load();
      } catch {
        setError(t.waBizError);
      } finally {
        setBusy(false);
      }
    },
    [load, t],
  );
  saveRef.current = save;

  // Meta's Embedded Signup posts the created WABA id back as a window message.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith('facebook.com')) return;
      try {
        const data: unknown = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        const msg = data as { type?: string; event?: string; data?: { waba_id?: string | number } };
        if (msg?.type === 'WA_EMBEDDED_SIGNUP' && msg.event === 'FINISH' && msg.data?.waba_id != null) {
          saveRef.current?.(String(msg.data.waba_id), 'embedded_signup');
        }
      } catch {
        // Facebook posts plenty of non-JSON messages; ignore them.
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, []);

  const startEmbeddedSignup = async () => {
    if (!status || !status.embeddedSignup.configured) return;
    setError(null);
    try {
      const fb = await loadFbSdk(status.embeddedSignup.appId);
      fb.login(() => {}, {
        config_id: status.embeddedSignup.configId,
        response_type: 'code',
        override_default_response_type: true,
        extras: { sessionInfoVersion: '3' },
      });
    } catch {
      setError(t.waBizEsFailed);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.waBusinessDisconnect();
      await load();
    } finally {
      setBusy(false);
    }
  };

  if (status === null) {
    return (
      <SettingsGroup title={t.waBizTitle}>
        <SettingsRow title={t.waBizAccount} control={<span className="muted">{loadFailed ? t.csLoadFailed : t.loading}</span>} />
      </SettingsGroup>
    );
  }

  return (
    <SettingsGroup title={t.waBizTitle}>
      <SettingsRow
        title={t.waBizAccount}
        description={status.connected ? t.waBizConnectedDesc : t.waBizDesc}
        control={
          status.connected ? (
            <>
              <span className="badge badge-success">{t.waBizConnected}</span>
              <span className="settings-value" dir="ltr">
                {status.wabaId}
              </span>
              <button type="button" className="btn btn-ghost btn-small" onClick={disconnect} disabled={busy}>
                {t.waBizDisconnect}
              </button>
            </>
          ) : status.embeddedSignup.configured ? (
            <button type="button" className="btn btn-primary" onClick={startEmbeddedSignup} disabled={busy}>
              {t.waBizConnectFb}
            </button>
          ) : undefined
        }
      />
      {!status.connected && (
        <div className="settings-subsection">
          <SettingsRow
            title={t.waBizManualLabel}
            description={status.embeddedSignup.configured ? undefined : t.waBizNotConfiguredHint}
            control={
              <>
                <input
                  type="text"
                  dir="ltr"
                  inputMode="numeric"
                  placeholder={t.waBizManualPlaceholder}
                  value={manualId}
                  onChange={(e) => setManualId(e.target.value.trim())}
                  disabled={busy}
                />
                <button
                  type="button"
                  className="btn btn-ghost btn-small"
                  onClick={() => save(manualId, 'manual')}
                  disabled={busy || !/^[0-9]{5,20}$/.test(manualId)}
                >
                  {t.waBizSave}
                </button>
              </>
            }
          />
        </div>
      )}
      {error && <p className="settings-list-empty muted">{error}</p>}
    </SettingsGroup>
  );
}

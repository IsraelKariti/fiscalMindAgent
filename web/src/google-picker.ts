/**
 * The Google Picker popup (google-picker.html): a tiny standalone document the
 * customer-service settings page opens to let the accountant pick a
 * spreadsheet or doc. It runs as a top-level popup because the Picker overlay
 * is unreliable inside the monday iframe — and this way one flow serves both
 * the standalone dashboard and the iframe.
 *
 * Protocol (opener is always same-origin): the popup announces
 * `fm-picker-ready`, the opener answers with `fm-picker-config` (fresh
 * drive.file access token + API key — passed via postMessage so the token
 * never lands in a URL), and the popup reports the choice back with
 * `fm-picked` before closing itself.
 */

/* global gapi, google -- loaded at runtime from apis.google.com */
declare const gapi: any;
declare const google: any;

interface PickerConfigMessage {
  type: 'fm-picker-config';
  accessToken: string;
  apiKey: string;
  appId: string | null;
  view: 'spreadsheets' | 'documents';
}

const statusEl = document.getElementById('status')!;

function fail(message: string): void {
  statusEl.textContent = message;
}

function loadGapi(): Promise<void> {
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://apis.google.com/js/api.js';
    script.onload = () => gapi.load('picker', { callback: resolve, onerror: reject });
    script.onerror = () => reject(new Error('failed to load api.js'));
    document.head.appendChild(script);
  });
}

async function showPicker(config: PickerConfigMessage): Promise<void> {
  await loadGapi();
  const viewId = config.view === 'documents' ? google.picker.ViewId.DOCUMENTS : google.picker.ViewId.SPREADSHEETS;
  const builder = new google.picker.PickerBuilder()
    .setOAuthToken(config.accessToken)
    .setDeveloperKey(config.apiKey)
    .setLocale('iw')
    .addView(
      new google.picker.DocsView(viewId)
        .setIncludeFolders(true)
        .setMode(google.picker.DocsViewMode.LIST),
    )
    .setCallback((data: any) => {
      if (data.action === google.picker.Action.PICKED) {
        const doc = data.docs?.[0];
        if (doc) {
          window.opener?.postMessage(
            { type: 'fm-picked', id: doc.id, name: doc.name, mimeType: doc.mimeType },
            window.location.origin,
          );
        }
        window.close();
      } else if (data.action === google.picker.Action.CANCEL) {
        window.close();
      }
    });
  if (config.appId) builder.setAppId(config.appId);
  builder.build().setVisible(true);
  statusEl.textContent = '';
}

if (!window.opener) {
  fail('הדף הזה נפתח רק מתוך הגדרות הסוכן.');
} else {
  window.addEventListener('message', (event: MessageEvent) => {
    if (event.origin !== window.location.origin || event.source !== window.opener) return;
    const config = event.data as PickerConfigMessage;
    if (config?.type !== 'fm-picker-config') return;
    showPicker(config).catch(() => fail('טעינת בוחר הקבצים נכשלה — סגרו את החלון ונסו שוב.'));
  });
  window.opener.postMessage({ type: 'fm-picker-ready' }, window.location.origin);
}

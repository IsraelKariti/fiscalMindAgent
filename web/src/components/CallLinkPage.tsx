import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import { CallDetailModal } from './admin/AdminLlmCalls';
import { parseCallHash } from './callLink';

/**
 * What a call link (#/llm-calls/:id) opens while impersonating: that one LLM
 * call in the call detail modal. Without impersonation the admin dashboard's
 * own router opens the same address over the call browser, so App mounts
 * this only for an impersonating admin, whose workspace router would
 * otherwise rewrite the hash. `CallDetailModal` loads the call by id itself
 * (and reports a well-formed id that matches no row inside the modal); this
 * page only parses the hash and shows an in-app "call not found" card for a
 * malformed id. `onClose` returns to the normal shell.
 */
export function CallLinkPage({ hash, onClose }: { hash: string; onClose: () => void }) {
  const { t } = useT();
  const callId = parseCallHash(hash);

  if (callId) return <CallDetailModal callId={callId} onClose={onClose} />;

  return createPortal(
    <div className="modal-backdrop">
      <div className="card modal modal-confirm" role="alertdialog" aria-modal="true" aria-labelledby="call-not-found-title">
        <h2 id="call-not-found-title">{t.callNotFound}</h2>
        <p className="muted">{t.callNotFoundHint}</p>
        <div className="btn-row modal-actions">
          <button className="btn btn-primary" type="button" onClick={onClose} autoFocus>
            {t.stepBackToApp}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

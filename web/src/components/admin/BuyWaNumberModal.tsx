import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../../api';
import { useT } from '../../i18n';
import { Spinner } from '../Spinner';

interface Props {
  agentInstanceId: string;
  onConfirm: (displayName: string) => void;
  onClose: () => void;
}

const MIN = 3;
const MAX = 100;

/** The display name the server accepts: trimmed, 3–100 characters, one line (mirrors the API schema). */
function validDisplayName(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed.length < MIN || trimmed.length > MAX || /[\r\n]/.test(trimmed)) return null;
  return trimmed;
}

/**
 * The "buy number" confirmation (openspec `whatsapp-sender`): the admin sees
 * and may edit the WhatsApp display name before the number is bought, since
 * Meta reviews the name after registration and the platform never changes it
 * later. The field is prefilled from the server's per-accountant default
 * ("<accountant name> by FiscalMind"); Confirm waits for that default and for
 * a valid name. Same portal and styling as ConfirmModal.
 */
export function BuyWaNumberModal({ agentInstanceId, onConfirm, onClose }: Props) {
  const { t } = useT();
  const [name, setName] = useState<string | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .adminGetWaDisplayNameDefault(agentInstanceId)
      .then((r) => {
        if (!cancelled) setName(r.displayName);
      })
      .catch(() => {
        if (!cancelled) {
          setLoadFailed(true);
          setName('');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentInstanceId]);

  const valid = name === null ? null : validDisplayName(name);

  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-confirm" onClick={(e) => e.stopPropagation()}>
        <h2>{t.adminWaNumberBuy}</h2>
        <p className="muted">{t.adminWaNumberBuyConfirm}</p>
        <label className="muted" htmlFor="wa-display-name">
          {t.adminWaDisplayNameLabel}
        </label>
        {name === null ? (
          <span className="badge badge-neutral">
            <Spinner /> {t.adminWaDisplayNameLoading}
          </span>
        ) : (
          <input
            id="wa-display-name"
            dir="auto"
            autoFocus
            maxLength={MAX}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
        {loadFailed && <p className="muted">{t.adminWaDisplayNameDefaultFailed}</p>}
        <p className="muted">{t.adminWaDisplayNameRules}</p>
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={valid === null}
            onClick={() => {
              if (valid === null) return;
              onClose();
              onConfirm(valid);
            }}
          >
            {t.adminWaNumberBuy}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

import { createPortal } from 'react-dom';
import type { OrphanedWaNumber } from '../api';
import { formatTimestamp } from '../format';
import { useT } from '../i18n';

interface Props {
  /** Null while the pool is still loading. */
  numbers: OrphanedWaNumber[] | null;
  error: string | null;
  onSelect: (phoneNumber: string) => void;
  onClose: () => void;
}

/** Picks an owned-but-unassigned Twilio number to assign to an agent instance. */
export function WaPoolModal({ numbers, error, onSelect, onClose }: Props) {
  const { t } = useT();

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>{t.adminWaPoolTitle}</h2>
        <p className="muted">{t.adminWaPoolDesc}</p>
        {error && <div className="error-banner">{error}</div>}
        {numbers === null ? (
          <p className="muted">{t.loading}</p>
        ) : numbers.length === 0 ? (
          !error && <p className="muted">{t.adminOrphanNumbersEmpty}</p>
        ) : (
          <ul className="doc-list">
            {numbers.map((n) => (
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
                <button className="btn btn-ghost btn-small" onClick={() => onSelect(n.phoneNumber)}>
                  {t.adminWaPoolSelect}
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.cancel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

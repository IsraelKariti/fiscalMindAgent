import { useT } from '../i18n';

interface Props {
  /** Where the upgrade CTA points until self-serve billing exists (null hides the CTA). */
  contactEmail: string | null;
  onClose: () => void;
}

/** Premium upsell shown when a Standard-plan accountant taps a premium-only feature. */
export function UpgradeModal({ contactEmail, onClose }: Props) {
  const { t } = useT();
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="card modal modal-upgrade"
        role="dialog"
        aria-modal="true"
        aria-labelledby="upgrade-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="upgrade-icon" aria-hidden="true">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
            <path d="M19 15l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1z" />
          </svg>
        </span>
        <h2 id="upgrade-modal-title">
          <span className="modal-highlight">{t.premiumFeatureTitle}</span>
        </h2>
        <p className="muted">{t.waPremiumPitch}</p>
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.maybeLater}
          </button>
          {contactEmail && (
            <a
              className="btn btn-primary plan-upgrade-btn"
              href={`mailto:${contactEmail}?subject=${encodeURIComponent(t.upgradeMailSubject)}`}
            >
              {t.upgradeToPremium}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

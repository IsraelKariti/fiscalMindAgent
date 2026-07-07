import { useEffect, useRef, useState } from 'react';
import { api, type AccountTier, type MailboxStatus, type WaSenderStatus } from '../api';
import { useT, type Lang } from '../i18n';
import { ClaimMailbox } from './ClaimMailbox';

interface Props {
  mailbox: MailboxStatus | null;
  onClaimed: (status: MailboxStatus) => void;
  tier: AccountTier | null;
  /** Where the upgrade CTA points until self-serve billing exists. */
  contactEmail: string | null;
}

const icon = {
  copy: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  ),
  check: (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
};

// Each language is labeled in itself so it stays recognizable whichever
// language is currently active.
const LANGUAGES: { value: Lang; label: string }[] = [
  { value: 'he', label: 'עברית' },
  { value: 'en', label: 'English' },
  { value: 'ru', label: 'Русский' },
];

export function Settings({ mailbox, onClaimed, tier, contactEmail }: Props) {
  const { t, lang, setLang } = useT();
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const [waSender, setWaSender] = useState<WaSenderStatus | null>(null);

  useEffect(() => {
    api.waSenderStatus().then(setWaSender).catch(() => setWaSender({ assigned: false, phoneNumber: null }));
  }, []);

  const address = mailbox?.claimed ? mailbox.emailAddress : null;

  const copyMailbox = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="client-view">
      <section className="card">
        <div className="card-header">
          <div>
            <h2>{t.settingsTitle}</h2>
          </div>
        </div>

        <div className="settings-section">
          <h3>{t.yourPlan}</h3>
          <div className="plan-row">
            <span className={`badge ${tier === 'premium' ? 'badge-premium' : 'badge-neutral'}`}>
              {tier === 'premium' ? t.tierPremium : t.tierNormal}
            </span>
            <p className="muted">{tier === 'premium' ? t.planPremiumDesc : t.planStandardDesc}</p>
          </div>
          {tier !== 'premium' && contactEmail && (
            <a
              className="btn btn-primary plan-upgrade-btn"
              href={`mailto:${contactEmail}?subject=${encodeURIComponent(t.upgradeMailSubject)}`}
            >
              {t.upgradeToPremium}
            </a>
          )}
        </div>

        <div className="settings-section">
          <h3>{t.language}</h3>
          <p className="muted">{t.languageDesc}</p>
          <div className="lang-switch">
            {LANGUAGES.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`chip ${lang === option.value ? 'chip-selected' : ''}`}
                aria-pressed={lang === option.value}
                onClick={() => setLang(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>{t.agentMailbox}</h3>
          <p className="muted">{t.agentMailboxDesc}</p>
          {address ? (
            <div className="settings-mailbox" dir="ltr">
              <span className="settings-mailbox-address">{address}</span>
              <button
                className={`icon-btn ${copied ? 'icon-btn-success' : ''}`}
                onClick={copyMailbox}
                title={copied ? t.copied : t.copyAddress}
              >
                {copied ? icon.check : icon.copy}
              </button>
            </div>
          ) : mailbox ? (
            <ClaimMailbox domain={mailbox.domain} onClaimed={onClaimed} />
          ) : (
            <p className="muted">{t.loading}</p>
          )}
        </div>

        <div className="settings-section">
          <h3>{t.agentWhatsApp}</h3>
          <p className="muted">{t.agentWhatsAppDesc}</p>
          {waSender === null ? (
            <p className="muted">{t.loading}</p>
          ) : waSender.assigned ? (
            <div className="settings-mailbox" dir="ltr">
              <span className="settings-mailbox-address">{waSender.phoneNumber}</span>
            </div>
          ) : (
            <p className="muted">{t.agentWhatsAppNone}</p>
          )}
        </div>
      </section>
    </div>
  );
}

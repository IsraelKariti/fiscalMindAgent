import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type AccountTier, type MailboxStatus, type WaSenderStatus } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT, type Lang } from '../i18n';
import { ClaimMailbox } from './ClaimMailbox';
import { SettingsGroup, SettingsRow } from './SettingsUI';

interface Props {
  mailbox: MailboxStatus | null;
  onClaimed: (status: MailboxStatus) => void;
  tier: AccountTier | null;
  /** Where the upgrade CTA points until self-serve billing exists. */
  contactEmail: string | null;
  /** The active agent type's own settings section (AgentTypeUI.settingsPanel), if it has one. */
  agentPanel?: ReactNode;
  /** Agent without an email channel (AgentTypeUI.channels): no mailbox to show or claim. */
  hideMailbox?: boolean;
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

export function Settings({ mailbox, onClaimed, tier, contactEmail, agentPanel, hideMailbox }: Props) {
  const { t, lang, setLang } = useT();
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const [waSender, setWaSender] = useState<WaSenderStatus | null>(null);
  const wsApi = useWorkspaceApi();

  useEffect(() => {
    wsApi.waSenderStatus().then(setWaSender).catch(() => setWaSender({ assigned: false, phoneNumber: null }));
  }, [wsApi]);

  const address = mailbox?.claimed ? mailbox.emailAddress : null;

  const copyMailbox = async () => {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    clearTimeout(copyResetTimer.current);
    copyResetTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  return (
    <div className="client-view settings-page">
      <header className="settings-header">
        <h2>{t.settingsTitle}</h2>
      </header>

      <SettingsGroup title={t.settingsGroupAccount}>
        <SettingsRow
          title={t.yourPlan}
          description={tier === 'premium' ? t.planPremiumDesc : t.planStandardDesc}
          control={
            <>
              <span className={`badge ${tier === 'premium' ? 'badge-premium' : 'badge-neutral'}`}>
                {tier === 'premium' ? t.tierPremium : t.tierNormal}
              </span>
              {tier !== 'premium' && contactEmail && (
                <a
                  className="btn btn-primary btn-small plan-upgrade-btn"
                  href={`mailto:${contactEmail}?subject=${encodeURIComponent(t.upgradeMailSubject)}`}
                >
                  {t.upgradeToPremium}
                </a>
              )}
            </>
          }
        />
        <SettingsRow
          title={t.language}
          description={t.languageDesc}
          control={
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
          }
        />
      </SettingsGroup>

      <SettingsGroup title={t.settingsGroupChannels}>
        {!hideMailbox &&
          (address ? (
            <SettingsRow
              title={t.agentMailbox}
              description={t.agentMailboxDesc}
              control={
                <span className="settings-value" dir="ltr">
                  {address}
                  <button
                    className={`icon-btn ${copied ? 'icon-btn-success' : ''}`}
                    onClick={copyMailbox}
                    title={copied ? t.copied : t.copyAddress}
                  >
                    {copied ? icon.check : icon.copy}
                  </button>
                </span>
              }
            />
          ) : (
            <SettingsRow title={t.agentMailbox} description={t.agentMailboxDesc} stack>
              {mailbox ? (
                <ClaimMailbox domain={mailbox.domain} onClaimed={onClaimed} />
              ) : (
                <p className="muted">{t.loading}</p>
              )}
            </SettingsRow>
          ))}
        <SettingsRow
          title={t.agentWhatsApp}
          description={t.agentWhatsAppDesc}
          control={
            waSender === null ? (
              <span className="muted">{t.loading}</span>
            ) : waSender.assigned ? (
              <span className="settings-value" dir="ltr">
                {waSender.phoneNumber}
              </span>
            ) : (
              <span className="muted">{t.agentWhatsAppNone}</span>
            )
          }
        />
      </SettingsGroup>

      {agentPanel}
    </div>
  );
}

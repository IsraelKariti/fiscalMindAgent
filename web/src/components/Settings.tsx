import { useEffect, useRef, useState, type ReactNode } from 'react';
import { type AccountTier, type MailboxStatus, type WaSenderStatus } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { useT } from '../i18n';
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
  /** When set (AgentTypeUI.settingsPanelTabKey), agentPanel gets its own tab instead of rendering inline. */
  agentPanelTabKey?: MessageStringKey;
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

export function Settings({ mailbox, onClaimed, tier, contactEmail, agentPanel, agentPanelTabKey, hideMailbox }: Props) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const [waSender, setWaSender] = useState<WaSenderStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'agent'>('general');
  const wsApi = useWorkspaceApi();

  // The agent panel gets its own tab only when the agent type asks for one.
  const tabbed = agentPanel != null && agentPanelTabKey != null;

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

      {tabbed && (
        <div className="client-tabs" role="tablist" aria-label={t.settingsTitle}>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'general'}
            className={`client-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            {t.settingsTabGeneral}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'agent'}
            className={`client-tab ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => setActiveTab('agent')}
          >
            {t[agentPanelTabKey!]}
          </button>
        </div>
      )}

      {tabbed && activeTab === 'agent' ? (
        agentPanel
      ) : (
        <>
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

          {!tabbed && agentPanel}
        </>
      )}
    </div>
  );
}

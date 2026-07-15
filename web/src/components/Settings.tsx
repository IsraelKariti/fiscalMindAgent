import { useEffect, useState, type ReactNode } from 'react';
import { type AccountTier, type EmailSenderStatus, type MailboxStatus, type WaSenderStatus } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { useT } from '../i18n';
import { CopyButton } from './CopyButton';
import { SettingsGroup, SettingsRow } from './SettingsUI';

interface Props {
  /** Legacy account mailbox — shown as a fallback for instances that predate admin-assigned addresses. */
  mailbox: MailboxStatus | null;
  tier: AccountTier | null;
  /** Where the upgrade CTA points until self-serve billing exists. */
  contactEmail: string | null;
  /** The active agent type's own settings section (AgentTypeUI.settingsPanel), if it has one. */
  agentPanel?: ReactNode;
  /** When set (AgentTypeUI.settingsPanelTabKey), agentPanel gets its own tab instead of rendering inline. */
  agentPanelTabKey?: MessageStringKey;
  /** Agent without an email channel (AgentTypeUI.channels): no mailbox to show. */
  hideMailbox?: boolean;
}

export function Settings({ mailbox, tier, contactEmail, agentPanel, agentPanelTabKey, hideMailbox }: Props) {
  const { t } = useT();
  const [waSender, setWaSender] = useState<WaSenderStatus | null>(null);
  const [emailSender, setEmailSender] = useState<EmailSenderStatus | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'agent'>('general');
  const wsApi = useWorkspaceApi();

  // The agent panel gets its own tab only when the agent type asks for one.
  const tabbed = agentPanel != null && agentPanelTabKey != null;

  useEffect(() => {
    wsApi.waSenderStatus().then(setWaSender).catch(() => setWaSender({ assigned: false, phoneNumber: null }));
  }, [wsApi]);

  useEffect(() => {
    wsApi.emailSender().then(setEmailSender).catch(() => setEmailSender({ assigned: false, emailAddress: null }));
  }, [wsApi]);

  // Prefer the agent's own admin-assigned address; fall back to the legacy account mailbox.
  const address = (emailSender?.assigned ? emailSender.emailAddress : null) ?? (mailbox?.claimed ? mailbox.emailAddress : null);

  return (
    <div className={`client-view settings-page${tabbed ? ' settings-page-tabbed' : ''}`}>
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

      <div className="settings-content">
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
        {!hideMailbox && (
          <SettingsRow
            title={t.agentMailbox}
            description={t.agentMailboxDesc}
            control={
              emailSender === null || mailbox === null ? (
                <span className="muted">{t.loading}</span>
              ) : address ? (
                <span className="settings-value" dir="ltr">
                  {address}
                  <CopyButton text={address} />
                </span>
              ) : (
                <span className="muted">{t.agentMailboxNone}</span>
              )
            }
          />
        )}
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
    </div>
  );
}

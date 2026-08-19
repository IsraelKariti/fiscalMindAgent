import { useEffect, useState, type ReactNode } from 'react';
import { type EmailSenderStatus, type MailboxStatus, type WaSenderStatus } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { useT } from '../i18n';
import { CopyButton } from './CopyButton';
import { SettingsGroup, SettingsRow } from './SettingsUI';

interface Props {
  /** Legacy account mailbox — shown as a fallback for instances that predate admin-assigned addresses. */
  mailbox: MailboxStatus | null;
  /** The agent's dashboard (Overview), shown as the last tab. */
  dashboard: ReactNode;
  /** The active agent type's own settings section (AgentTypeUI.settingsPanel), if it has one. */
  agentPanel?: ReactNode;
  /** When set (AgentTypeUI.settingsPanelTabKey), agentPanel gets its own tab instead of rendering inline. */
  agentPanelTabKey?: MessageStringKey;
  /** Agent without an email channel (AgentTypeUI.channels): no mailbox to show. */
  hideMailbox?: boolean;
}

type Tab = 'general' | 'agent' | 'dashboard';

export function Settings({ mailbox, dashboard, agentPanel, agentPanelTabKey, hideMailbox }: Props) {
  const { t } = useT();
  const [waSender, setWaSender] = useState<WaSenderStatus | null>(null);
  const [emailSender, setEmailSender] = useState<EmailSenderStatus | null>(null);
  const wsApi = useWorkspaceApi();

  // The agent panel gets its own tab only when the agent type asks for one.
  const tabbed = agentPanel != null && agentPanelTabKey != null;
  // Survives a refresh alongside fm.lastView, so the user lands back on the same tab.
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const stored = sessionStorage.getItem('fm.settingsTab');
    if (stored === 'dashboard') return 'dashboard';
    if (stored === 'agent' && tabbed) return 'agent';
    return 'general';
  });
  useEffect(() => {
    sessionStorage.setItem('fm.settingsTab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    wsApi.waSenderStatus().then(setWaSender).catch(() => setWaSender({ assigned: false, phoneNumber: null }));
  }, [wsApi]);

  useEffect(() => {
    wsApi.emailSender().then(setEmailSender).catch(() => setEmailSender({ assigned: false, emailAddress: null }));
  }, [wsApi]);

  // Prefer the agent's own admin-assigned address; fall back to the legacy account mailbox.
  const address = (emailSender?.assigned ? emailSender.emailAddress : null) ?? (mailbox?.claimed ? mailbox.emailAddress : null);

  return (
    <div
      className={`client-view settings-page settings-page-tabbed${
        activeTab === 'dashboard' ? ' settings-page-dashboard' : ''
      }`}
    >
      <header className="settings-header">
        <h2>{t.settingsTitle}</h2>
      </header>

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
        {tabbed && (
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'agent'}
            className={`client-tab ${activeTab === 'agent' ? 'active' : ''}`}
            onClick={() => setActiveTab('agent')}
          >
            {t[agentPanelTabKey!]}
          </button>
        )}
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'dashboard'}
          className={`client-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveTab('dashboard')}
        >
          {t.navDashboard}
        </button>
      </div>

      <div className="settings-content">
      {activeTab === 'dashboard' ? (
        dashboard
      ) : tabbed && activeTab === 'agent' ? (
        agentPanel
      ) : (
        <>
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

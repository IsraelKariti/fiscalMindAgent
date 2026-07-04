import { useRef, useState } from 'react';
import type { MailboxStatus } from '../api';
import { ClaimMailbox } from './ClaimMailbox';

interface Props {
  mailbox: MailboxStatus | null;
  onClaimed: (status: MailboxStatus) => void;
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

export function Settings({ mailbox, onClaimed }: Props) {
  const [copied, setCopied] = useState(false);
  const copyResetTimer = useRef<ReturnType<typeof setTimeout>>();

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
            <h2>הגדרות</h2>
          </div>
        </div>

        <div className="settings-section">
          <h3>תיבת הסוכן</h3>
          <p className="muted">תיבת הדואר שממנה הסוכן שולח ומקבל מיילים. הלקוחות מתכתבים עם הכתובת הזו.</p>
          {address ? (
            <div className="settings-mailbox" dir="ltr">
              <span className="settings-mailbox-address">{address}</span>
              <button
                className={`icon-btn ${copied ? 'icon-btn-success' : ''}`}
                onClick={copyMailbox}
                title={copied ? 'הועתק!' : 'העתקת הכתובת'}
              >
                {copied ? icon.check : icon.copy}
              </button>
            </div>
          ) : mailbox ? (
            <ClaimMailbox domain={mailbox.domain} onClaimed={onClaimed} />
          ) : (
            <p className="muted">טוען…</p>
          )}
        </div>
      </section>
    </div>
  );
}

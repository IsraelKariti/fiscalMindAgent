import { useRef, useState } from 'react';
import { useT } from '../i18n';

const copyIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="9" y="9" width="13" height="13" rx="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const checkIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 6 9 17l-5-5" />
  </svg>
);

/**
 * Copy-to-clipboard button that flashes a checkmark after copying. Icon-only
 * by default; with `label` it renders as a ghost button with the text beside
 * the icon (the label is then its accessible name).
 */
export function CopyButton({ text, title, label }: { text: string; title?: string; label?: string }) {
  const { t } = useT();
  const [copied, setCopied] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();

  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setCopied(false), 1600);
  };

  if (label)
    return (
      <button type="button" className={`btn btn-ghost copy-btn-labelled ${copied ? 'copy-btn-success' : ''}`} onClick={copy}>
        {copied ? checkIcon : copyIcon}
        <span>{copied ? t.copied : label}</span>
      </button>
    );

  return (
    <button
      type="button"
      className={`icon-btn ${copied ? 'icon-btn-success' : ''}`}
      onClick={copy}
      title={copied ? t.copied : (title ?? t.copyAddress)}
    >
      {copied ? checkIcon : copyIcon}
    </button>
  );
}

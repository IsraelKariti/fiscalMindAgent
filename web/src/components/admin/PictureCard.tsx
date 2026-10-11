import { useRef, useState } from 'react';
import { useT } from '../../i18n';
import { Spinner } from '../Spinner';

const MAX_BYTES = 2 * 1024 * 1024;
const ACCEPTED = new Set(['image/png', 'image/jpeg']);

interface Props {
  title: string;
  description: string;
  /** The picture currently in effect (own upload, or the fallback). */
  pictureUrl: string;
  /** Caption under the preview: which level the picture comes from. */
  levelLabel: string;
  /** True when an own picture exists at this level — shows the remove button. */
  hasOwn: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
  onRemove: () => void;
  /** Error or result line from the parent (server errors, Twilio outcome). */
  notice?: { kind: 'error' | 'info'; text: string } | null;
}

/**
 * One picture level (the app logo on the settings page, the agent icon on the
 * agent page): round preview, where it comes from, replace, remove. The file
 * input is hidden behind a styled button; the type/size check here only gives
 * an instant message — the server checks the bytes itself.
 */
export function PictureCard({ title, description, pictureUrl, levelLabel, hasOwn, busy, onUpload, onRemove, notice }: Props) {
  const { t } = useT();
  const inputRef = useRef<HTMLInputElement>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED.has(file.type) || file.size > MAX_BYTES) {
      setLocalError(t.pictureRejected);
      return;
    }
    setLocalError(null);
    onUpload(file);
  };

  return (
    <div className="settings-section">
      <h3>{title}</h3>
      <p className="muted">{description}</p>
      <div className="picture-row">
        <img className="picture-preview" src={pictureUrl} alt="" />
        <span className="doc-text">
          <span className="doc-name">{levelLabel}</span>
          <span className="doc-desc muted">{t.pictureRequirements}</span>
        </span>
        <span className="picture-actions">
          <input
            ref={inputRef}
            type="file"
            accept="image/png,image/jpeg"
            hidden
            onChange={(e) => {
              pick(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button className="btn btn-ghost btn-small" disabled={busy} onClick={() => inputRef.current?.click()}>
            {busy ? <Spinner /> : null}
            {hasOwn ? t.pictureReplace : t.pictureUpload}
          </button>
          {hasOwn && (
            <button className="btn btn-ghost btn-small" disabled={busy} onClick={onRemove}>
              {t.pictureRemove}
            </button>
          )}
        </span>
      </div>
      {localError && <div className="error-banner">{localError}</div>}
      {notice && (notice.kind === 'error' ? <div className="error-banner">{notice.text}</div> : <p className="muted">{notice.text}</p>)}
    </div>
  );
}

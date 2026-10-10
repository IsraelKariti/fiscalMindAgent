import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DocumentFile } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT } from '../i18n';

/** The spreadsheet types the server renders to text for the model and for the inline view (openspec spreadsheet-files). */
export function isSpreadsheet(file: { content_type: string }): boolean {
  const mime = (file.content_type.toLowerCase().split(';')[0] ?? '').trim();
  return mime === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || mime === 'text/csv';
}

/** Mirrors the server's INLINE_VIEW_TYPES plus the spreadsheets it serves inline as text — anything else won't render. */
export function canPreview(file: { content_type: string }): boolean {
  return (
    file.content_type === 'application/pdf' ||
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.content_type) ||
    isSpreadsheet(file)
  );
}

/**
 * The inline view of a spreadsheet: the server answers with the plain-text
 * rendering the model read, shown as text (never interpreted as HTML).
 */
export function SpreadsheetText({ url }: { url: string }) {
  const { t } = useT();
  const [state, setState] = useState<{ text: string } | 'loading' | 'failed'>('loading');
  useEffect(() => {
    let cancelled = false;
    setState('loading');
    fetch(url, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        return res.text();
      })
      .then((text) => {
        if (!cancelled) setState({ text });
      })
      .catch(() => {
        if (!cancelled) setState('failed');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);
  if (state === 'loading') return <p className="muted">{t.loading}</p>;
  if (state === 'failed') return <p className="muted">{t.spreadsheetTextFailed}</p>;
  return (
    <pre className="doc-text" dir="auto">
      {state.text}
    </pre>
  );
}

/**
 * A named child of a split PDF keeps its source in view: its stored name holds
 * the original's name and the pages.
 */
export function fileDisplayName(file: { filename: string; label: string | null; parentFileId: string | null }): string {
  return file.label && file.parentFileId ? `${file.label} · ${file.filename}` : (file.label ?? file.filename);
}

interface Props {
  clientId: string;
  file: DocumentFile;
  onClose: () => void;
}

/** Full-size in-app viewer for a received file (PDF/image in an iframe/img). */
export function FileViewModal({ clientId, file, onClose }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  // Fetched on open: the monday transport appends a short-lived ?sessionToken=,
  // so the src can't be computed synchronously.
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void api.fileViewUrl(clientId, file.id).then((u) => {
      if (!cancelled) setUrl(u);
    });
    return () => {
      cancelled = true;
    };
  }, [api, clientId, file.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal modal-viewer" onClick={(e) => e.stopPropagation()}>
        <div className="modal-viewer-header">
          <h2 title={file.filename}>
            {fileDisplayName({
              filename: file.filename,
              label: file.label,
              parentFileId: file.parent_file_id ?? null,
            })}
          </h2>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={async () => window.location.assign(await api.fileDownloadUrl(clientId, file.id))}
          >
            {t.downloadFile}
          </button>
          <button className="chip-x" type="button" title={t.closeViewer} onClick={onClose}>
            ×
          </button>
        </div>
        <div className="modal-viewer-body">
          {!url ? (
            <p className="muted">{t.loading}</p>
          ) : !canPreview(file) ? (
            <p className="muted">{t.previewUnavailable}</p>
          ) : isSpreadsheet(file) ? (
            <SpreadsheetText url={url} />
          ) : file.content_type.startsWith('image/') ? (
            <img src={url} alt={file.filename} />
          ) : (
            <iframe src={url} title={file.filename} />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

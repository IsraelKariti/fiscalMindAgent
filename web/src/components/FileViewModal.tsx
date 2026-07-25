import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { DocumentFile } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT } from '../i18n';

/** Mirrors the server's INLINE_VIEW_TYPES — anything else won't render in the iframe. */
export function canPreview(file: DocumentFile): boolean {
  return (
    file.content_type === 'application/pdf' ||
    ['image/png', 'image/jpeg', 'image/gif', 'image/webp'].includes(file.content_type)
  );
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
          <h2 title={file.filename}>{file.label ?? file.filename}</h2>
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

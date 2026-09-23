import { useEffect, useState } from 'react';
import type { StepFile } from '../api';
import { useT } from '../i18n';
import { canPreview, fileDisplayName } from './FileViewModal';

/**
 * The document a detail modal is about, in its own state:
 * 'none' = the row is not about a file (no request at all);
 * 'loading' = asked, not yet answered; 'missing' = the file is gone (404);
 * otherwise the file's name and type. The request is made only here, on open,
 * and only when `id` is set — loading a list never asks for a document.
 */
export type DocumentState = StepFile | 'none' | 'loading' | 'missing';

export function useDocumentOf(id: string | null, load: (id: string) => Promise<{ file: StepFile }>): DocumentState {
  const [doc, setDoc] = useState<DocumentState>(id ? 'loading' : 'none');

  useEffect(() => {
    setDoc(id ? 'loading' : 'none');
    if (!id) return;
    let stale = false;
    load(id)
      .then((res) => {
        if (!stale) setDoc(res.file);
      })
      .catch(() => {
        if (!stale) setDoc('missing');
      });
    return () => {
      stale = true;
    };
  }, [id, load]);

  return doc;
}

/** True when the modal should render two panes (details beside the document). */
export function isTwoPane(doc: DocumentState): doc is StepFile | 'loading' {
  return doc !== 'none' && doc !== 'missing';
}

/**
 * The document pane of a two-pane detail modal (`.gate-modal-with-doc`):
 * the file's display name, "download" and "open full size" above, the
 * document itself below (an image fitted to the pane, a PDF in a frame, or a
 * "preview unavailable" note). Shared by the step modal and the LLM call
 * modal so the two never drift.
 */
export function DocumentPane({ doc, viewUrl, downloadUrl }: { doc: StepFile | 'loading'; viewUrl: string; downloadUrl: string }) {
  const { t } = useT();
  return (
    <section className="gate-modal-doc" aria-label={t.stepDocPane}>
      {doc === 'loading' ? (
        <div className="gate-modal-doc-body">
          <p className="muted">{t.stepDocLoading}</p>
        </div>
      ) : (
        <>
          <div className="gate-modal-doc-head">
            <h3 title={doc.filename} dir="auto">
              {fileDisplayName(doc)}
            </h3>
            <a className="btn btn-ghost" href={downloadUrl}>
              {t.downloadFile}
            </a>
            {canPreview({ content_type: doc.contentType }) && (
              <a className="btn btn-ghost" href={viewUrl} target="_blank" rel="noopener noreferrer">
                {t.stepDocOpenFull}
              </a>
            )}
          </div>
          <div className="gate-modal-doc-body">
            {!canPreview({ content_type: doc.contentType }) ? (
              <p className="muted">{t.previewUnavailable}</p>
            ) : doc.contentType.startsWith('image/') ? (
              <img src={viewUrl} alt={doc.filename} />
            ) : (
              <iframe src={viewUrl} title={doc.filename} />
            )}
          </div>
        </>
      )}
    </section>
  );
}

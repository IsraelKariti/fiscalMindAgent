import { useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, type ClientDocument, type DocumentFile, type DocumentStatus } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { FileViewModal } from './FileViewModal';
import { LOCALE, formatFileSize } from '../format';
import { useT, type Messages } from '../i18n';

interface Props {
  clientId: string;
  documents: ClientDocument[];
  /** Received files — a row whose checklist item has a linked file gets view/download buttons. */
  files: DocumentFile[];
  onChanged: () => Promise<void>;
  /** Panel title override — agents where the list isn't accountant-defined rename it. */
  titleKey?: MessageStringKey;
  /** Empty-state override — for agents whose list starts empty by design. */
  emptyTextKey?: MessageStringKey;
  /** Capital-declaration flow: grouped statuses, verification badges, attestation state. */
  capital?: { attestation: 'none' | 'requested' | 'confirmed' };
}

/** The view/download icon pair for one received file. */
function FileActions({ clientId, file, onView }: { clientId: string; file: DocumentFile; onView: (file: DocumentFile) => void }) {
  const { t } = useT();
  const api = useWorkspaceApi();
  return (
    <span className="doc-actions">
      <button className="icon-btn" type="button" title={t.viewFile} onClick={() => onView(file)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      </button>
      <button
        className="icon-btn"
        type="button"
        title={t.downloadFile}
        onClick={async () => window.location.assign(await api.fileDownloadUrl(clientId, file.id))}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </span>
  );
}

/** The content-analysis verdict line under a file, or a status badge when there is none. */
function AnalysisLine({ file }: { file: DocumentFile }) {
  const { t } = useT();
  if (file.analysis_status === 'blocked') {
    return (
      <span className="badge badge-danger" title={t.analysisBlockedTitle}>
        {t.analysisBlocked}
      </span>
    );
  }
  if (file.analysis_status !== 'done' || !file.analysis) {
    const label =
      file.analysis_status === 'failed'
        ? t.analysisFailed
        : file.analysis_status === 'unsupported'
          ? t.analysisUnsupported
          : t.analysisPending;
    return <span className="badge badge-neutral">{label}</span>;
  }
  const a = file.analysis;
  const details = [a.tax_year ? t.analysisTaxYear(a.tax_year) : null, a.subject_name].filter(Boolean).join(' · ');
  return (
    <span className="doc-desc muted" title={a.summary}>
      {t.analysisIdentified(a.document_kind)}
      {details ? ` · ${details}` : ''}
      {a.injection_suspected && (
        <span className="badge badge-danger" title={t.analysisSuspiciousTitle}>
          {' '}
          {t.analysisSuspicious}
        </span>
      )}
      {!a.legible && <span className="badge badge-pending"> {t.analysisNotLegible}</span>}
    </span>
  );
}

/** One received file: name, size · date, analysis verdict, and the view/download pair. */
function FileItem({ clientId, file, onView }: { clientId: string; file: DocumentFile; onView: (file: DocumentFile) => void }) {
  return (
    <li className="doc-file-item">
      <span className="doc-file-text">
        <span className="doc-file-label" title={file.filename}>
          {file.label ?? file.filename}
        </span>
        <span className="doc-desc muted">
          {formatFileSize(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString(LOCALE)}
        </span>
        <AnalysisLine file={file} />
      </span>
      <FileActions clientId={clientId} file={file} onView={onView} />
    </li>
  );
}

/** One compact "issuer · date · amount" line from the verification verdict of an approved row. */
function extractedSummary(doc: ClientDocument): string | null {
  const extracted = doc.verification?.extracted;
  if (!extracted) return null;
  const amount = extracted.amounts?.[0];
  const parts = [
    extracted.issuer,
    extracted.as_of_date,
    amount ? `${amount.value.toLocaleString()} ${amount.currency}` : null,
  ].filter((p): p is string => Boolean(p));
  return parts.length > 0 ? parts.join(' · ') : null;
}

/** Group order + labels of the capital-declaration flow. */
const CAPITAL_GROUPS: { status: DocumentStatus; labelKey: keyof Messages; collapsed?: boolean }[] = [
  { status: 'unresolved', labelKey: 'groupUnresolved' },
  { status: 'pending', labelKey: 'groupPending' },
  { status: 'claimed', labelKey: 'groupClaimed' },
  { status: 'collected', labelKey: 'groupCollected' },
  { status: 'approved', labelKey: 'groupApproved' },
  { status: 'not_required', labelKey: 'groupNotRequired', collapsed: true },
  { status: 'retired', labelKey: 'groupRetired', collapsed: true },
];

export function DocumentsCard({ clientId, documents, files, onChanged, titleKey, emptyTextKey, capital }: Props) {
  const { t } = useT();
  const api = useWorkspaceApi();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [viewing, setViewing] = useState<DocumentFile | null>(null);

  // All files linked to a checklist item, oldest first (the list arrives
  // created_at ascending). A tax-fetched multi-employer year links several
  // 106s to the one item — every one of them must stay visible.
  const filesFor = (docId: string): DocumentFile[] => files.filter((f) => f.client_document_id === docId);
  // Files whose analysis matched no checklist item — the accountant must see these.
  const unmatched = files.filter((f) => f.client_document_id === null);

  // Capital flow: done = verified; not_required/retired rows are outside the goal.
  const inGoal = capital
    ? documents.filter((d) => d.status !== 'not_required' && d.status !== 'retired')
    : documents;
  const done = capital
    ? documents.filter((d) => d.status === 'approved').length
    : documents.filter((d) => d.status === 'collected').length;

  const run = async (action: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.docsUpdateFailed);
    } finally {
      setBusy(false);
    }
  };

  const setStatus = (doc: ClientDocument, status: DocumentStatus) =>
    run(() => api.updateDocument(clientId, doc.id, { status }));

  const add = (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    run(async () => {
      await api.addDocument(clientId, { name: trimmed, description: description.trim() || null });
      setName('');
      setDescription('');
    });
  };

  const smallBtn = (label: string, onClick: () => void, opts: { title?: string; primary?: boolean } = {}) => (
    <button
      className={`btn btn-small ${opts.primary ? 'btn-primary' : 'btn-ghost'}`}
      type="button"
      title={opts.title}
      disabled={busy}
      onClick={onClick}
    >
      {label}
    </button>
  );

  /** One row of the capital-declaration flow: status-specific controls + verification detail. */
  const capitalRow = (doc: ClientDocument) => {
    // Every linked file gets its own sub-row: the analysis verdict belongs
    // next to the file it describes (two uploads of one document must stay apart).
    const linked = filesFor(doc.id);
    const failed = doc.verification?.passed === false;
    const stalled = doc.verification?.stalled === true || doc.verification?.unavailable === true;
    const reasons = doc.verification?.reasons?.join('; ') ?? '';
    const summary = doc.status === 'approved' ? extractedSummary(doc) : null;

    const controls: ReactNode[] = [];
    if (doc.status === 'unresolved') {
      controls.push(smallBtn(t.markRequired, () => setStatus(doc, 'pending'), { primary: true }));
      controls.push(smallBtn(t.markNotRequired, () => setStatus(doc, 'not_required')));
    } else if (doc.status === 'pending') {
      controls.push(smallBtn(t.markNotRequired, () => setStatus(doc, 'not_required')));
    } else if (doc.status === 'claimed') {
      controls.push(smallBtn(t.confirmClaimedReceipt, () => setStatus(doc, 'approved'), { title: t.confirmClaimedTitle, primary: true }));
    } else if (doc.status === 'collected') {
      controls.push(smallBtn(t.approveManually, () => setStatus(doc, 'approved'), { primary: stalled }));
    } else if (doc.status === 'approved' || doc.status === 'not_required' || doc.status === 'retired') {
      controls.push(smallBtn(t.reopenDocument, () => setStatus(doc, 'pending')));
    }

    const badge =
      doc.status === 'approved' ? (
        <span className="badge badge-success">{t.approvedStatus}</span>
      ) : doc.status === 'collected' ? (
        <span className={`badge ${stalled ? 'badge-danger' : 'badge-note'}`}>
          {stalled ? t.verificationFailedStatus : t.inVerificationStatus}
        </span>
      ) : doc.status === 'claimed' ? (
        <span className="badge badge-warning">{t.claimedStatus}</span>
      ) : doc.status === 'retired' ? (
        <span className="badge badge-note">{t.retiredStatus}</span>
      ) : null;

    return (
      <li key={doc.id} className={`doc-row ${doc.status}`}>
        <div className="doc-row-main">
          <span className="doc-text">
            <span className="doc-name">{doc.name}</span>
            {doc.description && <span className="doc-desc muted">{doc.description}</span>}
          </span>
          {badge}
          {controls}
          <button className="chip-x" title={t.removeDocument} disabled={busy} onClick={() => run(() => api.deleteDocument(clientId, doc.id))}>
            ×
          </button>
        </div>
        {linked.length > 0 && (
          <ul className="doc-file-list">
            {linked.map((file) => (
              <FileItem key={file.id} clientId={clientId} file={file} onView={setViewing} />
            ))}
          </ul>
        )}
        {(doc.status === 'pending' || doc.status === 'collected') && (failed || stalled) && reasons && (
          <div className="doc-verification-note">{t.verificationReasonsPrefix + reasons}</div>
        )}
        {(doc.status === 'not_required' || doc.status === 'retired') && doc.resolution_evidence && (
          <div className="doc-verification-note muted">
            {doc.resolution_evidence.source === 'form_empty'
              ? t.formEmptyNote
              : `${t.clientQuotePrefix}"${doc.resolution_evidence.quote}"`}
          </div>
        )}
        {summary && <div className="doc-verification-note muted">{summary}</div>}
      </li>
    );
  };

  /** The original flat flow (doc collector): checkbox + status badge per row.
   *  Unreachable in the current single-agent setup (declaration_of_capital always
   *  passes `capital`); it keeps the old inline-file layout on purpose. */
  const classicRow = (doc: ClientDocument) => {
    const linked = filesFor(doc.id);
    const showFileList = linked.length > 1 || Boolean(linked[0]?.label);
    const inlineFile = showFileList ? null : (linked[0] ?? null);
    return (
      <li key={doc.id} className={`doc-row ${doc.status}`}>
        <div className="doc-row-main">
          <label
            className="doc-check"
            title={doc.status === 'collected' ? t.markPending : doc.status === 'claimed' ? t.confirmClaimedTitle : t.markCollected}
          >
            <input
              type="checkbox"
              checked={doc.status === 'collected'}
              disabled={busy}
              onChange={() => setStatus(doc, doc.status === 'collected' ? 'pending' : 'collected')}
            />
            <span className="doc-text">
              <span className="doc-name">{doc.name}</span>
              {doc.description && <span className="doc-desc muted">{doc.description}</span>}
            </span>
          </label>
          {inlineFile && <FileActions clientId={clientId} file={inlineFile} onView={setViewing} />}
          <span
            className={`badge ${
              doc.status === 'collected' ? 'badge-success' : doc.status === 'claimed' ? 'badge-warning' : 'badge-pending'
            }`}
          >
            {doc.status === 'collected' ? t.collectedStatus : doc.status === 'claimed' ? t.claimedStatus : t.pendingStatus}
          </span>
          <button className="chip-x" title={t.removeDocument} disabled={busy} onClick={() => run(() => api.deleteDocument(clientId, doc.id))}>
            ×
          </button>
        </div>
        {showFileList && (
          <ul className="doc-file-list">
            {linked.map((file) => (
              <li key={file.id} className="doc-file-item">
                <span className="doc-file-label" title={file.filename}>
                  {file.label ?? file.filename}
                </span>
                <FileActions clientId={clientId} file={file} onView={setViewing} />
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  const attestationText =
    capital?.attestation === 'confirmed'
      ? t.attestationConfirmed
      : capital?.attestation === 'requested'
        ? t.attestationRequested
        : t.attestationNone;

  return (
    <section className="card panel">
      <div className="panel-header">
        <h3>{t[titleKey ?? 'requiredDocuments']}</h3>
        {inGoal.length > 0 && (
          <span className={`badge ${done === inGoal.length ? 'badge-success' : 'badge-pending'}`}>
            {t.collectedBadge(done, inGoal.length)}
          </span>
        )}
      </div>

      <div className="panel-body">
        {error && <div className="error-banner">{error}</div>}
        {capital && (
          <div className={`doc-attestation ${capital.attestation}`}>
            <span className="muted">{t.attestationLabel}:</span> {attestationText}
          </div>
        )}

        {documents.length === 0 ? (
          <p className="muted">{t[emptyTextKey ?? 'noDocsNothingToCollect']}</p>
        ) : capital ? (
          CAPITAL_GROUPS.map(({ status, labelKey, collapsed }) => {
            const group = documents.filter((d) => d.status === status);
            if (group.length === 0) return null;
            const list = <ul className="doc-list">{group.map(capitalRow)}</ul>;
            return collapsed ? (
              <details key={status} className="doc-group">
                <summary className="doc-group-title">{`${t[labelKey] as string} (${group.length})`}</summary>
                {list}
              </details>
            ) : (
              <div key={status} className="doc-group">
                <div className="doc-group-title">{`${t[labelKey] as string} (${group.length})`}</div>
                {list}
              </div>
            );
          })
        ) : (
          <ul className="doc-list">{documents.map(classicRow)}</ul>
        )}
        {capital && unmatched.length > 0 && (
          <div className="doc-group">
            <div className="doc-group-title">{`${t.groupUnmatchedFiles} (${unmatched.length})`}</div>
            <ul className="doc-list">
              <li className="doc-row">
                <ul className="doc-file-list">
                  {unmatched.map((file) => (
                    <FileItem key={file.id} clientId={clientId} file={file} onView={setViewing} />
                  ))}
                </ul>
              </li>
            </ul>
          </div>
        )}
        {viewing && <FileViewModal clientId={clientId} file={viewing} onClose={() => setViewing(null)} />}
      </div>

      <form className="doc-add-form panel-footer" onSubmit={add}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.docNamePlaceholder}
          aria-label={t.docNameAria}
        />
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.docDescPlaceholder}
          aria-label={t.docDescAria}
        />
        <button className="btn btn-primary" type="submit" disabled={busy || !name.trim()}>
          {t.addDocument}
        </button>
      </form>
    </section>
  );
}

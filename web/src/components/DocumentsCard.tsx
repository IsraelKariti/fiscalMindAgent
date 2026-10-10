import { useState, type FormEvent } from 'react';
import { ApiError, type ClientDocument, type DocumentFile, type DocumentStatus } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';
import { FileViewModal } from './FileViewModal';
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
  /** Capital-declaration flow: grouped statuses, verification badges. */
  capital?: boolean;
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
function AnalysisLine({ file, childCount }: { file: DocumentFile; childCount: number }) {
  const { t } = useT();
  // The original of a multi-document PDF: its documents are listed as their own files.
  if (file.analysis_status === 'split') {
    return (
      <span className="badge badge-meta" title={t.analysisSplitTitle}>
        {t.analysisSplit(childCount)}
      </span>
    );
  }
  if (file.analysis_status === 'blocked') {
    return (
      <span className="badge badge-danger" title={t.analysisBlockedTitle}>
        {t.analysisBlocked}
      </span>
    );
  }
  if (file.analysis_status === 'not_needed') {
    return (
      <span className="badge badge-neutral" title={t.analysisNotNeededTitle}>
        {t.analysisNotNeeded}
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
  // A clean verdict adds nothing the accountant needs to skim: only warnings are shown.
  const a = file.analysis;
  if (!a.injection_suspected && a.legible) return null;
  return (
    <span className="doc-desc" title={a.summary}>
      {a.injection_suspected && (
        <span className="badge badge-danger" title={t.analysisSuspiciousTitle}>
          {t.analysisSuspicious}
        </span>
      )}
      {!a.legible && <span className="badge badge-pending">{t.analysisNotLegible}</span>}
    </span>
  );
}

/** Whitespace-insensitive equality of two display names. */
function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.replace(/\s+/g, ' ').trim() === b.replace(/\s+/g, ' ').trim();
}

/** One received file: name, analysis warnings, and the view/download pair. */
function FileItem({
  clientId,
  file,
  files,
  documentName,
  onView,
}: {
  clientId: string;
  file: DocumentFile;
  /** Every file of the client — a split parent counts its children, a child names its parent. */
  files: DocumentFile[];
  /** Name of the list document the file sits under; a label equal to it is not repeated. */
  documentName?: string;
  onView: (file: DocumentFile) => void;
}) {
  const { t } = useT();
  const parent = file.parent_file_id ? files.find((f) => f.id === file.parent_file_id) : undefined;
  const childCount = files.filter((f) => f.parent_file_id === file.id).length;
  const hasPages = Boolean(parent) && file.page_from != null && file.page_to != null;
  // A matched child is labelled after its document, so under that document the
  // label would repeat the row title. The line then shows what is new: the
  // file the client sent (the parent, for a split child) and the page range.
  const repeatsDocument = sameName(file.label, documentName);
  const sourceName = parent?.filename ?? file.filename;
  return (
    <li className="doc-file-item">
      <span className="doc-file-text">
        <span className="doc-file-label" title={repeatsDocument ? sourceName : file.filename}>
          <svg className="doc-file-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
          <span>{repeatsDocument ? sourceName : (file.label ?? file.filename)}</span>
          {repeatsDocument && hasPages && (
            <span className="doc-file-pages">· {t.splitPagesShort(file.page_from!, file.page_to!)}</span>
          )}
        </span>
        {!repeatsDocument && hasPages && parent && (
          <span className="badge badge-meta" title={parent.filename}>
            {t.splitChildPages(file.page_from!, file.page_to!, parent.label ?? parent.filename)}
          </span>
        )}
        <AnalysisLine file={file} childCount={childCount} />
      </span>
      <FileActions clientId={clientId} file={file} onView={onView} />
    </li>
  );
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
  // Capital flow: the status tab in view; falls back to the first non-empty tab.
  const [tab, setTab] = useState<string | null>(null);

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

  /** One row of the capital-declaration flow: status-specific controls + verification detail. */
  const capitalRow = (doc: ClientDocument) => {
    // Every linked file gets its own sub-row: the analysis verdict belongs
    // next to the file it describes (two uploads of one document must stay apart).
    const linked = filesFor(doc.id);
    const failed = doc.verification?.passed === false;
    const stalled = doc.verification?.stalled === true || doc.verification?.unavailable === true;
    const reasons = doc.verification?.reasons?.join('; ') ?? '';

    // The badge is the row's only status wording; every action sits in the
    // "⋯" menu under a verb label, the one the accountant is expected to take first.
    const actions: ActionMenuItem[] = [];
    if (doc.status === 'unresolved') {
      actions.push({ key: 'required', label: t.markRequired, onSelect: () => setStatus(doc, 'pending') });
      actions.push({ key: 'not_required', label: t.markNotRequired, onSelect: () => setStatus(doc, 'not_required') });
    } else if (doc.status === 'pending') {
      actions.push({ key: 'not_required', label: t.markNotRequired, onSelect: () => setStatus(doc, 'not_required') });
    } else if (doc.status === 'claimed') {
      actions.push({
        key: 'confirm',
        label: t.confirmClaimedReceipt,
        title: t.confirmClaimedTitle,
        onSelect: () => setStatus(doc, 'approved'),
      });
    } else if (doc.status === 'collected') {
      actions.push({ key: 'approve', label: t.approveManually, onSelect: () => setStatus(doc, 'approved') });
    } else if (doc.status === 'approved' || doc.status === 'not_required' || doc.status === 'retired') {
      actions.push({ key: 'reopen', label: t.reopenDocument, onSelect: () => setStatus(doc, 'pending') });
    }
    actions.push({
      key: 'remove',
      label: t.removeDocument,
      danger: true,
      onSelect: () => run(() => api.deleteDocument(clientId, doc.id)),
    });

    const badges: Record<DocumentStatus, { className: string; label: string }> = {
      unresolved: { className: 'badge-warning', label: t.unresolvedStatus },
      pending: { className: 'badge-pending', label: t.awaitingClientStatus },
      claimed: { className: 'badge-warning', label: t.claimedStatus },
      collected: stalled
        ? { className: 'badge-danger', label: t.verificationFailedStatus }
        : { className: 'badge-note', label: t.inVerificationStatus },
      approved: { className: 'badge-success', label: t.approvedStatus },
      not_required: { className: 'badge-neutral', label: t.notRequiredStatus },
      retired: { className: 'badge-note', label: t.retiredStatus },
    };
    const badge = badges[doc.status];

    return (
      <li key={doc.id} className={`doc-row ${doc.status}`}>
        <div className="doc-row-main">
          <span className="doc-text">
            <span className="doc-name">{doc.name}</span>
            {doc.description && <span className="doc-desc muted">{doc.description}</span>}
          </span>
          <span className={`badge ${badge.className}`}>{badge.label}</span>
          <ActionMenu items={actions} label={t.rowActions} disabled={busy} />
        </div>
        {linked.length > 0 && (
          <ul className="doc-file-list">
            {linked.map((file) => (
              <FileItem key={file.id} clientId={clientId} file={file} files={files} documentName={doc.name} onView={setViewing} />
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
              : doc.resolution_evidence.source === 'approved_file'
                ? t.provenByApprovedFileNote +
                  (doc.resolution_evidence.fact === 'seller_builder' ? t.provenFactSellerBuilder : t.provenFactSellerPrivate)
                : `${t.clientQuotePrefix}"${doc.resolution_evidence.quote}"`}
          </div>
        )}
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
        {documents.length === 0 ? (
          <p className="muted">{t[emptyTextKey ?? 'noDocsNothingToCollect']}</p>
        ) : capital ? (
          (() => {
            // One tab per non-empty status group, then the unmatched files.
            const tabs: { key: string; label: string; count: number; body: JSX.Element }[] = CAPITAL_GROUPS.flatMap(({ status, labelKey }) => {
              const group = documents.filter((d) => d.status === status);
              if (group.length === 0) return [];
              return [{ key: status, label: t[labelKey] as string, count: group.length, body: <ul className="doc-list">{group.map(capitalRow)}</ul> }];
            });
            if (unmatched.length > 0) {
              tabs.push({
                key: 'unmatched',
                label: t.groupUnmatchedFiles,
                count: unmatched.length,
                body: (
                  <ul className="doc-list">
                    {unmatched.map((file) => (
                      <li key={file.id} className="doc-row unmatched">
                        <ul className="doc-file-list doc-file-list-unmatched">
                          <FileItem clientId={clientId} file={file} files={files} onView={setViewing} />
                        </ul>
                      </li>
                    ))}
                  </ul>
                ),
              });
            }
            const active = tabs.find((x) => x.key === tab) ?? tabs[0];
            if (!active) return null;
            return (
              <>
                <div className="doc-tabs" role="tablist">
                  {tabs.map((x) => (
                    <button
                      key={x.key}
                      type="button"
                      role="tab"
                      aria-selected={x.key === active.key}
                      className={`doc-tab doc-group-${x.key} ${x.key === active.key ? 'active' : ''}`}
                      onClick={() => setTab(x.key)}
                    >
                      <span className="doc-group-name">{x.label}</span>
                      <span className="doc-group-count">{x.count}</span>
                    </button>
                  ))}
                </div>
                <div className="doc-group" role="tabpanel">
                  {active.body}
                </div>
              </>
            );
          })()
        ) : (
          <ul className="doc-list">{documents.map(classicRow)}</ul>
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

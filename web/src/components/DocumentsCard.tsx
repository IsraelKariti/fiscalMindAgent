import { useState, type FormEvent } from 'react';
import { ApiError, type ClientDocument, type DocumentFile, type DocumentStatus } from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { ActionMenu, type ActionMenuItem } from './ActionMenu';
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
  capital?: {
    attestation: 'none' | 'requested' | 'confirmed';
    /** The household on file (openspec `spouse-identity`); ids arrive already masked. */
    household?: {
      maritalStatus: 'married' | 'not_married' | null;
      spouse: { name: string | null; maskedId: string | null; nameSource: string | null; idSource: string | null } | null;
    };
  };
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
      <span className="badge badge-neutral" title={t.analysisSplitTitle}>
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
function FileItem({
  clientId,
  file,
  files,
  onView,
}: {
  clientId: string;
  file: DocumentFile;
  /** Every file of the client — a split parent counts its children, a child names its parent. */
  files: DocumentFile[];
  onView: (file: DocumentFile) => void;
}) {
  const { t } = useT();
  const parent = file.parent_file_id ? files.find((f) => f.id === file.parent_file_id) : undefined;
  const childCount = files.filter((f) => f.parent_file_id === file.id).length;
  return (
    <li className="doc-file-item">
      <span className="doc-file-text">
        <span className="doc-file-label" title={file.filename}>
          {file.label ?? file.filename}
        </span>
        <span className="doc-desc muted">
          {formatFileSize(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString(LOCALE)}
        </span>
        {parent && file.page_from != null && file.page_to != null && (
          <span className="doc-desc muted">{t.splitChildPages(file.page_from, file.page_to, parent.label ?? parent.filename)}</span>
        )}
        <AnalysisLine file={file} childCount={childCount} />
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

  /** One row of the capital-declaration flow: status-specific controls + verification detail. */
  const capitalRow = (doc: ClientDocument) => {
    // Every linked file gets its own sub-row: the analysis verdict belongs
    // next to the file it describes (two uploads of one document must stay apart).
    const linked = filesFor(doc.id);
    const failed = doc.verification?.passed === false;
    const stalled = doc.verification?.stalled === true || doc.verification?.unavailable === true;
    const reasons = doc.verification?.reasons?.join('; ') ?? '';
    const summary = doc.status === 'approved' ? extractedSummary(doc) : null;

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
              <FileItem key={file.id} clientId={clientId} file={file} files={files} onView={setViewing} />
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

  // One line for the household on file; absent when nothing is known (openspec `spouse-identity`).
  const household = capital?.household;
  const sourceText = (s: string | null) =>
    s === 'questionnaire' ? t.spouseSourceQuestionnaire : s === 'crm' ? t.spouseSourceCrm : s === 'document' ? t.spouseSourceDocument : '';
  const householdText =
    household && (household.maritalStatus !== null || household.spouse)
      ? [
          household.maritalStatus === 'married' ? t.maritalMarried : household.maritalStatus === 'not_married' ? t.maritalNotMarried : t.maritalUnknown,
          household.spouse
            ? `${t.spouseLabel}: ${household.spouse.name ?? t.spouseNameUnknown}${household.spouse.name && household.spouse.nameSource ? ` (${sourceText(household.spouse.nameSource)})` : ''}${
                household.spouse.maskedId ? ` · ${t.spouseIdLabel} ${household.spouse.maskedId}${household.spouse.idSource ? ` (${sourceText(household.spouse.idSource)})` : ''}` : ''
              }`
            : null,
        ]
          .filter((s): s is string => s !== null)
          .join(' · ')
      : null;

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
        {householdText && (
          <div className="doc-household muted">
            <span>{t.householdLabel}:</span> {householdText}
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
                    <FileItem key={file.id} clientId={clientId} file={file} files={files} onView={setViewing} />
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

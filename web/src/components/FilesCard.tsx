import { api, type ClientDocument, type DocumentFile } from '../api';
import { LOCALE } from '../format';
import { useT } from '../i18n';

interface Props {
  clientId: string;
  files: DocumentFile[];
  documents: ClientDocument[];
}

function formatSize(bytes: string): string {
  const n = Number(bytes);
  if (!Number.isFinite(n)) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/** The content-analysis verdict line under a file, or a status badge when there is none. */
function AnalysisLine({ file }: { file: DocumentFile }) {
  const { t } = useT();
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
      {!a.legible && <span className="badge badge-pending"> {t.analysisNotLegible}</span>}
    </span>
  );
}

export function FilesCard({ clientId, files, documents }: Props) {
  const { t } = useT();
  if (files.length === 0) return null;

  const documentName = (id: string | null) => documents.find((d) => d.id === id)?.name ?? null;

  return (
    <section className="card panel panel-compact">
      <div className="panel-header">
        <h3>{t.filesReceived}</h3>
        <span className="badge badge-success">{files.length}</span>
      </div>
      <ul className="doc-list panel-body">
        {files.map((file) => {
          const linked = documentName(file.client_document_id);
          return (
            <li key={file.id} className="doc-row collected">
              <span className="doc-text">
                {/* The URL is fetched on click: the monday transport appends a
                    short-lived ?sessionToken=, so it can't be precomputed into href. */}
                <a
                  className="doc-name"
                  href="#"
                  onClick={async (e) => {
                    e.preventDefault();
                    window.location.assign(await api.fileDownloadUrl(clientId, file.id));
                  }}
                >
                  {file.filename}
                </a>
                <span className="doc-desc muted">
                  {formatSize(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString(LOCALE)}
                  {linked ? ` · ${linked}` : ''}
                </span>
                <AnalysisLine file={file} />
              </span>
              {linked && <span className="badge badge-success">{linked}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

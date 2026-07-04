import { api, type ClientDocument, type DocumentFile } from '../api';
import { LOCALE } from '../format';

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

export function FilesCard({ clientId, files, documents }: Props) {
  if (files.length === 0) return null;

  const documentName = (id: string | null) => documents.find((d) => d.id === id)?.name ?? null;

  return (
    <section className="card panel panel-compact">
      <div className="panel-header">
        <h3>קבצים שהתקבלו</h3>
        <span className="badge badge-success">{files.length}</span>
      </div>
      <ul className="doc-list panel-body">
        {files.map((file) => {
          const linked = documentName(file.client_document_id);
          return (
            <li key={file.id} className="doc-row collected">
              <span className="doc-text">
                <a className="doc-name" href={api.fileDownloadUrl(clientId, file.id)}>
                  {file.filename}
                </a>
                <span className="doc-desc muted">
                  {formatSize(file.size_bytes)} · {new Date(file.created_at).toLocaleDateString(LOCALE)}
                  {linked ? ` · ${linked}` : ''}
                </span>
              </span>
              {linked && <span className="badge badge-success">{linked}</span>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

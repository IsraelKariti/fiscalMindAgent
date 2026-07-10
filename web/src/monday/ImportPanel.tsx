import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import { mondayApi, MondayApiError } from './api';
import { fetchBoards, fetchImportRows, type BoardMeta, type ImportRow } from './boards';

const IMPORT_CHUNK = 500; // server-side max per POST

interface Props {
  boardIds: string[];
  /** Refetch the dashboard after a successful import. */
  onImported: () => void;
}

/**
 * Board → clients import: pick a connected board, map its email (and optional
 * phone) column, preview how many rows qualify, then import. Re-importing is
 * safe — the server skips emails that already exist.
 */
export function ImportPanel({ boardIds, onImported }: Props) {
  const { t } = useT();
  const [boards, setBoards] = useState<BoardMeta[] | null>(null);
  const [boardId, setBoardId] = useState<string>('');
  const [emailColumnId, setEmailColumnId] = useState<string>('');
  const [phoneColumnId, setPhoneColumnId] = useState<string>('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (boardIds.length === 0) {
      setBoards([]);
      return;
    }
    fetchBoards(boardIds)
      .then((loaded) => {
        setBoards(loaded);
        const first = loaded[0];
        if (first) {
          setBoardId(first.id);
          setEmailColumnId(first.columns.find((c) => c.type === 'email')?.id ?? '');
        }
      })
      .catch(() => setError(t.mwBoardLoadFailed));
  }, [boardIds, t]);

  const board = boards?.find((b) => b.id === boardId) ?? null;
  const emailColumns = board?.columns.filter((c) => c.type === 'email') ?? [];
  const phoneColumns = board?.columns.filter((c) => c.type === 'phone') ?? [];

  const selectBoard = (id: string) => {
    setBoardId(id);
    const next = boards?.find((b) => b.id === id);
    setEmailColumnId(next?.columns.find((c) => c.type === 'email')?.id ?? '');
    setPhoneColumnId('');
    setRows(null);
    setResult(null);
    setError(null);
  };

  // Preview: read the board as soon as a board + email column are chosen.
  useEffect(() => {
    setRows(null);
    if (!boardId || !emailColumnId) return;
    let stale = false;
    fetchImportRows(boardId, emailColumnId, phoneColumnId || null)
      .then((loaded) => {
        if (!stale) setRows(loaded);
      })
      .catch(() => {
        if (!stale) setError(t.mwBoardLoadFailed);
      });
    return () => {
      stale = true;
    };
  }, [boardId, emailColumnId, phoneColumnId, t]);

  const runImport = useCallback(async () => {
    if (!rows || rows.length === 0) return;
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      let created = 0;
      let skipped = 0;
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        const res = await mondayApi.importClients(rows.slice(i, i + IMPORT_CHUNK));
        created += res.created;
        skipped += res.skipped;
      }
      setResult(t.mwImportDone(created, skipped));
      onImported();
    } catch (err) {
      setError(err instanceof MondayApiError && err.code === 'no_mailbox' ? t.mwMailboxNeeded : t.mwImportFailed);
    } finally {
      setBusy(false);
    }
  }, [rows, onImported, t]);

  if (boards === null && !error) return <p className="muted">{t.loading}</p>;
  if (boards !== null && boards.length === 0) return <p className="muted">{t.mwNoBoards}</p>;

  return (
    <div className="mw-import">
      {boards !== null && boards.length > 1 && (
        <label className="field">
          <span>{t.mwBoardLabel}</span>
          <select value={boardId} onChange={(e) => selectBoard(e.target.value)}>
            {boards.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>
      )}

      {board && emailColumns.length === 0 ? (
        <p className="muted">{t.mwNoEmailColumn}</p>
      ) : (
        board && (
          <>
            <label className="field">
              <span>{t.mwEmailColumnLabel}</span>
              <select value={emailColumnId} onChange={(e) => setEmailColumnId(e.target.value)}>
                {emailColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            {phoneColumns.length > 0 && (
              <label className="field">
                <span>{t.mwPhoneColumnLabel}</span>
                <select value={phoneColumnId} onChange={(e) => setPhoneColumnId(e.target.value)}>
                  <option value="">{t.mwNoPhoneColumn}</option>
                  {phoneColumns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {rows === null ? (
              <p className="muted">{t.loading}</p>
            ) : (
              <>
                <p className="muted">{t.mwImportableCount(rows.length)}</p>
                <div className="btn-row">
                  <button className="btn btn-primary" disabled={busy || rows.length === 0} onClick={runImport}>
                    {busy ? t.mwImporting : t.mwImportRun(rows.length)}
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}

      {result && <p className="muted">{result}</p>}
      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import { useT } from '../i18n';
import { mondayApi, MondayApiError } from './api';
import { showToast } from './sdk';
import {
  emailColumnCandidates,
  fetchBoards,
  fetchImportableBoards,
  fetchImportRows,
  guessEmailColumn,
  guessPhoneColumn,
  nameColumnCandidates,
  nameColumnTitle,
  phoneColumnCandidates,
  type BoardMeta,
  type ImportRow,
} from './boards';

const IMPORT_CHUNK = 500; // server-side max per POST

interface Props {
  boardIds: string[];
  /** Refetch the dashboard after a successful import. */
  onImported: () => void;
  /** Collapse the import form (the cancel button). */
  onClose: () => void;
}

/**
 * Board → clients import: pick a connected board, map its columns onto the
 * fields fiscalMind needs (name from the item name or a text column, email
 * required, phone optional), preview the qualifying rows, then import.
 * Re-importing is safe — the server skips emails that already exist.
 */
export function ImportPanel({ boardIds, onImported, onClose }: Props) {
  const { t } = useT();
  const [boards, setBoards] = useState<BoardMeta[] | null>(null);
  const [boardId, setBoardId] = useState<string>('');
  const [nameColumnId, setNameColumnId] = useState<string>(''); // '' = the item name
  const [emailColumnId, setEmailColumnId] = useState<string>('');
  const [phoneColumnId, setPhoneColumnId] = useState<string>('');
  const [rows, setRows] = useState<ImportRow[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Boards connected to the widget; when monday reports none (per-widget
  // connections are easy to miss), fall back to every readable board that has
  // a column that could hold email addresses so the import still works.
  useEffect(() => {
    let stale = false;
    setError(null);
    (boardIds.length > 0 ? fetchBoards(boardIds) : fetchImportableBoards())
      .then((loaded) => {
        if (stale) return;
        setBoards(loaded);
        const first = loaded[0];
        if (first) {
          setBoardId(first.id);
          setEmailColumnId(guessEmailColumn(first));
          setPhoneColumnId(guessPhoneColumn(first));
        }
      })
      .catch(() => {
        if (!stale) setError(t.mwBoardLoadFailed);
      });
    return () => {
      stale = true;
    };
  }, [boardIds, t]);

  const board = boards?.find((b) => b.id === boardId) ?? null;
  const nameColumns = board ? nameColumnCandidates(board) : [];
  const emailColumns = board ? emailColumnCandidates(board) : [];
  const phoneColumns = board ? phoneColumnCandidates(board) : [];

  const selectBoard = (id: string) => {
    setBoardId(id);
    const next = boards?.find((b) => b.id === id);
    setNameColumnId('');
    setEmailColumnId(next ? guessEmailColumn(next) : '');
    setPhoneColumnId(next ? guessPhoneColumn(next) : '');
    setRows(null);
    setError(null);
  };

  // Preview: read the board as soon as a board + email column are chosen.
  useEffect(() => {
    setRows(null);
    if (!boardId || !emailColumnId) return;
    let stale = false;
    fetchImportRows(boardId, emailColumnId, phoneColumnId || null, nameColumnId || null)
      .then((loaded) => {
        if (!stale) setRows(loaded);
      })
      .catch(() => {
        if (!stale) setError(t.mwBoardLoadFailed);
      });
    return () => {
      stale = true;
    };
  }, [boardId, emailColumnId, phoneColumnId, nameColumnId, t]);

  const runImport = useCallback(async () => {
    if (!rows || rows.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      let created = 0;
      let skipped = 0;
      for (let i = 0; i < rows.length; i += IMPORT_CHUNK) {
        const res = await mondayApi.importClients(rows.slice(i, i + IMPORT_CHUNK));
        created += res.created;
        skipped += res.skipped;
      }
      // Done: the outcome goes to a monday toast and the form collapses. Errors
      // stay inline instead, so the user can retry with the form still open.
      showToast(t.mwImportDone(created, skipped), created > 0 ? 'success' : 'info');
      onImported();
      onClose();
    } catch (err) {
      setError(err instanceof MondayApiError && err.code === 'no_mailbox' ? t.mwMailboxNeeded : t.mwImportFailed);
    } finally {
      setBusy(false);
    }
  }, [rows, onImported, onClose, t]);

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
            {/* Always shown (even when the item name is the only choice) so the
                user can see where the client name comes from. */}
            <label className="field">
              <span>{t.mwNameColumnLabel}</span>
              <select value={nameColumnId} onChange={(e) => setNameColumnId(e.target.value)}>
                <option value="">{t.mwItemNameOption(nameColumnTitle(board))}</option>
                {nameColumns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>{t.mwEmailColumnLabel}</span>
              <select value={emailColumnId} onChange={(e) => setEmailColumnId(e.target.value)}>
                {emailColumnId === '' && (
                  <option value="" disabled>
                    {t.mwChooseColumn}
                  </option>
                )}
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

            {!emailColumnId ? (
              <p className="muted">{t.mwChooseColumnHint}</p>
            ) : rows === null ? (
              <p className="muted">{t.loading}</p>
            ) : (
              <>
                <p className="muted">{t.mwImportableCount(rows.length)}</p>
                {rows.length > 0 && (
                  <table className="mw-sample">
                    <thead>
                      <tr>
                        <th>{t.mwColName}</th>
                        <th>{t.mwColEmail}</th>
                        {phoneColumnId && <th>{t.mwColPhone}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.slice(0, 3).map((r, i) => (
                        <tr key={i}>
                          <td>{r.name}</td>
                          <td>{r.email}</td>
                          {phoneColumnId && <td>{r.phone ?? '—'}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="btn-row">
                  <button className="btn btn-primary" disabled={busy || rows.length === 0} onClick={runImport}>
                    {busy ? t.mwImporting : t.mwImportRun(rows.length)}
                  </button>
                  <button className="btn btn-ghost" disabled={busy} onClick={onClose}>
                    {t.cancel}
                  </button>
                </div>
              </>
            )}
          </>
        )
      )}

      {error && <div className="error-banner">{error}</div>}
    </div>
  );
}

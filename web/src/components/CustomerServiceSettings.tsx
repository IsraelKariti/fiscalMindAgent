import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type CustomerServiceSettings as CsSettings,
  type MondayBoardMeta,
  type MondayConnection,
  type MondayDocMeta,
} from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT } from '../i18n';

/**
 * The customer-service agent's settings section: connect the accountant's
 * monday account (OAuth popup), then pick the knowledge workdocs and the
 * client-data boards (each with its phone column). Rendered inside the
 * workspace Settings view via AgentTypeUI.settingsPanel.
 */
export function CustomerServiceSettings() {
  const { t } = useT();
  const wsApi = useWorkspaceApi();
  const [connection, setConnection] = useState<MondayConnection | null>(null);
  const [settings, setSettings] = useState<CsSettings | null>(null);
  const [docs, setDocs] = useState<MondayDocMeta[] | null>(null);
  const [boards, setBoards] = useState<MondayBoardMeta[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [addingBoardId, setAddingBoardId] = useState('');
  const savedResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const connectPoll = useRef<ReturnType<typeof setInterval>>();

  const loadPickers = useCallback(async () => {
    // 409 not_connected is an expected state, not a failure.
    try {
      const [{ docs: docList }, { boards: boardList }] = await Promise.all([
        wsApi.csListMondayDocs(),
        wsApi.csListMondayBoards(),
      ]);
      setDocs(docList);
      setBoards(boardList);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) setLoadFailed(true);
    }
  }, [wsApi]);

  const load = useCallback(async () => {
    try {
      const [conn, { settings: current }] = await Promise.all([api.mondayConnection(), wsApi.csGetSettings()]);
      setConnection(conn);
      setSettings(current);
      if (conn.connected) await loadPickers();
    } catch {
      setLoadFailed(true);
    }
  }, [wsApi, loadPickers]);

  useEffect(() => {
    load().catch(() => setLoadFailed(true));
    return () => {
      clearInterval(connectPoll.current);
      clearTimeout(savedResetTimer.current);
    };
  }, [load]);

  // Popup-blocker-safe connect: open the window synchronously, then point it at
  // the OAuth start URL. The callback page postMessages back, but the message
  // can be lost (or blocked cross-origin) — poll the status too while waiting.
  const connect = async () => {
    const win = window.open('about:blank', '_blank', 'popup,width=520,height=680');
    try {
      const { url } = await api.mondayConnectUrl();
      if (win) win.location.href = url;
      else window.open(url, '_blank', 'popup,width=520,height=680');
    } catch {
      win?.close();
      return;
    }
    const finish = () => {
      clearInterval(connectPoll.current);
      window.removeEventListener('message', onMessage);
      load().catch(() => setLoadFailed(true));
    };
    const onMessage = (event: MessageEvent) => {
      if (event.data === 'fm-monday-connected') finish();
    };
    window.addEventListener('message', onMessage);
    clearInterval(connectPoll.current);
    connectPoll.current = setInterval(async () => {
      try {
        const conn = await api.mondayConnection();
        if (conn.connected) finish();
      } catch {
        /* keep polling */
      }
      if (win?.closed) {
        // One last check after the popup closed, then stop either way.
        clearInterval(connectPoll.current);
        window.removeEventListener('message', onMessage);
        load().catch(() => setLoadFailed(true));
      }
    }, 2000);
  };

  const disconnect = async () => {
    await api.mondayDisconnect();
    setDocs(null);
    setBoards(null);
    await load();
  };

  const save = async (next: CsSettings) => {
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      const { settings: stored } = await wsApi.csSaveSettings(next);
      setSettings(stored);
      setSaved(true);
      clearTimeout(savedResetTimer.current);
      savedResetTimer.current = setTimeout(() => setSaved(false), 1600);
    } catch {
      setLoadFailed(true);
    } finally {
      setSaving(false);
    }
  };

  const toggleDoc = (docId: string) => {
    if (!settings) return;
    const docIds = settings.docIds.includes(docId)
      ? settings.docIds.filter((id) => id !== docId)
      : [...settings.docIds, docId];
    save({ ...settings, docIds }).catch(console.error);
  };

  const addBoard = (boardId: string) => {
    if (!settings || !boards) return;
    const board = boards.find((b) => b.id === boardId);
    if (!board || settings.boards.some((b) => b.boardId === boardId)) return;
    // Preselect the most likely phone column: a real phone column first, else the first text column.
    const phoneColumn = board.columns.find((c) => c.type === 'phone') ?? board.columns.find((c) => c.type === 'text' || c.type === 'long_text');
    if (!phoneColumn) return;
    setAddingBoardId('');
    save({
      ...settings,
      boards: [...settings.boards, { boardId: board.id, phoneColumnId: phoneColumn.id, boardName: board.name }],
    }).catch(console.error);
  };

  const removeBoard = (boardId: string) => {
    if (!settings) return;
    save({ ...settings, boards: settings.boards.filter((b) => b.boardId !== boardId) }).catch(console.error);
  };

  const setPhoneColumn = (boardId: string, phoneColumnId: string) => {
    if (!settings) return;
    save({
      ...settings,
      boards: settings.boards.map((b) => (b.boardId === boardId ? { ...b, phoneColumnId } : b)),
    }).catch(console.error);
  };

  if (!connection || !settings) {
    return (
      <div className="settings-section">
        <h3>{t.csSettingsTitle}</h3>
        <p className="muted">{loadFailed ? t.csLoadFailed : t.loading}</p>
      </div>
    );
  }

  const phoneColumnCandidates = (board: MondayBoardMeta) =>
    board.columns.filter((c) => c.type === 'phone' || c.type === 'text' || c.type === 'long_text');
  const availableBoards = boards?.filter((b) => !settings.boards.some((chosen) => chosen.boardId === b.id)) ?? [];

  return (
    <div className="settings-section">
      <h3>{t.csSettingsTitle}</h3>
      <p className="muted">{t.csSettingsDesc}</p>
      {loadFailed && <p className="muted">{t.csLoadFailed}</p>}

      {!connection.configured ? (
        <p className="muted">{t.csMondayNotConfigured}</p>
      ) : !connection.connected ? (
        <div>
          <p className="muted">{t.csConnectFirstHint}</p>
          <button type="button" className="btn btn-primary" onClick={connect}>
            {t.csConnectMonday}
          </button>
        </div>
      ) : (
        <>
          <div className="plan-row">
            <span className="badge badge-neutral">{t.csMondayConnected}</span>
            <button type="button" className="btn btn-ghost btn-small" onClick={disconnect}>
              {t.csDisconnect}
            </button>
            {saving ? <span className="muted">{t.loading}</span> : saved ? <span className="muted">{t.csSaved}</span> : null}
          </div>

          <h4>{t.csKnowledgeDocs}</h4>
          <p className="muted">{t.csKnowledgeDocsDesc}</p>
          {docs === null ? (
            <p className="muted">{t.loading}</p>
          ) : docs.length === 0 ? (
            <p className="muted">{t.csNoDocs}</p>
          ) : (
            <ul className="cs-doc-list">
              {docs.map((doc) => (
                <li key={doc.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={settings.docIds.includes(doc.id)}
                      onChange={() => toggleDoc(doc.id)}
                    />{' '}
                    {doc.name}
                    {doc.workspaceName ? <span className="muted"> — {doc.workspaceName}</span> : null}
                  </label>
                </li>
              ))}
            </ul>
          )}

          <h4>{t.csBoards}</h4>
          <p className="muted">{t.csBoardsDesc}</p>
          {boards === null ? (
            <p className="muted">{t.loading}</p>
          ) : (
            <>
              {settings.boards.length > 0 && (
                <ul className="cs-board-list">
                  {settings.boards.map((chosen) => {
                    const board = boards.find((b) => b.id === chosen.boardId);
                    return (
                      <li key={chosen.boardId} className="cs-board-row">
                        <span>{board?.name ?? chosen.boardName ?? chosen.boardId}</span>
                        {board && (
                          <label>
                            {t.csPhoneColumn}{' '}
                            <select
                              value={chosen.phoneColumnId}
                              onChange={(e) => setPhoneColumn(chosen.boardId, e.target.value)}
                            >
                              {phoneColumnCandidates(board).map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.title}
                                </option>
                              ))}
                            </select>
                          </label>
                        )}
                        <button
                          type="button"
                          className="btn btn-ghost btn-small"
                          onClick={() => removeBoard(chosen.boardId)}
                        >
                          {t.csRemoveBoard}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {boards.length === 0 ? (
                <p className="muted">{t.csNoBoards}</p>
              ) : availableBoards.length > 0 ? (
                <label>
                  {t.csAddBoard}{' '}
                  <select value={addingBoardId} onChange={(e) => addBoard(e.target.value)}>
                    <option value="">—</option>
                    {availableBoards.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </label>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

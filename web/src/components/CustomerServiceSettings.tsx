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
import { SettingsGroup, SettingsRow } from './SettingsUI';

const removeIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * A "+ Add …" button that opens a styled dropdown of the not-yet-chosen
 * items. Shared by the workdoc and board pickers so both read the same way.
 */
function AddPicker({
  label,
  options,
  onPick,
}: {
  label: string;
  options: { id: string; name: string }[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open]);

  return (
    <div className="add-picker" ref={rootRef}>
      <button
        type="button"
        className="btn btn-ghost btn-small"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
      >
        + {label}
      </button>
      {open && (
        <ul className="add-picker-menu" role="menu">
          {options.map((option) => (
            <li key={option.id}>
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  onPick(option.id);
                }}
              >
                {option.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The customer-service agent's settings sections: connect the accountant's
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
      const [conn, { settings: current }] = await Promise.all([
        api.mondayConnection(),
        wsApi.csGetSettings(),
      ]);
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

  const addDoc = (docId: string) => {
    if (!settings || settings.docIds.includes(docId)) return;
    save({ ...settings, docIds: [...settings.docIds, docId] }).catch(console.error);
  };

  const removeDoc = (docId: string) => {
    if (!settings) return;
    save({ ...settings, docIds: settings.docIds.filter((id) => id !== docId) }).catch(console.error);
  };

  const addBoard = (boardId: string) => {
    if (!settings || !boards) return;
    const board = boards.find((b) => b.id === boardId);
    if (!board || settings.boards.some((b) => b.boardId === boardId)) return;
    // Preselect the most likely phone column: a real phone column first, else the first text column.
    const phoneColumn = board.columns.find((c) => c.type === 'phone') ?? board.columns.find((c) => c.type === 'text' || c.type === 'long_text');
    if (!phoneColumn) return;
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
      <SettingsGroup title={t.csSettingsTitle}>
        <SettingsRow
          title={t.csMondayAccount}
          control={<span className="muted">{loadFailed ? t.csLoadFailed : t.loading}</span>}
        />
      </SettingsGroup>
    );
  }

  const phoneColumnCandidates = (board: MondayBoardMeta) =>
    board.columns.filter((c) => c.type === 'phone' || c.type === 'text' || c.type === 'long_text');
  const availableDocs = docs?.filter((d) => !settings.docIds.includes(d.id)) ?? [];
  const availableBoards = boards?.filter((b) => !settings.boards.some((chosen) => chosen.boardId === b.id)) ?? [];

  return (
    <>
      <SettingsGroup title={t.csSettingsTitle}>
        <SettingsRow
          title={t.csMondayAccount}
          description={
            loadFailed
              ? t.csLoadFailed
              : !connection.configured
                ? t.csMondayNotConfigured
                : !connection.connected
                  ? t.csConnectFirstHint
                  : undefined
          }
          control={
            !connection.configured ? undefined : !connection.connected ? (
              <button type="button" className="btn btn-primary" onClick={connect}>
                {t.csConnectMonday}
              </button>
            ) : (
              <>
                <span className="badge badge-success">{t.csMondayConnected}</span>
                <button type="button" className="btn btn-ghost btn-small" onClick={disconnect}>
                  {t.csDisconnect}
                </button>
              </>
            )
          }
        />
      </SettingsGroup>

      {connection.connected && (
        <SettingsGroup
          title={t.csGroupSources}
          aside={
            saving ? (
              <span className="settings-group-status">{t.loading}</span>
            ) : saved ? (
              <span className="settings-group-status settings-group-status-ok">{t.csSaved}</span>
            ) : undefined
          }
        >
          <div className="settings-subsection">
            <SettingsRow
              title={t.csKnowledgeDocs}
              description={t.csKnowledgeDocsDesc}
              control={
                docs === null ? (
                  <span className="muted">{t.loading}</span>
                ) : availableDocs.length > 0 ? (
                  <AddPicker label={t.csAddDoc} options={availableDocs} onPick={addDoc} />
                ) : undefined
              }
            />
            {docs?.length === 0 ? (
              <p className="settings-list-empty muted">{t.csNoDocs}</p>
            ) : (
              settings.docIds.length > 0 && (
                <ul className="settings-list">
                  {settings.docIds.map((docId) => (
                    <li key={docId} className="settings-list-row">
                      <span className="settings-list-name">{docs?.find((d) => d.id === docId)?.name ?? docId}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t.csRemove}
                        aria-label={t.csRemove}
                        onClick={() => removeDoc(docId)}
                      >
                        {removeIcon}
                      </button>
                    </li>
                  ))}
                </ul>
              )
            )}
          </div>

          <div className="settings-subsection">
            <SettingsRow
              title={t.csBoards}
              description={t.csBoardsDesc}
              control={
                boards === null ? (
                  <span className="muted">{t.loading}</span>
                ) : availableBoards.length > 0 ? (
                  <AddPicker
                    label={t.csAddBoard}
                    options={availableBoards.map((b) => ({ id: b.id, name: b.name }))}
                    onPick={addBoard}
                  />
                ) : undefined
              }
            />
            {boards?.length === 0 ? (
              <p className="settings-list-empty muted">{t.csNoBoards}</p>
            ) : (
              settings.boards.length > 0 && (
                <ul className="settings-list">
                  {settings.boards.map((chosen) => {
                    const board = boards?.find((b) => b.id === chosen.boardId);
                    return (
                      <li key={chosen.boardId} className="settings-list-row">
                        <span className="settings-list-name">{board?.name ?? chosen.boardName ?? chosen.boardId}</span>
                        {board && (
                          <label className="settings-list-field">
                            <span className="muted">{t.csPhoneColumn}</span>
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
                          className="icon-btn"
                          title={t.csRemove}
                          aria-label={t.csRemove}
                          onClick={() => removeBoard(chosen.boardId)}
                        >
                          {removeIcon}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )
            )}
          </div>
        </SettingsGroup>
      )}
    </>
  );
}

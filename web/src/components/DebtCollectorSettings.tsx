import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type DebtCollectorSettings as DcSettings,
  type GoogleConnection,
  type MondayBoardMeta,
  type MondayConnection,
  type SpreadsheetMeta,
} from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import { useT } from '../i18n';
import { SettingsGroup, SettingsRow } from './SettingsUI';
import { SheetMappingModal, type SheetMapping } from './SheetMappingModal';
import { SourcePickerModal, type PickerSelection } from './SourcePickerModal';

const removeIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/**
 * The debt collector's settings sections: connect the accountant's monday /
 * Google accounts (same account-level OAuth flows as the customer-service
 * agent), then pick the boards and sheets holding client financial rows —
 * each mapped by its email column (the row-matching key) plus an optional
 * name column (names auto-enrolled debtors found by the daily scan).
 * Rendered inside the workspace Settings view via AgentTypeUI.settingsPanel.
 */
export function DebtCollectorSettings() {
  const { t } = useT();
  const wsApi = useWorkspaceApi();
  const [connection, setConnection] = useState<MondayConnection | null>(null);
  const [gConnection, setGConnection] = useState<GoogleConnection | null>(null);
  const [settings, setSettings] = useState<DcSettings | null>(null);
  const [boards, setBoards] = useState<MondayBoardMeta[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickingBoards, setPickingBoards] = useState(false);
  /** Spreadsheet just picked in the Google Picker, awaiting its tab/column mapping. */
  const [mapping, setMapping] = useState<{ spreadsheetId: string; name: string; meta: SpreadsheetMeta } | null>(null);
  const [pickFailed, setPickFailed] = useState(false);
  const savedResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const connectPoll = useRef<ReturnType<typeof setInterval>>();
  // The Google Picker message listener outlives renders; read settings through
  // a ref so a pick applied late still starts from the current state.
  const settingsRef = useRef<DcSettings | null>(null);
  settingsRef.current = settings;

  const loadBoards = useCallback(async () => {
    // 409 not_connected is an expected state, not a failure.
    try {
      const { boards: boardList } = await wsApi.dcListMondayBoards();
      setBoards(boardList);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) setLoadFailed(true);
    }
  }, [wsApi]);

  const load = useCallback(async () => {
    try {
      const [conn, gConn, { settings: current }] = await Promise.all([
        api.mondayConnection(),
        api.googleConnection(),
        wsApi.dcGetSettings(),
      ]);
      setConnection(conn);
      setGConnection(gConn);
      setSettings(current);
      if (conn.connected) await loadBoards();
    } catch {
      setLoadFailed(true);
    }
  }, [wsApi, loadBoards]);

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
  const openConnectPopup = async (
    getUrl: () => Promise<{ url: string }>,
    getStatus: () => Promise<{ connected: boolean }>,
    doneMessage: string,
  ) => {
    const win = window.open('about:blank', '_blank', 'popup,width=520,height=680');
    try {
      const { url } = await getUrl();
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
      if (event.data === doneMessage) finish();
    };
    window.addEventListener('message', onMessage);
    clearInterval(connectPoll.current);
    connectPoll.current = setInterval(async () => {
      try {
        const conn = await getStatus();
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

  const connect = () => openConnectPopup(api.mondayConnectUrl, api.mondayConnection, 'fm-monday-connected');
  const connectGoogle = () => openConnectPopup(api.googleConnectUrl, api.googleConnection, 'fm-google-connected');

  const disconnect = async () => {
    await api.mondayDisconnect();
    setBoards(null);
    await load();
  };

  const disconnectGoogle = async () => {
    await api.googleDisconnect();
    await load();
  };

  const save = async (next: DcSettings) => {
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      const { settings: stored } = await wsApi.dcSaveSettings(next);
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

  const applyBoardSelection = (selection: PickerSelection[]) => {
    setPickingBoards(false);
    if (!settings || !boards) return;
    save({
      ...settings,
      boards: selection.flatMap(({ id, columnId }) => {
        const board = boards.find((b) => b.id === id);
        if (!board || !columnId) return [];
        // Re-confirming the picker must not reset a previously chosen name column.
        const existing = settings.boards.find((b) => b.boardId === id);
        return [{ boardId: id, emailColumnId: columnId, nameColumnId: existing?.nameColumnId, boardName: board.name }];
      }),
    }).catch(console.error);
  };

  const removeBoard = (boardId: string) => {
    if (!settings) return;
    save({ ...settings, boards: settings.boards.filter((b) => b.boardId !== boardId) }).catch(console.error);
  };

  const setEmailColumn = (boardId: string, emailColumnId: string) => {
    if (!settings) return;
    save({
      ...settings,
      boards: settings.boards.map((b) => (b.boardId === boardId ? { ...b, emailColumnId } : b)),
    }).catch(console.error);
  };

  // '' = the default (monday item name); undefined keeps the stored settings free of the key.
  const setNameColumn = (boardId: string, nameColumnId: string) => {
    if (!settings) return;
    save({
      ...settings,
      boards: settings.boards.map((b) => (b.boardId === boardId ? { ...b, nameColumnId: nameColumnId || undefined } : b)),
    }).catch(console.error);
  };

  /** A sheet pick continues into the tab/email-column mapping modal. */
  const handlePicked = async (id: string, name: string) => {
    try {
      const { meta } = await wsApi.dcSpreadsheetMeta(id);
      setMapping({ spreadsheetId: id, name, meta });
    } catch {
      setPickFailed(true);
    }
  };

  /**
   * Opens the Google Picker popup (google-picker.html, popup-blocker-safe:
   * opened synchronously). The access token travels by postMessage, never in
   * the URL: the popup announces fm-picker-ready, we answer with the config,
   * it reports fm-picked. See web/src/google-picker.ts for the other side.
   */
  const addGoogleSheet = () => {
    setPickFailed(false);
    const win = window.open('/google-picker.html', '_blank', 'popup,width=1080,height=720');
    if (!win) return;
    const configPromise = api.googlePickerConfig();
    configPromise.catch(() => {
      setPickFailed(true);
      win.close();
    });
    const done = () => {
      clearInterval(closePoll);
      window.removeEventListener('message', onMessage);
    };
    const onMessage = async (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== win) return;
      const data = event.data as { type?: string; id?: string; name?: string };
      if (data?.type === 'fm-picker-ready') {
        try {
          const config = await configPromise;
          win.postMessage({ type: 'fm-picker-config', ...config, view: 'spreadsheets' }, window.location.origin);
        } catch {
          /* already handled above */
        }
      } else if (data?.type === 'fm-picked' && data.id) {
        done();
        handlePicked(data.id, data.name ?? '').catch(() => setPickFailed(true));
      }
    };
    window.addEventListener('message', onMessage);
    const closePoll = setInterval(() => {
      if (win.closed) done();
    }, 2000);
  };

  const applySheetMapping = (chosen: SheetMapping) => {
    const current = settingsRef.current;
    if (!current || !mapping) return;
    setMapping(null);
    save({
      ...current,
      sheets: [
        // Re-adding the same tab replaces its mapping instead of duplicating it.
        ...current.sheets.filter(
          (s) => !(s.spreadsheetId === mapping.spreadsheetId && s.sheetTitle === chosen.sheetTitle),
        ),
        {
          spreadsheetId: mapping.spreadsheetId,
          spreadsheetName: mapping.name,
          sheetTitle: chosen.sheetTitle,
          emailColumn: chosen.phoneColumn,
          nameColumn: chosen.nameColumn,
        },
      ],
    }).catch(console.error);
  };

  const removeSheet = (spreadsheetId: string, sheetTitle: string) => {
    if (!settings) return;
    save({
      ...settings,
      sheets: settings.sheets.filter((s) => !(s.spreadsheetId === spreadsheetId && s.sheetTitle === sheetTitle)),
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

  const emailColumnCandidates = (board: MondayBoardMeta) =>
    board.columns.filter((c) => c.type === 'email' || c.type === 'text' || c.type === 'long_text');

  // Any column can hold the display name; the built-in item-name column is the dropdown's default option.
  const nameColumnCandidates = (board: MondayBoardMeta) => board.columns.filter((c) => c.type !== 'name');

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
          title={t.csBoards}
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
              title={t.csBoards}
              description={t.dcBoardsDesc}
              control={
                boards === null ? (
                  <span className="muted">{t.loading}</span>
                ) : boards.length > 0 ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setPickingBoards(true)}>
                    {t.csChooseBoards}
                  </button>
                ) : undefined
              }
            />
            {boards?.length === 0 ? (
              <p className="settings-list-empty muted">{t.dcNoBoards}</p>
            ) : (
              settings.boards.length > 0 && (
                <ul className="settings-list">
                  {settings.boards.map((chosen) => {
                    const board = boards?.find((b) => b.id === chosen.boardId);
                    return (
                      <li key={chosen.boardId} className="settings-list-row">
                        <span className="settings-list-name">{board?.name ?? chosen.boardName ?? chosen.boardId}</span>
                        {board && (
                          <>
                            <label className="settings-list-field">
                              <span className="muted">{t.dcEmailColumn}</span>
                              <select
                                value={chosen.emailColumnId}
                                onChange={(e) => setEmailColumn(chosen.boardId, e.target.value)}
                              >
                                {emailColumnCandidates(board).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="settings-list-field">
                              <span className="muted">{t.csNameColumn}</span>
                              <select
                                value={chosen.nameColumnId ?? ''}
                                onChange={(e) => setNameColumn(chosen.boardId, e.target.value)}
                              >
                                <option value="">{t.csNameColumnDefault}</option>
                                {nameColumnCandidates(board).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                          </>
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

      {gConnection && (
        <SettingsGroup title={t.csGoogleSettingsTitle}>
          <SettingsRow
            title={t.csGoogleAccount}
            description={
              !gConnection.configured
                ? t.csGoogleNotConfigured
                : !gConnection.connected
                  ? t.csGoogleConnectFirstHint
                  : undefined
            }
            control={
              !gConnection.configured ? undefined : !gConnection.connected ? (
                <button type="button" className="btn btn-primary" onClick={connectGoogle}>
                  {t.csConnectGoogle}
                </button>
              ) : (
                <>
                  <span className="badge badge-success">{t.csGoogleConnected}</span>
                  <button type="button" className="btn btn-ghost btn-small" onClick={disconnectGoogle}>
                    {t.csDisconnect}
                  </button>
                </>
              )
            }
          />
        </SettingsGroup>
      )}

      {gConnection?.connected && (
        <SettingsGroup
          title={t.csGoogleSheets}
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
              title={t.csGoogleSheets}
              description={t.dcSheetsDesc}
              control={
                <button type="button" className="btn btn-ghost btn-small" onClick={addGoogleSheet}>
                  {t.csAddGoogleSheet}
                </button>
              }
            />
            {pickFailed && <p className="settings-list-empty muted">{t.csPickerFailed}</p>}
            {settings.sheets.length > 0 && (
              <ul className="settings-list">
                {settings.sheets.map((sheet) => (
                  <li key={`${sheet.spreadsheetId}:${sheet.sheetTitle}`} className="settings-list-row">
                    <span className="settings-list-name">{sheet.spreadsheetName ?? sheet.spreadsheetId}</span>
                    <span className="muted">
                      {t.csSheetTab}: {sheet.sheetTitle} · {t.dcEmailColumn}: {sheet.emailColumn}
                      {sheet.nameColumn ? ` · ${t.csNameColumn}: ${sheet.nameColumn}` : ''}
                    </span>
                    <button
                      type="button"
                      className="icon-btn"
                      title={t.csRemove}
                      aria-label={t.csRemove}
                      onClick={() => removeSheet(sheet.spreadsheetId, sheet.sheetTitle)}
                    >
                      {removeIcon}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </SettingsGroup>
      )}

      {mapping && (
        <SheetMappingModal
          spreadsheetName={mapping.name}
          meta={mapping.meta}
          columnLabel={t.dcEmailColumn}
          description={t.dcSheetMappingDesc}
          onConfirm={applySheetMapping}
          onClose={() => setMapping(null)}
        />
      )}

      {pickingBoards && boards && (
        <SourcePickerModal
          title={t.csChooseBoards}
          columnLabel={t.dcEmailColumn}
          items={boards.map((board) => {
            const candidates = emailColumnCandidates(board);
            // Preselect the most likely email column: a real email column first, else the first text column.
            const preferred = candidates.find((c) => c.type === 'email') ?? candidates[0];
            return {
              id: board.id,
              name: board.name,
              columns: candidates.map((c) => ({ id: c.id, title: c.title })),
              defaultColumnId: preferred?.id,
            };
          })}
          initial={settings.boards.map((b) => ({ id: b.boardId, columnId: b.emailColumnId }))}
          onConfirm={applyBoardSelection}
          onClose={() => setPickingBoards(false)}
        />
      )}
    </>
  );
}

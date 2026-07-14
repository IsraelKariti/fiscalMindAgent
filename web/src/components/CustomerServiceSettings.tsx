import { useCallback, useEffect, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type CustomerServiceSettings as CsSettings,
  type GoogleConnection,
  type MondayBoardMeta,
  type MondayConnection,
  type MondayDocMeta,
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
 * The customer-service agent's settings sections: connect the accountant's
 * monday account (OAuth popup), then pick the knowledge workdocs and the
 * client-data boards (each with its phone column) — and likewise connect
 * Google (drive.file OAuth popup) and pick Sheets with client rows / Docs with
 * office knowledge via the Google Picker. Rendered inside the workspace
 * Settings view via AgentTypeUI.settingsPanel.
 */
export function CustomerServiceSettings() {
  const { t } = useT();
  const wsApi = useWorkspaceApi();
  const [connection, setConnection] = useState<MondayConnection | null>(null);
  const [gConnection, setGConnection] = useState<GoogleConnection | null>(null);
  const [settings, setSettings] = useState<CsSettings | null>(null);
  const [docs, setDocs] = useState<MondayDocMeta[] | null>(null);
  const [boards, setBoards] = useState<MondayBoardMeta[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [picker, setPicker] = useState<'docs' | 'boards' | null>(null);
  /** Spreadsheet just picked in the Google Picker, awaiting its tab/column mapping. */
  const [mapping, setMapping] = useState<{ spreadsheetId: string; name: string; meta: SpreadsheetMeta } | null>(null);
  const [pickFailed, setPickFailed] = useState(false);
  const savedResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const connectPoll = useRef<ReturnType<typeof setInterval>>();
  // The Google Picker message listener outlives renders; read settings through
  // a ref so a pick applied late still starts from the current state.
  const settingsRef = useRef<CsSettings | null>(null);
  settingsRef.current = settings;

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
      const [conn, gConn, { settings: current }] = await Promise.all([
        api.mondayConnection(),
        api.googleConnection(),
        wsApi.csGetSettings(),
      ]);
      setConnection(conn);
      setGConnection(gConn);
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
    setDocs(null);
    setBoards(null);
    await load();
  };

  const disconnectGoogle = async () => {
    await api.googleDisconnect();
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

  const applyDocSelection = (selection: PickerSelection[]) => {
    setPicker(null);
    if (!settings) return;
    save({ ...settings, docIds: selection.map((s) => s.id) }).catch(console.error);
  };

  const applyBoardSelection = (selection: PickerSelection[]) => {
    setPicker(null);
    if (!settings || !boards) return;
    save({
      ...settings,
      boards: selection.flatMap(({ id, columnId }) => {
        const board = boards.find((b) => b.id === id);
        if (!board || !columnId) return [];
        // Re-confirming the picker must not reset a previously chosen name column.
        const existing = settings.boards.find((b) => b.boardId === id);
        return [{ boardId: id, phoneColumnId: columnId, nameColumnId: existing?.nameColumnId, boardName: board.name }];
      }),
    }).catch(console.error);
  };

  const removeDoc = (docId: string) => {
    if (!settings) return;
    save({ ...settings, docIds: settings.docIds.filter((id) => id !== docId) }).catch(console.error);
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

  // '' = the default (monday item name); undefined keeps the stored settings free of the key.
  const setNameColumn = (boardId: string, nameColumnId: string) => {
    if (!settings) return;
    save({
      ...settings,
      boards: settings.boards.map((b) => (b.boardId === boardId ? { ...b, nameColumnId: nameColumnId || undefined } : b)),
    }).catch(console.error);
  };

  /** A doc pick is final; a sheet pick continues into the tab/phone-column mapping modal. */
  const handlePicked = async (view: 'spreadsheets' | 'documents', id: string, name: string) => {
    const current = settingsRef.current;
    if (!current) return;
    if (view === 'documents') {
      await save({
        ...current,
        googleDocs: [...current.googleDocs.filter((d) => d.documentId !== id), { documentId: id, name }],
      });
      return;
    }
    try {
      const { meta } = await wsApi.csSpreadsheetMeta(id);
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
  const addGoogleSource = (view: 'spreadsheets' | 'documents') => {
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
          win.postMessage({ type: 'fm-picker-config', ...config, view }, window.location.origin);
        } catch {
          /* already handled above */
        }
      } else if (data?.type === 'fm-picked' && data.id) {
        done();
        handlePicked(view, data.id, data.name ?? '').catch(() => setPickFailed(true));
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
        { spreadsheetId: mapping.spreadsheetId, spreadsheetName: mapping.name, ...chosen },
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

  const removeGoogleDoc = (documentId: string) => {
    if (!settings) return;
    save({ ...settings, googleDocs: settings.googleDocs.filter((d) => d.documentId !== documentId) }).catch(
      console.error,
    );
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

  // Any column can hold the display name; the built-in item-name column is the dropdown's default option.
  const nameColumnCandidates = (board: MondayBoardMeta) => board.columns.filter((c) => c.type !== 'name');

  const savedAside = saving ? (
    <span className="settings-group-status">{t.loading}</span>
  ) : saved ? (
    <span className="settings-group-status settings-group-status-ok">{t.csSaved}</span>
  ) : undefined;

  return (
    <>
      <SettingsGroup title={t.csSettingsTitle} aside={savedAside}>
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
        {connection.connected && (
          <div className="settings-subsection">
            <SettingsRow
              title={t.csKnowledgeDocs}
              description={t.csKnowledgeDocsDesc}
              control={
                docs === null ? (
                  <span className="muted">{t.loading}</span>
                ) : docs.length > 0 ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setPicker('docs')}>
                    {t.csChooseDocs}
                  </button>
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
        )}
        {connection.connected && (
          <div className="settings-subsection">
            <SettingsRow
              title={t.csBoards}
              description={t.csBoardsDesc}
              control={
                boards === null ? (
                  <span className="muted">{t.loading}</span>
                ) : boards.length > 0 ? (
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setPicker('boards')}>
                    {t.csChooseBoards}
                  </button>
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
                          <>
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
        )}
      </SettingsGroup>

      {gConnection && (
        <SettingsGroup title={t.csGoogleSettingsTitle} aside={savedAside}>
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
          {gConnection.connected && (
            <div className="settings-subsection">
              <SettingsRow
                title={t.csGoogleDocs}
                description={t.csGoogleDocsDesc}
                control={
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => addGoogleSource('documents')}>
                    {t.csAddGoogleDoc}
                  </button>
                }
              />
              {settings.googleDocs.length > 0 && (
                <ul className="settings-list">
                  {settings.googleDocs.map((doc) => (
                    <li key={doc.documentId} className="settings-list-row">
                      <span className="settings-list-name">{doc.name || doc.documentId}</span>
                      <button
                        type="button"
                        className="icon-btn"
                        title={t.csRemove}
                        aria-label={t.csRemove}
                        onClick={() => removeGoogleDoc(doc.documentId)}
                      >
                        {removeIcon}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {gConnection.connected && (
            <div className="settings-subsection">
              <SettingsRow
                title={t.csGoogleSheets}
                description={t.csGoogleSheetsDesc}
                control={
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => addGoogleSource('spreadsheets')}>
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
                        {t.csSheetTab}: {sheet.sheetTitle} · {t.csPhoneColumn}: {sheet.phoneColumn}
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
          )}
        </SettingsGroup>
      )}

      {mapping && (
        <SheetMappingModal
          spreadsheetName={mapping.name}
          meta={mapping.meta}
          onConfirm={applySheetMapping}
          onClose={() => setMapping(null)}
        />
      )}

      {picker === 'docs' && docs && (
        <SourcePickerModal
          title={t.csChooseDocs}
          items={docs.map((d) => ({ id: d.id, name: d.name }))}
          initial={settings.docIds.map((id) => ({ id }))}
          onConfirm={applyDocSelection}
          onClose={() => setPicker(null)}
        />
      )}
      {picker === 'boards' && boards && (
        <SourcePickerModal
          title={t.csChooseBoards}
          columnLabel={t.csPhoneColumn}
          items={boards.map((board) => {
            const candidates = phoneColumnCandidates(board);
            // Preselect the most likely phone column: a real phone column first, else the first text column.
            const preferred = candidates.find((c) => c.type === 'phone') ?? candidates[0];
            return {
              id: board.id,
              name: board.name,
              columns: candidates.map((c) => ({ id: c.id, title: c.title })),
              defaultColumnId: preferred?.id,
            };
          })}
          initial={settings.boards.map((b) => ({ id: b.boardId, columnId: b.phoneColumnId }))}
          onConfirm={applyBoardSelection}
          onClose={() => setPicker(null)}
        />
      )}
    </>
  );
}

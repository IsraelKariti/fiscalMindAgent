import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type ClientImportScanResult,
  type ClientSourcesConfig,
  type GoogleConnection,
  type MondayBoardMeta,
  type MondayConnection,
  type SpreadsheetMeta,
} from '../api';
import { useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { DEFAULT_DOCUMENTS } from '../defaultDocuments';
import { useT } from '../i18n';
import { SettingsGroup, SettingsRow } from './SettingsUI';
import { SheetMappingModal, type SheetMapping } from './SheetMappingModal';
import { SourcePickerModal, type PickerSelection } from './SourcePickerModal';

const removeIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/** The per-agent transport: each consumer binds its own settings/boards/meta routes. */
export interface ClientSourcesPanelApi {
  getSettings: () => Promise<{ settings: ClientSourcesConfig; mondayConnected: boolean; googleConnected: boolean }>;
  saveSettings: (settings: ClientSourcesConfig) => Promise<{ settings: ClientSourcesConfig }>;
  listBoards: () => Promise<{ boards: MondayBoardMeta[] }>;
  spreadsheetMeta: (spreadsheetId: string) => Promise<{ meta: SpreadsheetMeta }>;
  /** When provided, renders the "import now" row (client-import agents only). */
  scanNow?: () => Promise<ClientImportScanResult>;
}

interface Props {
  api: ClientSourcesPanelApi;
  boardsDescKey: MessageStringKey;
  sheetsDescKey: MessageStringKey;
  sheetMappingDescKey: MessageStringKey;
  /** Renders the default-documents checklist editor (doc collector: imported clients get this list). */
  withDocuments?: boolean;
  /** Maps the tax-portal credential columns (ת"ז + permanent user code) — doc collector only. */
  withPortalCredentials?: boolean;
}

/**
 * Shared settings sections for agents that read client rows from the
 * accountant's monday boards / Google Sheets: connect the account-level
 * monday/Google OAuth, pick boards and sheets (each mapped by its email
 * column, plus an optional name column), and — for client-import agents —
 * trigger an immediate import and edit the imported clients' documents
 * checklist. Rendered inside the workspace Settings view via
 * AgentTypeUI.settingsPanel; the debt collector wraps it too.
 */
export function ClientSourcesSettings({ api: panelApi, boardsDescKey, sheetsDescKey, sheetMappingDescKey, withDocuments = false, withPortalCredentials = false }: Props) {
  const { t } = useT();
  const [connection, setConnection] = useState<MondayConnection | null>(null);
  const [gConnection, setGConnection] = useState<GoogleConnection | null>(null);
  const [settings, setSettings] = useState<ClientSourcesConfig | null>(null);
  const [boards, setBoards] = useState<MondayBoardMeta[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickingBoards, setPickingBoards] = useState(false);
  /** Spreadsheet just picked in the Google Picker, awaiting its tab/column mapping. */
  const [mapping, setMapping] = useState<{ spreadsheetId: string; name: string; meta: SpreadsheetMeta | null } | null>(
    null,
  );
  const [pickFailed, setPickFailed] = useState(false);
  const [docDraft, setDocDraft] = useState('');
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<ClientImportScanResult | null>(null);
  const [scanFailed, setScanFailed] = useState(false);
  /** Post-save "import now?" prompt, shown next to the source list that just changed. */
  const [importPrompt, setImportPrompt] = useState<'boards' | 'sheets' | null>(null);
  const savedResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const connectPoll = useRef<ReturnType<typeof setInterval>>();
  // The Google Picker message listener outlives renders; read settings through
  // a ref so a pick applied late still starts from the current state.
  const settingsRef = useRef<ClientSourcesConfig | null>(null);
  settingsRef.current = settings;

  const loadBoards = useCallback(async () => {
    // 409 not_connected is an expected state, not a failure.
    try {
      const { boards: boardList } = await panelApi.listBoards();
      setBoards(boardList);
    } catch (err) {
      if (!(err instanceof ApiError && err.status === 409)) setLoadFailed(true);
    }
  }, [panelApi]);

  const load = useCallback(async () => {
    try {
      const [conn, gConn, { settings: current }] = await Promise.all([
        api.mondayConnection(),
        api.googleConnection(),
        panelApi.getSettings(),
      ]);
      setConnection(conn);
      setGConnection(gConn);
      setSettings(current);
      if (conn.connected) await loadBoards();
    } catch {
      setLoadFailed(true);
    }
  }, [panelApi, loadBoards]);

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

  const save = async (next: ClientSourcesConfig): Promise<boolean> => {
    setSettings(next);
    setSaving(true);
    setSaved(false);
    try {
      const { settings: stored } = await panelApi.saveSettings(next);
      setSettings(stored);
      setSaved(true);
      clearTimeout(savedResetTimer.current);
      savedResetTimer.current = setTimeout(() => setSaved(false), 1600);
      return true;
    } catch {
      setLoadFailed(true);
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** A source was just added/remapped: offer to import from it right here. */
  const offerImport = (kind: 'boards' | 'sheets') => {
    if (!panelApi.scanNow) return;
    setScanResult(null);
    setScanFailed(false);
    setImportPrompt(kind);
  };

  const applyBoardSelection = (selection: PickerSelection[]) => {
    setPickingBoards(false);
    if (!settings || !boards) return;
    const known = new Set(settings.boards.map((b) => b.boardId));
    const addsBoard = selection.some(({ id, columnId }) => columnId && !known.has(id));
    save({
      ...settings,
      boards: selection.flatMap(({ id, columnId }) => {
        const board = boards.find((b) => b.id === id);
        if (!board || !columnId) return [];
        // Re-confirming the picker must not reset previously chosen extra columns.
        const existing = settings.boards.find((b) => b.boardId === id);
        return [
          {
            boardId: id,
            emailColumnId: columnId,
            nameColumnId: existing?.nameColumnId,
            phoneColumnId: existing?.phoneColumnId,
            idNumberColumnId: existing?.idNumberColumnId,
            taxUserCodeColumnId: existing?.taxUserCodeColumnId,
            documentsColumnId: existing?.documentsColumnId,
            boardName: board.name,
          },
        ];
      }),
    })
      .then((ok) => {
        if (ok && addsBoard) offerImport('boards');
      })
      .catch(console.error);
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

  const setBoardOptionalColumn = (boardId: string, key: 'phoneColumnId' | 'idNumberColumnId' | 'taxUserCodeColumnId' | 'documentsColumnId', columnId: string) => {
    if (!settings) return;
    save({
      ...settings,
      boards: settings.boards.map((b) => (b.boardId === boardId ? { ...b, [key]: columnId || undefined } : b)),
    }).catch(console.error);
  };

  /**
   * A sheet pick continues into the tab/email-column mapping modal. The modal
   * opens right away in a loading state; the meta fetch fills it in (or closes
   * it on failure). The functional updates keep a modal the user already
   * dismissed closed.
   */
  const handlePicked = async (id: string, name: string) => {
    setMapping({ spreadsheetId: id, name, meta: null });
    try {
      const { meta } = await panelApi.spreadsheetMeta(id);
      setMapping((m) => (m && m.spreadsheetId === id ? { ...m, meta } : m));
    } catch {
      setMapping((m) => (m && m.spreadsheetId === id && !m.meta ? null : m));
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
          emailColumn: chosen.keyColumn,
          nameColumn: chosen.nameColumn,
          phoneColumn: chosen.phoneColumn,
          idNumberColumn: chosen.idNumberColumn,
          taxUserCodeColumn: chosen.taxUserCodeColumn,
          documentsColumn: chosen.documentsColumn,
        },
      ],
    })
      .then((ok) => {
        if (ok) offerImport('sheets');
      })
      .catch(console.error);
  };

  const removeSheet = (spreadsheetId: string, sheetTitle: string) => {
    if (!settings) return;
    save({
      ...settings,
      sheets: settings.sheets.filter((s) => !(s.spreadsheetId === spreadsheetId && s.sheetTitle === sheetTitle)),
    }).catch(console.error);
  };

  const documents = settings?.documents ?? [];

  const addDocument = () => {
    const trimmed = docDraft.trim();
    if (!settings || !trimmed || documents.some((d) => d.name === trimmed)) return;
    setDocDraft('');
    save({ ...settings, documents: [...documents, { name: trimmed }] }).catch(console.error);
  };

  const addDefaultDocuments = () => {
    if (!settings) return;
    const existing = new Set(documents.map((d) => d.name));
    const merged = [...documents, ...DEFAULT_DOCUMENTS.filter((d) => !existing.has(d.name))];
    save({ ...settings, documents: merged }).catch(console.error);
  };

  const removeDocument = (name: string) => {
    if (!settings) return;
    save({ ...settings, documents: documents.filter((d) => d.name !== name) }).catch(console.error);
  };

  const runScan = async () => {
    if (!panelApi.scanNow) return;
    setScanBusy(true);
    setScanFailed(false);
    setScanResult(null);
    try {
      setScanResult(await panelApi.scanNow());
    } catch {
      setScanFailed(true);
    } finally {
      setScanBusy(false);
    }
  };

  const scanMessage = (result: ClientImportScanResult): string => {
    if (result.notReady === 'no_sources') return t.sourcesImportNoSources;
    if (result.notReady === 'no_mailbox') return t.sourcesImportNoMailbox;
    if (result.notReady === 'no_documents') return t.sourcesImportNoDocuments;
    const summary = t.sourcesImportResult(result.enrolled, result.skipped);
    return result.failedSources.length > 0
      ? `${summary} ${t.sourcesImportFailedSources(result.failedSources.join(', '))}`
      : summary;
  };

  /** Inline "import now?" callout under the source list that was just saved. */
  const importPromptBanner = (kind: 'boards' | 'sheets') => {
    if (importPrompt !== kind) return null;
    if (scanBusy) {
      return (
        <div className="import-prompt">
          <span>{t.sourcesImporting}</span>
        </div>
      );
    }
    if (scanResult || scanFailed) {
      return (
        <div className="import-prompt">
          <span>{scanResult ? scanMessage(scanResult) : t.sourcesImportFailed}</span>
          <button
            type="button"
            className="icon-btn"
            title={t.sourcesImportPromptClose}
            aria-label={t.sourcesImportPromptClose}
            onClick={() => setImportPrompt(null)}
          >
            {removeIcon}
          </button>
        </div>
      );
    }
    return (
      <div className="import-prompt">
        <span>{kind === 'sheets' ? t.sourcesImportPromptSheet : t.sourcesImportPromptBoards}</span>
        <button type="button" className="btn btn-primary btn-small" onClick={runScan}>
          {t.sourcesImportNow}
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setImportPrompt(null)}>
          {t.sourcesImportPromptLater}
        </button>
      </div>
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

  const emailColumnCandidates = (board: MondayBoardMeta) =>
    board.columns.filter((c) => c.type === 'email' || c.type === 'text' || c.type === 'long_text');

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
              title={t.csBoards}
              description={t[boardsDescKey]}
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
                            {withPortalCredentials && (
                              <label className="settings-list-field">
                                <span className="muted">{t.sourcesIdNumberColumn}</span>
                                <select
                                  value={chosen.idNumberColumnId ?? ''}
                                  onChange={(e) => setBoardOptionalColumn(chosen.boardId, 'idNumberColumnId', e.target.value)}
                                >
                                  <option value="">{t.csSheetNameColumnNone}</option>
                                  {nameColumnCandidates(board).map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.title}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
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
                              <span className="muted">{t.csPhoneColumn}</span>
                              <select
                                value={chosen.phoneColumnId ?? ''}
                                onChange={(e) => setBoardOptionalColumn(chosen.boardId, 'phoneColumnId', e.target.value)}
                              >
                                <option value="">{t.csSheetNameColumnNone}</option>
                                {nameColumnCandidates(board).map((c) => (
                                  <option key={c.id} value={c.id}>
                                    {c.title}
                                  </option>
                                ))}
                              </select>
                            </label>
                            {withPortalCredentials && (
                              <label className="settings-list-field">
                                <span className="muted">{t.sourcesTaxCodeColumn}</span>
                                <select
                                  value={chosen.taxUserCodeColumnId ?? ''}
                                  onChange={(e) => setBoardOptionalColumn(chosen.boardId, 'taxUserCodeColumnId', e.target.value)}
                                >
                                  <option value="">{t.csSheetNameColumnNone}</option>
                                  {nameColumnCandidates(board).map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.title}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {withDocuments && (
                              <label className="settings-list-field">
                                <span className="muted">{t.sourcesDocumentsColumn}</span>
                                <select
                                  value={chosen.documentsColumnId ?? ''}
                                  onChange={(e) => setBoardOptionalColumn(chosen.boardId, 'documentsColumnId', e.target.value)}
                                >
                                  <option value="">{t.csSheetNameColumnNone}</option>
                                  {nameColumnCandidates(board).map((c) => (
                                    <option key={c.id} value={c.id}>
                                      {c.title}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
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
            {importPromptBanner('boards')}
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
                title={t.csGoogleSheets}
                description={t[sheetsDescKey]}
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
                        {sheet.phoneColumn ? ` · ${t.csPhoneColumn}: ${sheet.phoneColumn}` : ''}
                        {sheet.idNumberColumn ? ` · ${t.sourcesIdNumberColumn}: ${sheet.idNumberColumn}` : ''}
                        {sheet.taxUserCodeColumn ? ` · ${t.sourcesTaxCodeColumn}: ${sheet.taxUserCodeColumn}` : ''}
                        {sheet.documentsColumn ? ` · ${t.sourcesDocumentsColumn}: ${sheet.documentsColumn}` : ''}
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
              {importPromptBanner('sheets')}
            </div>
          )}
        </SettingsGroup>
      )}

      {withDocuments && (
        <SettingsGroup title={t.sourcesDocsTitle} aside={savedAside}>
          <div className="settings-subsection">
            <SettingsRow
              title={t.sourcesDocsTitle}
              description={t.sourcesDocsDesc}
              control={
                <button type="button" className="btn btn-ghost btn-small" onClick={addDefaultDocuments}>
                  {t.sourcesDocsUseDefault}
                </button>
              }
            />
            {documents.length > 0 && (
              <ul className="doc-chip-list">
                {documents.map((doc) => (
                  <li key={doc.name} className="doc-chip" title={doc.description ?? undefined}>
                    {doc.name}
                    <button type="button" className="chip-x" title={t.removeNamed(doc.name)} onClick={() => removeDocument(doc.name)}>
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <div className="doc-add-form">
              <input
                value={docDraft}
                onChange={(e) => setDocDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addDocument();
                  }
                }}
                placeholder={t.egForm106}
                aria-label={t.docNameAria}
              />
              <button type="button" className="btn btn-ghost" onClick={addDocument} disabled={!docDraft.trim()}>
                {t.addDocument}
              </button>
            </div>
          </div>
        </SettingsGroup>
      )}

      {panelApi.scanNow && (
        <SettingsGroup title={t.sourcesImportTitle}>
          <SettingsRow
            title={t.sourcesImportTitle}
            description={t.sourcesImportDesc}
            control={
              <button type="button" className="btn btn-primary" onClick={runScan} disabled={scanBusy}>
                {scanBusy ? t.sourcesImporting : t.sourcesImportNow}
              </button>
            }
          />
          {scanFailed && <p className="settings-list-empty muted">{t.sourcesImportFailed}</p>}
          {scanResult && <p className="settings-list-empty muted">{scanMessage(scanResult)}</p>}
        </SettingsGroup>
      )}

      {mapping && (
        <SheetMappingModal
          spreadsheetName={mapping.name}
          meta={mapping.meta}
          columnLabel={t.dcEmailColumn}
          description={t[sheetMappingDescKey]}
          withPhoneColumn
          withPortalCredentials={withPortalCredentials}
          withDocumentsColumn={withDocuments}
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

/** The doc collector's / annual-report assistant's panel, bound to the shared /client-sources routes. */
export function ClientImportSettings({
  withDocuments = false,
  withPortalCredentials = false,
}: {
  withDocuments?: boolean;
  withPortalCredentials?: boolean;
}) {
  const wsApi = useWorkspaceApi();
  const panelApi = useMemo<ClientSourcesPanelApi>(
    () => ({
      getSettings: wsApi.sourcesGetSettings,
      saveSettings: wsApi.sourcesSaveSettings,
      listBoards: wsApi.sourcesListMondayBoards,
      spreadsheetMeta: wsApi.sourcesSpreadsheetMeta,
      scanNow: wsApi.sourcesScanNow,
    }),
    [wsApi],
  );
  return (
    <ClientSourcesSettings
      api={panelApi}
      boardsDescKey="sourcesBoardsDesc"
      sheetsDescKey="sourcesSheetsDesc"
      sheetMappingDescKey="sourcesSheetMappingDesc"
      withDocuments={withDocuments}
      withPortalCredentials={withPortalCredentials}
    />
  );
}

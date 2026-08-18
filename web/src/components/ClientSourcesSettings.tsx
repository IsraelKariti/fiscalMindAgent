import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  api,
  ApiError,
  type ClientImportScanResult,
  type ClientImportSourceRef,
  type ClientSourcesConfig,
  type GoogleConnection,
  type MondayBoardMeta,
  type MondayConnection,
  type SpreadsheetMeta,
} from '../api';
import { useClientsRefresh, useWorkspaceApi } from '../agents/ApiContext';
import type { MessageStringKey } from '../agents/types';
import { useT } from '../i18n';
import { BoardMappingModal, type BoardMapping } from './BoardMappingModal';
import { SettingsGroup, SettingsRow } from './SettingsUI';
import { SheetMappingModal, type SheetMapping } from './SheetMappingModal';
import { SourcePickerModal, type PickerSelection } from './SourcePickerModal';
import { WhatsAppBusinessSettings } from './WhatsAppBusinessSettings';

const removeIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 6 6 18M6 6l12 12" />
  </svg>
);

/** The per-agent transport: each consumer binds its own settings/boards/meta routes. */
export interface ClientSourcesPanelApi {
  getSettings: () => Promise<{
    settings: ClientSourcesConfig;
    mondayConnected: boolean;
    googleConnected: boolean;
    /** Manual-kickoff agents only: the monday webhook URL that starts a board row's conversation. */
    kickoffWebhookUrl?: string;
  }>;
  saveSettings: (settings: ClientSourcesConfig) => Promise<{ settings: ClientSourcesConfig }>;
  listBoards: () => Promise<{ boards: MondayBoardMeta[] }>;
  spreadsheetMeta: (spreadsheetId: string) => Promise<{ meta: SpreadsheetMeta }>;
  /** When provided, renders the per-source "import now" buttons (client-import agents only). */
  scanNow?: (source?: ClientImportSourceRef) => Promise<ClientImportScanResult>;
}

interface Props {
  api: ClientSourcesPanelApi;
  boardsDescKey: MessageStringKey;
  sheetsDescKey: MessageStringKey;
  sheetMappingDescKey: MessageStringKey;
  boardMappingDescKey: MessageStringKey;
  /** Maps a required-documents column on each source (doc collector: the cell is the imported client's checklist). */
  withDocuments?: boolean;
  /** Maps the tax-portal credential columns (ת"ז + permanent user code) — doc collector only. */
  withPortalCredentials?: boolean;
}

/**
 * Shared settings sections for agents that read client rows from the
 * accountant's monday boards / Google Sheets: connect the account-level
 * monday/Google OAuth, pick boards and sheets (each continues into a column
 * mapping modal — email column plus the optional extras), and — for
 * client-import agents — trigger an immediate import. Rendered inside the
 * workspace Settings view via AgentTypeUI.settingsPanel; the debt collector
 * wraps it too.
 */
export function ClientSourcesSettings({ api: panelApi, boardsDescKey, sheetsDescKey, sheetMappingDescKey, boardMappingDescKey, withDocuments = false, withPortalCredentials = false }: Props) {
  const { t } = useT();
  const refreshClients = useClientsRefresh();
  const [connection, setConnection] = useState<MondayConnection | null>(null);
  const [gConnection, setGConnection] = useState<GoogleConnection | null>(null);
  const [settings, setSettings] = useState<ClientSourcesConfig | null>(null);
  const [kickoffUrl, setKickoffUrl] = useState<string | null>(null);
  const [kickoffCopied, setKickoffCopied] = useState(false);
  const [boards, setBoards] = useState<MondayBoardMeta[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [pickingBoards, setPickingBoards] = useState(false);
  /** Boards just checked in the picker, awaiting their column mapping (processed head-first). */
  const [mappingBoards, setMappingBoards] = useState<MondayBoardMeta[]>([]);
  /** Spreadsheet just picked in the Google Picker, awaiting its tab/column mapping. */
  const [mapping, setMapping] = useState<{ spreadsheetId: string; name: string; meta: SpreadsheetMeta | null } | null>(
    null,
  );
  const [pickFailed, setPickFailed] = useState(false);
  const [scanBusy, setScanBusy] = useState(false);
  const [scanResult, setScanResult] = useState<ClientImportScanResult | null>(null);
  const [scanFailed, setScanFailed] = useState(false);
  /** Which source's "import now" triggered the running/last scan: a board key or a sheet key. */
  const [scanOrigin, setScanOrigin] = useState<string | null>(null);
  const savedResetTimer = useRef<ReturnType<typeof setTimeout>>();
  const kickoffCopyTimer = useRef<ReturnType<typeof setTimeout>>();
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
      const [conn, gConn, { settings: current, kickoffWebhookUrl }] = await Promise.all([
        api.mondayConnection(),
        api.googleConnection(),
        panelApi.getSettings(),
      ]);
      setConnection(conn);
      setGConnection(gConn);
      setSettings(current);
      setKickoffUrl(kickoffWebhookUrl ?? null);
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
      clearTimeout(kickoffCopyTimer.current);
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

  const copyKickoffUrl = async () => {
    if (!kickoffUrl) return;
    try {
      await navigator.clipboard.writeText(kickoffUrl);
      setKickoffCopied(true);
      clearTimeout(kickoffCopyTimer.current);
      kickoffCopyTimer.current = setTimeout(() => setKickoffCopied(false), 1600);
    } catch {
      /* clipboard unavailable — the URL is selectable in place */
    }
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

  /**
   * The picker confirms which boards are wanted: unchecked boards are removed
   * right away, already-configured boards keep their mapping, and each newly
   * checked board continues into the column-mapping modal (like a sheet pick
   * continues into SheetMappingModal) before it is saved.
   */
  const applyBoardSelection = (selection: PickerSelection[]) => {
    setPickingBoards(false);
    if (!settings || !boards) return;
    const selectedIds = new Set(selection.map((s) => s.id));
    const kept = settings.boards.filter((b) => selectedIds.has(b.boardId));
    setMappingBoards(
      selection
        .filter((s) => !settings.boards.some((b) => b.boardId === s.id))
        .flatMap((s) => boards.find((b) => b.id === s.id) ?? []),
    );
    if (kept.length !== settings.boards.length) {
      save({ ...settings, boards: kept }).catch(console.error);
    }
  };

  /** A mapped board is saved and the queue advances to the next new board. */
  const applyBoardMapping = (board: MondayBoardMeta, mapping: BoardMapping) => {
    setMappingBoards((queue) => queue.slice(1));
    const current = settingsRef.current;
    if (!current) return;
    save({
      ...current,
      boards: [
        ...current.boards.filter((b) => b.boardId !== board.id),
        {
          boardId: board.id,
          boardName: board.name,
          ...mapping,
          // The new board prompts "import now" until a scan runs (client-import agents only).
          pendingImport: panelApi.scanNow ? true : undefined,
        },
      ],
    }).catch(console.error);
  };

  const removeBoard = (boardId: string) => {
    if (!settings) return;
    save({ ...settings, boards: settings.boards.filter((b) => b.boardId !== boardId) }).catch(console.error);
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
          // The new sheet prompts "import now" until a scan runs (client-import agents only).
          pendingImport: panelApi.scanNow ? true : undefined,
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

  const runScan = async (origin: string, source: ClientImportSourceRef) => {
    if (!panelApi.scanNow) return;
    setScanOrigin(origin);
    setScanBusy(true);
    setScanFailed(false);
    setScanResult(null);
    try {
      const result = await panelApi.scanNow(source);
      setScanResult(result);
      // Even 0-enrolled runs may have backfilled phones/credentials of existing clients.
      refreshClients();
      // A clean scan clears the scanned source's pendingImport flag server-side — pick that up.
      panelApi
        .getSettings()
        .then(({ settings: current }) => setSettings(current))
        .catch(() => {});
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

  /**
   * A source's "import now" prompt content. The prompt shows as long as the
   * source carries pendingImport (the server clears it once a scan reads the
   * source) — there is no dismiss; importing is the only way to resolve it.
   * While/after this prompt's own scan runs, it shows the progress/result.
   */
  const importPromptContent = (origin: string, source: ClientImportSourceRef, promptText: string) => {
    const active = scanOrigin === origin;
    if (active && scanBusy) return <span>{t.sourcesImporting}</span>;
    if (active && (scanResult || scanFailed)) {
      return (
        <>
          <span>{scanResult ? scanMessage(scanResult) : t.sourcesImportFailed}</span>
          <button
            type="button"
            className="icon-btn"
            title={t.sourcesImportPromptClose}
            aria-label={t.sourcesImportPromptClose}
            onClick={() => setScanOrigin(null)}
          >
            {removeIcon}
          </button>
        </>
      );
    }
    return (
      <>
        <span>{promptText}</span>
        <button
          type="button"
          className="btn btn-primary btn-small"
          onClick={() => runScan(origin, source)}
          disabled={scanBusy}
        >
          {t.sourcesImportNow}
        </button>
      </>
    );
  };

  /**
   * The always-available per-source "import now" button, shown while the
   * source's prompt/progress bar is not — so each source carries exactly one
   * import affordance at any time.
   */
  const importNowButton = (origin: string, source: ClientImportSourceRef) => (
    <button
      type="button"
      className="btn btn-ghost btn-small"
      onClick={() => runScan(origin, source)}
      disabled={scanBusy}
    >
      {t.sourcesImportNow}
    </button>
  );

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
                    const columnTitle = (id: string) => board?.columns.find((c) => c.id === id)?.title ?? id;
                    const boardOrigin = `board:${chosen.boardId}`;
                    const boardSource = { boardId: chosen.boardId };
                    const promptShown = Boolean(chosen.pendingImport) || scanOrigin === boardOrigin;
                    // The pending prompt carries its own button; otherwise the head button
                    // stays (it returns right after a scan, next to the result bar).
                    const buttonShown = !chosen.pendingImport && !(scanOrigin === boardOrigin && scanBusy);
                    return (
                      <li key={chosen.boardId} className="settings-source-card">
                        <div className="settings-source-head">
                          <span className="settings-list-name">{board?.name ?? chosen.boardName ?? chosen.boardId}</span>
                          {panelApi.scanNow && buttonShown && importNowButton(boardOrigin, boardSource)}
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => removeBoard(chosen.boardId)}
                          >
                            {t.csRemove}
                          </button>
                        </div>
                        <span className="muted settings-source-meta">
                          {t.dcEmailColumn}: {columnTitle(chosen.emailColumnId)}
                          {` · ${t.csNameColumn}: ${chosen.nameColumnId ? columnTitle(chosen.nameColumnId) : t.csNameColumnDefault}`}
                          {chosen.phoneColumnId ? ` · ${t.csPhoneColumn}: ${columnTitle(chosen.phoneColumnId)}` : ''}
                          {chosen.idNumberColumnId ? ` · ${t.sourcesIdNumberColumn}: ${columnTitle(chosen.idNumberColumnId)}` : ''}
                          {chosen.taxUserCodeColumnId ? ` · ${t.sourcesTaxCodeColumn}: ${columnTitle(chosen.taxUserCodeColumnId)}` : ''}
                          {chosen.documentsColumnId ? ` · ${t.sourcesDocumentsColumn}: ${columnTitle(chosen.documentsColumnId)}` : ''}
                        </span>
                        {panelApi.scanNow && promptShown && (
                          <div className="settings-source-prompt">
                            {importPromptContent(boardOrigin, boardSource, t.sourcesImportPromptBoard)}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )
            )}
            {kickoffUrl && settings.boards.length > 0 && (
              <SettingsRow title={t.sourcesKickoffTitle} description={t.sourcesKickoffDesc} stack>
                <div className="settings-kickoff-url">
                  <code>{kickoffUrl}</code>
                  <button type="button" className="btn btn-ghost btn-small" onClick={copyKickoffUrl}>
                    {kickoffCopied ? t.sourcesKickoffCopied : t.sourcesKickoffCopy}
                  </button>
                </div>
              </SettingsRow>
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
                  {settings.sheets.map((sheet) => {
                    const sheetKey = `${sheet.spreadsheetId}:${sheet.sheetTitle}`;
                    const sheetSource = { spreadsheetId: sheet.spreadsheetId, sheetTitle: sheet.sheetTitle };
                    const promptShown = Boolean(sheet.pendingImport) || scanOrigin === sheetKey;
                    // The pending prompt carries its own button; otherwise the head button
                    // stays (it returns right after a scan, next to the result bar).
                    const buttonShown = !sheet.pendingImport && !(scanOrigin === sheetKey && scanBusy);
                    return (
                      <li key={sheetKey} className="settings-source-card">
                        <div className="settings-source-head">
                          <span className="settings-list-name">{sheet.spreadsheetName ?? sheet.spreadsheetId}</span>
                          {panelApi.scanNow && buttonShown && importNowButton(sheetKey, sheetSource)}
                          <button
                            type="button"
                            className="btn btn-ghost btn-small"
                            onClick={() => removeSheet(sheet.spreadsheetId, sheet.sheetTitle)}
                          >
                            {t.csRemove}
                          </button>
                        </div>
                        <span className="muted settings-source-meta">
                          {t.csSheetTab}: {sheet.sheetTitle} · {t.dcEmailColumn}: {sheet.emailColumn}
                          {sheet.nameColumn ? ` · ${t.csNameColumn}: ${sheet.nameColumn}` : ''}
                          {sheet.phoneColumn ? ` · ${t.csPhoneColumn}: ${sheet.phoneColumn}` : ''}
                          {sheet.idNumberColumn ? ` · ${t.sourcesIdNumberColumn}: ${sheet.idNumberColumn}` : ''}
                          {sheet.taxUserCodeColumn ? ` · ${t.sourcesTaxCodeColumn}: ${sheet.taxUserCodeColumn}` : ''}
                          {sheet.documentsColumn ? ` · ${t.sourcesDocumentsColumn}: ${sheet.documentsColumn}` : ''}
                        </span>
                        {panelApi.scanNow && promptShown && (
                          <div className="settings-source-prompt">
                            {importPromptContent(sheetKey, sheetSource, t.sourcesImportPromptSheet)}
                          </div>
                        )}
                      </li>
                    );
                  })}
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
          items={boards.map((board) => ({ id: board.id, name: board.name }))}
          initial={settings.boards.map((b) => ({ id: b.boardId }))}
          onConfirm={applyBoardSelection}
          onClose={() => setPickingBoards(false)}
        />
      )}

      {mappingBoards[0] && (
        <BoardMappingModal
          key={mappingBoards[0].id}
          board={mappingBoards[0]}
          description={t[boardMappingDescKey]}
          withPortalCredentials={withPortalCredentials}
          withDocumentsColumn={withDocuments}
          onConfirm={(mapping) => applyBoardMapping(mappingBoards[0]!, mapping)}
          onClose={() => setMappingBoards((queue) => queue.slice(1))}
        />
      )}
    </>
  );
}

/** The doc collector's panel, bound to the shared /client-sources routes. */
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
    <>
      <ClientSourcesSettings
        api={panelApi}
        boardsDescKey="sourcesBoardsDesc"
        sheetsDescKey="sourcesSheetsDesc"
        sheetMappingDescKey="sourcesSheetMappingDesc"
        boardMappingDescKey="sourcesBoardMappingDesc"
        withDocuments={withDocuments}
        withPortalCredentials={withPortalCredentials}
      />
      <WhatsAppBusinessSettings />
    </>
  );
}

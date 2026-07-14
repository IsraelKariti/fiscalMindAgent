import { useMemo } from 'react';
import { useWorkspaceApi } from '../agents/ApiContext';
import { ClientSourcesSettings, type ClientSourcesPanelApi } from './ClientSourcesSettings';

/**
 * The debt collector's settings: the shared client-sources panel bound to the
 * /debt-collector routes. No import-now button (its daily scan screens rows
 * for open debts with an LLM before enrolling) and no documents checklist.
 */
export function DebtCollectorSettings() {
  const wsApi = useWorkspaceApi();
  const panelApi = useMemo<ClientSourcesPanelApi>(
    () => ({
      getSettings: wsApi.dcGetSettings,
      // The debt schema is strict (boards/sheets only) — never forward extra keys.
      saveSettings: (settings) => wsApi.dcSaveSettings({ boards: settings.boards, sheets: settings.sheets }),
      listBoards: wsApi.dcListMondayBoards,
      spreadsheetMeta: wsApi.dcSpreadsheetMeta,
    }),
    [wsApi],
  );
  return (
    <ClientSourcesSettings
      api={panelApi}
      boardsDescKey="dcBoardsDesc"
      sheetsDescKey="dcSheetsDesc"
      sheetMappingDescKey="dcSheetMappingDesc"
    />
  );
}

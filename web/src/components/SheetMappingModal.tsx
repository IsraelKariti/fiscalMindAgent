import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { SpreadsheetMeta } from '../api';
import { useT } from '../i18n';

export interface SheetMapping {
  sheetTitle: string;
  phoneColumn: string;
  nameColumn?: string;
}

/**
 * After picking a spreadsheet in the Google Picker: choose the tab the client
 * rows live in and the phone (+ optional name) column, from the sheet's header
 * row. The monday boards get this mapping inline in SourcePickerModal; sheets
 * get it here because the tab/columns are only known after the pick.
 */
export function SheetMappingModal({
  spreadsheetName,
  meta,
  onConfirm,
  onClose,
}: {
  spreadsheetName: string;
  meta: SpreadsheetMeta;
  onConfirm: (mapping: SheetMapping) => void;
  onClose: () => void;
}) {
  const { t } = useT();
  const [sheetTitle, setSheetTitle] = useState(meta.sheets[0]?.title ?? '');
  const headers = meta.sheets.find((s) => s.title === sheetTitle)?.headers ?? [];
  const [phoneColumn, setPhoneColumn] = useState(headers[0] ?? '');
  const [nameColumn, setNameColumn] = useState('');

  const selectTab = (title: string) => {
    setSheetTitle(title);
    const nextHeaders = meta.sheets.find((s) => s.title === title)?.headers ?? [];
    setPhoneColumn(nextHeaders[0] ?? '');
    setNameColumn('');
  };

  const confirm = () => {
    if (!sheetTitle || !phoneColumn) return;
    onConfirm({ sheetTitle, phoneColumn, nameColumn: nameColumn || undefined });
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {t.csSheetMappingTitle}: {spreadsheetName}
        </h2>
        <p className="muted">{t.csSheetMappingDesc}</p>
        <label className="settings-list-field">
          <span className="muted">{t.csSheetTab}</span>
          <select value={sheetTitle} onChange={(e) => selectTab(e.target.value)}>
            {meta.sheets.map((s) => (
              <option key={s.title} value={s.title}>
                {s.title}
              </option>
            ))}
          </select>
        </label>
        {headers.length === 0 ? (
          <p className="muted">{t.csSheetNoHeaders}</p>
        ) : (
          <>
            <label className="settings-list-field">
              <span className="muted">{t.csPhoneColumn}</span>
              <select value={phoneColumn} onChange={(e) => setPhoneColumn(e.target.value)}>
                {headers.map((h) => (
                  <option key={h} value={h}>
                    {h}
                  </option>
                ))}
              </select>
            </label>
            <label className="settings-list-field">
              <span className="muted">{t.csNameColumn}</span>
              <select value={nameColumn} onChange={(e) => setNameColumn(e.target.value)}>
                <option value="">{t.csSheetNameColumnNone}</option>
                {headers
                  .filter((h) => h !== phoneColumn)
                  .map((h) => (
                    <option key={h} value={h}>
                      {h}
                    </option>
                  ))}
              </select>
            </label>
          </>
        )}
        <div className="btn-row modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            {t.cancel}
          </button>
          <button className="btn btn-primary" type="button" onClick={confirm} disabled={!sheetTitle || !phoneColumn}>
            {t.csAdd}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

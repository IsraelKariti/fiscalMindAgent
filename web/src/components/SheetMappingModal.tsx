import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { SpreadsheetMeta } from '../api';
import { useT } from '../i18n';
import { Dropdown } from './Dropdown';
import { autoMapColumns, SourceMappingForm, type ColumnMapping, type MappingOption } from './SourceMappingForm';

export interface SheetMapping {
  sheetTitle: string;
  /** The row key column: phone for customer service, email for client-import agents. */
  keyColumn: string;
  nameColumn?: string;
  phoneColumn?: string;
  idNumberColumn?: string;
  taxUserCodeColumn?: string;
  documentsColumn?: string;
}

/**
 * After picking a spreadsheet in the Google Picker: choose the tab the client
 * rows live in and the key (+ optional extra) columns, from the sheet's header
 * row. The column fields themselves are the shared SourceMappingForm — monday
 * boards get the identical form in BoardMappingModal.
 *
 * Opens immediately after the pick with meta=null (loading state) so the user
 * sees feedback while the tab/header fetch is in flight.
 */
export function SheetMappingModal({
  spreadsheetName,
  meta,
  onConfirm,
  onClose,
  columnLabel,
  description,
  withPhoneColumn = false,
  withPortalCredentials = false,
  withDocumentsColumn = false,
}: {
  spreadsheetName: string;
  /** Null while the spreadsheet's tabs/headers are still loading. */
  meta: SpreadsheetMeta | null;
  onConfirm: (mapping: SheetMapping) => void;
  onClose: () => void;
  /** Label of the key column being mapped; defaults to the CS phone column. */
  columnLabel?: string;
  description?: string;
  /** Also map an optional phone column — client-import agents (key = email). */
  withPhoneColumn?: boolean;
  /** Also map the tax-portal credential columns (ת"ז + permanent user code) — doc collector. */
  withPortalCredentials?: boolean;
  /** Also map an optional per-client required-documents column — doc collector. */
  withDocumentsColumn?: boolean;
}) {
  const { t } = useT();

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {t.csSheetMappingTitle}: <span className="modal-highlight">{spreadsheetName}</span>
        </h2>
        <p className="muted">{description ?? t.csSheetMappingDesc}</p>
        {meta === null ? (
          <>
            <p className="muted">{t.loading}</p>
            <div className="btn-row modal-actions">
              <button className="btn btn-ghost" type="button" onClick={onClose}>
                {t.cancel}
              </button>
            </div>
          </>
        ) : (
          <SheetMappingForm
            meta={meta}
            onConfirm={onConfirm}
            onClose={onClose}
            columnLabel={columnLabel}
            withPhoneColumn={withPhoneColumn}
            withPortalCredentials={withPortalCredentials}
            withDocumentsColumn={withDocumentsColumn}
          />
        )}
      </div>
    </div>,
    document.body,
  );
}

/** Split out so its useState initializers run when meta arrives, not before. */
function SheetMappingForm({
  meta,
  onConfirm,
  onClose,
  columnLabel,
  withPhoneColumn,
  withPortalCredentials,
  withDocumentsColumn,
}: {
  meta: SpreadsheetMeta;
  onConfirm: (mapping: SheetMapping) => void;
  onClose: () => void;
  columnLabel?: string;
  withPhoneColumn: boolean;
  withPortalCredentials: boolean;
  withDocumentsColumn: boolean;
}) {
  const { t } = useT();
  // Client-import agents key rows by email (and map phone separately); the
  // customer-service agent keys by phone — see the withPhoneColumn prop doc.
  const keyKind: 'email' | 'phone' = withPhoneColumn ? 'email' : 'phone';
  const [sheetTitle, setSheetTitle] = useState(meta.sheets[0]?.title ?? '');
  const headers = meta.sheets.find((s) => s.title === sheetTitle)?.headers ?? [];
  const options: MappingOption[] = headers.map((h) => ({ value: h, label: h }));

  return (
    <>
      <label className="field">
        <span>{t.csSheetTab}</span>
        <Dropdown
          value={sheetTitle}
          onChange={setSheetTitle}
          options={meta.sheets.map((s) => ({ value: s.title, label: s.title }))}
        />
      </label>
      {headers.length === 0 ? (
        <>
          <p className="muted">{t.csSheetNoHeaders}</p>
          <div className="btn-row modal-actions">
            <button className="btn btn-ghost" type="button" onClick={onClose}>
              {t.cancel}
            </button>
          </div>
        </>
      ) : (
        // Keyed by tab: switching tabs re-runs the auto-mapping over the new headers.
        <SourceMappingForm
          key={sheetTitle}
          keyLabel={columnLabel ?? t.csPhoneColumn}
          keyOptions={options}
          options={options}
          initial={autoMapColumns(options, keyKind, {
            phone: withPhoneColumn,
            portalCredentials: withPortalCredentials,
            documents: withDocumentsColumn,
          })}
          withPhoneColumn={withPhoneColumn}
          withPortalCredentials={withPortalCredentials}
          withDocumentsColumn={withDocumentsColumn}
          onConfirm={(mapping: ColumnMapping) => onConfirm({ sheetTitle, ...mapping })}
          onClose={onClose}
        />
      )}
    </>
  );
}

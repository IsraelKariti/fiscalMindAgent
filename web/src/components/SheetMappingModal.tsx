import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { SpreadsheetMeta } from '../api';
import { useT } from '../i18n';
import { Dropdown } from './Dropdown';

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
 * row. The monday boards get this mapping inline in SourcePickerModal; sheets
 * get it here because the tab/columns are only known after the pick.
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

const HEADER_PATTERNS = {
  email: /mail|אימייל|דוא/i,
  phone: /phone|mobile|cell|טלפון|נייד/i,
  name: /name|שם/i,
  // ת"ז variants must be the whole header — a substring match would grab e.g. תזרים.
  idNumber: /^ת\.?["”״׳']?ז\.?$|תעודת זהות|\bid\b/i,
  taxUserCode: /קוד משתמש|user\s*code/i,
  documents: /document|מסמכ/i,
};

/**
 * Pre-select columns whose headers obviously match a field (EMAIL → email,
 * טלפון → phone, …) so the common case is confirming a pre-filled mapping
 * instead of picking every column by hand. Each header is used at most once,
 * and only fields the modal actually shows get filled.
 */
function autoMapColumns(
  headers: string[],
  keyKind: 'email' | 'phone',
  show: { phone: boolean; portalCredentials: boolean; documents: boolean },
) {
  const taken = new Set<string>();
  const find = (re: RegExp) => {
    const header = headers.find((h) => !taken.has(h) && re.test(h.trim()));
    if (header) taken.add(header);
    return header ?? '';
  };
  return {
    keyColumn: find(HEADER_PATTERNS[keyKind]),
    nameColumn: find(HEADER_PATTERNS.name),
    idNumberColumn: show.portalCredentials ? find(HEADER_PATTERNS.idNumber) : '',
    phoneColumn: show.phone ? find(HEADER_PATTERNS.phone) : '',
    taxUserCodeColumn: show.portalCredentials ? find(HEADER_PATTERNS.taxUserCode) : '',
    documentsColumn: show.documents ? find(HEADER_PATTERNS.documents) : '',
  };
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
  const show = { phone: withPhoneColumn, portalCredentials: withPortalCredentials, documents: withDocumentsColumn };
  const [sheetTitle, setSheetTitle] = useState(meta.sheets[0]?.title ?? '');
  const headers = meta.sheets.find((s) => s.title === sheetTitle)?.headers ?? [];
  const initial = autoMapColumns(meta.sheets[0]?.headers ?? [], keyKind, show);
  const [keyColumn, setKeyColumn] = useState(initial.keyColumn);
  const [nameColumn, setNameColumn] = useState(initial.nameColumn);
  const [phoneColumn, setPhoneColumn] = useState(initial.phoneColumn);
  const [idNumberColumn, setIdNumberColumn] = useState(initial.idNumberColumn);
  const [taxUserCodeColumn, setTaxUserCodeColumn] = useState(initial.taxUserCodeColumn);
  const [documentsColumn, setDocumentsColumn] = useState(initial.documentsColumn);

  const selectTab = (title: string) => {
    setSheetTitle(title);
    const tabHeaders = meta.sheets.find((s) => s.title === title)?.headers ?? [];
    const mapped = autoMapColumns(tabHeaders, keyKind, show);
    setKeyColumn(mapped.keyColumn);
    setNameColumn(mapped.nameColumn);
    setPhoneColumn(mapped.phoneColumn);
    setIdNumberColumn(mapped.idNumberColumn);
    setTaxUserCodeColumn(mapped.taxUserCodeColumn);
    setDocumentsColumn(mapped.documentsColumn);
  };

  const confirm = () => {
    if (!sheetTitle || !keyColumn) return;
    onConfirm({
      sheetTitle,
      keyColumn,
      nameColumn: nameColumn || undefined,
      phoneColumn: phoneColumn || undefined,
      idNumberColumn: idNumberColumn || undefined,
      taxUserCodeColumn: taxUserCodeColumn || undefined,
      documentsColumn: documentsColumn || undefined,
    });
  };

  const optionalColumnOptions = [
    { value: '', label: t.csSheetNameColumnNone },
    ...headers.filter((h) => h !== keyColumn).map((h) => ({ value: h, label: h })),
  ];

  return (
    <>
      <label className="field">
        <span>{t.csSheetTab}</span>
        <Dropdown
          value={sheetTitle}
          onChange={selectTab}
          options={meta.sheets.map((s) => ({ value: s.title, label: s.title }))}
        />
      </label>
      {headers.length === 0 ? (
        <p className="muted">{t.csSheetNoHeaders}</p>
      ) : (
        <>
          <label className="field">
            <span>{t.csNameColumn}</span>
            <Dropdown value={nameColumn} onChange={setNameColumn} options={optionalColumnOptions} />
          </label>
          {withPortalCredentials && (
            <label className="field">
              <span>{t.sourcesIdNumberColumn}</span>
              <Dropdown value={idNumberColumn} onChange={setIdNumberColumn} options={optionalColumnOptions} />
            </label>
          )}
          <label className="field">
            <span>{columnLabel ?? t.csPhoneColumn}</span>
            <Dropdown
              value={keyColumn}
              onChange={setKeyColumn}
              options={headers.map((h) => ({ value: h, label: h }))}
              placeholder={t.csSheetChooseColumn}
            />
          </label>
          {withPhoneColumn && (
            <label className="field">
              <span>{t.csPhoneColumn}</span>
              <Dropdown value={phoneColumn} onChange={setPhoneColumn} options={optionalColumnOptions} />
            </label>
          )}
          {withPortalCredentials && (
            <label className="field">
              <span>{t.sourcesTaxCodeColumn}</span>
              <Dropdown value={taxUserCodeColumn} onChange={setTaxUserCodeColumn} options={optionalColumnOptions} />
            </label>
          )}
          {withDocumentsColumn && (
            <label className="field">
              <span>{t.sourcesDocumentsColumn}</span>
              <Dropdown value={documentsColumn} onChange={setDocumentsColumn} options={optionalColumnOptions} />
            </label>
          )}
        </>
      )}
      <div className="btn-row modal-actions">
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          {t.cancel}
        </button>
        <button className="btn btn-primary" type="button" onClick={confirm} disabled={!sheetTitle || !keyColumn}>
          {t.csAdd}
        </button>
      </div>
    </>
  );
}

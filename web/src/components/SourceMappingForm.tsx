import { useState } from 'react';
import { useT } from '../i18n';
import { Dropdown } from './Dropdown';

export interface MappingOption {
  /** Stored value: a header text (sheets) or a column id (boards). */
  value: string;
  label: string;
}

/** The confirmed mapping; optional fields are undefined when left unmapped. */
export interface ColumnMapping {
  keyColumn: string;
  nameColumn?: string;
  phoneColumn?: string;
  idNumberColumn?: string;
  taxUserCodeColumn?: string;
  documentsColumn?: string;
}

/** Every field as a plain string ('' = unset) — the form's initial state. */
export interface MappingDraft {
  keyColumn: string;
  nameColumn: string;
  phoneColumn: string;
  idNumberColumn: string;
  taxUserCodeColumn: string;
  documentsColumn: string;
}

const LABEL_PATTERNS = {
  email: /mail|אימייל|דוא/i,
  phone: /phone|mobile|cell|טלפון|נייד/i,
  name: /name|שם/i,
  // ת"ז variants must be the whole header — a substring match would grab e.g. תזרים.
  idNumber: /^ת\.?["”״׳']?ז\.?$|תעודת זהות|\bid\b/i,
  taxUserCode: /קוד משתמש|user\s*code/i,
  documents: /document|מסמכ/i,
};

/**
 * Pre-select columns whose labels obviously match a field (EMAIL → email,
 * טלפון → phone, …) so the common case is confirming a pre-filled mapping
 * instead of picking every column by hand. Each column is used at most once,
 * and only fields the form actually shows get filled.
 */
export function autoMapColumns(
  options: MappingOption[],
  keyKind: 'email' | 'phone',
  show: { phone: boolean; portalCredentials: boolean; documents: boolean },
): MappingDraft {
  const taken = new Set<string>();
  const find = (re: RegExp) => {
    const option = options.find((o) => !taken.has(o.value) && re.test(o.label.trim()));
    if (option) taken.add(option.value);
    return option?.value ?? '';
  };
  return {
    keyColumn: find(LABEL_PATTERNS[keyKind]),
    nameColumn: find(LABEL_PATTERNS.name),
    idNumberColumn: show.portalCredentials ? find(LABEL_PATTERNS.idNumber) : '',
    phoneColumn: show.phone ? find(LABEL_PATTERNS.phone) : '',
    taxUserCodeColumn: show.portalCredentials ? find(LABEL_PATTERNS.taxUserCode) : '',
    documentsColumn: show.documents ? find(LABEL_PATTERNS.documents) : '',
  };
}

/**
 * The column-mapping fields + confirm row shared by the sheet and board
 * mapping modals, so both sources are configured through the exact same form.
 * Mount with a `key` when the option set changes (e.g. a sheet tab switch) so
 * the field state re-initializes from `initial`.
 */
export function SourceMappingForm({
  keyLabel,
  keyOptions,
  options,
  initial,
  nameDefaultLabel,
  onConfirm,
  onClose,
  withPhoneColumn = false,
  withPortalCredentials = false,
  withDocumentsColumn = false,
}: {
  /** Label of the required key column (email for client-import agents, phone for CS). */
  keyLabel: string;
  /** Choices for the key column (boards restrict it to email/text columns). */
  keyOptions: MappingOption[];
  /** Choices for the optional columns. */
  options: MappingOption[];
  initial: MappingDraft;
  /** Label of the name column's '' option; defaults to "none" (boards: the item name). */
  nameDefaultLabel?: string;
  onConfirm: (mapping: ColumnMapping) => void;
  onClose: () => void;
  /** Also map an optional phone column — client-import agents (key = email). */
  withPhoneColumn?: boolean;
  /** Also map the tax-portal credential columns (ת"ז + permanent user code) — doc collector. */
  withPortalCredentials?: boolean;
  /** Also map an optional per-client required-documents column — doc collector. */
  withDocumentsColumn?: boolean;
}) {
  const { t } = useT();
  const [keyColumn, setKeyColumn] = useState(initial.keyColumn);
  const [nameColumn, setNameColumn] = useState(initial.nameColumn);
  const [phoneColumn, setPhoneColumn] = useState(initial.phoneColumn);
  const [idNumberColumn, setIdNumberColumn] = useState(initial.idNumberColumn);
  const [taxUserCodeColumn, setTaxUserCodeColumn] = useState(initial.taxUserCodeColumn);
  const [documentsColumn, setDocumentsColumn] = useState(initial.documentsColumn);

  const confirm = () => {
    if (!keyColumn) return;
    onConfirm({
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
    ...options.filter((o) => o.value !== keyColumn),
  ];
  const nameColumnOptions = [
    { value: '', label: nameDefaultLabel ?? t.csSheetNameColumnNone },
    ...options.filter((o) => o.value !== keyColumn),
  ];

  return (
    <>
      <label className="field">
        <span>{t.csNameColumn}</span>
        <Dropdown value={nameColumn} onChange={setNameColumn} options={nameColumnOptions} />
      </label>
      {withPortalCredentials && (
        <label className="field">
          <span>{t.sourcesIdNumberColumn}</span>
          <Dropdown value={idNumberColumn} onChange={setIdNumberColumn} options={optionalColumnOptions} />
        </label>
      )}
      <label className="field">
        <span>{keyLabel}</span>
        <Dropdown
          value={keyColumn}
          onChange={setKeyColumn}
          options={keyOptions}
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
      <div className="btn-row modal-actions">
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          {t.cancel}
        </button>
        <button className="btn btn-primary" type="button" onClick={confirm} disabled={!keyColumn}>
          {t.csAdd}
        </button>
      </div>
    </>
  );
}

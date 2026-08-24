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
  statusColumn?: string;
  crmLinkColumn?: string;
  formLinkColumn?: string;
  fileNumberColumn?: string;
  yearColumn?: string;
}

/** Every field as a plain string ('' = unset) — the form's initial state. */
export interface MappingDraft {
  keyColumn: string;
  nameColumn: string;
  phoneColumn: string;
  idNumberColumn: string;
  taxUserCodeColumn: string;
  documentsColumn: string;
  statusColumn: string;
  crmLinkColumn: string;
  formLinkColumn: string;
  fileNumberColumn: string;
  yearColumn: string;
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
    // Status columns have their own typed option list; the caller preselects.
    statusColumn: '',
    // Declaration-flow columns have their own typed option lists; the caller preselects.
    crmLinkColumn: '',
    formLinkColumn: '',
    fileNumberColumn: '',
    yearColumn: '',
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
  statusOptions,
  declarationLinkOptions,
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
  /** When set, also map the status column the agent reports its progress to (boards only, status-typed columns). */
  statusOptions?: MappingOption[];
  /**
   * Declaration-of-capital boards: connect-boards options for the CRM /
   * questionnaire link columns (plus file-number + year fields from the
   * regular options). When set, the CRM link is the required field and the
   * key (phone) column becomes optional — the phone lives on the linked CRM item.
   */
  declarationLinkOptions?: MappingOption[];
}) {
  const { t } = useT();
  const [keyColumn, setKeyColumn] = useState(initial.keyColumn);
  const [nameColumn, setNameColumn] = useState(initial.nameColumn);
  const [phoneColumn, setPhoneColumn] = useState(initial.phoneColumn);
  const [idNumberColumn, setIdNumberColumn] = useState(initial.idNumberColumn);
  const [taxUserCodeColumn, setTaxUserCodeColumn] = useState(initial.taxUserCodeColumn);
  const [documentsColumn, setDocumentsColumn] = useState(initial.documentsColumn);
  const [statusColumn, setStatusColumn] = useState(initial.statusColumn);
  const [crmLinkColumn, setCrmLinkColumn] = useState(initial.crmLinkColumn);
  const [formLinkColumn, setFormLinkColumn] = useState(initial.formLinkColumn);
  const [fileNumberColumn, setFileNumberColumn] = useState(initial.fileNumberColumn);
  const [yearColumn, setYearColumn] = useState(initial.yearColumn);

  const declaration = declarationLinkOptions !== undefined;
  const confirmable = declaration ? Boolean(crmLinkColumn) : Boolean(keyColumn);

  const confirm = () => {
    if (!confirmable) return;
    onConfirm({
      keyColumn,
      nameColumn: nameColumn || undefined,
      phoneColumn: phoneColumn || undefined,
      idNumberColumn: idNumberColumn || undefined,
      taxUserCodeColumn: taxUserCodeColumn || undefined,
      documentsColumn: documentsColumn || undefined,
      statusColumn: statusColumn || undefined,
      crmLinkColumn: crmLinkColumn || undefined,
      formLinkColumn: formLinkColumn || undefined,
      fileNumberColumn: fileNumberColumn || undefined,
      yearColumn: yearColumn || undefined,
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
      {declaration && (
        <>
          <label className="field">
            <span>{t.sourcesCrmLinkColumn}</span>
            <Dropdown
              value={crmLinkColumn}
              onChange={setCrmLinkColumn}
              options={declarationLinkOptions!}
              placeholder={t.csSheetChooseColumn}
            />
          </label>
          <label className="field">
            <span>{t.sourcesFormLinkColumn}</span>
            <Dropdown
              value={formLinkColumn}
              onChange={setFormLinkColumn}
              options={[{ value: '', label: t.csSheetNameColumnNone }, ...declarationLinkOptions!]}
            />
          </label>
          <label className="field">
            <span>{t.sourcesFileNumberColumn}</span>
            <Dropdown value={fileNumberColumn} onChange={setFileNumberColumn} options={optionalColumnOptions} />
          </label>
          <label className="field">
            <span>{t.sourcesYearColumn}</span>
            <Dropdown value={yearColumn} onChange={setYearColumn} options={optionalColumnOptions} />
          </label>
        </>
      )}
      <label className="field">
        <span>{keyLabel}</span>
        <Dropdown
          value={keyColumn}
          onChange={setKeyColumn}
          // Declaration boards resolve the phone through the CRM link — their own key column is optional.
          options={declaration ? [{ value: '', label: t.csSheetNameColumnNone }, ...keyOptions] : keyOptions}
          placeholder={declaration ? undefined : t.csSheetChooseColumn}
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
      {statusOptions && statusOptions.length > 0 && (
        <label className="field">
          <span>{t.sourcesStatusColumn}</span>
          <Dropdown
            value={statusColumn}
            onChange={setStatusColumn}
            options={[{ value: '', label: t.csSheetNameColumnNone }, ...statusOptions]}
          />
        </label>
      )}
      <div className="btn-row modal-actions">
        <button className="btn btn-ghost" type="button" onClick={onClose}>
          {t.cancel}
        </button>
        <button className="btn btn-primary" type="button" onClick={confirm} disabled={!confirmable}>
          {t.csAdd}
        </button>
      </div>
    </>
  );
}

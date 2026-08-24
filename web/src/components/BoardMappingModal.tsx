import { createPortal } from 'react-dom';
import type { MondayBoardMeta } from '../api';
import { useT } from '../i18n';
import { autoMapColumns, SourceMappingForm, type ColumnMapping, type MappingOption } from './SourceMappingForm';

/** The confirmed board column mapping, in the stored (column-id) shape. */
export interface BoardMapping {
  /** Row key of email-keyed agents; phone-keyed (WhatsApp-only) mappings store the key in phoneColumnId instead. */
  emailColumnId?: string;
  nameColumnId?: string;
  phoneColumnId?: string;
  idNumberColumnId?: string;
  taxUserCodeColumnId?: string;
  documentsColumnId?: string;
  /** Status column the agent writes its progress labels to. */
  statusColumnId?: string;
  /** Connect-boards column linking to the client's CRM item (declaration of capital). */
  crmLinkColumnId?: string;
  /** Connect-boards column linking to the submitted questionnaire item (declaration of capital). */
  formLinkColumnId?: string;
  /** Column holding the tax-office file number (declaration of capital). */
  fileNumberColumnId?: string;
  /** Column holding the row's declaration year (declaration of capital). */
  yearColumnId?: string;
}

/**
 * After checking a new board in the board picker: map its columns onto the
 * client fields, mirroring the sheet flow (Google Picker → SheetMappingModal).
 * The fields are the shared SourceMappingForm, so both sources are configured
 * through the identical form.
 */
export function BoardMappingModal({
  board,
  description,
  onConfirm,
  onClose,
  keyKind = 'email',
  withPortalCredentials = false,
  withDocumentsColumn = false,
  withStatusColumn = false,
  withDeclarationColumns = false,
}: {
  board: MondayBoardMeta;
  description: string;
  onConfirm: (mapping: BoardMapping) => void;
  onClose: () => void;
  /** The row-key field: email (client-import default) or phone (WhatsApp-only agents). */
  keyKind?: 'email' | 'phone';
  /** Also map the tax-portal credential columns (ת"ז + permanent user code) — doc collector. */
  withPortalCredentials?: boolean;
  /** Also map an optional per-client required-documents column — doc collector. */
  withDocumentsColumn?: boolean;
  /** Also map the status column the agent reports its progress to (declaration of capital). */
  withStatusColumn?: boolean;
  /** Also map the declaration-flow columns: CRM link, questionnaire link, file number, year (declaration of capital). */
  withDeclarationColumns?: boolean;
}) {
  const { t } = useT();
  // The key lives in a matching typed column or a free-text one; any non-name
  // column can feed the optional fields (the built-in item name is the name default).
  const keyOptions: MappingOption[] = board.columns
    .filter((c) => c.type === keyKind || c.type === 'text' || c.type === 'long_text')
    .map((c) => ({ value: c.id, label: c.title }));
  const options: MappingOption[] = board.columns
    .filter((c) => c.type !== 'name')
    .map((c) => ({ value: c.id, label: c.title }));

  const auto = autoMapColumns(options, keyKind, {
    // Phone-keyed mappings carry the phone in the key itself — no separate phone field.
    phone: keyKind === 'email',
    portalCredentials: withPortalCredentials,
    documents: withDocumentsColumn,
  });
  // Only genuine status columns may receive the agent's progress labels
  // ('color' is the API's legacy type name for the status column).
  const statusOptions: MappingOption[] = withStatusColumn
    ? board.columns.filter((c) => c.type === 'status' || c.type === 'color').map((c) => ({ value: c.id, label: c.title }))
    : [];

  // Declaration flow: only connect-boards columns can carry the CRM /
  // questionnaire links; preselect by the office's conventional titles.
  const linkColumns = board.columns.filter((c) => c.type === 'board_relation');
  const linkOptions: MappingOption[] = linkColumns.map((c) => ({ value: c.id, label: c.title }));
  const linkByTitle = (re: RegExp, exclude?: string) =>
    linkColumns.find((c) => c.id !== exclude && re.test(c.title))?.id ?? '';
  const crmLinkAuto = withDeclarationColumns
    ? linkByTitle(/crm/i) || (linkColumns.length === 1 ? linkColumns[0]!.id : '')
    : '';
  const formLinkAuto = withDeclarationColumns ? linkByTitle(/שאלון|form/i, crmLinkAuto) : '';
  const scalarByTitle = (re: RegExp) =>
    board.columns.find((c) => c.type !== 'name' && c.type !== 'board_relation' && re.test(c.title))?.id ?? '';

  // A real email/phone-typed column beats a title match; either way the pick
  // must be a valid key candidate.
  const keyTyped = board.columns.find((c) => c.type === keyKind);
  const initial = {
    ...auto,
    keyColumn: keyTyped?.id ?? (keyOptions.some((o) => o.value === auto.keyColumn) ? auto.keyColumn : ''),
    // A board with exactly one status column can only mean that one — preselect it.
    statusColumn: statusOptions.length === 1 ? statusOptions[0]!.value : '',
    crmLinkColumn: crmLinkAuto,
    formLinkColumn: formLinkAuto,
    fileNumberColumn: withDeclarationColumns ? scalarByTitle(/תיק|file/i) : '',
    yearColumn: withDeclarationColumns ? scalarByTitle(/שנת|שנה|year/i) : '',
  };

  // Portaled to <body>: ancestor cards have backdrop-filter/animated transforms,
  // which re-anchor position:fixed to the card instead of the viewport.
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h2>
          {t.sourcesBoardMappingTitle}: <span className="modal-highlight">{board.name}</span>
        </h2>
        <p className="muted">{description}</p>
        <SourceMappingForm
          keyLabel={keyKind === 'phone' ? t.csPhoneColumn : t.dcEmailColumn}
          keyOptions={keyOptions}
          options={options}
          initial={initial}
          nameDefaultLabel={t.csNameColumnDefault}
          withPhoneColumn={keyKind === 'email'}
          withPortalCredentials={withPortalCredentials}
          withDocumentsColumn={withDocumentsColumn}
          statusOptions={withStatusColumn ? statusOptions : undefined}
          declarationLinkOptions={withDeclarationColumns ? linkOptions : undefined}
          onConfirm={(mapping: ColumnMapping) =>
            onConfirm({
              // Phone-keyed (WhatsApp-only) mappings store the key as the phone
              // column (optional for declaration boards — the phone lives on the
              // linked CRM item).
              ...(keyKind === 'phone'
                ? { phoneColumnId: mapping.keyColumn || undefined }
                : { emailColumnId: mapping.keyColumn, phoneColumnId: mapping.phoneColumn }),
              nameColumnId: mapping.nameColumn,
              idNumberColumnId: mapping.idNumberColumn,
              taxUserCodeColumnId: mapping.taxUserCodeColumn,
              documentsColumnId: mapping.documentsColumn,
              statusColumnId: mapping.statusColumn,
              crmLinkColumnId: mapping.crmLinkColumn,
              formLinkColumnId: mapping.formLinkColumn,
              fileNumberColumnId: mapping.fileNumberColumn,
              yearColumnId: mapping.yearColumn,
            })
          }
          onClose={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}

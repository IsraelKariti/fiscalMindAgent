import { createPortal } from 'react-dom';
import type { MondayBoardMeta } from '../api';
import { useT } from '../i18n';
import { autoMapColumns, SourceMappingForm, type ColumnMapping, type MappingOption } from './SourceMappingForm';

/** The confirmed board column mapping, in the stored (column-id) shape. */
export interface BoardMapping {
  emailColumnId: string;
  nameColumnId?: string;
  phoneColumnId?: string;
  idNumberColumnId?: string;
  taxUserCodeColumnId?: string;
  documentsColumnId?: string;
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
  withPortalCredentials = false,
  withDocumentsColumn = false,
}: {
  board: MondayBoardMeta;
  description: string;
  onConfirm: (mapping: BoardMapping) => void;
  onClose: () => void;
  /** Also map the tax-portal credential columns (ת"ז + permanent user code) — doc collector. */
  withPortalCredentials?: boolean;
  /** Also map an optional per-client required-documents column — doc collector. */
  withDocumentsColumn?: boolean;
}) {
  const { t } = useT();
  // The email lives in an email or free-text column; any non-name column can
  // feed the optional fields (the built-in item name is the name default).
  const keyOptions: MappingOption[] = board.columns
    .filter((c) => c.type === 'email' || c.type === 'text' || c.type === 'long_text')
    .map((c) => ({ value: c.id, label: c.title }));
  const options: MappingOption[] = board.columns
    .filter((c) => c.type !== 'name')
    .map((c) => ({ value: c.id, label: c.title }));

  const auto = autoMapColumns(options, 'email', {
    phone: true,
    portalCredentials: withPortalCredentials,
    documents: withDocumentsColumn,
  });
  // A real email-typed column beats a title match; either way the pick must be
  // a valid key candidate.
  const emailTyped = board.columns.find((c) => c.type === 'email');
  const initial = {
    ...auto,
    keyColumn: emailTyped?.id ?? (keyOptions.some((o) => o.value === auto.keyColumn) ? auto.keyColumn : ''),
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
          keyLabel={t.dcEmailColumn}
          keyOptions={keyOptions}
          options={options}
          initial={initial}
          nameDefaultLabel={t.csNameColumnDefault}
          withPhoneColumn
          withPortalCredentials={withPortalCredentials}
          withDocumentsColumn={withDocumentsColumn}
          onConfirm={(mapping: ColumnMapping) =>
            onConfirm({
              emailColumnId: mapping.keyColumn,
              nameColumnId: mapping.nameColumn,
              phoneColumnId: mapping.phoneColumn,
              idNumberColumnId: mapping.idNumberColumn,
              taxUserCodeColumnId: mapping.taxUserCodeColumn,
              documentsColumnId: mapping.documentsColumn,
            })
          }
          onClose={onClose}
        />
      </div>
    </div>,
    document.body,
  );
}

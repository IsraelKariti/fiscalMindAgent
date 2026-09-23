import type { Buffer } from 'node:buffer';
import type { LlmCallSpec } from '../../gemini/llmCall.js';
import { sanitizeInline } from '../shared/promptSafety.js';
import { getCatalogType, GENERIC_CHECKS, type ExtractionField, type VerificationChecks } from './catalog.js';
import { EXTRACTION_PROMPT, extractionJsonSchemaFor, typeFieldsPromptBlock } from './verifyChecks.js';

/**
 * The extract_document request builder, kept apart from verifyDocument.ts (which
 * imports the DB, blob storage and mail) so the evals harness can build the
 * exact extraction prompt without any of that.
 */

/** The subset of a checklist row the extractor is framed with (a DB row satisfies it; the harness builds it by hand). */
export interface ExtractableDocument {
  name: string;
  description: string | null;
  type_key: string | null;
}

/** The verification checks that apply to a checklist row: its catalog type's, or the generic none. */
export function checksFor(doc: Pick<ExtractableDocument, 'type_key'>): VerificationChecks {
  const catalogType = doc.type_key ? getCatalogType(doc.type_key) : undefined;
  return catalogType?.checks ?? GENERIC_CHECKS;
}

/** The type-specific extraction fields of a checklist row's catalog type (none for ad-hoc rows or untyped types). */
export function fieldsFor(doc: Pick<ExtractableDocument, 'type_key'>): {
  fields: readonly ExtractionField[] | undefined;
  fieldsAnyOf: readonly string[] | undefined;
} {
  const catalogType = doc.type_key ? getCatalogType(doc.type_key) : undefined;
  return { fields: catalogType?.fields, fieldsAnyOf: catalogType?.fieldsAnyOf };
}

export interface ExtractionCallInput {
  doc: ExtractableDocument;
  bytes: Buffer;
  contentType: string;
  filename: string;
  taxYear: number;
}

/** The exact extract_document request — shared with the evals harness so it tests what the app sends. */
export function buildExtractionCall({ doc, bytes, contentType, filename, taxYear }: ExtractionCallInput): LlmCallSpec {
  const catalogType = doc.type_key ? getCatalogType(doc.type_key) : undefined;
  const checks = checksFor(doc);
  // Resolved rows carry instance names/descriptions; the catalog description
  // (the office's accepted document forms for the type) is restated so
  // is_expected_type judges against every acceptable form.
  const typeDescription = catalogType ? catalogType.descriptionHe.replaceAll('{{tax_year}}', String(taxYear)) : null;
  // The type's extra fields: the same declaration yields the prompt lines and
  // the schema entries below, so the two cannot drift (openspec `document-extraction`).
  const fieldLines = typeFieldsPromptBlock(catalogType?.fields, catalogType?.fieldsAnyOf);
  const prompt = EXTRACTION_PROMPT.replace('{{expected_name}}', doc.name)
    .replace('{{expected_description}}', doc.description ?? '(ללא תיאור)')
    .replace(
      '{{type_context}}',
      `${typeDescription && typeDescription !== doc.description ? `מסמכים קבילים לסוג זה: ${typeDescription}\n` : ''}${
        catalogType?.analysisHintHe ? `${catalogType.analysisHintHe}\n` : ''
      }${fieldLines}`,
    )
    .replace(
      '{{date_context}}',
      checks.asOfDate
        ? `מסמך זה תלוי-תאריך: היתרות בו אמורות להתייחס ליום 31.12.${taxYear} (המועד הקובע להצהרת ההון).`
        : '',
    )
    .replace(
      '{{validity_context}}',
      checks.notExpired
        ? 'מסמך מהסוג הזה עשוי לשאת תאריך תוקף משלו — אתר וחלץ בקפידה את שדה "בתוקף עד" (valid_until).'
        : '',
    )
    .replace('{{filename}}', '');
  // Instructions + expected-document context (trusted) in the system turn;
  // only the bytes and the (untrusted) filename in the user turn.
  return {
    purpose: 'extract_document',
    systemInstruction: prompt.trimEnd(),
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: contentType, data: bytes.toString('base64') } },
          { text: `שם הקובץ כפי שנשלח: ${sanitizeInline(filename, 150)}` },
        ],
      },
    ],
    responseJsonSchema: extractionJsonSchemaFor(catalogType?.fields),
    temperature: 0,
  };
}

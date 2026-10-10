import type { Buffer } from 'node:buffer';
import type { LlmCallSpec } from '../../gemini/llmCall.js';
import { sanitizeInline } from '../shared/promptSafety.js';
import { getCatalogPaper } from './catalog.js';
import { documentTypeSpec, type DocumentTypeSpec } from './documentTypes/index.js';

/**
 * The extract_document request builder, kept apart from verifyDocument.ts (which
 * imports the DB, blob storage and mail) so the evals harness can build the
 * exact extraction prompt without any of that.
 *
 * The prompt and the schema are the document type's own (documentTypes/<type>.ts,
 * openspec `document-extraction`); this builder only fills the values that
 * vary per checklist row: the row's name and description, the expected paper
 * and the tax year.
 */

/** The subset of a checklist row the extractor is framed with (a DB row satisfies it; the harness builds it by hand). */
export interface ExtractableDocument {
  name: string;
  description: string | null;
  type_key: string | null;
  /** The paper the item stands for (openspec `document-papers`); absent/null = none. */
  paper_key?: string | null;
}

export { documentTypeSpec, type DocumentTypeSpec };

export interface ExtractionCallInput {
  doc: ExtractableDocument;
  bytes: Buffer;
  contentType: string;
  filename: string;
  taxYear: number;
}

/**
 * The paper the item stands for (openspec `document-papers`): named beside the
 * item, with its own anatomy, so is_expected_type judges the paper and not
 * only the type (a registry extract is not the contract). '' for an item
 * without a paper.
 */
export function paperContext(paperKey: string | null | undefined): string {
  const paper = getCatalogPaper(paperKey);
  if (!paper) return '';
  return `הנייר המצופה: ${paper.shortNameHe} — הקובץ חייב להיות נייר זה בדיוק, לא נייר אחר של אותו נכס.\n${paper.analysisHintHe ? `${paper.analysisHintHe}\n` : ''}`;
}

/** The type's prompt with the per-row placeholders filled — the exact system instruction the model receives. */
export function fillExtractionPrompt(spec: DocumentTypeSpec, doc: ExtractableDocument, taxYear: number): string {
  return spec.prompt
    .replace('{{expected_name}}', doc.name)
    .replace('{{expected_description}}', doc.description ?? '(ללא תיאור)')
    .replace('{{paper_context}}', paperContext(doc.paper_key))
    .replaceAll('{{tax_year}}', String(taxYear))
    .trimEnd();
}

/** The exact extract_document request — shared with the evals harness so it tests what the app sends. */
export function buildExtractionCall({ doc, bytes, contentType, filename, taxYear }: ExtractionCallInput): LlmCallSpec {
  const spec = documentTypeSpec(doc.type_key);
  // Instructions + expected-document context (trusted) in the system turn;
  // only the bytes and the (untrusted) filename in the user turn.
  return {
    purpose: 'extract_document',
    systemInstruction: fillExtractionPrompt(spec, doc, taxYear),
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: contentType, data: bytes.toString('base64') } },
          { text: `שם הקובץ כפי שנשלח: ${sanitizeInline(filename, 150)}` },
        ],
      },
    ],
    responseJsonSchema: spec.jsonSchema,
    temperature: 0,
  };
}

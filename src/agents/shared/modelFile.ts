import { extractFileText } from './fileText.js';
import { isSpreadsheetType, renderSpreadsheetText } from './spreadsheetText.js';

/**
 * What the model is given for a received file (openspec `spreadsheet-files`).
 * A PDF or an image goes to the model as it is, with the PDF's text layer as
 * `text` for the code-side regex screen. A spreadsheet goes as the plain-text
 * rendering code builds from it (`text/plain` bytes), and that rendering is
 * also its `text` — so the injection screen, the classifier, the extractor
 * and the admin's document pane all read exactly the same text.
 *
 * Throws only for a spreadsheet that cannot be rendered (damaged, encrypted);
 * the caller marks the file "failed" and makes no model call.
 */
export interface ModelFile {
  bytes: Buffer;
  contentType: string;
  /** Text code could read out of the file ('' when none: an image, a scanned PDF). */
  text: string;
}

export async function toModelFile(file: { bytes: Buffer; contentType: string }): Promise<ModelFile> {
  if (isSpreadsheetType(file.contentType)) {
    const text = await renderSpreadsheetText(file.bytes, file.contentType);
    return { bytes: Buffer.from(text, 'utf8'), contentType: 'text/plain', text };
  }
  return { bytes: file.bytes, contentType: file.contentType, text: extractFileText(file.bytes, file.contentType) };
}

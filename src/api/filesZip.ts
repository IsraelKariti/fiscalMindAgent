import archiver from 'archiver';
import type { Readable, Writable } from 'node:stream';
import { downloadNameOf, type NamedFile } from './downloadName.js';

/**
 * The "download all" zip of a client's files (openspec `workspace-documents`).
 * The route in workspace.ts only decides that the requester may read the
 * client; which files go in, under which path, and how the zip is streamed
 * live here. Nothing in this module touches the database or the blob store —
 * the caller passes the rows and the function that reads a blob.
 */

/** The folder that holds files linked to no checklist item. */
export const UNMATCHED_FOLDER = 'קבצים שלא שויכו';
/** The text file that lists files whose bytes could not be read. */
export const MISSING_FILES_NAME = 'קבצים חסרים.txt';

const ILLEGAL_IN_FILENAME = /[\\/:*?"<>|]/g;

/** The fields of a file row the zip needs. */
export interface ZipSourceFile extends NamedFile {
  id: string;
  blob_key: string;
  client_document_id: string | null;
  analysis_status: string;
  created_at: Date;
}

export interface ZipEntry<F extends ZipSourceFile = ZipSourceFile> {
  file: F;
  /** Path inside the zip, with `/` between a folder and the name. */
  path: string;
}

/** Whether a file goes into the zip: everything except the original of a split file, whose pages are in its children. */
export function isZipFile(file: { analysis_status: string }): boolean {
  return file.analysis_status !== 'split';
}

/**
 * Picks the files of the zip and gives each one its path. `files` is the
 * client's full list, oldest first (the order the tab shows); the originals
 * of split files stay in it so a child can find its parent's filename.
 */
export function zipEntriesFor<F extends ZipSourceFile>(files: F[]): ZipEntry<F>[] {
  const byId = new Map(files.map((file) => [file.id, file]));
  const taken = new Set<string>();
  const entries: ZipEntry<F>[] = [];
  for (const file of files) {
    if (!isZipFile(file)) continue;
    const parent = file.parent_file_id ? byId.get(file.parent_file_id) : undefined;
    const name = downloadNameOf(file, parent?.filename ?? '').replace(ILLEGAL_IN_FILENAME, '-') || 'file';
    const folder = file.client_document_id === null ? `${UNMATCHED_FOLDER}/` : '';
    entries.push({ file, path: folder + freeName(folder, name, taken) });
  }
  return entries;
}

/** `name`, or `name (2)`, `name (3)`… when the folder already has it. Compared without case: Windows treats the two as one file. */
function freeName(folder: string, name: string, taken: Set<string>): string {
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let candidate = name;
  for (let n = 2; taken.has((folder + candidate).toLowerCase()); n += 1) candidate = `${base} (${n})${ext}`;
  taken.add((folder + candidate).toLowerCase());
  return candidate;
}

/** The name the zip itself saves under. */
export function zipDownloadName(clientName: string | null): string {
  const name = (clientName ?? '').replace(ILLEGAL_IN_FILENAME, '-').trim() || 'לקוח';
  return `${name} - מסמכים.zip`;
}

/** The response as this module needs it — an Express `Response` fits, and so does a test stream. */
export type ZipSink = Writable & { setHeader(name: string, value: string): unknown };

/**
 * Streams the zip to `res`. Each file is read whole and then added, one at a
 * time, so memory holds one file and a file that cannot be read is left out
 * cleanly: the others still arrive and its name goes into "קבצים חסרים.txt".
 * The headers are sent before the first file is read, so from here on a
 * failure can only be told to the browser by breaking the download.
 */
export async function streamFilesZip(
  res: ZipSink,
  zipName: string,
  entries: ZipEntry[],
  openBlob: (blobKey: string) => Promise<{ stream: Readable }>,
  onSkipped: (entry: ZipEntry, err: unknown) => void = () => {},
): Promise<void> {
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipName)}`);

  // Level 1: PDFs and images are compressed already, a higher level only costs time.
  const archive = archiver('zip', { zlib: { level: 1 } });
  archive.on('error', (err) => res.destroy(err));
  res.on('close', () => {
    if (!res.writableFinished) archive.abort();
  });
  archive.pipe(res);

  const missing: string[] = [];
  for (const entry of entries) {
    if (res.destroyed) return; // the browser went away
    let bytes: Buffer;
    try {
      bytes = await readAll((await openBlob(entry.file.blob_key)).stream);
    } catch (err) {
      missing.push(entry.path);
      onSkipped(entry, err);
      continue;
    }
    await addEntry(archive, bytes, entry.path, entry.file.created_at);
  }
  if (missing.length > 0) {
    await addEntry(archive, Buffer.from(`${missing.join('\r\n')}\r\n`, 'utf8'), MISSING_FILES_NAME, new Date());
  }
  await archive.finalize();
}

async function readAll(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/** Adds one file and waits until the archive has written it, so the next file is read only then. */
function addEntry(archive: archiver.Archiver, bytes: Buffer, name: string, date: Date): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      archive.off('entry', done);
      archive.off('error', failed);
      resolve();
    };
    const failed = (err: Error) => {
      archive.off('entry', done);
      reject(err);
    };
    archive.once('entry', done);
    archive.once('error', failed);
    archive.append(bytes, { name, date });
  });
}

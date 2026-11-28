import { strict as assert } from 'node:assert';
import { PassThrough, Readable } from 'node:stream';
import { test } from 'node:test';
import JSZip from 'jszip';
import { downloadNameOf } from '../src/api/downloadName.js';
import {
  MISSING_FILES_NAME,
  UNMATCHED_FOLDER,
  streamFilesZip,
  zipDownloadName,
  zipEntriesFor,
  type ZipSourceFile,
} from '../src/api/filesZip.js';

let seq = 0;
function file(over: Partial<ZipSourceFile> = {}): ZipSourceFile {
  seq += 1;
  return {
    id: `file-${seq}`,
    blob_key: `blob-${seq}`,
    filename: `file-${seq}.pdf`,
    label: null,
    client_document_id: 'doc-1',
    analysis_status: 'done',
    parent_file_id: null,
    page_from: null,
    page_to: null,
    created_at: new Date('2026-01-01T10:00:00Z'),
    ...over,
  };
}

test('downloadNameOf: a plain file keeps its filename, also when it has a label', () => {
  assert.equal(downloadNameOf(file({ filename: 'bank.pdf' }), ''), 'bank.pdf');
  assert.equal(downloadNameOf(file({ filename: '106.pdf', label: 'טופס 106 — אלביט' }), ''), '106.pdf');
});

test('downloadNameOf: a named child of a split PDF saves under its label and its source', () => {
  const child = file({ filename: 'scan-p3-5.pdf', label: 'אישור יתרה — לאומי', parent_file_id: 'p', page_from: 3, page_to: 5 });
  assert.equal(downloadNameOf(child, 'scan.pdf'), 'אישור יתרה — לאומי (scan p3-5).pdf');
});

test('zipEntriesFor: linked files at the top level, unmatched files in their folder', () => {
  const entries = zipEntriesFor([
    file({ filename: 'a.pdf' }),
    file({ filename: 'b.pdf' }),
    file({ filename: 'c.pdf', client_document_id: null }),
  ]);
  assert.deepEqual(
    entries.map((e) => e.path),
    ['a.pdf', 'b.pdf', `${UNMATCHED_FOLDER}/c.pdf`],
  );
});

test('zipEntriesFor: the original of a split file is left out, its children are in', () => {
  const parent = file({ id: 'parent', filename: 'scan.pdf', analysis_status: 'split', client_document_id: null });
  const first = file({ filename: 'x.pdf', label: 'בנק', parent_file_id: 'parent', page_from: 1, page_to: 2 });
  const second = file({ filename: 'y.pdf', label: 'פנסיה', parent_file_id: 'parent', page_from: 3, page_to: 3 });
  const entries = zipEntriesFor([parent, first, second]);
  assert.deepEqual(
    entries.map((e) => e.path),
    ['בנק (scan p1-2).pdf', 'פנסיה (scan p3-3).pdf'],
  );
  // The only unmatched file was the original, so the zip has no unmatched folder.
  assert.ok(entries.every((e) => !e.path.startsWith(UNMATCHED_FOLDER)));
});

test('zipEntriesFor: a second file with the same name gets a numbered suffix', () => {
  const entries = zipEntriesFor([
    file({ filename: 'bank.pdf' }),
    file({ filename: 'Bank.pdf' }),
    file({ filename: 'bank.pdf' }),
    file({ filename: 'bank.pdf', client_document_id: null }),
  ]);
  assert.deepEqual(
    entries.map((e) => e.path),
    ['bank.pdf', 'Bank (2).pdf', 'bank (3).pdf', `${UNMATCHED_FOLDER}/bank.pdf`],
  );
});

test('zipEntriesFor: a name cannot escape its folder', () => {
  const [entry] = zipEntriesFor([file({ filename: '../evil.pdf' })]);
  assert.equal(entry?.path, '..-evil.pdf');
});

test('zipDownloadName: the client name, cleaned', () => {
  assert.equal(zipDownloadName('ישראל ישראלי'), 'ישראל ישראלי - מסמכים.zip');
  assert.equal(zipDownloadName('a/b'), 'a-b - מסמכים.zip');
  assert.equal(zipDownloadName(null), 'לקוח - מסמכים.zip');
});

/** A fake response: collects the bytes and the headers. */
function sink() {
  const stream = new PassThrough();
  const chunks: Buffer[] = [];
  stream.on('data', (chunk: Buffer) => chunks.push(chunk));
  const headers: Record<string, string> = {};
  const res = Object.assign(stream, { setHeader: (name: string, value: string) => (headers[name] = value) });
  const finished = new Promise<Buffer>((resolve) => stream.on('end', () => resolve(Buffer.concat(chunks))));
  return { res, headers, finished };
}

test('streamFilesZip: every readable file arrives with its original bytes', async () => {
  const xlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0x00]);
  const blobs: Record<string, Buffer> = { one: Buffer.from('first file'), two: xlsx };
  const entries = zipEntriesFor([
    file({ blob_key: 'one', filename: 'אישור.pdf' }),
    file({ blob_key: 'two', filename: 'sheet.xlsx', client_document_id: null }),
  ]);
  const { res, headers, finished } = sink();
  await streamFilesZip(res, zipDownloadName('דנה'), entries, async (key) => ({ stream: Readable.from([blobs[key]]) }));
  const zip = await JSZip.loadAsync(await finished);

  assert.equal(headers['Content-Type'], 'application/zip');
  assert.equal(headers['Content-Disposition'], `attachment; filename*=UTF-8''${encodeURIComponent('דנה - מסמכים.zip')}`);
  assert.deepEqual(Object.keys(zip.files).filter((name) => !zip.files[name]?.dir).sort(), ['אישור.pdf', `${UNMATCHED_FOLDER}/sheet.xlsx`].sort());
  assert.equal(await zip.file('אישור.pdf')!.async('string'), 'first file');
  assert.deepEqual(await zip.file(`${UNMATCHED_FOLDER}/sheet.xlsx`)!.async('nodebuffer'), xlsx);
  assert.equal(zip.file(MISSING_FILES_NAME), null);
});

test('streamFilesZip: a file that cannot be read is left out and named in the missing list', async () => {
  const entries = zipEntriesFor([
    file({ blob_key: 'ok-1', filename: 'a.pdf' }),
    file({ blob_key: 'gone', filename: 'b.pdf' }),
    file({ blob_key: 'breaks', filename: 'c.pdf' }),
    file({ blob_key: 'ok-2', filename: 'd.pdf' }),
  ]);
  const skipped: string[] = [];
  const { res, finished } = sink();
  await streamFilesZip(
    res,
    'x.zip',
    entries,
    async (key) => {
      if (key === 'gone') throw new Error('BlobNotFound');
      if (key === 'breaks') {
        // Fails after the first bytes were already read.
        return {
          stream: Readable.from(
            (async function* () {
              yield Buffer.from('half');
              throw new Error('connection reset');
            })(),
          ),
        };
      }
      return { stream: Readable.from([Buffer.from(key)]) };
    },
    (entry) => skipped.push(entry.path),
  );
  const zip = await JSZip.loadAsync(await finished);

  assert.deepEqual(Object.keys(zip.files).sort(), ['a.pdf', 'd.pdf', MISSING_FILES_NAME].sort());
  assert.equal(await zip.file('d.pdf')!.async('string'), 'ok-2');
  assert.equal(await zip.file(MISSING_FILES_NAME)!.async('string'), 'b.pdf\r\nc.pdf\r\n');
  assert.deepEqual(skipped, ['b.pdf', 'c.pdf']);
});

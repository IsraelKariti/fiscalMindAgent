import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { ingestInboundFileWith as ingestInboundFile, type InboundFileContext, type InboundFileDeps, type InboundFileItem } from '../src/webhook/ingestInboundFileCore.js';
import type { DocumentFileRow } from '../src/db/types.js';

const ctx: InboundFileContext = {
  clientId: 'client-1',
  agentInstanceId: 'instance-1',
  clientName: 'Niv',
  emailId: 'message-1',
  channel: 'whatsapp',
};

function harness(download: () => Promise<Buffer>, existing = new Set<string>()) {
  const uploads: string[] = [];
  const inserts: string[] = [];
  const analyzed: string[] = [];
  const audits: Parameters<InboundFileDeps['recordAudit']>[0][] = [];
  const pauses: number[] = [];
  const deps: InboundFileDeps = {
    uploadBlob: async (key) => { uploads.push(key); },
    insertIfNew: async (args) => {
      if (existing.has(args.providerAttachmentId)) return null;
      existing.add(args.providerAttachmentId);
      inserts.push(args.providerAttachmentId);
      return { id: `file-${inserts.length}`, provider_attachment_id: args.providerAttachmentId, filename: args.filename } as unknown as DocumentFileRow;
    },
    analyze: async (_clientId, file) => { analyzed.push(file.id); },
    recordAudit: (e) => { audits.push(e); },
    retry: { attempts: 3, delaysMs: [2000, 8000], sleep: async (ms) => { pauses.push(ms); } },
  };
  const item: InboundFileItem = {
    providerAttachmentId: 'MM1-0',
    index: 0,
    contentType: 'application/pdf',
    filename: 'whatsapp-media-20260924-101923.pdf',
    fileNameHint: 'contract.pdf',
    download,
  };
  return { deps, item, uploads, inserts, analyzed, audits, pauses };
}

test('a download that fails once is retried and the file is stored once, with no failure step', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls += 1;
    if (calls === 1) throw new TypeError('fetch failed', { cause: new Error('ECONNRESET') });
    return Buffer.from('%PDF-1.7');
  });
  const inserted = await ingestInboundFile(ctx, h.item, h.deps);
  assert.ok(inserted);
  assert.equal(calls, 2);
  assert.deepEqual(h.pauses, [2000]);
  assert.deepEqual(h.uploads, ['clients/client-1/MM1-0/whatsapp-media-20260924-101923.pdf']);
  assert.deepEqual(h.inserts, ['MM1-0']);
  assert.deepEqual(h.analyzed, ['file-1']);
  assert.deepEqual(h.audits, []);
});

test('a download that fails every attempt records one file.ingest_failed step and stores nothing', async () => {
  let calls = 0;
  const h = harness(async () => {
    calls += 1;
    throw new Error('media download returned 503');
  });
  const inserted = await ingestInboundFile(ctx, h.item, h.deps);
  assert.equal(inserted, null);
  assert.equal(calls, 3);
  assert.deepEqual(h.pauses, [2000, 8000]);
  assert.deepEqual(h.uploads, []);
  assert.deepEqual(h.analyzed, []);
  assert.equal(h.audits.length, 1);
  const row = h.audits[0]!;
  assert.equal(row.action, 'file.ingest_failed');
  assert.equal(row.severity, 'warning');
  assert.equal(row.actorType, 'system');
  assert.equal(row.clientId, 'client-1');
  assert.equal(row.agentInstanceId, 'instance-1');
  assert.equal(row.targetType, 'email');
  assert.equal(row.targetId, 'message-1');
  assert.deepEqual(row.detail, {
    channel: 'whatsapp',
    providerAttachmentId: 'MM1-0',
    index: 0,
    contentType: 'application/pdf',
    fileNameHint: 'contract.pdf',
    attempts: 3,
    error: 'media download returned 503',
    clientName: 'Niv',
  });
});

test('a failing upload is retried as part of the same unit', async () => {
  const h = harness(async () => Buffer.from('bytes'));
  let uploadCalls = 0;
  h.deps.uploadBlob = async () => {
    uploadCalls += 1;
    if (uploadCalls < 3) throw new Error('blob storage unavailable');
  };
  const inserted = await ingestInboundFile(ctx, h.item, h.deps);
  assert.ok(inserted);
  assert.equal(uploadCalls, 3);
  assert.deepEqual(h.inserts, ['MM1-0']);
  assert.deepEqual(h.audits, []);
});

test('a redelivered file that already exists stores nothing, analyses nothing and records no failure', async () => {
  const h = harness(async () => Buffer.from('bytes'), new Set(['MM1-0']));
  const inserted = await ingestInboundFile(ctx, h.item, h.deps);
  assert.equal(inserted, null);
  assert.deepEqual(h.inserts, []);
  assert.deepEqual(h.analyzed, []);
  assert.deepEqual(h.audits, []);
});

test('a failing analysis does not undo the stored file', async () => {
  const h = harness(async () => Buffer.from('bytes'));
  h.deps.analyze = async () => { throw new Error('gemini down'); };
  const inserted = await ingestInboundFile(ctx, h.item, h.deps);
  assert.ok(inserted);
  assert.deepEqual(h.audits, []);
});

test('a message row that does not exist leaves the step without a target', async () => {
  const h = harness(async () => { throw new Error('nope'); });
  await ingestInboundFile({ ...ctx, emailId: null }, h.item, h.deps);
  assert.equal(h.audits[0]!.targetType, null);
  assert.equal(h.audits[0]!.targetId, null);
});

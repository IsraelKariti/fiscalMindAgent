import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { fileDisposition } from '../src/api/fileDisposition.js';
import { resolveCallFile, resolveStepFile, stepFileIdOf } from '../src/api/stepFile.js';

const STEP = '646d8431-43ac-41af-9904-6a3f80f447cc';
const FILE = '0b618c2d-7ff9-4dfc-b91f-60fb095f2dfa';

test('fileDisposition: the previewable types render inline when asked', () => {
  for (const type of ['application/pdf', 'image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
    assert.equal(fileDisposition(type, 'inline'), 'inline');
  }
});

test('fileDisposition: script-capable and unknown types never render inline', () => {
  for (const type of ['text/html', 'image/svg+xml', 'application/vnd.ms-excel', '']) {
    assert.equal(fileDisposition(type, 'inline'), 'attachment');
  }
});

test('fileDisposition: a download stays a download', () => {
  assert.equal(fileDisposition('application/pdf', 'attachment'), 'attachment');
});

const CLIENT = '3f2b6c7e-1d4a-4b8c-9e0f-5a6b7c8d9e0f';
const OTHER_CLIENT = '9e8d7c6b-5a4f-4e3d-8c2b-1a0f9e8d7c6b';
const ITEM = 'c1d2e3f4-a5b6-4c7d-8e9f-0a1b2c3d4e5f';

type Step = { target_type: string | null; target_id: string | null; client_id: string | null; detail: Record<string, unknown> };
type File = { id: string; client_id: string };

const fileStep = (targetId: string | null): Step => ({ target_type: 'document_file', target_id: targetId, client_id: CLIENT, detail: {} });
const itemStep = (detail: Record<string, unknown>): Step => ({ target_type: 'client_document', target_id: ITEM, client_id: CLIENT, detail });
const theFile: File = { id: FILE, client_id: CLIENT };

function lookups(step: Step | null, file: File | null) {
  const asked: string[] = [];
  return {
    asked,
    getStep: async () => step,
    getFile: async (id: string) => {
      asked.push(id);
      return file;
    },
  };
}

test('resolveStepFile: a file step returns its file', async () => {
  const l = lookups(fileStep(FILE), theFile);
  assert.deepEqual(await resolveStepFile(STEP, l), theFile);
  assert.deepEqual(l.asked, [FILE]);
});

test('resolveStepFile: malformed or missing step id', async () => {
  const l = lookups(fileStep(FILE), theFile);
  assert.equal(await resolveStepFile('not-a-uuid', l), null);
  assert.equal(await resolveStepFile(undefined, l), null);
  assert.deepEqual(l.asked, []);
});

test('resolveStepFile: unknown step', async () => {
  assert.equal(await resolveStepFile(STEP, lookups(null, theFile)), null);
});

test('resolveStepFile: a step that is not about a file never reads a file', async () => {
  const planner = lookups({ target_type: null, target_id: null, client_id: CLIENT, detail: {} }, theFile);
  assert.equal(await resolveStepFile(STEP, planner), null);
  const none = lookups(fileStep(null), theFile);
  assert.equal(await resolveStepFile(STEP, none), null);
  assert.deepEqual([...planner.asked, ...none.asked], []);
});

test('resolveStepFile: a list-item step that names its file in the detail returns it', async () => {
  const l = lookups(itemStep({ name: 'x', fileId: FILE, attempt: 1 }), theFile);
  assert.deepEqual(await resolveStepFile(STEP, l), theFile);
  assert.deepEqual(l.asked, [FILE]);
});

test('resolveStepFile: a list-item step whose named file belongs to another client is not found', async () => {
  const l = lookups(itemStep({ fileId: FILE }), { id: FILE, client_id: OTHER_CLIENT });
  assert.equal(await resolveStepFile(STEP, l), null);
});

test('resolveStepFile: a list-item step that names no single file never reads a file', async () => {
  const replan = lookups(itemStep({ documents: [{ documentId: ITEM, fileId: FILE }] }), theFile);
  assert.equal(await resolveStepFile(STEP, replan), null);
  const junk = lookups(itemStep({ fileId: 'not-a-uuid' }), theFile);
  assert.equal(await resolveStepFile(STEP, junk), null);
  const stalled = lookups(itemStep({ stalled: true, reasons: [] }), theFile);
  assert.equal(await resolveStepFile(STEP, stalled), null);
  assert.deepEqual([...replan.asked, ...junk.asked, ...stalled.asked], []);
});

test('stepFileIdOf: the file id by target or by detail', () => {
  assert.equal(stepFileIdOf(fileStep(FILE)), FILE);
  assert.equal(stepFileIdOf(itemStep({ fileId: FILE })), FILE);
  assert.equal(stepFileIdOf(itemStep({})), null);
  assert.equal(stepFileIdOf({ target_type: 'client', target_id: CLIENT, detail: { fileId: FILE } }), null);
});

test('resolveStepFile: the file is gone', async () => {
  assert.equal(await resolveStepFile(STEP, lookups(fileStep(FILE), null)), null);
});

const CALL = 'a4c1f1a0-7c2e-4d7e-9a1b-2f0c9d8e7b6a';

function callLookups(call: { document_file_id: string | null } | null, file: { id: string } | null) {
  const asked: string[] = [];
  return {
    asked,
    getCall: async () => call,
    getFile: async (id: string) => {
      asked.push(id);
      return file;
    },
  };
}

test('resolveCallFile: a call that read a file returns it', async () => {
  const l = callLookups({ document_file_id: FILE }, { id: FILE });
  assert.deepEqual(await resolveCallFile(CALL, l), { id: FILE });
  assert.deepEqual(l.asked, [FILE]);
});

test('resolveCallFile: malformed or missing call id', async () => {
  const l = callLookups({ document_file_id: FILE }, { id: FILE });
  assert.equal(await resolveCallFile('not-a-uuid', l), null);
  assert.equal(await resolveCallFile(undefined, l), null);
  assert.deepEqual(l.asked, []);
});

test('resolveCallFile: unknown call', async () => {
  assert.equal(await resolveCallFile(CALL, callLookups(null, { id: FILE })), null);
});

test('resolveCallFile: a call that read no file never reads a file', async () => {
  const l = callLookups({ document_file_id: null }, { id: FILE });
  assert.equal(await resolveCallFile(CALL, l), null);
  assert.deepEqual(l.asked, []);
});

test('resolveCallFile: the file is gone', async () => {
  assert.equal(await resolveCallFile(CALL, callLookups({ document_file_id: FILE }, null)), null);
});

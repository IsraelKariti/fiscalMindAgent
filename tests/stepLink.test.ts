import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isFileStep, isStepHash, parseStepHash, stepDetailsText, stepLinkOf } from '../web/src/components/stepLink.js';

const ID = '3fc3a3c6-0c0b-4721-ba3b-45126f978a9d';
const ORIGIN = 'https://agent.fiscalmind.app';

test('stepLinkOf: origin + #/steps/<id>', () => {
  assert.equal(stepLinkOf(ID, ORIGIN), `${ORIGIN}/#/steps/${ID}`);
});

test('parseStepHash: valid link, with and without a trailing slash', () => {
  assert.equal(parseStepHash(`#/steps/${ID}`), ID);
  assert.equal(parseStepHash(`#/steps/${ID}/`), ID);
});

test('parseStepHash: round trip through stepLinkOf', () => {
  const link = stepLinkOf(ID, ORIGIN);
  assert.equal(parseStepHash(link.slice(link.indexOf('#'))), ID);
});

test('parseStepHash: malformed id, stray %, other hashes', () => {
  assert.equal(parseStepHash('#/steps/not-a-uuid'), null);
  assert.equal(parseStepHash(`#/steps/${ID}?x=1`), null);
  assert.equal(parseStepHash('#/steps/%'), null);
  assert.equal(parseStepHash('#/steps'), null);
  assert.equal(parseStepHash(`#/llm-calls/${ID}`), null);
  assert.equal(parseStepHash(`#/agents/${ID}/clients/${ID}`), null);
});

test('isStepHash: the namespace, even when the id is malformed', () => {
  assert.equal(isStepHash('#/steps/not-a-uuid'), true);
  assert.equal(isStepHash('#/steps'), true);
  assert.equal(isStepHash('#/stepsX'), false);
  assert.equal(isStepHash('#/agents'), false);
});

test('stepDetailsText: link first, then JSON holding the whole detail', () => {
  const detail = {
    result: false,
    reason: 'item company not identified',
    checks: [
      { key: 'matched_id_known', passed: true, note: null, observed: ID, expected: null },
      {
        key: 'issuer_matches_item',
        passed: false,
        note: 'item company not identified',
        observed: 'Harel',
        expected: 'not identified',
      },
    ],
  };
  const text = stepDetailsText(
    {
      id: ID,
      occurredAt: '2026-09-19T10:00:00.000Z',
      actorType: 'agent',
      action: 'validate_file_match',
      targetType: 'document_file',
      targetId: 'f1',
      severity: 'info',
      suspectedInjection: false,
      detail,
    },
    ORIGIN,
  );
  const [first, blank, ...rest] = text.split('\n');
  assert.equal(first, `${ORIGIN}/#/steps/${ID}`);
  assert.equal(blank, '');
  const parsed = JSON.parse(rest.join('\n'));
  assert.equal(parsed.id, ID);
  assert.equal(parsed.action, 'validate_file_match');
  assert.equal(parsed.occurredAt, '2026-09-19T10:00:00.000Z');
  assert.deepEqual(parsed.detail, detail);
  assert.equal('discarded' in parsed, false);
});

test('stepDetailsText: a step without checks', () => {
  const detail = { rows: [{ id: 'd1', name: 'אישור יתרות — בנק הפועלים', evidence: 'סגרתי את החשבון' }] };
  const text = stepDetailsText(
    {
      id: ID,
      occurredAt: '2026-09-19T10:00:00.000Z',
      actorType: 'agent',
      action: 'apply_retirements',
      targetType: null,
      targetId: null,
      severity: 'info',
      suspectedInjection: false,
      detail,
    },
    ORIGIN,
  );
  const parsed = JSON.parse(text.slice(text.indexOf('{')));
  assert.deepEqual(parsed.detail, detail);
  assert.equal('checks' in parsed.detail, false);
});

test('isFileStep: a received-file target, or a list-item target whose detail names the file', () => {
  const FILE = '0b618c2d-7ff9-4dfc-b91f-60fb095f2dfa';
  assert.equal(isFileStep({ targetType: 'document_file', targetId: FILE, detail: {} }), true);
  assert.equal(isFileStep({ targetType: 'document_file', targetId: null, detail: {} }), false);
  assert.equal(isFileStep({ targetType: 'client_document', targetId: ID, detail: { fileId: FILE, attempt: 1 } }), true);
  assert.equal(isFileStep({ targetType: 'client_document', targetId: ID, detail: { documents: [{ fileId: FILE }] } }), false);
  assert.equal(isFileStep({ targetType: 'client_document', targetId: ID, detail: { fileId: 'nope' } }), false);
  assert.equal(isFileStep({ targetType: null, targetId: null, detail: { fileId: FILE } }), false);
});

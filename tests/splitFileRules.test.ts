import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { FileSplitSchema, MAX_SPLIT_DOCUMENTS, validateFileSplit, type FileSplit } from '../src/agents/declarationOfCapital/splitFileRules.js';

function split(...ranges: Array<[number, number]>): FileSplit {
  return { documents: ranges.map(([first_page, last_page]) => ({ first_page, last_page, kind: 'document' })) };
}

const failedKeys = (gate: ReturnType<typeof validateFileSplit>): string[] => gate.checks.filter((c) => !c.passed).map((c) => c.key);

test('a valid two-range split is accepted with its ranges in order', () => {
  const gate = validateFileSplit(split([1, 3], [4, 5]), 5);
  assert.equal(gate.result, true);
  assert.equal(gate.reason, null);
  assert.deepEqual(gate.ranges, [
    { from: 1, to: 3 },
    { from: 4, to: 5 },
  ]);
});

test('an accepted split lists all four checks, passed, with what each looked at', () => {
  const gate = validateFileSplit(split([1, 3], [4, 5]), 5);
  assert.deepEqual(gate.checks, [
    { key: 'document_count_within_cap', passed: true, note: null, observed: '2', expected: '20' },
    { key: 'ranges_inside_file', passed: true, note: null, observed: '1-3, 4-5', expected: '5' },
    { key: 'ranges_ordered_no_overlap', passed: true, note: null, observed: '1-3, 4-5', expected: null },
    { key: 'all_pages_covered', passed: true, note: null, observed: 'none', expected: 'none' },
  ]);
});

test('one document covering the whole file is accepted (the caller does not cut)', () => {
  const gate = validateFileSplit(split([1, 5]), 5);
  assert.equal(gate.result, true);
  assert.deepEqual(gate.ranges, [{ from: 1, to: 5 }]);
});

test('single-page ranges are valid (boundary)', () => {
  const gate = validateFileSplit(split([1, 1], [2, 2]), 2);
  assert.equal(gate.result, true);
});

test('a range past the last page is rejected, and the later range checks did not run', () => {
  const gate = validateFileSplit(split([1, 3], [4, 7]), 5);
  assert.equal(gate.result, false);
  assert.deepEqual(gate.ranges, []);
  assert.deepEqual(gate.proposed, [
    { from: 1, to: 3 },
    { from: 4, to: 7 },
  ]);
  assert.deepEqual(gate.checks, [
    { key: 'document_count_within_cap', passed: true, note: null, observed: '2', expected: '20' },
    { key: 'ranges_inside_file', passed: false, note: 'range 4-7 is outside the file (5 pages)', observed: '1-3, 4-7', expected: '5' },
  ]);
  assert.equal(gate.reason, 'range 4-7 is outside the file (5 pages)');
});

test('a range starting before page 1 is rejected', () => {
  const gate = validateFileSplit(split([0, 2], [3, 5]), 5);
  assert.deepEqual(failedKeys(gate), ['ranges_inside_file']);
});

test('a range whose first page is after its last page is rejected', () => {
  const gate = validateFileSplit(split([3, 1], [4, 5]), 5);
  assert.equal(gate.result, false);
  assert.deepEqual(failedKeys(gate), ['ranges_inside_file']);
  assert.match(gate.reason ?? '', /first page after its last page/);
});

test('overlapping ranges are rejected, and the coverage check did not run', () => {
  const gate = validateFileSplit(split([1, 3], [3, 5]), 5);
  assert.equal(gate.result, false);
  assert.deepEqual(
    gate.checks.map((c) => [c.key, c.passed]),
    [
      ['document_count_within_cap', true],
      ['ranges_inside_file', true],
      ['ranges_ordered_no_overlap', false],
    ],
  );
  assert.equal(gate.reason, 'ranges 1-3 and 3-5 share a page');
});

test('ranges in the wrong order are rejected', () => {
  const gate = validateFileSplit(split([4, 5], [1, 3]), 5);
  assert.deepEqual(failedKeys(gate), ['ranges_ordered_no_overlap']);
  assert.match(gate.reason ?? '', /not in ascending order/);
});

test('a page that belongs to no range is rejected and named', () => {
  const gate = validateFileSplit(split([1, 2], [4, 5]), 5);
  assert.equal(gate.result, false);
  assert.deepEqual(gate.checks.at(-1), {
    key: 'all_pages_covered',
    passed: false,
    note: 'pages that belong to no range: 3',
    observed: '3',
    expected: 'none',
  });
});

test('an answer with no documents is rejected and only the count check ran', () => {
  const gate = validateFileSplit(split(), 5);
  assert.equal(gate.result, false);
  assert.deepEqual(gate.checks, [
    { key: 'document_count_within_cap', passed: false, note: 'the answer lists no documents', observed: '0', expected: '20' },
  ]);
});

test('an answer above the cap is rejected and only the count check ran', () => {
  const pages = MAX_SPLIT_DOCUMENTS + 5;
  const gate = validateFileSplit(split(...Array.from({ length: pages }, (_, i): [number, number] => [i + 1, i + 1])), pages);
  assert.equal(gate.result, false);
  assert.equal(gate.checks.length, 1);
  assert.equal(gate.checks[0]?.observed, '25');
  assert.equal(gate.checks[0]?.passed, false);
});

test('exactly the cap is accepted (boundary)', () => {
  const pages = MAX_SPLIT_DOCUMENTS;
  const gate = validateFileSplit(split(...Array.from({ length: pages }, (_, i): [number, number] => [i + 1, i + 1])), pages);
  assert.equal(gate.result, true);
});

test('the schema rejects page numbers that are not whole numbers', () => {
  assert.throws(() => FileSplitSchema.parse({ documents: [{ first_page: 1.5, last_page: 2, kind: 'x' }] }));
});

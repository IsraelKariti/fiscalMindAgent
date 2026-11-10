import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { previewKind } from '../web/src/components/attachmentPreview.js';
import { INLINE_VIEW_TYPES } from '../src/api/fileDisposition.js';

test('previewKind: images and PDFs get a preview, nothing else does', () => {
  assert.equal(previewKind({ content_type: 'image/png' }), 'image');
  assert.equal(previewKind({ content_type: 'image/jpeg' }), 'image');
  assert.equal(previewKind({ content_type: 'image/webp' }), 'image');
  assert.equal(previewKind({ content_type: 'application/pdf' }), 'pdf');
  assert.equal(previewKind({ content_type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), null);
  assert.equal(previewKind({ content_type: 'text/csv' }), null);
  assert.equal(previewKind({ content_type: 'text/html' }), null);
  assert.equal(previewKind({ content_type: 'image/svg+xml' }), null);
  assert.equal(previewKind({ content_type: '' }), null);
});

test('previewKind: tolerates parameters and case', () => {
  assert.equal(previewKind({ content_type: 'Application/PDF; charset=binary' }), 'pdf');
  assert.equal(previewKind({ content_type: 'IMAGE/JPEG' }), 'image');
});

test('previewKind: agrees with the server inline allowlist', () => {
  for (const type of INLINE_VIEW_TYPES) assert.notEqual(previewKind({ content_type: type }), null, type);
});

import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { isPlannerToolStep, stepGlyph } from '../web/src/components/stepGlyph.js';

// openspec `conversation-trace`: a tool-call step shows a tool, a check a shield, a code-only step a gear.
test('tool-call steps get the tool icon; checks the shield; code-only and legacy apply rows the gear', () => {
  assert.equal(stepGlyph({ action: 'validate_message', severity: 'info' }), '🛡️');
  assert.equal(stepGlyph({ action: 'document.collected', severity: 'info' }), '🛡️');
  for (const tool of ['tie_file', 'mark_collected', 'conclude', 'send_whatsapp_text', 'resolve_document']) {
    assert.equal(stepGlyph({ action: tool, severity: 'info' }), '🛠️', tool);
    assert.equal(isPlannerToolStep(tool), true);
  }
  assert.equal(stepGlyph({ action: 'send_closing', severity: 'info' }), '⚙️');
  assert.equal(stepGlyph({ action: 'apply_collections', severity: 'info' }), '⚙️');
  assert.equal(stepGlyph({ action: 'send_reply', severity: 'info' }), '⚙️');
  assert.equal(stepGlyph({ action: 'withhold_reply', severity: 'info' }), '⚙️');
  assert.equal(isPlannerToolStep('apply_collections'), false);
});

test('a critical row and an accountant email keep their own marks', () => {
  assert.equal(stepGlyph({ action: 'tie_file', severity: 'critical' }), '⛔');
  assert.equal(stepGlyph({ action: 'email.accountant_sent', severity: 'info' }, true), '✉️');
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MessageTimingError,
  parseSavedSeconds,
  resolveMessageTiming,
  validateMessageTiming,
  type MessageTiming,
} from '../src/orchestration/timingRules.js';

const defaults: MessageTiming = { quietSeconds: 125, maxWaitSeconds: 300, afterSendDelaySeconds: 3600 };

describe('message timing settings (openspec `admin-timing-settings`)', () => {
  it('falls back to the server default when nothing is saved', () => {
    assert.deepEqual(resolveMessageTiming({}, defaults), defaults);
  });

  it('uses each saved value and ignores an unusable row', () => {
    const timing = resolveMessageTiming({ quietSeconds: '30', maxWaitSeconds: 'abc', afterSendDelaySeconds: '0' }, defaults);
    assert.deepEqual(timing, { quietSeconds: 30, maxWaitSeconds: 300, afterSendDelaySeconds: 0 });
  });

  it('rejects fractions, blanks and values below the minimum when parsing a saved row', () => {
    assert.equal(parseSavedSeconds('1.5', 'quietSeconds'), null);
    assert.equal(parseSavedSeconds('', 'quietSeconds'), null);
    assert.equal(parseSavedSeconds('0', 'quietSeconds'), null);
    assert.equal(parseSavedSeconds('0', 'afterSendDelaySeconds'), 0);
    assert.equal(parseSavedSeconds('-1', 'afterSendDelaySeconds'), null);
  });

  it('accepts a valid save', () => {
    validateMessageTiming({ quietSeconds: 30, maxWaitSeconds: 30, afterSendDelaySeconds: 0 });
  });

  it('refuses a non-integer, a quiet window below one second, a negative delay, and a max wait below the quiet window', () => {
    assert.throws(() => validateMessageTiming({ quietSeconds: 1.5, maxWaitSeconds: 300, afterSendDelaySeconds: 0 }), MessageTimingError);
    assert.throws(() => validateMessageTiming({ quietSeconds: 0, maxWaitSeconds: 300, afterSendDelaySeconds: 0 }), MessageTimingError);
    assert.throws(() => validateMessageTiming({ quietSeconds: 15, maxWaitSeconds: 300, afterSendDelaySeconds: -1 }), MessageTimingError);
    assert.throws(
      () => validateMessageTiming({ quietSeconds: 120, maxWaitSeconds: 60, afterSendDelaySeconds: 0 }),
      (err: unknown) => err instanceof MessageTimingError && /maximum wait must be at least the quiet window/.test(err.message),
    );
  });
});

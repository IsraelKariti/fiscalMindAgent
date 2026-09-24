import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AttemptsExhaustedError, errorSummary, withAttempts } from '../src/webhook/ingestRetry.js';

function recorder() {
  const pauses: number[] = [];
  return { pauses, sleep: async (ms: number) => { pauses.push(ms); } };
}

test('returns on the first success without pausing', async () => {
  const { pauses, sleep } = recorder();
  const result = await withAttempts(async () => 'ok', { attempts: 3, delaysMs: [2000, 8000], sleep });
  assert.deepEqual(result, { value: 'ok', attempts: 1 });
  assert.deepEqual(pauses, []);
});

test('succeeds on the second attempt after one pause', async () => {
  const { pauses, sleep } = recorder();
  let calls = 0;
  const result = await withAttempts(
    async (attempt) => {
      calls += 1;
      if (attempt === 1) throw new Error('media download returned 503');
      return `stored on ${attempt}`;
    },
    { attempts: 3, delaysMs: [2000, 8000], sleep },
  );
  assert.deepEqual(result, { value: 'stored on 2', attempts: 2 });
  assert.equal(calls, 2);
  assert.deepEqual(pauses, [2000]);
});

test('gives up after the last attempt, keeps the last error as cause, and does not pause after it', async () => {
  const { pauses, sleep } = recorder();
  let calls = 0;
  const last = new TypeError('fetch failed', { cause: new Error('ECONNRESET') });
  await assert.rejects(
    withAttempts(
      async () => {
        calls += 1;
        throw calls === 3 ? last : new Error(`attempt ${calls} failed`);
      },
      { attempts: 3, delaysMs: [2000, 8000], sleep },
    ),
    (err: unknown) => {
      assert.ok(err instanceof AttemptsExhaustedError);
      assert.equal(err.attempts, 3);
      assert.equal(err.cause, last);
      assert.match(err.message, /gave up after 3 attempts: fetch failed <- ECONNRESET/);
      return true;
    },
  );
  assert.equal(calls, 3);
  assert.deepEqual(pauses, [2000, 8000]);
});

test('repeats the last delay when there are more attempts than delays', async () => {
  const { pauses, sleep } = recorder();
  await assert.rejects(
    withAttempts(async () => { throw new Error('x'); }, { attempts: 4, delaysMs: [1000], sleep }),
    AttemptsExhaustedError,
  );
  assert.deepEqual(pauses, [1000, 1000, 1000]);
});

test('errorSummary flattens the cause chain to one capped line', () => {
  const err = new TypeError('fetch failed', { cause: new AggregateError([new Error('ECONNREFUSED ::1'), new Error('ECONNREFUSED 127.0.0.1')], 'connect') });
  assert.equal(errorSummary(err), 'fetch failed <- connect [ECONNREFUSED ::1; ECONNREFUSED 127.0.0.1]');
  assert.equal(errorSummary('plain string'), 'plain string');
  assert.equal(errorSummary(new Error('first line\nsecond line')), 'first line');
  assert.equal(errorSummary(new Error('a'.repeat(400))).length, 300);
});

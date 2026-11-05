import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { clientDotState, dotColorOf, type DotColor } from '../web/src/format.js';
import {
  MONDAY_DOCS_COMPLETE,
  MONDAY_DOCS_IN_PROGRESS,
  MONDAY_DOCS_REFUSED,
  MONDAY_DOCS_WINDOW_ENDED,
  documentsStatusInputOf,
  documentsStatusLabelOf,
} from '../src/agents/shared/mondayDocumentsStatus.js';

// openspec `monday-documents-status`: the board label follows the client dot,
// so the backend rule must agree with the web rule for every flag combination.

const LABEL_BY_COLOR: Record<DotColor, string> = {
  blue: MONDAY_DOCS_IN_PROGRESS,
  green: MONDAY_DOCS_COMPLETE,
  red: MONDAY_DOCS_REFUSED,
  orange: MONDAY_DOCS_WINDOW_ENDED,
};

test('label agrees with the dot color for all eight flag combinations', () => {
  for (const goal_status of ['pending', 'complete'] as const) {
    for (const declined of [false, true]) {
      for (const overdueStopped of [false, true]) {
        const color = dotColorOf(clientDotState({ goal_status, declined, overdueStopped }));
        assert.equal(
          documentsStatusLabelOf({ goal_status, declined, overdueStopped }),
          LABEL_BY_COLOR[color],
          `goal=${goal_status} declined=${declined} overdue=${overdueStopped}`,
        );
      }
    }
  }
});

test('the four labels are distinct Hebrew texts', () => {
  assert.equal(new Set(Object.values(LABEL_BY_COLOR)).size, 4);
});

test('input is read off the stored stamps', () => {
  assert.deepEqual(documentsStatusInputOf({ goal_status: 'pending', agent_fields: {} }), { goal_status: 'pending', declined: false, overdueStopped: false });
  assert.deepEqual(documentsStatusInputOf({ goal_status: 'pending', agent_fields: { declined_at: '2026-11-05T10:00:00.000Z', overdue_stopped_at: 7 } }), {
    goal_status: 'pending',
    declined: true,
    overdueStopped: false,
  });
  assert.deepEqual(documentsStatusInputOf({ goal_status: 'complete', agent_fields: { overdue_stopped_at: '2026-11-01T00:00:00.000Z' } }), {
    goal_status: 'complete',
    declined: false,
    overdueStopped: true,
  });
});

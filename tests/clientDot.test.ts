import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { clientDotState, countByDotColor, dotColorOf, type ClientDotState } from '../web/src/format.js';

// openspec `client-status-indicator`: one state per client, one color per state.

test('dot state precedence: refused > done > window ended > in progress', () => {
  assert.equal(clientDotState({ goal_status: 'pending', declined: true, overdueStopped: true }), 'refused');
  assert.equal(clientDotState({ goal_status: 'complete', declined: true }), 'done');
  assert.equal(clientDotState({ goal_status: 'complete', overdueStopped: true }), 'done');
  assert.equal(clientDotState({ goal_status: 'pending', overdueStopped: true }), 'window_ended');
  assert.equal(clientDotState({ goal_status: 'pending' }), 'in_progress');
  assert.equal(clientDotState({ goal_status: 'pending', declined: false, overdueStopped: false }), 'in_progress');
});

test('each state has its own color', () => {
  const expected: Record<ClientDotState, string> = { in_progress: 'blue', done: 'green', window_ended: 'orange', refused: 'red' };
  for (const [state, color] of Object.entries(expected)) assert.equal(dotColorOf(state as ClientDotState), color);
});

test('counts per filter button', () => {
  const states: ClientDotState[] = ['in_progress', 'in_progress', 'done', 'window_ended', 'refused', 'in_progress'];
  assert.deepEqual(countByDotColor(states), { all: 6, blue: 3, green: 1, orange: 1, red: 1 });
  assert.deepEqual(countByDotColor([]), { all: 0, blue: 0, green: 0, orange: 0, red: 0 });
});

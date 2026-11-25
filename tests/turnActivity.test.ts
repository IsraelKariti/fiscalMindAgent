import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTurnActivity, showHeaderPause, type TurnActivityInput } from '../web/src/components/turnActivity.js';

const NOW = Date.parse('2026-11-22T18:25:00Z');
const ago = (s: number): string => new Date(NOW - s * 1000).toISOString();
const ahead = (s: number): string => new Date(NOW + s * 1000).toISOString();

function input(over: Partial<TurnActivityInput['client']> = {}, rest: Partial<Omit<TurnActivityInput, 'client'>> = {}): TurnActivityInput {
  return {
    client: {
      goal_status: 'pending',
      paused: false,
      handedOff: false,
      deletedAt: null,
      drafting_since: null,
      processing_since: null,
      draft_failed_at: null,
      outage_held_at: null,
      ...over,
    },
    hasScheduled: false,
    planWaitUntil: null,
    lastActivityAt: ago(30),
    now: NOW,
    ...rest,
  };
}

describe('resolveTurnActivity (openspec `turn-activity-states`)', () => {
  it('shows nothing while a run is queued (quiet window, after-send wait)', () => {
    assert.equal(resolveTurnActivity(input({}, { planWaitUntil: ahead(100) })), 'waiting');
    assert.equal(resolveTurnActivity(input({}, { planWaitUntil: ahead(3500) })), 'waiting');
  });

  it('is processing while the processing stamp is fresh, stuck once stale', () => {
    assert.equal(resolveTurnActivity(input({ processing_since: ago(60) })), 'processing');
    assert.equal(resolveTurnActivity(input({ processing_since: ago(4 * 60) })), 'stuck');
  });

  it('is drafting while the drafting stamp is fresh, stuck once stale; drafting wins over processing', () => {
    assert.equal(resolveTurnActivity(input({ drafting_since: ago(20) })), 'drafting');
    assert.equal(resolveTurnActivity(input({ drafting_since: ago(4 * 60) })), 'stuck');
    assert.equal(resolveTurnActivity(input({ drafting_since: ago(20), processing_since: ago(5) })), 'drafting');
  });

  it('a paused client shows nothing, except a held first draft', () => {
    assert.equal(resolveTurnActivity(input({ paused: true })), null);
    assert.equal(resolveTurnActivity(input({ paused: true, drafting_since: ago(10) })), 'drafting');
    assert.equal(resolveTurnActivity(input({ paused: true, draft_failed_at: ago(10) })), 'failed');
    assert.equal(resolveTurnActivity(input({ paused: true, processing_since: ago(10) })), null);
  });

  it('a handed-off paused client shows its handed-off notice, whatever a planner attempt left behind', () => {
    // Due date passed (or declined) after a failed draft: the handed-off bubble with Resume, no Retry.
    assert.equal(resolveTurnActivity(input({ paused: true, handedOff: true, draft_failed_at: ago(10) })), null);
    assert.equal(resolveTurnActivity(input({ paused: true, handedOff: true, drafting_since: ago(4 * 60) })), null);
    assert.equal(resolveTurnActivity(input({ paused: true, handedOff: true, outage_held_at: ago(10) })), null);
    // Not paused (resumed) or not handed off: the failure keeps its notice (held first-message path).
    assert.equal(resolveTurnActivity(input({ paused: true, handedOff: false, draft_failed_at: ago(10) })), 'failed');
    assert.equal(resolveTurnActivity(input({ paused: false, handedOff: true, draft_failed_at: ago(10) })), 'failed');
  });

  it('failed and held keep their notices', () => {
    assert.equal(resolveTurnActivity(input({ draft_failed_at: ago(10) })), 'failed');
    assert.equal(resolveTurnActivity(input({ outage_held_at: ago(10), drafting_since: ago(10) })), 'held');
  });

  it('nothing queued: idle at first, stuck after the stale limit', () => {
    assert.equal(resolveTurnActivity(input({}, { lastActivityAt: ago(60) })), 'idle');
    assert.equal(resolveTurnActivity(input({}, { lastActivityAt: ago(4 * 60) })), 'stuck');
    assert.equal(resolveTurnActivity(input({}, { lastActivityAt: null })), 'idle');
  });

  it('nothing while a send is scheduled, the goal is done or the client is deleted', () => {
    assert.equal(resolveTurnActivity(input({ processing_since: ago(5) }, { hasScheduled: true })), null);
    assert.equal(resolveTurnActivity(input({ goal_status: 'complete', drafting_since: ago(5) })), null);
    assert.equal(resolveTurnActivity(input({ deletedAt: ago(5), drafting_since: ago(5) })), null);
  });

  it('a row from before the processing column reads as no processing', () => {
    const noColumn = input();
    delete noColumn.client.processing_since;
    assert.equal(resolveTurnActivity({ ...noColumn, planWaitUntil: ahead(10) }), 'waiting');
  });
});

describe('showHeaderPause (openspec `conversation-pause`)', () => {
  const base = { readOnly: false, goalStatus: 'pending', paused: false, hasScheduled: false };

  it('shows the header control while the agent waits with nothing scheduled', () => {
    assert.equal(showHeaderPause(base), true);
  });

  it('hides it when a scheduled bubble exists (it carries its own control, or none when held for review)', () => {
    assert.equal(showHeaderPause({ ...base, hasScheduled: true }), false);
  });

  it('hides it for a paused client, a completed goal and a read-only (deleted) client', () => {
    assert.equal(showHeaderPause({ ...base, paused: true }), false);
    assert.equal(showHeaderPause({ ...base, goalStatus: 'complete' }), false);
    assert.equal(showHeaderPause({ ...base, readOnly: true }), false);
  });
});

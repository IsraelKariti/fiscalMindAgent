import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { resolveTurnActivity, type TurnActivityInput } from '../web/src/components/turnActivity.js';

const NOW = Date.parse('2026-11-22T18:25:00Z');
const ago = (s: number): string => new Date(NOW - s * 1000).toISOString();
const ahead = (s: number): string => new Date(NOW + s * 1000).toISOString();

function input(over: Partial<TurnActivityInput['client']> = {}, rest: Partial<Omit<TurnActivityInput, 'client'>> = {}): TurnActivityInput {
  return {
    client: {
      goal_status: 'pending',
      paused: false,
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

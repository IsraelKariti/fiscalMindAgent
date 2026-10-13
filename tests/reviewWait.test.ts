import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { awaitsAdminReview, reviewWaitState, type ReviewWaitDraft } from '../src/orchestration/reviewWait.js';

// openspec `review-wait-visibility`: the client read reports whether the
// scheduled draft awaits admin approval and whether the worker already held
// it; "send now" is refused on such a draft.

const heldAt = new Date('2026-10-13T08:03:00Z');
const draft = (over: Partial<ReviewWaitDraft>): ReviewWaitDraft => ({
  status: 'draft',
  review_status: null,
  held_at: null,
  ...over,
});

describe('awaitsAdminReview (the send-now gate)', () => {
  it('refuses a pending draft whose time is still ahead', () => {
    assert.equal(awaitsAdminReview(draft({ review_status: 'pending' })), true);
  });

  it('refuses a draft the worker already held', () => {
    assert.equal(awaitsAdminReview(draft({ status: 'held', review_status: 'pending', held_at: heldAt })), true);
  });

  it('lets an approved draft, a draft outside review mode, and a missing draft through', () => {
    assert.equal(awaitsAdminReview(draft({ review_status: 'approved' })), false);
    assert.equal(awaitsAdminReview(draft({})), false);
    assert.equal(awaitsAdminReview(null), false);
  });
});

describe('reviewWaitState (the nextScheduled fields)', () => {
  it('pending, time ahead: awaiting and not held', () => {
    assert.deepEqual(reviewWaitState(draft({ review_status: 'pending' })), { reviewPending: true, heldAt: null });
  });

  it('pending, time passed: awaiting and held', () => {
    assert.deepEqual(reviewWaitState(draft({ status: 'held', review_status: 'pending', held_at: heldAt })), {
      reviewPending: true,
      heldAt,
    });
  });

  it('approved or no review mode: not awaiting', () => {
    assert.deepEqual(reviewWaitState(draft({ review_status: 'approved' })), { reviewPending: false, heldAt: null });
    assert.deepEqual(reviewWaitState(draft({})), { reviewPending: false, heldAt: null });
    assert.deepEqual(reviewWaitState(null), { reviewPending: false, heldAt: null });
  });
});

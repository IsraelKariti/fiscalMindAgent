import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { holdsFirstMessage } from '../src/orchestration/holdRule.js';
import { resumeAction } from '../src/orchestration/resumeDecision.js';

// openspec `first-message-approval`: the kickoff drafts the first message of a
// paused, never-contacted manual-kickoff client and holds it; the accountant's
// resume sends it — at its time, or now when that time passed.

describe('holdsFirstMessage', () => {
  it('holds a paused, never-contacted manual-kickoff client', () => {
    assert.equal(holdsFirstMessage({ paused: true, manualKickoff: true, contactedMessages: 0 }), true);
  });

  it('does not hold once a message was sent or received (a plain accountant pause)', () => {
    assert.equal(holdsFirstMessage({ paused: true, manualKickoff: true, contactedMessages: 1 }), false);
  });

  it('does not hold an unpaused client', () => {
    assert.equal(holdsFirstMessage({ paused: false, manualKickoff: true, contactedMessages: 0 }), false);
  });

  it('does not hold a client of a non-manual-kickoff agent type', () => {
    assert.equal(holdsFirstMessage({ paused: true, manualKickoff: false, contactedMessages: 0 }), false);
  });
});

describe('resumeAction', () => {
  const now = new Date('2026-10-11T10:00:00Z');
  const row = (scheduledFor: string, jobId = 'send_email:client-1:email-1') => ({
    bullmq_job_id: jobId,
    scheduled_for: new Date(scheduledFor),
  });

  it('restores the same draft when its planned time is still ahead', () => {
    assert.equal(resumeAction({ row: row('2026-10-11T11:00:00Z'), jobState: null, now }), 'restore');
  });

  it('sends the same draft now when its planned time passed', () => {
    assert.equal(resumeAction({ row: row('2026-10-09T09:00:00Z'), jobState: null, now }), 'send_now');
  });

  it('sends now when the planned time is exactly now', () => {
    assert.equal(resumeAction({ row: row('2026-10-11T10:00:00Z'), jobState: null, now }), 'send_now');
  });

  it('redrafts when nothing was preserved', () => {
    assert.equal(resumeAction({ row: null, jobState: null, now }), 'redraft');
  });

  it('leaves a still-queued job alone', () => {
    assert.equal(resumeAction({ row: row('2026-10-11T11:00:00Z'), jobState: 'delayed', now }), 'already_queued');
    assert.equal(resumeAction({ row: row('2026-10-09T09:00:00Z'), jobState: 'active', now }), 'already_queued');
  });

  it('redrafts when a finished job squats on the id or the id is unparseable', () => {
    assert.equal(resumeAction({ row: row('2026-10-09T09:00:00Z'), jobState: 'completed', now }), 'redraft');
    assert.equal(resumeAction({ row: row('2026-10-11T11:00:00Z', 'garbage'), jobState: null, now }), 'redraft');
  });
});

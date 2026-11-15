import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildTeamQuestionsSection } from '../src/agents/declarationOfCapital/prompt.js';
import type { TeamQuestionRow } from '../src/db/types.js';

// openspec `team-questions`: the TEAM QUESTIONS prompt section lists each
// question with its state — open, answered, or handled directly.

const TOKEN = 'tok123';
const row = (over: Partial<TeamQuestionRow>): TeamQuestionRow => ({
  id: 'q1',
  client_id: 'c1',
  agent_instance_id: 'i1',
  question: 'האם המשרד מחזיק בהצהרת ההון הקודמת של הלקוח?',
  reason: 'הלקוח שואל אם צריך לשלוח אותה',
  evidence_message_id: 'm1',
  asked_at: new Date('2026-11-15T09:00:00.000Z'),
  to_email: 'dana@office.co.il',
  to_name: 'דנה לוי',
  to_match: 'staff',
  closed_how: null,
  closed_text: null,
  closed_at: null,
  closed_by: null,
  closed_by_name: null,
  created_at: new Date('2026-11-15T09:00:00.000Z'),
  ...over,
});

describe('TEAM QUESTIONS prompt section', () => {
  it('is empty when the client has no questions', () => {
    assert.equal(buildTeamQuestionsSection(TOKEN, []), '');
  });

  it('an open question is marked OPEN with the addressee and the reason', () => {
    const s = buildTeamQuestionsSection(TOKEN, [row({})]);
    assert.ok(s.startsWith('--- TEAM QUESTIONS'), s);
    assert.ok(s.includes('[question 1] asked 2026-11-15T09:00:00.000Z | to: דנה לוי (team member) | OPEN — waiting for the team'), s);
    assert.ok(s.includes('Q: האם המשרד מחזיק בהצהרת ההון הקודמת של הלקוח?'), s);
    assert.ok(s.includes('Why asked: הלקוח שואל אם צריך לשלוח אותה'), s);
    assert.ok(!s.includes('A:'), s);
  });

  it('an answered question carries the answer and the answerer', () => {
    const s = buildTeamQuestionsSection(TOKEN, [
      row({ closed_how: 'answered', closed_text: 'יש לנו אותה, לא צריך כלום', closed_at: new Date('2026-11-15T12:30:00.000Z'), closed_by_name: 'דנה לוי' }),
    ]);
    assert.ok(s.includes('| ANSWERED by דנה לוי at 2026-11-15T12:30:00.000Z'), s);
    assert.ok(s.includes('A: יש לנו אותה, לא צריך כלום'), s);
  });

  it('a question handled directly says so, with the note when there is one', () => {
    const s = buildTeamQuestionsSection(TOKEN, [
      row({ closed_how: 'handled_outside', closed_text: 'אמרתי לו בטלפון שיש לנו', closed_at: new Date('2026-11-15T12:30:00.000Z'), closed_by_name: 'דנה לוי' }),
      row({ id: 'q0', reason: '', asked_at: new Date('2026-11-14T09:00:00.000Z'), closed_how: 'handled_outside', closed_text: null, closed_at: new Date('2026-11-14T12:30:00.000Z'), closed_by_name: null, to_match: 'accountant' }),
    ]);
    assert.ok(s.includes('| HANDLED DIRECTLY by דנה לוי at 2026-11-15T12:30:00.000Z (spoke to the client outside this chat)'), s);
    assert.ok(s.includes('Note: אמרתי לו בטלפון שיש לנו'), s);
    assert.ok(s.includes('[question 2] asked 2026-11-14T09:00:00.000Z | to: דנה לוי (the accountant) | HANDLED DIRECTLY by דנה לוי'), s);
    assert.equal((s.match(/Why asked:/g) ?? []).length, 1);
    assert.equal((s.match(/Note:/g) ?? []).length, 1);
  });

  it('lists at most five questions', () => {
    const many = Array.from({ length: 7 }, (_, i) => row({ id: `q${i}` }));
    const s = buildTeamQuestionsSection(TOKEN, many);
    assert.ok(s.includes('[question 5]') && !s.includes('[question 6]'), s);
  });
});

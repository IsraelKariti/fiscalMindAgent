import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { accountantName, teamQuestionAddressee, teamQuestionEmail } from '../src/agents/declarationOfCapital/teamQuestions.js';

// openspec `team-questions`: a question goes to the client's stored tax
// advisor when matched (accountant or staff); otherwise to the accountant.

const accountant = { email: 'office@example.com', name: 'Office Ltd', hebrew_name: 'משרד רו"ח כהן' };
const advisor = (over: Record<string, unknown>) => ({ agent_fields: { tax_advisor: { name: 'דנה לוי', email: 'Dana@Office.co.il', monday_user_id: '7', match: 'staff', ...over } } });

describe('teamQuestionAddressee', () => {
  it('a staff-matched advisor is the addressee, with the stored email as is', () => {
    assert.deepEqual(teamQuestionAddressee(advisor({}), accountant), { email: 'Dana@Office.co.il', name: 'דנה לוי', match: 'staff' });
  });

  it('an advisor matched to the accountant is the addressee as the accountant', () => {
    assert.deepEqual(teamQuestionAddressee(advisor({ match: 'accountant', email: 'office@example.com' }), accountant), {
      email: 'office@example.com',
      name: 'דנה לוי',
      match: 'accountant',
    });
  });

  it('an unmatched advisor, or one without an email, falls back to the accountant', () => {
    assert.deepEqual(teamQuestionAddressee(advisor({ match: 'none' }), accountant), { email: 'office@example.com', name: 'משרד רו"ח כהן', match: 'accountant' });
    assert.deepEqual(teamQuestionAddressee(advisor({ email: null }), accountant), { email: 'office@example.com', name: 'משרד רו"ח כהן', match: 'accountant' });
  });

  it('no advisor at all → the accountant; no accountant either → null', () => {
    assert.equal(teamQuestionAddressee({ agent_fields: {} }, accountant)?.email, 'office@example.com');
    assert.equal(teamQuestionAddressee({ agent_fields: {} }, null), null);
  });

  it('the accountant name prefers the Hebrew name, then the Google name, then the email', () => {
    assert.equal(accountantName(accountant), 'משרד רו"ח כהן');
    assert.equal(accountantName({ ...accountant, hebrew_name: null }), 'Office Ltd');
    assert.equal(accountantName({ email: 'x@y.z', name: null, hebrew_name: null }), 'x@y.z');
  });
});

describe('teamQuestionEmail', () => {
  it('names the client in the subject and carries the question, the reason and the app link', () => {
    const { subject, body } = teamQuestionEmail({ name: 'יוסי כהן' }, { question: 'האם המשרד מחזיק בהצהרה הקודמת?', reason: 'הלקוח שואל' });
    assert.ok(subject.includes('יוסי כהן'), subject);
    assert.ok(body.includes('האם המשרד מחזיק בהצהרה הקודמת?'), body);
    assert.ok(body.includes('למה הסוכן שואל:'), body);
    assert.ok(body.includes('הלקוח שואל'), body);
    assert.ok(body.includes('לשונית "שאלות"'), body);
  });

  it('leaves the reason block out when the reason is empty', () => {
    const { body } = teamQuestionEmail({ name: 'יוסי כהן' }, { question: 'ש', reason: '  ' });
    assert.ok(!body.includes('למה הסוכן שואל'), body);
  });
});

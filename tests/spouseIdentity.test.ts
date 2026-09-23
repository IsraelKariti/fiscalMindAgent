import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_SPOUSE,
  describePerson,
  mergeSpouse,
  readMaritalStatus,
  readSpouse,
  resolveSubjectIdentity,
  spouseToStored,
  type IdentityContext,
  type SpouseOnFile,
} from '../src/agents/declarationOfCapital/spouseIdentity.js';
import { runChecks, type CheckContext, type ExtractedFields } from '../src/agents/declarationOfCapital/verifyChecks.js';

// Checksum-valid test ids.
const CLIENT_ID = '025699448';
const SPOUSE_ID = '123456782';
const THIRD_ID = '012345542';
const BAD_ID = '123456783';

describe('readSpouse / readMaritalStatus', () => {
  it('reads a stored spouse and tolerates garbage', () => {
    assert.deepEqual(
      readSpouse({ spouse: { name: 'מיכל תמיר', id_number: SPOUSE_ID, name_source: 'questionnaire', id_source: 'document' } }),
      { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'questionnaire', idSource: 'document' },
    );
    assert.deepEqual(readSpouse({}), EMPTY_SPOUSE);
    assert.deepEqual(readSpouse(undefined), EMPTY_SPOUSE);
    assert.deepEqual(readSpouse({ spouse: 'מיכל' }), EMPTY_SPOUSE);
    assert.deepEqual(readSpouse({ spouse: [] }), EMPTY_SPOUSE);
    // A source without its value, or an unknown source, is dropped.
    assert.deepEqual(readSpouse({ spouse: { name: '', name_source: 'questionnaire', id_number: SPOUSE_ID, id_source: 'gossip' } }), {
      name: null,
      idNumber: SPOUSE_ID,
      nameSource: null,
      idSource: null,
    });
    assert.equal(readMaritalStatus({ marital_status: 'married' }), 'married');
    assert.equal(readMaritalStatus({ marital_status: 'not_married' }), 'not_married');
    assert.equal(readMaritalStatus({ marital_status: 'single' }), null);
    assert.equal(readMaritalStatus({}), null);
  });

  it('round-trips through the stored shape', () => {
    const s: SpouseOnFile = { name: 'מיכל', idNumber: SPOUSE_ID, nameSource: 'crm', idSource: 'document' };
    assert.deepEqual(readSpouse({ spouse: spouseToStored(s) }), s);
  });
});

describe('mergeSpouse', () => {
  it('fills a gap from any source and never clears a value', () => {
    const fromDoc = mergeSpouse(EMPTY_SPOUSE, { idNumber: SPOUSE_ID, name: 'מיכל תמיר' }, 'document');
    assert.deepEqual(fromDoc, { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'document', idSource: 'document' });
    assert.deepEqual(mergeSpouse(fromDoc, { name: null, idNumber: undefined }, 'questionnaire'), fromDoc);
    assert.deepEqual(mergeSpouse(fromDoc, {}, 'questionnaire'), fromDoc);
  });

  it('a higher-trust source replaces, an equal or lower one is ignored', () => {
    const fromDoc = mergeSpouse(EMPTY_SPOUSE, { idNumber: SPOUSE_ID }, 'document');
    // document → document: the first inferred id stays.
    assert.equal(mergeSpouse(fromDoc, { idNumber: THIRD_ID }, 'document').idNumber, SPOUSE_ID);
    // document → crm → questionnaire: each step wins.
    const fromCrm = mergeSpouse(fromDoc, { idNumber: THIRD_ID }, 'crm');
    assert.deepEqual([fromCrm.idNumber, fromCrm.idSource], [THIRD_ID, 'crm']);
    const fromForm = mergeSpouse(fromCrm, { idNumber: CLIENT_ID }, 'questionnaire');
    assert.deepEqual([fromForm.idNumber, fromForm.idSource], [CLIENT_ID, 'questionnaire']);
    // questionnaire → crm / document: ignored.
    assert.deepEqual(mergeSpouse(fromForm, { idNumber: SPOUSE_ID }, 'crm'), fromForm);
    assert.deepEqual(mergeSpouse(fromForm, { idNumber: SPOUSE_ID }, 'document'), fromForm);
  });

  it('name and id are merged independently', () => {
    const named = mergeSpouse(EMPTY_SPOUSE, { name: 'מיכל תמיר' }, 'questionnaire');
    const both = mergeSpouse(named, { name: 'מ. תמיר', idNumber: SPOUSE_ID }, 'document');
    assert.deepEqual(both, { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'questionnaire', idSource: 'document' });
  });
});

const baseCtx: IdentityContext = {
  clientName: 'ניב תמיר',
  clientId: CLIENT_ID,
  clientIdSource: 'monday_crm',
  spouse: EMPTY_SPOUSE,
  maritalStatus: null,
  subjectMatch: true,
};
const printed = (id: string, name: string | null = 'מיכל תמיר') => ({ subjectName: name, printedId: id, printedIdValid: id !== BAD_ID });
const byKey = (v: { checks: { key: string }[] }) => Object.fromEntries(v.checks.map((c) => [c.key, c])) as Record<string, any>;

describe('resolveSubjectIdentity', () => {
  it("the client's own id → client, expected names the client and the source", () => {
    const v = resolveSubjectIdentity(printed(CLIENT_ID, 'ניב'), baseCtx);
    assert.equal(v.matched, 'client');
    assert.equal(v.adopt, null);
    const k = byKey(v);
    assert.equal(k.subject.passed, true);
    assert.equal(k.subject.observed, 'ת"ז ••••••448 תואמת ללקוח');
    assert.equal(k.subject.expected, 'ניב תמיר');
    assert.equal(k.id_matches_client.passed, true);
    assert.equal(k.id_matches_client.expected, 'client ••••••448 (monday CRM)');
    assert.equal(k.spouse_adopted, undefined);
  });

  it("the spouse's id on file → spouse, no adoption", () => {
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'questionnaire', idSource: 'questionnaire' };
    const v = resolveSubjectIdentity(printed(SPOUSE_ID), { ...baseCtx, spouse });
    assert.equal(v.matched, 'spouse');
    assert.equal(v.adopt, null);
    const k = byKey(v);
    assert.equal(k.subject.observed, 'ת"ז ••••••782 תואמת לבן/בת הזוג');
    assert.equal(k.subject.expected, 'מיכל תמיר');
    assert.equal(k.id_matches_client.expected, 'spouse ••••••782 (questionnaire)');
    assert.equal(k.spouse_adopted, undefined);
    // A short-printed id (dropped leading zero) still matches the spouse on file.
    const short = resolveSubjectIdentity(printed('12345542'), { ...baseCtx, spouse: { ...spouse, idNumber: '012345542' } });
    assert.equal(short.matched, 'spouse');
  });

  it('first foreign valid id → adopted as the spouse, with the printed name', () => {
    const v = resolveSubjectIdentity(printed(SPOUSE_ID), baseCtx);
    assert.equal(v.matched, 'spouse');
    assert.deepEqual(v.adopt, { idNumber: SPOUSE_ID, name: 'מיכל תמיר' });
    const k = byKey(v);
    assert.equal(k.subject.passed, true);
    assert.equal(k.subject.expected, 'מיכל תמיר');
    assert.equal(k.id_matches_client.passed, true);
    assert.equal(k.id_matches_client.expected, 'spouse ••••••782 (document)');
    assert.equal(k.spouse_adopted.passed, true);
    assert.equal(k.spouse_adopted.observed, '••••••782');
    assert.equal(k.spouse_adopted.expected, 'מיכל תמיר');
    // Married per the questionnaire: the same.
    assert.equal(resolveSubjectIdentity(printed(SPOUSE_ID), { ...baseCtx, maritalStatus: 'married' }).matched, 'spouse');
    // No printed name: adopted with name unknown.
    const nameless = resolveSubjectIdentity(printed(SPOUSE_ID, null), baseCtx);
    assert.deepEqual(nameless.adopt, { idNumber: SPOUSE_ID, name: null });
    assert.equal(byKey(nameless).spouse_adopted.expected, 'name unknown');
    assert.equal(byKey(nameless).subject.expected, 'בן/בת זוג');
  });

  it('a spouse name from the form is kept over the printed spelling when adopting', () => {
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: null, nameSource: 'questionnaire', idSource: null };
    const v = resolveSubjectIdentity(printed(SPOUSE_ID, 'תמיר מיכל'), { ...baseCtx, spouse });
    assert.deepEqual(v.adopt, { idNumber: SPOUSE_ID, name: 'מיכל תמיר' });
  });

  it('a third person (spouse id already on file) fails id_matches_client and subject', () => {
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'document', idSource: 'document' };
    const v = resolveSubjectIdentity(printed(THIRD_ID, 'דנה לוי'), { ...baseCtx, spouse });
    assert.equal(v.matched, null);
    assert.equal(v.adopt, null);
    const k = byKey(v);
    assert.equal(k.id_matches_client.passed, false);
    assert.equal(k.id_matches_client.observed, '••••••542');
    assert.equal(k.id_matches_client.expected, 'client ••••••448 (monday CRM) / spouse ••••••782 (document)');
    assert.match(k.id_matches_client.reason, /אדם אחר/);
    assert.equal(k.subject.passed, false);
    assert.equal(k.subject.expected, 'ניב תמיר / מיכל תמיר');
    assert.equal(k.spouse_adopted, undefined);
  });

  it('a foreign id for a client registered as not married fails, no adoption', () => {
    const v = resolveSubjectIdentity(printed(SPOUSE_ID), { ...baseCtx, maritalStatus: 'not_married' });
    assert.equal(v.matched, null);
    assert.equal(v.adopt, null);
    assert.match(byKey(v).id_matches_client.reason, /לא נשוי/);
  });

  it('a printed name contradicting the spouse name from the form blocks adoption', () => {
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: null, nameSource: 'questionnaire', idSource: null };
    const v = resolveSubjectIdentity(printed(SPOUSE_ID, 'דנה לוי'), { ...baseCtx, spouse });
    assert.equal(v.adopt, null);
    assert.match(byKey(v).id_matches_client.reason, /דנה לוי/);
    assert.match(byKey(v).id_matches_client.reason, /מיכל תמיר/);
    // A shared surname is enough ("י. תמיר" style tolerance).
    assert.notEqual(resolveSubjectIdentity(printed(SPOUSE_ID, 'מ. תמיר'), { ...baseCtx, spouse }).adopt, null);
    // No printed name at all cannot be checked against the form's name.
    assert.equal(resolveSubjectIdentity(printed(SPOUSE_ID, null), { ...baseCtx, spouse }).adopt, null);
  });

  it('a checksum-invalid foreign id is never adopted', () => {
    const v = resolveSubjectIdentity(printed(BAD_ID), baseCtx);
    assert.equal(v.adopt, null);
    assert.equal(byKey(v).id_matches_client.passed, false);
  });

  it('no client id on file: only an exact spouse match counts, nothing is adopted', () => {
    const spouse: SpouseOnFile = { name: null, idNumber: SPOUSE_ID, nameSource: null, idSource: 'crm' };
    const asSpouse = resolveSubjectIdentity(printed(SPOUSE_ID), { ...baseCtx, clientId: '', clientIdSource: null, spouse });
    assert.equal(asSpouse.matched, 'spouse');
    assert.equal(byKey(asSpouse).id_matches_client.expected, 'spouse ••••••782 (monday CRM)');
    assert.equal(byKey(asSpouse).client_id_on_file, undefined);
    const stranger = resolveSubjectIdentity(printed(THIRD_ID, 'דנה לוי'), { ...baseCtx, clientId: '', clientIdSource: null, spouse });
    assert.equal(stranger.matched, null);
    assert.equal(stranger.adopt, null);
    assert.equal(byKey(stranger).subject.passed, false);
    assert.equal(byKey(stranger).client_id_on_file.passed, false);
    assert.equal(byKey(stranger).id_matches_client, undefined);
    // An uncomparable id with a name that matches the client: the subject passes
    // by name (as before this change), the id entries stay on client_id_on_file.
    const byName = resolveSubjectIdentity(printed(THIRD_ID, 'ניב'), { ...baseCtx, clientId: '', clientIdSource: null, spouse });
    assert.equal(byName.matched, 'client');
    assert.equal(byName.adopt, null);
    assert.equal(byKey(byName).subject.passed, true);
    assert.equal(byKey(byName).client_id_on_file.passed, false);
    assert.equal(byKey(byName).id_matches_client, undefined);
  });

  it('name only: the client, the spouse on file, or nobody', () => {
    const noId = (name: string | null) => ({ subjectName: name, printedId: '', printedIdValid: false });
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: null, nameSource: 'questionnaire', idSource: null };
    const client = resolveSubjectIdentity(noId('ניב'), { ...baseCtx, spouse });
    assert.equal(client.matched, 'client');
    assert.equal(byKey(client).subject.expected, 'ניב תמיר');
    const asSpouse = resolveSubjectIdentity(noId('מיכל'), { ...baseCtx, spouse });
    assert.equal(asSpouse.matched, 'spouse');
    assert.equal(asSpouse.adopt, null);
    assert.equal(byKey(asSpouse).subject.expected, 'מיכל תמיר');
    const nobody = resolveSubjectIdentity(noId('דנה לוי'), { ...baseCtx, spouse });
    assert.equal(nobody.matched, null);
    assert.equal(byKey(nobody).subject.passed, false);
    assert.equal(byKey(nobody).subject.expected, 'ניב תמיר / מיכל תמיר');
    assert.match(byKey(nobody).subject.reason, /בן\/בת הזוג/);
    // Without a spouse on file the wording is the old one.
    assert.doesNotMatch(byKey(resolveSubjectIdentity(noId('דנה לוי'), baseCtx)).subject.reason, /בן\/בת הזוג/);
    assert.equal(byKey(resolveSubjectIdentity(noId(null), baseCtx)).subject.passed, false);
  });

  it('types without subjectMatch still get the id entries', () => {
    const v = resolveSubjectIdentity(printed(SPOUSE_ID), { ...baseCtx, subjectMatch: false });
    assert.equal(byKey(v).subject, undefined);
    assert.equal(v.matched, 'spouse');
    assert.notEqual(v.adopt, null);
  });

  it('no id printed and no name: nothing reported', () => {
    const v = resolveSubjectIdentity({ subjectName: null, printedId: '', printedIdValid: false }, { ...baseCtx, subjectMatch: false });
    assert.deepEqual(v, { matched: null, adopt: null, checks: [] });
  });

  it('ids are always masked', () => {
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'document', idSource: 'document' };
    for (const v of [
      resolveSubjectIdentity(printed(CLIENT_ID), { ...baseCtx, spouse }),
      resolveSubjectIdentity(printed(SPOUSE_ID), { ...baseCtx, spouse }),
      resolveSubjectIdentity(printed(THIRD_ID), { ...baseCtx, spouse }),
      resolveSubjectIdentity(printed(SPOUSE_ID), baseCtx),
    ]) {
      for (const c of v.checks) {
        for (const s of [c.observed, c.expected, c.reason]) {
          for (const id of [CLIENT_ID, SPOUSE_ID, THIRD_ID]) assert.ok(!(s ?? '').includes(id), `${c.key}: ${s}`);
        }
      }
    }
    assert.equal(describePerson('spouse', SPOUSE_ID, null), 'spouse ••••••782');
  });
});

describe('runChecks with a spouse (end to end through verifyChecks)', () => {
  const fields: ExtractedFields = {
    is_expected_type: true,
    actual_kind: 'אישור יתרות קרן פנסיה',
    issuer: 'מנורה מבטחים',
    subject_name: 'מיכל תמיר',
    subject_id_number: SPOUSE_ID,
    as_of_date: '2025-12-31',
    valid_until: null,
    amounts: [{ label: 'יתרה', value: 1_134_117, currency: 'ILS' }],
    legible: true,
    injection_suspected: false,
  };
  const ctx: CheckContext = {
    clientName: 'ניב',
    credentialIdNumber: CLIENT_ID,
    credentialIdSource: 'monday_crm',
    maritalStatus: 'married',
    taxYear: 2025,
    now: new Date('2026-01-15T10:00:00'),
    checks: { subjectMatch: true, asOfDate: true, amounts: true },
  };

  it('adopts the spouse and orders the entries subject, id_checksum, id_matches_client, spouse_adopted', () => {
    const v = runChecks(fields, ctx);
    assert.equal(v.passed, true);
    assert.equal(v.subjectMatched, 'spouse');
    assert.deepEqual(v.adoptSpouse, { idNumber: SPOUSE_ID, name: 'מיכל תמיר' });
    assert.deepEqual(
      v.checks.map((c) => c.key),
      ['legible', 'expected_type', 'subject', 'id_checksum', 'id_matches_client', 'spouse_adopted', 'as_of_date', 'amounts'],
    );
  });

  it('then verifies the next document against the spouse on file, without a second adoption', () => {
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'document', idSource: 'document' };
    const v = runChecks(fields, { ...ctx, spouse });
    assert.equal(v.passed, true);
    assert.equal(v.adoptSpouse, null);
    assert.equal(v.checks.some((c) => c.key === 'spouse_adopted'), false);
    const third = runChecks({ ...fields, subject_name: 'דנה לוי', subject_id_number: THIRD_ID }, { ...ctx, spouse });
    assert.equal(third.passed, false);
    assert.equal(third.subjectMatched, null);
    assert.deepEqual(
      third.checks.filter((c) => !c.passed).map((c) => c.key),
      ['subject', 'id_matches_client'],
    );
  });
});

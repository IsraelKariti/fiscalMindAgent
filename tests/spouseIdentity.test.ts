import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  EMPTY_SPOUSE,
  chooseSpouseToAdopt,
  describePerson,
  mergeSpouse,
  readMaritalStatus,
  readSpouse,
  resolveDocumentOwners,
  resolveParty,
  spouseToStored,
  type IdentityContext,
  type PartyInput,
  type SpouseOnFile,
} from '../src/agents/declarationOfCapital/spouseIdentity.js';
import { runChecks, type CheckContext, type ExtractedFields, type PartyRole } from '../src/agents/declarationOfCapital/verifyChecks.js';

// Checksum-valid test ids.
const CLIENT_ID = '025699448';
const SPOUSE_ID = '123456782';
const THIRD_ID = '012345542';
const FOURTH_ID = '000000026';
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
/** One party as the rule reads it; a null id = none printed. */
const party = (name: string | null, id: string | null, role: PartyRole = 'owner'): PartyInput => ({
  name,
  printedId: id ?? '',
  printedIdValid: id !== null && id !== BAD_ID,
  role,
});
const one = (id: string, name: string | null = 'מיכל תמיר') => [party(name, id)];
const byKey = (v: { checks: { key: string }[] }) => Object.fromEntries(v.checks.map((c) => [c.key, c])) as Record<string, any>;
const spouseNamed: SpouseOnFile = { name: 'מיכל תמיר', idNumber: null, nameSource: 'questionnaire', idSource: null };
const spouseFull: SpouseOnFile = { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'questionnaire', idSource: 'questionnaire' };

describe('resolveParty (chart B for one person)', () => {
  it('client id → client, spouse id → spouse, short-printed ids still match', () => {
    assert.equal(resolveParty(party('ניב', CLIENT_ID), baseCtx).kind, 'client');
    assert.equal(resolveParty(party('מיכל', SPOUSE_ID), { ...baseCtx, spouse: spouseFull }).kind, 'spouse');
    assert.equal(resolveParty(party('מיכל', '12345542'), { ...baseCtx, spouse: { ...spouseFull, idNumber: '012345542' } }).kind, 'spouse');
  });

  it('a foreign valid id is adoptable only under the four conditions', () => {
    assert.equal(resolveParty(party('מיכל תמיר', SPOUSE_ID), baseCtx).kind, 'adoptable');
    assert.equal(resolveParty(party('מיכל תמיר', BAD_ID), baseCtx).kind, 'nobody');
    assert.equal(resolveParty(party('דנה לוי', THIRD_ID), { ...baseCtx, spouse: spouseFull }).kind, 'nobody');
    assert.match(resolveParty(party('דנה לוי', THIRD_ID), { ...baseCtx, spouse: spouseFull }).reason ?? '', /אדם אחר/);
    assert.match(resolveParty(party('מיכל', SPOUSE_ID), { ...baseCtx, maritalStatus: 'not_married' }).reason ?? '', /לא נשוי/);
    assert.equal(resolveParty(party('דנה לוי', SPOUSE_ID), { ...baseCtx, spouse: spouseNamed }).kind, 'nobody');
    assert.equal(resolveParty(party('מ. תמיר', SPOUSE_ID), { ...baseCtx, spouse: spouseNamed }).kind, 'adoptable');
    assert.equal(resolveParty(party(null, SPOUSE_ID), { ...baseCtx, spouse: spouseNamed }).kind, 'nobody');
  });

  it('no client id on file: only the spouse id compares; otherwise the name decides and the id is uncompared', () => {
    const ctx = { ...baseCtx, clientId: '', clientIdSource: null, spouse: spouseFull };
    assert.deepEqual([resolveParty(party('מיכל', SPOUSE_ID), ctx).kind, resolveParty(party('מיכל', SPOUSE_ID), ctx).idUncompared], ['spouse', false]);
    const stranger = resolveParty(party('דנה לוי', THIRD_ID), ctx);
    assert.deepEqual([stranger.kind, stranger.idUncompared], ['nobody', true]);
    const byName = resolveParty(party('ניב', THIRD_ID), ctx);
    assert.deepEqual([byName.kind, byName.idUncompared], ['client', true]);
  });

  it('no id printed: the name, loosely, against the client and the spouse', () => {
    const ctx = { ...baseCtx, spouse: spouseNamed };
    assert.equal(resolveParty(party('ניב', null), ctx).kind, 'client');
    assert.equal(resolveParty(party('מיכל', null), ctx).kind, 'spouse');
    assert.equal(resolveParty(party('דנה לוי', null), ctx).kind, 'nobody');
    assert.equal(resolveParty(party(null, null), ctx).kind, 'nobody');
  });
});

describe('chooseSpouseToAdopt', () => {
  it('one owner: the adoptable party is adopted, with the name on file over the printed spelling', () => {
    const owners = [resolveParty(party('תמיר מיכל', SPOUSE_ID), baseCtx)];
    assert.deepEqual(chooseSpouseToAdopt(owners, baseCtx), { idNumber: SPOUSE_ID, name: 'תמיר מיכל' });
    const ctx = { ...baseCtx, spouse: spouseNamed };
    assert.deepEqual(chooseSpouseToAdopt([resolveParty(party('תמיר מיכל', SPOUSE_ID), ctx)], ctx), { idNumber: SPOUSE_ID, name: 'מיכל תמיר' });
  });

  it('several owners: only through a spouse name on file that exactly one candidate matches', () => {
    const owners = (ctx: IdentityContext) => [resolveParty(party('תמיר ניב', CLIENT_ID), ctx), resolveParty(party('תמיר מיכל', SPOUSE_ID), ctx)];
    assert.equal(chooseSpouseToAdopt(owners(baseCtx), baseCtx), null);
    const named = { ...baseCtx, spouse: spouseNamed };
    assert.deepEqual(chooseSpouseToAdopt(owners(named), named), { idNumber: SPOUSE_ID, name: 'מיכל תמיר' });
    // Two candidates never adopt, even when the loose name rule matches both.
    const two = [...owners(named), resolveParty(party('תמיר דנה', THIRD_ID), named)];
    assert.equal(chooseSpouseToAdopt(two, named), null);
  });
});

describe('resolveDocumentOwners', () => {
  it("the client's own id → client, expected names the client and the source", () => {
    const v = resolveDocumentOwners(one(CLIENT_ID, 'ניב'), baseCtx);
    assert.equal(v.matched, 'client');
    assert.equal(v.adopt, null);
    const k = byKey(v);
    assert.equal(k.subject.passed, true);
    assert.equal(k.subject.observed, 'ניב (••••••448)');
    assert.equal(k.subject.expected, 'ניב תמיר');
    assert.equal(k.id_matches_client.passed, true);
    assert.equal(k.id_matches_client.observed, '••••••448');
    assert.equal(k.id_matches_client.expected, 'client ••••••448 (monday CRM)');
    assert.equal(k.spouse_adopted, undefined);
    assert.equal(k.co_owners, undefined);
    assert.deepEqual(v.parties, [{ name: 'ניב', role: 'owner', maskedId: '••••••448', resolved: 'client' }]);
  });

  it("the spouse's id on file → spouse, no adoption", () => {
    const v = resolveDocumentOwners(one(SPOUSE_ID), { ...baseCtx, spouse: spouseFull });
    assert.equal(v.matched, 'spouse');
    assert.equal(v.adopt, null);
    const k = byKey(v);
    assert.equal(k.subject.observed, 'מיכל תמיר (••••••782)');
    assert.equal(k.subject.expected, 'מיכל תמיר');
    assert.equal(k.id_matches_client.expected, 'spouse ••••••782 (questionnaire)');
    assert.equal(k.spouse_adopted, undefined);
  });

  it('first foreign valid id on a one-owner document → adopted as the spouse, with the printed name', () => {
    const v = resolveDocumentOwners(one(SPOUSE_ID), baseCtx);
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
    assert.deepEqual(v.parties[0]!.resolved, 'adopted');
    // Married per the questionnaire: the same.
    assert.equal(resolveDocumentOwners(one(SPOUSE_ID), { ...baseCtx, maritalStatus: 'married' }).matched, 'spouse');
    // No printed name: adopted with name unknown.
    const nameless = resolveDocumentOwners(one(SPOUSE_ID, null), baseCtx);
    assert.deepEqual(nameless.adopt, { idNumber: SPOUSE_ID, name: null });
    assert.equal(byKey(nameless).spouse_adopted.expected, 'name unknown');
    assert.equal(byKey(nameless).subject.expected, 'בן/בת זוג');
  });

  it('a third person (spouse id already on file) fails id_matches_client and subject', () => {
    const v = resolveDocumentOwners(one(THIRD_ID, 'דנה לוי'), { ...baseCtx, spouse: { ...spouseFull, nameSource: 'document', idSource: 'document' } });
    assert.equal(v.matched, null);
    assert.equal(v.adopt, null);
    const k = byKey(v);
    assert.equal(k.id_matches_client.passed, false);
    assert.equal(k.id_matches_client.observed, '••••••542');
    assert.equal(k.id_matches_client.expected, 'client ••••••448 (monday CRM) / spouse ••••••782 (document)');
    assert.match(k.id_matches_client.reason, /אדם אחר/);
    assert.equal(k.subject.passed, false);
    assert.equal(k.subject.observed, 'דנה לוי (••••••542)');
    assert.equal(k.subject.expected, 'ניב תמיר / מיכל תמיר');
    assert.equal(k.spouse_adopted, undefined);
    assert.equal(v.parties[0]!.resolved, 'none');
  });

  it('a foreign id for a client registered as not married fails, no adoption', () => {
    const v = resolveDocumentOwners(one(SPOUSE_ID), { ...baseCtx, maritalStatus: 'not_married' });
    assert.equal(v.matched, null);
    assert.equal(v.adopt, null);
    assert.match(byKey(v).id_matches_client.reason, /לא נשוי/);
  });

  it('a printed name contradicting the spouse name from the form blocks adoption', () => {
    const v = resolveDocumentOwners(one(SPOUSE_ID, 'דנה לוי'), { ...baseCtx, spouse: spouseNamed });
    assert.equal(v.adopt, null);
    assert.match(byKey(v).id_matches_client.reason, /דנה לוי/);
    assert.match(byKey(v).id_matches_client.reason, /מיכל תמיר/);
    // A shared surname is enough ("י. תמיר" style tolerance); the form's spelling is stored.
    assert.deepEqual(resolveDocumentOwners(one(SPOUSE_ID, 'מ. תמיר'), { ...baseCtx, spouse: spouseNamed }).adopt, { idNumber: SPOUSE_ID, name: 'מיכל תמיר' });
    // No printed name at all cannot be checked against the form's name.
    assert.equal(resolveDocumentOwners(one(SPOUSE_ID, null), { ...baseCtx, spouse: spouseNamed }).adopt, null);
  });

  it('a checksum-invalid foreign id is never adopted', () => {
    const v = resolveDocumentOwners(one(BAD_ID), baseCtx);
    assert.equal(v.adopt, null);
    assert.equal(byKey(v).id_matches_client.passed, false);
  });

  it('no client id on file: only an exact spouse match counts, nothing is adopted', () => {
    const spouse: SpouseOnFile = { name: null, idNumber: SPOUSE_ID, nameSource: null, idSource: 'crm' };
    const ctx = { ...baseCtx, clientId: '', clientIdSource: null, spouse };
    const asSpouse = resolveDocumentOwners(one(SPOUSE_ID), ctx);
    assert.equal(asSpouse.matched, 'spouse');
    assert.equal(byKey(asSpouse).id_matches_client.expected, 'spouse ••••••782 (monday CRM)');
    assert.equal(byKey(asSpouse).client_id_on_file, undefined);
    const stranger = resolveDocumentOwners(one(THIRD_ID, 'דנה לוי'), ctx);
    assert.equal(stranger.matched, null);
    assert.equal(stranger.adopt, null);
    assert.equal(byKey(stranger).subject.passed, false);
    assert.equal(byKey(stranger).client_id_on_file.passed, false);
    assert.equal(byKey(stranger).id_matches_client, undefined);
    assert.equal(stranger.parties[0]!.resolved, 'uncompared');
    // An uncomparable id with a name that matches the client: the subject passes
    // by name, the id entries stay on client_id_on_file.
    const byName = resolveDocumentOwners(one(THIRD_ID, 'ניב'), ctx);
    assert.equal(byName.matched, 'client');
    assert.equal(byName.adopt, null);
    assert.equal(byKey(byName).subject.passed, true);
    assert.equal(byKey(byName).client_id_on_file.passed, false);
    assert.equal(byKey(byName).id_matches_client, undefined);
  });

  it('name only: the client, the spouse on file, or nobody', () => {
    const ctx = { ...baseCtx, spouse: spouseNamed };
    const client = resolveDocumentOwners([party('ניב', null)], ctx);
    assert.equal(client.matched, 'client');
    assert.equal(byKey(client).subject.observed, 'ניב');
    assert.equal(byKey(client).subject.expected, 'ניב תמיר');
    assert.equal(byKey(client).id_matches_client, undefined);
    const asSpouse = resolveDocumentOwners([party('מיכל', null)], ctx);
    assert.equal(asSpouse.matched, 'spouse');
    assert.equal(asSpouse.adopt, null);
    assert.equal(byKey(asSpouse).subject.expected, 'מיכל תמיר');
    const nobody = resolveDocumentOwners([party('דנה לוי', null)], ctx);
    assert.equal(nobody.matched, null);
    assert.equal(byKey(nobody).subject.passed, false);
    assert.equal(byKey(nobody).subject.expected, 'ניב תמיר / מיכל תמיר');
    assert.match(byKey(nobody).subject.reason, /בן\/בת הזוג/);
    // Without a spouse on file the wording is the old one.
    assert.doesNotMatch(byKey(resolveDocumentOwners([party('דנה לוי', null)], baseCtx)).subject.reason, /בן\/בת הזוג/);
    assert.equal(byKey(resolveDocumentOwners([party(null, null)], baseCtx)).subject.passed, false);
    // No owner at all: the subject is not printed.
    const none = resolveDocumentOwners([], baseCtx);
    assert.equal(byKey(none).subject.passed, false);
    assert.equal(byKey(none).subject.observed, 'לא מצוין');
  });

  it('types without subjectMatch still get the id entries', () => {
    const v = resolveDocumentOwners(one(SPOUSE_ID), { ...baseCtx, subjectMatch: false });
    assert.equal(byKey(v).subject, undefined);
    assert.equal(v.matched, 'spouse');
    assert.notEqual(v.adopt, null);
  });

  it('no parties: nothing reported', () => {
    const v = resolveDocumentOwners([], { ...baseCtx, subjectMatch: false });
    assert.deepEqual(v, { matched: null, adopt: null, checks: [], parties: [] });
  });

  // --- several owners (openspec multi-subject-documents) --------------------

  const contract = (buyerId: string | null, michalId: string | null): PartyInput[] => [
    party('מקמל חזי', THIRD_ID, 'counterparty'),
    party('מקמל קתי פנינה', FOURTH_ID, 'counterparty'),
    party('תמיר ניב', buyerId),
    party('תמיר מיכל', michalId),
  ];

  it('four-party contract, no spouse name on file: the client, a co-owner, no adoption, sellers ignored', () => {
    const v = resolveDocumentOwners(contract(CLIENT_ID, SPOUSE_ID), baseCtx);
    assert.equal(v.matched, 'client');
    assert.equal(v.adopt, null);
    const k = byKey(v);
    assert.equal(k.subject.passed, true);
    assert.equal(k.subject.observed, 'תמיר ניב (••••••448) · תמיר מיכל (••••••782)');
    assert.equal(k.subject.expected, 'ניב תמיר');
    assert.equal(k.id_matches_client.passed, true);
    assert.equal(k.id_matches_client.observed, '••••••448 · ••••••782');
    assert.equal(k.id_matches_client.expected, 'client ••••••448 (monday CRM)');
    assert.equal(k.spouse_adopted, undefined);
    assert.equal(k.co_owners.passed, true);
    assert.equal(k.co_owners.observed, 'תמיר מיכל (••••••782)');
    assert.deepEqual(
      v.parties.map((p) => [p.role, p.resolved]),
      [
        ['counterparty', 'none'],
        ['counterparty', 'none'],
        ['owner', 'client'],
        ['owner', 'co_owner'],
      ],
    );
    // The sellers' ids never reach a check value.
    for (const c of v.checks) for (const s of [c.observed, c.expected]) assert.ok(!(s ?? '').includes('542') && !(s ?? '').includes('026'), `${c.key}: ${s}`);
  });

  it("four-party contract with the spouse's name from the questionnaire: both, her id adopted alone", () => {
    const v = resolveDocumentOwners(contract(CLIENT_ID, SPOUSE_ID), { ...baseCtx, spouse: spouseNamed });
    assert.equal(v.matched, 'both');
    assert.deepEqual(v.adopt, { idNumber: SPOUSE_ID, name: 'מיכל תמיר' });
    const k = byKey(v);
    assert.equal(k.subject.expected, 'ניב תמיר / מיכל תמיר');
    assert.equal(k.id_matches_client.expected, 'client ••••••448 (monday CRM) / spouse ••••••782 (document)');
    assert.equal(k.spouse_adopted.observed, '••••••782');
    assert.equal(k.spouse_adopted.expected, 'מיכל תמיר');
    assert.equal(k.co_owners, undefined);
    assert.equal(v.parties[3]!.resolved, 'adopted');
  });

  it('joint account with a co-owner who is not the spouse: passes as the client', () => {
    const v = resolveDocumentOwners([party('תמיר ניב', CLIENT_ID), party('דנה לוי', THIRD_ID)], { ...baseCtx, spouse: spouseFull });
    assert.equal(v.matched, 'client');
    assert.equal(v.adopt, null);
    assert.equal(byKey(v).subject.passed, true);
    assert.equal(byKey(v).id_matches_client.passed, true);
    assert.equal(byKey(v).co_owners.observed, 'דנה לוי (••••••542)');
  });

  it('only strangers own the document: third person, rejected', () => {
    const v = resolveDocumentOwners([party('דנה לוי', THIRD_ID), party('רון לוי', FOURTH_ID)], { ...baseCtx, spouse: spouseFull });
    assert.equal(v.matched, null);
    assert.equal(v.adopt, null);
    assert.equal(byKey(v).subject.passed, false);
    assert.match(byKey(v).id_matches_client.reason, /אדם אחר/);
    assert.equal(byKey(v).co_owners, undefined);
  });

  it('two adoptable strangers beside the client, no spouse name: both co-owners, no adoption', () => {
    const v = resolveDocumentOwners([party('תמיר ניב', CLIENT_ID), party('תמיר מיכל', SPOUSE_ID), party('תמיר דנה', THIRD_ID)], baseCtx);
    assert.equal(v.matched, 'client');
    assert.equal(v.adopt, null);
    assert.equal(byKey(v).co_owners.observed, 'תמיר מיכל (••••••782) · תמיר דנה (••••••542)');
  });

  it("a seller's id is the only id printed: owners judged by name, nothing compared or adopted", () => {
    const v = resolveDocumentOwners(contract(null, null), baseCtx);
    assert.equal(v.matched, 'client');
    assert.equal(v.adopt, null);
    const k = byKey(v);
    assert.equal(k.subject.observed, 'תמיר ניב · תמיר מיכל');
    assert.equal(k.id_matches_client, undefined);
    assert.equal(k.client_id_on_file, undefined);
    // Both buyers share the client's surname, so the loose name rule counts both as the client: no co-owner.
    assert.equal(k.co_owners, undefined);
    assert.deepEqual(v.parties.map((p) => p.resolved), ['none', 'none', 'client', 'client']);
  });

  it('joint owners without ids: the client and a co-owner, nothing recorded', () => {
    const v = resolveDocumentOwners([party('תמיר ניב', null), party('דנה לוי', null)], baseCtx);
    assert.equal(v.matched, 'client');
    assert.equal(v.adopt, null);
    assert.equal(byKey(v).co_owners.observed, 'דנה לוי');
  });

  it('the client by name beside a co-owner with a foreign id: accepted, the id listed under the co-owner', () => {
    const v = resolveDocumentOwners([party('תמיר ניב', null), party('תמיר מיכל', SPOUSE_ID)], baseCtx);
    assert.equal(v.matched, 'client');
    assert.equal(v.adopt, null);
    assert.equal(byKey(v).id_matches_client.passed, true);
    assert.equal(byKey(v).co_owners.observed, 'תמיר מיכל (••••••782)');
  });

  it('several owners with ids, none the household, no spouse name: the note says why', () => {
    const v = resolveDocumentOwners([party('תמיר מיכל', SPOUSE_ID), party('תמיר דנה', THIRD_ID)], baseCtx);
    assert.equal(v.matched, null);
    assert.match(byKey(v).id_matches_client.reason, /כמה בעלים/);
  });

  it('ids are always masked', () => {
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'document', idSource: 'document' };
    for (const v of [
      resolveDocumentOwners(one(CLIENT_ID), { ...baseCtx, spouse }),
      resolveDocumentOwners(one(SPOUSE_ID), { ...baseCtx, spouse }),
      resolveDocumentOwners(one(THIRD_ID), { ...baseCtx, spouse }),
      resolveDocumentOwners(one(SPOUSE_ID), baseCtx),
      resolveDocumentOwners(contract(CLIENT_ID, SPOUSE_ID), baseCtx),
    ]) {
      for (const c of v.checks) {
        for (const s of [c.observed, c.expected, c.reason]) {
          for (const id of [CLIENT_ID, SPOUSE_ID, THIRD_ID, FOURTH_ID]) assert.ok(!(s ?? '').includes(id), `${c.key}: ${s}`);
        }
      }
      for (const p of v.parties) for (const id of [CLIENT_ID, SPOUSE_ID, THIRD_ID, FOURTH_ID]) assert.ok(!(p.maskedId ?? '').includes(id));
    }
    assert.equal(describePerson('spouse', SPOUSE_ID, null), 'spouse ••••••782');
  });
});

describe('runChecks with a spouse (end to end through verifyChecks)', () => {
  const fields: ExtractedFields = {
    is_expected_type: true,
    actual_kind: 'אישור יתרות קרן פנסיה',
    issuer: 'מנורה מבטחים',
    parties: [{ name: 'מיכל תמיר', id_number: SPOUSE_ID, role: 'owner' }],
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
    assert.deepEqual(v.parties, [{ name: 'מיכל תמיר', role: 'owner', maskedId: '••••••782', resolved: 'adopted' }]);
  });

  it('then verifies the next document against the spouse on file, without a second adoption', () => {
    const spouse: SpouseOnFile = { name: 'מיכל תמיר', idNumber: SPOUSE_ID, nameSource: 'document', idSource: 'document' };
    const v = runChecks(fields, { ...ctx, spouse });
    assert.equal(v.passed, true);
    assert.equal(v.adoptSpouse, null);
    assert.equal(v.checks.some((c) => c.key === 'spouse_adopted'), false);
    const third = runChecks({ ...fields, parties: [{ name: 'דנה לוי', id_number: THIRD_ID, role: 'owner' }] }, { ...ctx, spouse });
    assert.equal(third.passed, false);
    assert.equal(third.subjectMatched, null);
    assert.deepEqual(
      third.checks.filter((c) => !c.passed).map((c) => c.key),
      ['subject', 'id_matches_client'],
    );
  });

  it('a joint document: id_checksum covers every owner id and names the bad one; the sellers are never checked', () => {
    const joint = runChecks(
      {
        ...fields,
        parties: [
          { name: 'ניב', id_number: CLIENT_ID, role: 'owner' },
          { name: 'דנה לוי', id_number: BAD_ID, role: 'owner' },
          { name: 'בנק לאומי', id_number: '1', role: 'counterparty' },
        ],
      },
      ctx,
    );
    assert.equal(joint.passed, false);
    assert.equal(joint.subjectMatched, 'client');
    const checksum = joint.checks.find((c) => c.key === 'id_checksum')!;
    assert.equal(checksum.passed, false);
    assert.equal(checksum.observed, '••••••448 · ••••••783');
    assert.match(checksum.reason ?? '', /••••••783/);
    assert.deepEqual(joint.checks.filter((c) => !c.passed).map((c) => c.key), ['id_checksum']);
    assert.equal(joint.checks.some((c) => c.key === 'co_owners'), true);
    // A counterparty's bad id does not fail the document, and no owner id means no checksum entry.
    const sellerOnly = runChecks({ ...fields, parties: [{ name: 'ניב', id_number: null, role: 'owner' }, { name: 'מוכר', id_number: BAD_ID, role: 'counterparty' }] }, ctx);
    assert.equal(sellerOnly.checks.some((c) => c.key === 'id_checksum'), false);
    assert.equal(sellerOnly.passed, true);
  });
});

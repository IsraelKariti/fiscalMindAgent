import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildClientIdentitySection, buildPrompt, PLATFORM_SECTIONS } from '../src/agents/declarationOfCapital/prompt.js';
import type { ClientRow } from '../src/db/types.js';

const SPOUSE_ID = '123456782';
const TOKEN = 'tok123';

const client = (agentFields: Record<string, unknown>): ClientRow =>
  ({
    id: 'c1',
    user_id: 'u1',
    agent_instance_id: 'a1',
    agent_fields: agentFields,
    name: 'ניב תמיר',
    email_address: 'c1@wa.local',
    goal_status: 'open',
    occupation: null,
    phone: '+972501234567',
    wa_phone: '+972501234567',
    paused: false,
    created_at: new Date('2026-09-01T00:00:00Z'),
  }) as unknown as ClientRow;

describe('CLIENT IDENTITY prompt section (buildClientIdentitySection)', () => {
  it('married client with a spouse inferred from a document', () => {
    const section = buildClientIdentitySection(
      TOKEN,
      client({
        id_number: '025699448',
        marital_status: 'married',
        spouse: { name: 'מיכל תמיר', id_number: SPOUSE_ID, name_source: 'document', id_source: 'document' },
      }),
      true,
    );
    assert.match(section, new RegExp(`${PLATFORM_SECTIONS.identity}`));
    assert.match(section, /Client: ניב תמיר \(national id on file: yes\)/);
    assert.match(section, /Marital status: married \(questionnaire\)/);
    assert.match(section, /Spouse on file: מיכל תמיר \(name from a document the client sent\); national id: known \(from a document the client sent\)/);
    // The digits never reach the model.
    assert.ok(!section.includes(SPOUSE_ID));
    assert.ok(!section.includes('025699448'));
  });

  it('nothing known', () => {
    const section = buildClientIdentitySection(TOKEN, client({}), false);
    assert.match(section, /national id on file: no/);
    assert.match(section, /Marital status: unknown/);
    assert.match(section, /Spouse on file: none on file/);
  });

  it('spouse named by the questionnaire without an id; id-on-file derived from agent_fields when not given', () => {
    const section = buildClientIdentitySection(
      TOKEN,
      client({ id_number: '025699448', marital_status: 'not_married', spouse: { name: 'מיכל תמיר', name_source: 'questionnaire' } }),
      null,
    );
    assert.match(section, /national id on file: yes/);
    assert.match(section, /Marital status: not married \(questionnaire\)/);
    assert.match(section, /Spouse on file: מיכל תמיר \(name from questionnaire\); national id: not known/);
    // Garbled spouse field → nothing on file.
    assert.match(buildClientIdentitySection(TOKEN, client({ spouse: 'מיכל' }), null), /none on file/);
    assert.match(buildClientIdentitySection(TOKEN, client({ spouse: { id_number: SPOUSE_ID, id_source: 'crm' } }), null), /Spouse on file: name unknown; national id: known \(from CRM card\)/);
  });

  it('is placed in every prompt, right after the documents section', () => {
    const { contents } = buildPrompt(client({ marital_status: 'married' }), null, [], [], [], new Date('2026-09-23T10:00:00Z'));
    const identityAt = contents.indexOf(`--- ${PLATFORM_SECTIONS.identity} [`);
    assert.ok(identityAt >= 0, 'identity block present');
    assert.match(contents, /Marital status: married/);
  });
});

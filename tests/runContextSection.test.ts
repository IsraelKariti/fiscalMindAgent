import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { buildPrompt, buildRunContextSection, buildSystemPrompt, PLATFORM_SECTIONS, PROMPT_PLACEHOLDERS } from '../src/agents/declarationOfCapital/prompt.js';
import type { ClientRow, EmailRow, UserRow } from '../src/db/types.js';

// openspec planner-prompt-caching: the system prompt is identical across clients and calls;
// every per-request fact opens the input in the RUN CONTEXT section.

const TOKEN = 'tok123';

const client = (name: string, phone: string): ClientRow =>
  ({
    id: 'c1',
    user_id: 'u1',
    agent_instance_id: 'a1',
    agent_fields: {},
    name,
    email_address: 'c1@wa.local',
    goal_status: 'open',
    occupation: null,
    phone,
    wa_phone: phone,
    paused: false,
    created_at: new Date('2026-11-05T08:00:00Z'),
  }) as unknown as ClientRow;

const accountant = (hebrewName: string): UserRow => ({ id: 'u1', email: 'acc@example.com', name: 'Acc', hebrew_name: hebrewName }) as unknown as UserRow;

const sentMessage = (at: string): EmailRow =>
  ({ id: 'm1', direction: 'outbound', channel: 'whatsapp', body: 'היי', sent_at: new Date(at), created_at: new Date(at) }) as unknown as EmailRow;

describe('RUN CONTEXT prompt section (buildRunContextSection)', () => {
  it('states the accountant, the client, the engagement start, the clock and the calendar', () => {
    const now = new Date('2026-11-11T00:28:00Z');
    const section = buildRunContextSection(TOKEN, client('ניב תמיר', '+972501234567'), accountant('פלתיאל אפרתי'), [sentMessage('2026-11-10T23:28:00Z')], now);
    assert.ok(section.startsWith(`--- ${PLATFORM_SECTIONS.runContext} [${TOKEN}] ---\n`));
    assert.ok(section.endsWith(`--- END ${PLATFORM_SECTIONS.runContext} [${TOKEN}] ---`));
    assert.match(section, /^רואה החשבון: פלתיאל אפרתי$/m);
    assert.match(section, /^הלקוח: ניב תמיר \(WhatsApp: \+972501234567\)$/m);
    assert.match(section, /^התהליך התחיל בתאריך: 2026-11-05$/m);
    assert.match(section, /^תאריך ושעה נוכחיים \(UTC\): 2026-11-11T00:28:00\.000Z$/m);
    assert.match(section, /^תאריך ושעה מקומיים אצל רואה החשבון \([A-Za-z_/]+\): 2026-11-11 \d\d:\d\d \(Wed\)$/m);
    assert.match(section, /^זמן שעבר מההודעה האחרונה: /m);
    assert.match(section, /לוח התאריכים לשבועות הקרובים/);
    assert.match(section, /2026-11-12/); // a calendar line of the coming days
  });

  it('says when no message was sent yet', () => {
    const section = buildRunContextSection(TOKEN, client('ניב', '+972501234567'), null, [], new Date('2026-11-11T00:28:00Z'));
    assert.match(section, /זמן שעבר מההודעה האחרונה: N\/A \(no messages sent yet\)/);
    assert.match(section, /רואה החשבון: המטפל בתיק/);
  });
});

describe('planner prompt layout (buildPrompt)', () => {
  const prompt = (name: string, phone: string, acc: string, now: Date) => buildPrompt(client(name, phone), accountant(acc), [], [], [], now, undefined, [], 2025);

  it('RUN CONTEXT is the first section of the input and its fence is the first line', () => {
    const { contents } = prompt('ניב תמיר', '+972501234567', 'פלתיאל אפרתי', new Date('2026-11-11T00:28:00Z'));
    assert.match(contents, new RegExp(`^--- ${PLATFORM_SECTIONS.runContext} \\[[0-9a-f]{8}\\] ---\n`));
  });

  it('the system prompt is byte-identical for different clients, accountants and clock values', () => {
    const a = prompt('ניב תמיר', '+972501234567', 'פלתיאל אפרתי', new Date('2026-11-11T00:28:00Z')).systemInstruction;
    const b = prompt('דנה לוי', '+972529876543', 'משרד כהן', new Date('2026-12-24T15:03:00Z')).systemInstruction;
    assert.equal(a, b);
    assert.equal(buildSystemPrompt(2025), a);
  });

  it('the system prompt carries no per-request fact and no fence token', () => {
    const { systemInstruction } = prompt('ניב תמיר', '+972501234567', 'פלתיאל אפרתי', new Date('2026-11-11T00:28:00Z'));
    for (const forbidden of ['ניב תמיר', '+972501234567', 'פלתיאל אפרתי', '2026-11-11', '2026-11-05', 'T00:28']) {
      assert.ok(!systemInstruction.includes(forbidden), `system prompt must not contain ${forbidden}`);
    }
    assert.doesNotMatch(systemInstruction, /\[[0-9a-f]{8}\]/);
    assert.doesNotMatch(systemInstruction, /\{\{\w+\}\}/, 'every placeholder rendered');
    assert.match(systemInstruction, /31\.12\.2025/);
    assert.match(systemInstruction, /בשורה הראשונה של הקלט/); // the doctrine names the token by position
    assert.ok((systemInstruction.match(/RUN CONTEXT/g) ?? []).length >= 5, 'the rules point at RUN CONTEXT');
    assert.deepEqual([...PROMPT_PLACEHOLDERS], ['tax_year']);
  });
});

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

// openspec `llm-provider-outage`: after a hold clears, every held client's
// waiting messages are screened, its held files analyzed, its cut-short
// verifications re-run, and then ONE deferred planner run is requested; a
// client that can no longer be planned only loses its marker; a hold that
// reopens mid-recovery leaves the client held. The recovery is driven through
// stubbed deps — nothing touches a database or a provider.

for (const [key, value] of Object.entries({
  DATABASE_URL: 'postgres://test',
  REDIS_URL: 'redis://test',
  GEMINI_API_KEY: 'test',
  ANTHROPIC_API_KEY: 'test',
  OPENAI_API_KEY: 'test',
  SECRET_ENC_KEY: 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
  RESEND_API_KEY: 'test',
})) {
  process.env[key] ??= value;
}

const { createOutageRecovery } = await import('../src/orchestration/outageRecoveryCore.js');
type RecoveryDeps = import('../src/orchestration/outageRecoveryCore.js').RecoveryDeps;
type ClientRow = import('../src/db/types.js').ClientRow;
type EmailRow = import('../src/db/types.js').EmailRow;
type DocumentFileRow = import('../src/db/types.js').DocumentFileRow;

function clientOf(overrides: Partial<ClientRow> = {}): ClientRow {
  return { id: 'client-1', goal_status: 'pending', paused: false, outage_held_at: new Date(), outage_held_provider: 'anthropic', ...overrides } as ClientRow;
}

function stubDeps(opts: { client?: ClientRow; messages?: number; files?: number; stillHeld?: boolean } = {}) {
  const log: string[] = [];
  const client = opts.client ?? clientOf();
  const messages = Array.from({ length: opts.messages ?? 0 }, (_, i) => ({ id: `msg-${i}`, client_id: client.id }) as EmailRow);
  const files = Array.from({ length: opts.files ?? 0 }, (_, i) => ({ id: `file-${i}`, client_id: client.id, parent_file_id: null }) as DocumentFileRow);
  let inflight = 0;
  const deps: RecoveryDeps = {
    heldClients: async () => [client],
    getClient: async () => client,
    loadAgent: async () =>
      ({
        rescreen: async (row: EmailRow) => {
          assert.equal(inflight, 1, 'a re-screen runs as in-flight inbound work');
          log.push(`screen:${row.id}`);
        },
        reanalyze: async (file: DocumentFileRow) => {
          assert.equal(inflight, 1, 'a re-analysis runs as in-flight inbound work');
          log.push(`analyze:${file.id}`);
        },
        reverify: async () => {
          log.push('reverify');
        },
      }),
    pendingMessages: async () => messages,
    heldFiles: async () => files,
    inFlight: async (_clientId, fn) => {
      inflight += 1;
      try {
        return await fn();
      } finally {
        inflight -= 1;
      }
    },
    stillHeld: async () => opts.stillHeld ?? false,
    clearClientHeld: async (id) => {
      log.push(`clear:${id}`);
    },
    requestReplan: async (id) => {
      log.push(`replan:${id}`);
    },
  };
  return { deps, log };
}

describe('recoverFromOutage', () => {
  it('screens every waiting message, analyzes every held file, re-verifies, then requests exactly one replan', async () => {
    const { deps, log } = stubDeps({ messages: 3, files: 2 });
    const counts = await createOutageRecovery(deps)('anthropic');
    assert.deepEqual(log, ['screen:msg-0', 'screen:msg-1', 'screen:msg-2', 'analyze:file-0', 'analyze:file-1', 'reverify', 'clear:client-1', 'replan:client-1']);
    assert.deepEqual(counts, { clients: 1, messages: 3, files: 2 });
    assert.equal(log.filter((l) => l.startsWith('replan:')).length, 1);
  });

  it('a client completed meanwhile loses its marker and gets no plan', async () => {
    const { deps, log } = stubDeps({ client: clientOf({ goal_status: 'complete' }), messages: 1 });
    const counts = await createOutageRecovery(deps)('anthropic');
    assert.deepEqual(log, ['clear:client-1']);
    assert.deepEqual(counts, { clients: 0, messages: 0, files: 0 });
  });

  it('a paused client is released without a plan', async () => {
    const { deps, log } = stubDeps({ client: clientOf({ paused: true }) });
    await createOutageRecovery(deps)('anthropic');
    assert.deepEqual(log, ['clear:client-1']);
  });

  it('a hold that reopens mid-recovery leaves the client held and unplanned', async () => {
    const { deps, log } = stubDeps({ messages: 1, stillHeld: true });
    const counts = await createOutageRecovery(deps)('anthropic');
    assert.deepEqual(log, ['screen:msg-0', 'reverify']);
    assert.equal(counts.clients, 0);
  });
});

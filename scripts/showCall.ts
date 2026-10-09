import { pool } from '../src/db/pool.js';
import * as clients from '../src/db/queries/clients.js';
import * as llmCalls from '../src/db/queries/llmCalls.js';

/**
 * Prints one LLM call as JSON, from a call link copied in the call detail
 * modal (`<site>/#/llm-calls/<id>`) or from a bare id. Same shape as the
 * modal's "copy details" text (camelCase keys, the exact request, the raw
 * response). Reads the database DATABASE_URL points at — the local one. A
 * link from another host (sandbox, production) names a row this database
 * does not hold: ask for the modal's "copy details" text instead.
 *
 *   npm run call -- "<link-or-id>"
 *
 * Exit code: 0 = printed, 1 = no uuid in the argument, or no such call.
 */

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

async function main(): Promise<number> {
  const arg = process.argv[2] ?? '';
  // The call id is the last uuid of the link (the hash segment).
  const id = arg.match(UUID)?.pop();
  if (!id) {
    console.error('Usage: npm run call -- "<call link or id>" (no call id found in the argument)');
    return 1;
  }
  const row = await llmCalls.getById(id);
  if (!row) {
    console.error(`Call ${id} is not in this database. If the link is from another environment, paste the modal's "copy details" text instead.`);
    return 1;
  }
  const client = row.client_id ? await clients.getById(row.client_id) : null;
  console.log(
    JSON.stringify(
      {
        id: row.id,
        createdAt: row.created_at,
        userId: row.user_id,
        agentInstanceId: row.agent_instance_id,
        clientId: row.client_id,
        clientName: client?.name ?? null,
        documentFileId: row.document_file_id,
        documentFileName: row.document_filename,
        purpose: row.purpose,
        provider: row.provider,
        model: row.model,
        status: row.status,
        error: row.error,
        attempts: row.attempts,
        durationMs: row.duration_ms,
        inputTokens: row.input_tokens,
        outputTokens: row.output_tokens,
        thinkingTokens: row.thinking_tokens,
        cachedTokens: row.cached_tokens,
        inputPricePerToken: row.input_price_per_token,
        outputPricePerToken: row.output_price_per_token,
        thinkingPricePerToken: row.thinking_price_per_token,
        cachedPricePerToken: row.cached_price_per_token,
        cost: row.cost,
        request: row.request,
        response: row.response,
      },
      null,
      2,
    ),
  );
  return 0;
}

main()
  .catch((err) => {
    console.error(err);
    return 1;
  })
  .then(async (code) => {
    await pool.end();
    process.exit(code);
  });

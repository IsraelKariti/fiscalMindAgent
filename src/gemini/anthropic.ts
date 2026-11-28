import Anthropic from '@anthropic-ai/sdk';
import type { Content, GenerateContentResponse, Part } from '@google/genai';
import type { genaiClient } from './client.js';
import { env } from '../config/env.js';
import { restoreOmittedNulls } from './anthropicSchema.js';
import { declaredToolsOf } from './requestLog.js';
import { anthropicTranscriptMessages, callsFromAnthropicContent, toAnthropicTools } from './toolTransport.js';
import type { TranscriptItem } from './toolLoop.js';
import { sentCacheTtlOf, sentRequestOf } from './wireRequest.js';
import type { CacheTtl } from './cost.js';

type GeminiRequest = Parameters<typeof genaiClient.models.generateContent>[0] & {
  transcript?: readonly TranscriptItem[];
  /** The admin's cache lifetime at call time (llmCall.ts); absent = the default. */
  cacheTtl?: CacheTtl;
};

/**
 * Anthropic's usage block in the Gemini convention the call log uses
 * (openspec `llm-call-cache-usage`). Anthropic's input_tokens EXCLUDES cache
 * reads and cache writes; ours includes both (cached and cache-write are
 * subsets of input). Cache-write tokens are split by lifetime from the
 * provider's own breakdown; an answer without the breakdown counts them all
 * under the lifetime the request asked for. Pure, so the tests pin it.
 */
export function anthropicUsageMetadata(
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | null;
    cache_creation_input_tokens?: number | null;
    cache_creation?: { ephemeral_5m_input_tokens?: number | null; ephemeral_1h_input_tokens?: number | null } | null;
  },
  sentTtl: CacheTtl | null,
): {
  promptTokenCount: number;
  candidatesTokenCount: number;
  thoughtsTokenCount: number;
  cachedContentTokenCount: number;
  cacheWrite5mTokenCount: number;
  cacheWrite1hTokenCount: number;
} {
  const cacheRead = usage.cache_read_input_tokens ?? 0;
  const cacheCreation = usage.cache_creation_input_tokens ?? 0;
  const breakdown = usage.cache_creation;
  const hasBreakdown = breakdown != null && (breakdown.ephemeral_5m_input_tokens != null || breakdown.ephemeral_1h_input_tokens != null);
  const write1h = hasBreakdown ? (breakdown.ephemeral_1h_input_tokens ?? 0) : sentTtl === '1h' ? cacheCreation : 0;
  const write5m = hasBreakdown ? (breakdown.ephemeral_5m_input_tokens ?? 0) : cacheCreation - write1h;
  return {
    promptTokenCount: usage.input_tokens + cacheRead + write5m + write1h,
    // Anthropic folds thinking tokens into output_tokens and bills them at
    // the output rate, so reporting them all as output keeps costs right.
    candidatesTokenCount: usage.output_tokens,
    thoughtsTokenCount: 0,
    cachedContentTokenCount: cacheRead,
    cacheWrite5mTokenCount: write5m,
    cacheWrite1hTokenCount: write1h,
  };
}

/**
 * The Messages API requires max_tokens. The agents' answers are JSON decisions
 * far below this; on Claude Opus 5 / Sonnet 5 adaptive thinking (on by
 * default) also spends from it.
 */
const MAX_TOKENS = 16_000;

let client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set but an Anthropic model was requested');
  // maxRetries: 0 — generateWithRetry owns the retry/backoff policy for every provider.
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY, maxRetries: 0 });
  return client;
}

function partToBlock(part: Part): Anthropic.ContentBlockParam {
  if (part.text !== undefined) return { type: 'text', text: part.text };
  const inline = part.inlineData;
  if (inline?.data && inline.mimeType) {
    if (inline.mimeType.startsWith('image/')) {
      return {
        type: 'image',
        source: {
          type: 'base64',
          media_type: inline.mimeType as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp',
          data: inline.data,
        },
      };
    }
    // Plain text (a spreadsheet's rendering, shared/modelFile.ts): a text document, not a PDF.
    if (inline.mimeType.startsWith('text/')) {
      return { type: 'document', source: { type: 'text', media_type: 'text/plain', data: Buffer.from(inline.data, 'base64').toString('utf8') } };
    }
    // Non-image binaries (in practice: PDFs).
    return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: inline.data } };
  }
  throw new Error('unsupported Gemini part for Anthropic translation');
}

/** Our callers pass either a bare string or an array of {role, parts} turns. */
function toMessages(contents: GeminiRequest['contents']): Anthropic.MessageParam[] {
  if (typeof contents === 'string') return [{ role: 'user', content: contents }];
  if (!Array.isArray(contents)) throw new Error('unsupported Gemini contents shape for Anthropic translation');
  return contents.map((turn) => {
    if (typeof turn === 'string') return { role: 'user' as const, content: turn };
    const content = turn as Content;
    return {
      role: content.role === 'model' ? ('assistant' as const) : ('user' as const),
      content: (content.parts ?? []).map(partToBlock),
    };
  });
}

/**
 * Serves a Gemini-shaped generateContent request via Anthropic's Messages API,
 * returning a GenerateContentResponse-compatible object — the same contract as
 * openai.ts, covering exactly what the agents use: text + inlineData contents,
 * systemInstruction, responseJsonSchema OR tools (tool choice left to the
 * model, parallel calls allowed, the calls returned as `functionCalls` with
 * their ids; a `transcript` of earlier turns and tool results is replayed
 * after the prompt — toolLoop.ts), and token usage.
 * `temperature` is intentionally NOT forwarded — Claude Opus 5 / Sonnet 5
 * reject sampling params. `thinking` is left at each model's default (adaptive
 * on Opus 5 / Sonnet 5, off on Haiku 4.5).
 */
export async function generateContentAnthropic(request: GeminiRequest): Promise<GenerateContentResponse> {
  const systemInstruction = request.config?.systemInstruction;
  if (systemInstruction !== undefined && typeof systemInstruction !== 'string') {
    throw new Error('unsupported systemInstruction shape for Anthropic translation');
  }
  const jsonSchema = request.config?.responseJsonSchema;
  const tools = declaredToolsOf(request.config);
  // The schema as sent comes from wireRequest.ts — the same copy the call log
  // stores, so the log can never drift from the wire.
  const sentSchema = sentRequestOf('anthropic', request)?.responseJsonSchema;
  // The lifetime of the cache mark, from the same rule the call row records (wireRequest.ts).
  const cacheTtl = sentCacheTtlOf('anthropic', request);

  const response = await getClient().messages.create(
    {
      model: request.model,
      max_tokens: MAX_TOKENS,
      messages: [...toMessages(request.contents), ...anthropicTranscriptMessages(request.transcript ?? [])],
      // Prompt caching is opt-in on Anthropic. The mark on the system block
      // caches everything before it too (tools render first), so a repeat call
      // within the lifetime reads tools + system at the cache-read rate. The
      // per-call text (messages) stays after the mark. Prompts under the
      // model's minimum cacheable size are simply not cached.
      ...(systemInstruction
        ? {
            system: [
              {
                type: 'text' as const,
                text: systemInstruction,
                ...(cacheTtl ? { cache_control: { type: 'ephemeral' as const, ttl: cacheTtl } } : {}),
              },
            ],
          }
        : {}),
      ...(jsonSchema
        ? { output_config: { format: { type: 'json_schema' as const, schema: sentSchema as Record<string, unknown> } } }
        : {}),
      ...(tools.length > 0 ? { tools: toAnthropicTools(tools), tool_choice: { type: 'auto' as const } } : {}),
    },
    { timeout: request.config?.httpOptions?.timeout },
  );

  if (response.stop_reason === 'refusal') {
    throw new Error(`Anthropic model refused the request: ${response.stop_details?.explanation ?? 'no explanation'}`);
  }

  const calls = callsFromAnthropicContent(response.content);
  let text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  // toAnthropicSchema turned "null when unused" fields into "omitted when
  // unused"; put the explicit nulls back so callers see the Gemini-shaped
  // answer their Zod schemas expect. `restoredFields` (the paths filled) rides
  // on the response for the `restore_answer` trace step (wireRequest.ts).
  let restoredFields: string[] | undefined;
  if (text && jsonSchema) {
    try {
      const filled: string[] = [];
      text = JSON.stringify(restoreOmittedNulls(jsonSchema, JSON.parse(text), filled));
      restoredFields = filled;
    } catch {
      // Not parseable JSON — hand it through; the caller's validation owns the rejection.
    }
  }
  return {
    text: text || undefined,
    ...(calls.length > 0 ? { functionCalls: calls } : {}),
    ...(restoredFields ? { restoredFields } : {}),
    // The answer's own blocks (thinking included) and id, replayed by the loop's next turn.
    providerTurn: response.content,
    responseId: response.id,
    usageMetadata: anthropicUsageMetadata(response.usage, cacheTtl),
    // The provider's usage block as returned, for the call row (openspec `llm-call-cache-usage`).
    rawUsage: [response.usage],
  } as unknown as GenerateContentResponse;
}

import Anthropic from '@anthropic-ai/sdk';
import type { Content, GenerateContentResponse, Part } from '@google/genai';
import type { genaiClient } from './client.js';
import { env } from '../config/env.js';

type GeminiRequest = Parameters<typeof genaiClient.models.generateContent>[0];

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

/**
 * Keywords Anthropic's structured outputs reject; our schemas come from
 * zodToJsonSchema, which can emit them. Stripped only where a key is a schema
 * keyword — never inside a `properties` map, where it would be a field name.
 */
const UNSUPPORTED_SCHEMA_KEYWORDS = new Set([
  '$schema',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'pattern',
  'minItems',
  'maxItems',
  'uniqueItems',
]);

function normalizeSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(normalizeSchema);
  if (node === null || typeof node !== 'object') return node;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED_SCHEMA_KEYWORDS.has(key)) continue;
    if (key === 'properties' && value && typeof value === 'object' && !Array.isArray(value)) {
      out.properties = Object.fromEntries(
        Object.entries(value).map(([name, propSchema]) => [name, normalizeSchema(propSchema)]),
      );
      continue;
    }
    out[key] = normalizeSchema(value);
  }
  // Structured outputs require additionalProperties:false on every object.
  if (out.type === 'object' || out.properties !== undefined) out.additionalProperties = false;
  return out;
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
 * systemInstruction, responseJsonSchema, and token usage. `temperature` is
 * intentionally NOT forwarded — Claude Opus 5 / Sonnet 5 reject sampling
 * params. `thinking` is left at each model's default (adaptive on Opus 5 /
 * Sonnet 5, off on Haiku 4.5).
 */
export async function generateContentAnthropic(request: GeminiRequest): Promise<GenerateContentResponse> {
  const systemInstruction = request.config?.systemInstruction;
  if (systemInstruction !== undefined && typeof systemInstruction !== 'string') {
    throw new Error('unsupported systemInstruction shape for Anthropic translation');
  }
  const jsonSchema = request.config?.responseJsonSchema;

  const response = await getClient().messages.create(
    {
      model: request.model,
      max_tokens: MAX_TOKENS,
      messages: toMessages(request.contents),
      ...(systemInstruction ? { system: systemInstruction } : {}),
      ...(jsonSchema
        ? { output_config: { format: { type: 'json_schema' as const, schema: normalizeSchema(jsonSchema) as Record<string, unknown> } } }
        : {}),
    },
    { timeout: request.config?.httpOptions?.timeout },
  );

  if (response.stop_reason === 'refusal') {
    throw new Error(`Anthropic model refused the request: ${response.stop_details?.explanation ?? 'no explanation'}`);
  }

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
  return {
    text: text || undefined,
    usageMetadata: {
      promptTokenCount: response.usage.input_tokens,
      // Anthropic folds thinking tokens into output_tokens and bills them at
      // the output rate, so reporting them all as output keeps costs right.
      candidatesTokenCount: response.usage.output_tokens,
      thoughtsTokenCount: 0,
    },
  } as GenerateContentResponse;
}

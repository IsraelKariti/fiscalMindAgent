import type { Content, GenerateContentResponse, Part } from '@google/genai';
import type { genaiClient } from './client.js';
import { env } from '../config/env.js';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';

/** Carries the HTTP status so generate.ts can apply the same retry policy as for Gemini's ApiError. */
export class OpenAiApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'OpenAiApiError';
  }
}

type GeminiRequest = Parameters<typeof genaiClient.models.generateContent>[0];

interface OpenAiContentItem {
  type: 'input_text' | 'output_text' | 'input_image' | 'input_file';
  text?: string;
  image_url?: string;
  filename?: string;
  file_data?: string;
}

interface OpenAiInputItem {
  role: 'user' | 'assistant';
  content: OpenAiContentItem[];
}

function partToContentItem(part: Part, role: 'user' | 'assistant'): OpenAiContentItem {
  if (part.text !== undefined) {
    return { type: role === 'assistant' ? 'output_text' : 'input_text', text: part.text };
  }
  const inline = part.inlineData;
  if (inline?.data && inline.mimeType) {
    const dataUrl = `data:${inline.mimeType};base64,${inline.data}`;
    if (inline.mimeType.startsWith('image/')) return { type: 'input_image', image_url: dataUrl };
    // Non-image binaries (in practice: PDFs). The Responses API requires a
    // filename alongside inline file data; the callers don't thread one
    // through, so a placeholder does.
    return { type: 'input_file', filename: 'document.pdf', file_data: dataUrl };
  }
  throw new Error('unsupported Gemini part for OpenAI translation');
}

/** Our callers pass either a bare string or an array of {role, parts} turns. */
function toInput(contents: GeminiRequest['contents']): OpenAiInputItem[] {
  if (typeof contents === 'string') {
    return [{ role: 'user', content: [{ type: 'input_text', text: contents }] }];
  }
  if (!Array.isArray(contents)) throw new Error('unsupported Gemini contents shape for OpenAI translation');
  return contents.map((turn) => {
    if (typeof turn === 'string') {
      return { role: 'user' as const, content: [{ type: 'input_text' as const, text: turn }] };
    }
    const content = turn as Content;
    const role = content.role === 'model' ? ('assistant' as const) : ('user' as const);
    return { role, content: (content.parts ?? []).map((p) => partToContentItem(p, role)) };
  });
}

function extractText(output: unknown): string {
  if (!Array.isArray(output)) return '';
  return output
    .filter((item): item is { type: string; content?: unknown } => typeof item === 'object' && item !== null)
    .filter((item) => item.type === 'message' && Array.isArray(item.content))
    .flatMap((item) => item.content as { type?: string; text?: string }[])
    .filter((c) => c.type === 'output_text' && typeof c.text === 'string')
    .map((c) => c.text)
    .join('');
}

/**
 * Serves a Gemini-shaped generateContent request via OpenAI's Responses API,
 * returning a GenerateContentResponse-compatible object, so the agents' call
 * sites stay provider-agnostic. Covers exactly what they use: text +
 * inlineData contents, systemInstruction, responseJsonSchema, and token usage.
 * `temperature` is intentionally NOT forwarded — the GPT-5 reasoning family
 * rejects non-default values.
 */
export async function generateContentOpenAI(request: GeminiRequest): Promise<GenerateContentResponse> {
  if (!env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set but an OpenAI model was requested');

  const systemInstruction = request.config?.systemInstruction;
  if (systemInstruction !== undefined && typeof systemInstruction !== 'string') {
    throw new Error('unsupported systemInstruction shape for OpenAI translation');
  }
  const jsonSchema = request.config?.responseJsonSchema;

  const body: Record<string, unknown> = {
    model: request.model,
    input: toInput(request.contents),
  };
  if (systemInstruction) body.instructions = systemInstruction;
  if (jsonSchema) {
    // strict:false — the agents' schemas are written for Gemini and don't meet
    // OpenAI's strict-mode constraints (additionalProperties:false everywhere).
    body.text = { format: { type: 'json_schema', name: 'response', strict: false, schema: jsonSchema } };
  }

  const timeoutMs = request.config?.httpOptions?.timeout;
  const res = await fetch(OPENAI_RESPONSES_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined,
  });
  if (!res.ok) {
    const errBody = (await res.text().catch(() => '')).slice(0, 500);
    throw new OpenAiApiError(res.status, `OpenAI HTTP ${res.status}: ${errBody}`);
  }

  const data = (await res.json()) as {
    output?: unknown;
    usage?: { input_tokens?: number; output_tokens?: number; output_tokens_details?: { reasoning_tokens?: number } };
  };
  const text = extractText(data.output);
  const reasoningTokens = data.usage?.output_tokens_details?.reasoning_tokens ?? 0;
  return {
    text: text || undefined,
    usageMetadata: {
      promptTokenCount: data.usage?.input_tokens ?? 0,
      // OpenAI's output_tokens includes reasoning; Gemini reports them apart,
      // and usageFromResponse/pricing assume the disjoint convention.
      candidatesTokenCount: Math.max(0, (data.usage?.output_tokens ?? 0) - reasoningTokens),
      thoughtsTokenCount: reasoningTokens,
    },
  } as GenerateContentResponse;
}

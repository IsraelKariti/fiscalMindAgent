import type { Content, Part } from '@google/genai';

/**
 * Reduction of an LLM request to the loggable JSON stored in
 * llm_calls.request (049). Pure (no env/DB imports) so tests can pin the
 * redaction guarantee: binary parts must NEVER land in the log as bytes.
 */

const MAX_LOGGED_TEXT = 200_000;

function textForLog(text: string): string {
  if (text.length <= MAX_LOGGED_TEXT) return text;
  return `${text.slice(0, MAX_LOGGED_TEXT)}… [truncated ${text.length - MAX_LOGGED_TEXT} chars]`;
}

/** Binary parts are logged as {mimeType, sizeBytes} placeholders, never as bytes. */
function partForLog(part: Part): Record<string, unknown> {
  if (part.text !== undefined) return { text: textForLog(part.text) };
  const inline = part.inlineData;
  if (inline) {
    return {
      inlineData: {
        mimeType: inline.mimeType,
        sizeBytes: Math.round(((inline.data?.length ?? 0) * 3) / 4),
      },
    };
  }
  return { unsupported: Object.keys(part) };
}

function contentsForLog(contents: unknown): unknown {
  if (typeof contents === 'string') return textForLog(contents);
  if (!Array.isArray(contents)) return contents;
  return contents.map((turn) => {
    if (typeof turn === 'string') return textForLog(turn);
    const content = turn as Content;
    if (!Array.isArray(content.parts)) return content;
    return { role: content.role, parts: content.parts.map(partForLog) };
  });
}

/** Structural view of the request — every Gemini-shaped request satisfies it. */
export interface LoggableRequest {
  model: string;
  contents?: unknown;
  config?: {
    systemInstruction?: unknown;
    temperature?: unknown;
    responseMimeType?: unknown;
    responseJsonSchema?: unknown;
  };
}

/** The exact model input, reduced to a loggable JSON shape. */
export function requestForLog(request: LoggableRequest): Record<string, unknown> {
  const cfg = request.config ?? {};
  return {
    model: request.model,
    ...(typeof cfg.systemInstruction === 'string' ? { systemInstruction: textForLog(cfg.systemInstruction) } : {}),
    contents: contentsForLog(request.contents),
    config: {
      ...(cfg.temperature !== undefined ? { temperature: cfg.temperature } : {}),
      ...(cfg.responseMimeType !== undefined ? { responseMimeType: cfg.responseMimeType } : {}),
      ...(cfg.responseJsonSchema !== undefined ? { responseJsonSchema: cfg.responseJsonSchema } : {}),
    },
  };
}

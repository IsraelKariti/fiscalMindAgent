/**
 * Step injection_detection_regex — the first of the three injection layers
 * (regex → dedicated LLM scan → code check of the scan's proof), run on every
 * untrusted input: form answers, every inbound message, every attached file
 * (its filename and, for a PDF, its text layer).
 *
 * Named patterns, most decisive first, first hit wins. No model, no cost.
 * Advisory in the chat transcript (the planner is told which tripwires fired)
 * and a hard gate wherever the text would otherwise reach a task model
 * unscreened (form intake, message screening, file screening).
 */

import { check, type GateCheck } from './gateChecks.js';

export interface InjectionPattern {
  /** Stable label for audit rows / telemetry. */
  kind: string;
  pattern: RegExp;
}

export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
  // All-caps SYSTEM: is the signal — deliberately case-sensitive.
  { kind: 'system_impersonation', pattern: /\bSYSTEM\s*:|\bend of system message\b/ },
  {
    kind: 'ignore_instructions',
    pattern: /\b(ignore|disregard|forget)\b.{0,40}\b(previous|prior|above|earlier|all)\b.{0,20}\b(instructions?|directions?|prompts?|rules?)\b/i,
  },
  { kind: 'ignore_instructions_he', pattern: /התעלם\s+מ(כל\s+)?ה?(הוראות|הנחיות|כללים)/ },
  { kind: 'system_prompt', pattern: /\b(system|developer)\s+(prompt|message|instructions?)\b/i },
  { kind: 'system_prompt_he', pattern: /הוראות\s+ה?מערכת|פרומפט/ },
  { kind: 'role_tags', pattern: /<\|im_(start|end)\|>|<<SYS>>|\[\/?INST\]/i },
  { kind: 'ai_address', pattern: /\byou\s+are\s+(an?\s+)?(ai|llm|language\s+model|assistant|agent)\b/i },
  { kind: 'ai_address_he', pattern: /אתה\s+(מודל\s+שפה|בינה\s+מלאכותית|סוכן\s+(וירטואלי|AI))/ },
  {
    kind: 'state_command',
    pattern: /\b(mark|set|flag)\s+(all\s+)?(the\s+)?(documents?|debts?|status|goal)\s+(as\s+)?(collected|paid|completed?|approved)\b|\bauto-?approve\b/i,
  },
  { kind: 'state_command_he', pattern: /סמן\s+(את\s+)?(כל\s+)?(המסמכים|המסמך|החוב|הסטטוס)\s+כ/ },
  // The shape makeFenceToken produces ([8 hex chars]) — a forged section boundary.
  { kind: 'fence_forgery', pattern: /^[\s>]*(---|===)\s*(END\s+)?[A-Z][A-Z ]{3,}(\s+\[[0-9a-f]{8}\])?\s*(---|===)/m },
];

export interface InjectionRegexHit {
  kind: string;
  /** The matched text, verbatim (capped). */
  evidence: string;
}

/** The first (most decisive) pattern the text sets off, or null when clean. */
export function matchInjectionRegex(text: string): InjectionRegexHit | null {
  for (const { kind, pattern } of INJECTION_PATTERNS) {
    const m = pattern.exec(text);
    if (m) return { kind, evidence: m[0].slice(0, 300) };
  }
  return null;
}

/** Every pattern the text sets off (empty = clean) — the transcript's tripwire note lists them all. */
export function injectionRegexLabels(text: string): string[] {
  return INJECTION_PATTERNS.filter((p) => p.pattern.test(text)).map((p) => p.kind);
}

/**
 * The gate's check list for the audit row: one entry per pattern, in pattern
 * order; a pattern that matched is a failed check whose note quotes the match.
 */
export function injectionRegexChecks(text: string): GateCheck[] {
  return INJECTION_PATTERNS.map(({ kind, pattern }) => {
    const m = pattern.exec(text);
    return check(kind, m === null, m?.[0].slice(0, 300));
  });
}

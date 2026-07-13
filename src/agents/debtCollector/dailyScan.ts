import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import * as agentInstances from '../../db/queries/agentInstances.js';
import * as agentMailboxes from '../../db/queries/agentMailboxes.js';
import * as clients from '../../db/queries/clients.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { draftFirstEmail } from '../../api/draftFirstEmail.js';
import { getGeminiModel } from '../../gemini/modelSettings.js';
import { generateWithRetry, usageFromResponse } from '../../gemini/generate.js';
import { logger } from '../../util/logger.js';
import type { AgentInstanceRow } from '../../db/types.js';
import { loadAllRows, type ScanSourceRows } from './data.js';
import { parseSettings } from './settings.js';

/** Rows the screening prompt may carry per instance per day — keeps one Gemini call bounded. */
const MAX_CANDIDATE_ROWS = 1000;

const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Which of the listed rows show an open debt: emails only — names/rows stay
// authoritative on our side, the LLM merely screens.
const ScanResponseSchema = z.object({
  debtors: z.array(
    z.object({
      email: z.string(),
      /** Internal, for the logs. */
      reasoning: z.string(),
    }),
  ),
});

const scanJsonSchema = zodToJsonSchema(ScanResponseSchema) as Record<string, unknown>;
delete scanJsonSchema.$schema;

const SCAN_SYSTEM_PROMPT = `אתה סוכן גביית חובות של משרד רואי חשבון. תוצג בפניך רשימת שורות מתוך הלוחות והגיליונות של המשרד — כל שורה שייכת ללקוח (מזוהה לפי כתובת אימייל) שעדיין אין לו תיק גבייה פתוח.

זהה אילו מהשורות מעידות על חוב פתוח שטרם שולם: יתרת חוב, תשלום שלא הוסדר, פיגור בתשלומים וכדומה. שורה שאינה מראה חוב פתוח (שולם, יתרה אפס, אין אינדיקציה) — אל תכלול.

השב אך ורק לפי סכמת ה-JSON: מערך debtors ובו, לכל לקוח עם חוב פתוח, כתובת האימייל שלו בדיוק כפי שהופיעה בשורה, ו-reasoning קצר (לשימוש פנימי). אם אין חייבים — החזר מערך ריק.`;

interface Candidate {
  email: string;
  name: string;
  lines: string[];
}

/** Rows keyed by (valid, lowercased) email, merged across sources; first non-empty name wins. */
function collectCandidates(sources: ScanSourceRows[]): Map<string, Candidate> {
  const candidates = new Map<string, Candidate>();
  for (const source of sources) {
    for (const row of source.rows) {
      if (!EMAIL_SHAPE.test(row.email)) continue;
      const line = `[${source.sourceName}] ${Object.entries(row.row)
        .map(([header, value]) => `${header}: ${value}`)
        .join(' | ')}`;
      const existing = candidates.get(row.email);
      if (existing) {
        existing.lines.push(line);
        if (!existing.name) existing.name = row.name;
      } else {
        candidates.set(row.email, { email: row.email, name: row.name, lines: [line] });
      }
    }
  }
  return candidates;
}

/** One Gemini screening call over the not-yet-enrolled rows; returns the debtor emails it flagged. */
async function screenForDebtors(instance: AgentInstanceRow, candidates: Candidate[]): Promise<Set<string>> {
  const contents = candidates
    .map((c) => `email: ${c.email}\n${c.lines.join('\n')}`)
    .join('\n\n');

  const model = await getGeminiModel();
  const response = await generateWithRetry({
    model,
    contents: `--- CLIENT ROWS (no open collection case yet) ---\n${contents}\n--- END ROWS ---`,
    config: {
      systemInstruction: SCAN_SYSTEM_PROMPT,
      responseMimeType: 'application/json',
      responseJsonSchema: scanJsonSchema,
      temperature: 0.1,
    },
  });

  const usage = usageFromResponse(response);
  logger.info('gemini tokens used (debt scan)', { model, instanceId: instance.id, ...usage });
  await llmUsage.add(instance.user_id, model, usage);

  const text = response.text;
  if (!text) throw new Error(`Gemini returned no text output for debt scan: ${JSON.stringify(response)}`);
  const parsed = ScanResponseSchema.parse(JSON.parse(text));
  for (const debtor of parsed.debtors) {
    logger.info('debt scan: debtor flagged', { instanceId: instance.id, email: debtor.email, reasoning: debtor.reasoning });
  }
  return new Set(parsed.debtors.map((d) => d.email.trim().toLowerCase()));
}

async function scanInstance(instance: AgentInstanceRow): Promise<number> {
  const settings = parseSettings(instance.settings);
  if (settings.boards.length === 0 && settings.sheets.length === 0) return 0;
  if (!(await agentMailboxes.getByUserId(instance.user_id))) {
    // Without a mailbox the first email could never send; skip rather than
    // enroll clients that immediately fail.
    logger.warn('debt scan: accountant has no agent mailbox, skipping instance', { instanceId: instance.id });
    return 0;
  }

  const { sources, failedSources } = await loadAllRows(instance.user_id, settings);
  if (failedSources.length > 0) {
    logger.warn('debt scan: some sources unreadable this run', { instanceId: instance.id, failedSources });
  }

  const candidates = collectCandidates(sources);
  // Idempotency: any existing client of this instance (whatever its goal
  // status) counts as "handled" — re-runs and boot catch-ups enroll no one twice.
  const fresh: Candidate[] = [];
  for (const candidate of candidates.values()) {
    if (!(await clients.getByEmailAddressForInstance(instance.id, candidate.email))) fresh.push(candidate);
  }
  if (fresh.length === 0) return 0;
  if (fresh.length > MAX_CANDIDATE_ROWS) {
    logger.warn('debt scan: candidate rows truncated', { instanceId: instance.id, total: fresh.length, kept: MAX_CANDIDATE_ROWS });
    fresh.length = MAX_CANDIDATE_ROWS;
  }

  const debtorEmails = await screenForDebtors(instance, fresh);
  let enrolled = 0;
  for (const candidate of fresh) {
    if (!debtorEmails.has(candidate.email)) continue;
    const name = candidate.name || candidate.email.split('@')[0] || candidate.email;
    try {
      const client = await clients.insert({
        userId: instance.user_id,
        agentInstanceId: instance.id,
        name,
        emailAddress: candidate.email,
      });
      // Same fire-and-forget first-draft path as manual client creation: the
      // per-client plan re-reads the row, verifies the debt, and either emails
      // or completes silently.
      draftFirstEmail(client.id);
      enrolled += 1;
      logger.info('debt scan: client enrolled', { instanceId: instance.id, clientId: client.id, email: candidate.email });
    } catch (err) {
      // 23505 = unique_violation: enrolled concurrently (webhook, another run) — fine.
      if (err instanceof Error && 'code' in err && (err as { code?: string }).code === '23505') continue;
      logger.error('debt scan: client insert failed', err, { instanceId: instance.id, email: candidate.email });
    }
  }
  return enrolled;
}

/**
 * The daily sweep: for every enabled debt-collector instance, read all rows of
 * its configured sheets/boards, screen the not-yet-enrolled ones for open
 * debts with one Gemini call, and enroll + start emailing the debtors. Runs
 * daily just after local midnight plus once on worker boot; existing clients
 * are skipped, so overlapping runs are harmless.
 */
export async function runDebtScan(): Promise<void> {
  const instances = await agentInstances.listEnabledByType('debt_collector');
  let enrolled = 0;
  for (const instance of instances) {
    try {
      enrolled += await scanInstance(instance);
    } catch (err) {
      // One accountant's bad config/outage must not stop the rest.
      logger.error('debt scan failed for instance', err, { instanceId: instance.id });
    }
  }
  logger.info('debt scan finished', { instances: instances.length, enrolled });
}

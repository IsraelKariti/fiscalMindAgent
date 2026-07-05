import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../util/logger.js';
import { getGeminiModel } from './modelSettings.js';
import { generateWithRetry, usageFromResponse, type GeminiUsage } from './generate.js';
import type { ClientDocumentRow } from '../db/types.js';

/** Verdict from reading the file's actual contents; persisted as document_files.analysis. */
export const FileAnalysisSchema = z.object({
  /** What the document actually is, from its contents (e.g. "טופס 867 מבנק לאומי"). */
  document_kind: z.string(),
  /** 1-2 sentence Hebrew summary of the contents, shown to the accountant. */
  summary: z.string(),
  tax_year: z.string().nullable(),
  /** The person/business the document is about, if stated. */
  subject_name: z.string().nullable(),
  /** Id from the required-documents list this file satisfies, or null if none. */
  matched_document_id: z.string().nullable(),
  legible: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
});

export type FileAnalysis = z.infer<typeof FileAnalysisSchema>;

const analysisJsonSchema = zodToJsonSchema(FileAnalysisSchema) as Record<string, unknown>;
delete analysisJsonSchema.$schema;

// Types Gemini reads natively as documents/images. Everything else (Office
// files, archives, …) is stored but marked unsupported for content analysis.
const ANALYZABLE_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
]);

// Inline parts count toward Gemini's 20MB request limit; leave headroom for
// the prompt and base64 overhead (bytes grow ~4/3 when encoded).
const MAX_ANALYZABLE_BYTES = 14 * 1024 * 1024;

export function isAnalyzable(contentType: string, sizeBytes: number): boolean {
  const mime = (contentType.toLowerCase().split(';')[0] ?? '').trim();
  return ANALYZABLE_TYPES.has(mime) && sizeBytes <= MAX_ANALYZABLE_BYTES;
}

const ANALYSIS_PROMPT = `אתה בודק מסמכים עבור משרד רואי חשבון. מצורף קובץ שלקוח שלח במייל. קרא את תוכן הקובץ עצמו וקבע מהו המסמך בפועל - אל תסתמך על שם הקובץ.

רשימת המסמכים הנדרשים מהלקוח:
{{documents}}

השב לפי הסכמה:
- document_kind: מהו המסמך בפועל לפי תוכנו (למשל "טופס 867 מבנק הפועלים", "דוח שנתי מקרן פנסיה", "צילום תעודת זהות").
- summary: סיכום קצר (משפט-שניים) של תוכן המסמך, בעברית.
- tax_year: שנת המס שהמסמך מתייחס אליה, אם מצוינת בו. אחרת null.
- subject_name: שם האדם או העסק שהמסמך נוגע אליו, אם מופיע. אחרת null.
- matched_document_id: המזהה (id) מהרשימה למעלה של המסמך הנדרש שהקובץ הזה מספק, רק אם התוכן באמת תואם. אם אינו תואם לאף מסמך ברשימה - null.
- legible: האם המסמך קריא מספיק כדי לקבוע את תוכנו בביטחון. אם הקובץ ריק, חתוך או מטושטש מדי - false.
- confidence: מידת הביטחון בזיהוי (high / medium / low).

שם הקובץ כפי שנשלח (לידיעה בלבד, אין להסתמך עליו): {{filename}}`;

export interface AnalyzeFileResult {
  analysis: FileAnalysis;
  usage: GeminiUsage;
  /** The model that actually served this call, for per-model usage accounting. */
  model: string;
}

/** Reads the file's actual bytes with Gemini and classifies what document it is. */
export async function analyzeFile(
  bytes: Buffer,
  contentType: string,
  filename: string,
  requiredDocuments: ClientDocumentRow[],
): Promise<AnalyzeFileResult> {
  const documentLines =
    requiredDocuments.length > 0
      ? requiredDocuments
          .map((doc) => `[id: ${doc.id}] ${doc.name}${doc.description ? ` — ${doc.description}` : ''}`)
          .join('\n')
      : '(אין מסמכים מוגדרים)';
  const prompt = ANALYSIS_PROMPT.replace('{{documents}}', documentLines).replace('{{filename}}', filename);

  const model = await getGeminiModel();
  const response = await generateWithRetry({
    model,
    contents: [
      {
        role: 'user',
        parts: [
          { inlineData: { mimeType: contentType, data: bytes.toString('base64') } },
          { text: prompt },
        ],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: analysisJsonSchema,
      temperature: 0.1,
    },
  });

  const usage = usageFromResponse(response);
  logger.info('gemini tokens used (file analysis)', { model, filename, ...usage });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text output for file analysis: ${JSON.stringify(response)}`);
  }
  return { analysis: FileAnalysisSchema.parse(JSON.parse(text)), usage, model };
}

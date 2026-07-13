import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../../util/logger.js';
import { getGeminiModel } from '../../gemini/modelSettings.js';
import { generateWithRetry, usageFromResponse, type GeminiUsage } from '../../gemini/generate.js';
import type { FileAnalysis } from '../../db/types.js';

/**
 * Receipt-focused verdict, persisted in the shared document_files.analysis
 * shape (FileAnalysis) so the files UI and transcript rendering need no
 * special-casing. matched_document_id is a doc-collector concept — always null
 * here.
 */
const ReceiptAnalysisSchema = z.object({
  /** What the document actually is (e.g. "אישור העברה בנקאית מבנק לאומי"). */
  document_kind: z.string(),
  /** 1-2 sentence Hebrew summary: is it a payment proof, for what amount, from whom to whom, dated when. */
  summary: z.string(),
  /** The person/business that made the payment, if stated. */
  subject_name: z.string().nullable(),
  legible: z.boolean(),
  confidence: z.enum(['high', 'medium', 'low']),
});

const analysisJsonSchema = zodToJsonSchema(ReceiptAnalysisSchema) as Record<string, unknown>;
delete analysisJsonSchema.$schema;

const ANALYSIS_PROMPT = `אתה בודק אסמכתאות תשלום עבור משרד רואי חשבון. מצורף קובץ שלקוח שלח במייל במסגרת גביית חוב. קרא את תוכן הקובץ עצמו וקבע מהו בפועל - אל תסתמך על שם הקובץ.

השב לפי הסכמה:
- document_kind: מהו המסמך בפועל לפי תוכנו (למשל "אישור העברה בנקאית", "קבלה", "צילום מסך של אפליקציית תשלומים", או כל מסמך אחר שאינו אסמכתת תשלום).
- summary: סיכום קצר (משפט-שניים) בעברית: האם זו אסמכתת תשלום, על איזה סכום, ממי למי, ומאיזה תאריך - ככל שהפרטים מופיעים.
- subject_name: שם האדם או העסק שביצע את התשלום, אם מופיע. אחרת null.
- legible: האם המסמך קריא מספיק כדי לקבוע את תוכנו בביטחון. אם הקובץ ריק, חתוך או מטושטש מדי - false.
- confidence: מידת הביטחון בזיהוי (high / medium / low).

שם הקובץ כפי שנשלח (לידיעה בלבד, אין להסתמך עליו): {{filename}}`;

export interface AnalyzeReceiptResult {
  analysis: FileAnalysis;
  usage: GeminiUsage;
  /** The model that actually served this call, for per-model usage accounting. */
  model: string;
}

/** Reads the file's actual bytes with Gemini and classifies whether it is a payment confirmation. */
export async function analyzeReceipt(bytes: Buffer, contentType: string, filename: string): Promise<AnalyzeReceiptResult> {
  const prompt = ANALYSIS_PROMPT.replace('{{filename}}', filename);

  const model = await getGeminiModel();
  const response = await generateWithRetry({
    model,
    contents: [
      {
        role: 'user',
        parts: [{ inlineData: { mimeType: contentType, data: bytes.toString('base64') } }, { text: prompt }],
      },
    ],
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: analysisJsonSchema,
      temperature: 0.1,
    },
  });

  const usage = usageFromResponse(response);
  logger.info('gemini tokens used (receipt analysis)', { model, filename, ...usage });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text output for receipt analysis: ${JSON.stringify(response)}`);
  }
  const parsed = ReceiptAnalysisSchema.parse(JSON.parse(text));
  return {
    analysis: { ...parsed, tax_year: null, matched_document_id: null },
    usage,
    model,
  };
}

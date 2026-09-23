import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '../src/config/env.js';
import { generateWithRetry, usageFromResponse } from '../src/gemini/generate.js';
import { getCatalogType } from '../src/agents/declarationOfCapital/catalog.js';
import { buildExtractionCall, checksFor, fieldsFor } from '../src/agents/declarationOfCapital/extractionCall.js';
import { extractionSchemaFor, runChecks } from '../src/agents/declarationOfCapital/verifyChecks.js';

/**
 * Standalone extraction harness — one Gemini call, no DB/Redis/blob access:
 * runs the REAL verification extraction prompt + deterministic runChecks over
 * a local sample file, exactly as verifyDocument.ts would over a client
 * upload. For testing document samples (e.g. a vehicle license) against the
 * pipeline without the dev stack.
 *
 *   npx tsx scripts/verifyExtractionSample.ts <file> [typeKey=vehicle]
 *     [--name <expected instance name>] [--client <client name>]
 *     [--id <client id number>] [--year <taxYear>] [--model <model>]
 *
 * Exit code: 0 = verification passed, 1 = failed, 2 = usage/config error.
 */

// Default expected-instance name per type — stands in for the resolved
// client_documents row name the harness doesn't have.
const DEFAULT_INSTANCE_NAME: Record<string, string> = {
  vehicle: 'העתק רישיון רכב בתוקף',
};

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

async function main(): Promise<void> {
  const positional: string[] = [];
  const flags = new Map<string, string>();
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg.startsWith('--')) flags.set(arg.slice(2), args[++i] ?? '');
    else positional.push(arg);
  }
  const filePath = positional[0];
  if (!filePath) {
    console.error(
      'usage: npx tsx scripts/verifyExtractionSample.ts <file> [typeKey] [--name x] [--client x] [--id x] [--year x] [--model x]',
    );
    process.exit(2);
  }

  const typeKey = positional[1] ?? 'vehicle';
  const catalogType = getCatalogType(typeKey);
  if (!catalogType) {
    console.error(`unknown catalog type: ${typeKey}`);
    process.exit(2);
  }
  const now = new Date();
  const taxYear = Number(flags.get('year') ?? now.getFullYear() - 1);
  const year = String(taxYear);
  const expectedName =
    flags.get('name') ?? DEFAULT_INSTANCE_NAME[typeKey] ?? catalogType.nameHe.replaceAll('{{tax_year}}', year);

  const bytes = await readFile(filePath);
  const mime = MIME[path.extname(filePath).toLowerCase()] ?? 'application/pdf';

  // The exact production request (the type's own field lines and schema
  // entries included). The instance description is null since the harness
  // has no resolved row, so the builder restates the catalog description.
  const doc = { name: expectedName, description: null, type_key: typeKey };
  const spec = buildExtractionCall({ doc, bytes, contentType: mime, filename: path.basename(filePath), taxYear });
  const { fields, fieldsAnyOf } = fieldsFor(doc);

  const model = flags.get('model') ?? env.GEMINI_MODEL;
  console.log(`extracting with ${model}: ${filePath} as type '${typeKey}' (tax year ${taxYear})`);
  const response = await generateWithRetry({
    model,
    contents: spec.contents,
    config: {
      responseMimeType: 'application/json',
      responseJsonSchema: spec.responseJsonSchema,
      temperature: spec.temperature,
      ...(spec.systemInstruction !== undefined ? { systemInstruction: spec.systemInstruction } : {}),
    },
  });
  if (!response.text) throw new Error('extraction returned no text');
  const extracted = extractionSchemaFor(fields).parse(JSON.parse(response.text));
  console.log('\n--- extracted ---');
  console.log(JSON.stringify(extracted, null, 2));
  console.log('\n--- usage ---');
  console.log(JSON.stringify(usageFromResponse(response)));

  const verdict = runChecks(extracted, {
    clientName: flags.get('client') ?? '',
    credentialIdNumber: flags.get('id') ?? null,
    taxYear,
    now,
    checks: checksFor(doc),
    documentName: expectedName,
    fields,
    fieldsAnyOf,
  });
  console.log('\n--- verdict ---');
  console.log(JSON.stringify(verdict, null, 2));
  process.exit(verdict.passed ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});

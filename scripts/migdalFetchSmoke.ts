/**
 * Manual, one-off validation of the Migdal browser port against the REAL
 * site (openspec `migdal-fetch`). Every run makes Migdal send a real SMS code
 * to the mobile number it holds for that id, so use it only with that
 * person's consent — iterate on the mock (TAX_FETCH_MOCK=true) for everything
 * else.
 *
 *   npx tsx scripts/migdalFetchSmoke.ts <idNumber> [taxYear] [keys]
 *
 * No phone is passed: the site sends the code to its registered number.
 * `keys` is a comma list of pension_annual,study_fund_annual (default: both).
 * It opens Chrome, logs in, waits for you to type the SMS code, runs the four
 * filter rounds (full + short report × pension + study fund) and writes the
 * PDFs to <temp dir>/migdal-smoke/ (never into the repo — they are personal
 * documents).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { launchInteractivePage } from '../src/browserRunner/launch.js';
import { migdalProvider } from '../src/browserRunner/migdal.js';
import { OtpRejectedError } from '../src/browserRunner/providerTypes.js';

async function main(): Promise<void> {
  const [idNumber, taxYearArg, keysArg] = process.argv.slice(2);
  if (!idNumber) {
    console.error('usage: npx tsx scripts/migdalFetchSmoke.ts <idNumber> [taxYear] [pension_annual,study_fund_annual]');
    process.exit(1);
  }
  const taxYear = taxYearArg ? Number(taxYearArg) : new Date().getFullYear() - 1;
  const documentKeys = (keysArg ?? 'pension_annual,study_fund_annual').split(',').map((k) => k.trim()).filter(Boolean);
  const outDir = join(tmpdir(), 'migdal-smoke');
  await mkdir(outDir, { recursive: true });

  const { browser, page } = await launchInteractivePage();
  try {
    console.log('logging in — Migdal should send an SMS code to its registered number shortly…');
    await migdalProvider.startLogin(page, { idNumber });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (;;) {
      const otp = (await rl.question('enter the SMS code: ')).trim();
      try {
        await migdalProvider.submitOtp(page, otp);
        break;
      } catch (err) {
        if (!(err instanceof OtpRejectedError)) throw err;
        console.log('the site rejected that code — try again');
      }
    }
    rl.close();

    console.log(`authenticated — running the report rounds for ${taxYear} (${documentKeys.join(', ')})…`);
    const docs = await migdalProvider.downloadDocuments(page, { taxYear, documentKeys });

    for (const [i, doc] of docs.entries()) {
      const outPath = join(outDir, `${i + 1}_${doc.filename}`);
      await writeFile(outPath, doc.buffer);
      console.log(`saved ${doc.buffer.length} bytes to ${outPath} (${doc.kind}: ${doc.title})`);
    }
    console.log(`done — ${docs.length} document(s) in ${outDir}`);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('smoke test failed:', err);
  process.exit(1);
});

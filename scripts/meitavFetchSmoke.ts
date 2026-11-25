/**
 * Manual, one-off validation of the Meitav browser port against the REAL
 * site (openspec `meitav-fetch`). Every run makes Meitav send a real SMS code
 * to the phone given, so use it only with that person's consent — iterate on
 * the mock (DOCUMENT_FETCH_MOCK=true) for everything else.
 *
 *   npx tsx scripts/meitavFetchSmoke.ts <idNumber> <phone> [taxYear] [keys]
 *
 * `phone` is the WhatsApp number as stored (05X… or 972…). `keys` is a comma
 * list of pension_annual,study_fund_annual (default: both). It opens Chrome,
 * logs in, waits for you to type the SMS code, opens "דוחות תקופתיים", sets
 * the year and downloads the detailed + short annual report of every product
 * card, writing the PDFs to <temp dir>/meitav-smoke/ (never into the repo —
 * they are personal documents).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { launchInteractivePage } from '../src/browserRunner/launch.js';
import { meitavProvider } from '../src/browserRunner/meitav.js';
import { OtpRejectedError } from '../src/browserRunner/providerTypes.js';

async function main(): Promise<void> {
  const [idNumber, phoneNumber, taxYearArg, keysArg] = process.argv.slice(2);
  if (!idNumber || !phoneNumber) {
    console.error('usage: npx tsx scripts/meitavFetchSmoke.ts <idNumber> <phone> [taxYear] [pension_annual,study_fund_annual]');
    process.exit(1);
  }
  const taxYear = taxYearArg ? Number(taxYearArg) : new Date().getFullYear() - 1;
  const documentKeys = (keysArg ?? 'pension_annual,study_fund_annual').split(',').map((k) => k.trim()).filter(Boolean);
  const outDir = join(tmpdir(), 'meitav-smoke');
  await mkdir(outDir, { recursive: true });

  const { browser, page } = await launchInteractivePage();
  try {
    console.log('logging in — Meitav should send an SMS code shortly…');
    await meitavProvider.startLogin(page, { idNumber, phoneNumber });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (;;) {
      const otp = (await rl.question('enter the SMS code: ')).trim();
      try {
        await meitavProvider.submitOtp(page, otp);
        break;
      } catch (err) {
        if (!(err instanceof OtpRejectedError)) throw err;
        console.log('the site rejected that code — try again');
      }
    }
    rl.close();

    console.log(`authenticated — reading the periodic reports for ${taxYear} (${documentKeys.join(', ')})…`);
    const docs = await meitavProvider.downloadDocuments(page, { taxYear, documentKeys });

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

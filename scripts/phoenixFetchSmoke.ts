/**
 * Manual, one-off validation of the Phoenix browser port against the REAL
 * site (openspec `phoenix-fetch`). Every run sends a real SMS code to the
 * phone you pass, so use it only with that person's consent — iterate on the
 * mock (TAX_FETCH_MOCK=true) for everything else.
 *
 *   npx tsx scripts/phoenixFetchSmoke.ts <idNumber> <phone> [taxYear] [keys]
 *
 * `keys` is a comma list of pension_annual,study_fund_annual (default: both).
 * It opens Chrome, logs in, waits for you to type the SMS code, walks the
 * reports list and writes the PDFs to <temp dir>/phoenix-smoke/ (never into
 * the repo — they are personal documents).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { launchInteractivePage } from '../src/browserRunner/launch.js';
import { phoenixProvider } from '../src/browserRunner/phoenix.js';
import { OtpRejectedError } from '../src/browserRunner/providerTypes.js';

async function main(): Promise<void> {
  const [idNumber, phone, taxYearArg, keysArg] = process.argv.slice(2);
  if (!idNumber || !phone) {
    console.error('usage: npx tsx scripts/phoenixFetchSmoke.ts <idNumber> <phone> [taxYear] [pension_annual,study_fund_annual]');
    process.exit(1);
  }
  const taxYear = taxYearArg ? Number(taxYearArg) : new Date().getFullYear() - 1;
  const documentKeys = (keysArg ?? 'pension_annual,study_fund_annual').split(',').map((k) => k.trim()).filter(Boolean);
  const outDir = join(tmpdir(), 'phoenix-smoke');
  await mkdir(outDir, { recursive: true });

  const { browser, page } = await launchInteractivePage();
  try {
    console.log('logging in — an SMS code should arrive shortly…');
    await phoenixProvider.startLogin(page, { idNumber, phoneNumber: phone });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (;;) {
      const otp = (await rl.question('enter the SMS code: ')).trim();
      try {
        await phoenixProvider.submitOtp(page, otp);
        break;
      } catch (err) {
        if (!(err instanceof OtpRejectedError)) throw err;
        console.log('the site rejected that code — try again');
      }
    }
    rl.close();

    console.log(`authenticated — walking the reports list for ${taxYear} (${documentKeys.join(', ')})…`);
    const docs = await phoenixProvider.downloadDocuments(page, { taxYear, documentKeys });

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

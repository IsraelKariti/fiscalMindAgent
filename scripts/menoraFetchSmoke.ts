/**
 * Manual, one-off validation of the Menora Mivtachim browser port against the
 * REAL site (openspec `menora-fetch`). Every run makes Menora send a real SMS
 * code to the phone given, so use it only with that person's consent —
 * iterate on the mock (DOCUMENT_FETCH_MOCK=true) for everything else.
 *
 *   npx tsx scripts/menoraFetchSmoke.ts <idNumber> <phone> [taxYear] [keys]
 *
 * `phone` is the WhatsApp number as stored (05X… or 972…). `keys` is a comma
 * list of pension_annual,study_fund_annual (default: both). It opens Chrome,
 * logs in, waits for you to type the SMS code, opens "הדוחות שלי", sets the
 * three filters (short annual report × פנסיה + גמל והשתלמות × the year) and
 * downloads every row, writing the PDFs to <temp dir>/menora-smoke/ (never
 * into the repo — they are personal documents).
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { launchInteractivePage } from '../src/browserRunner/launch.js';
import { menoraProvider } from '../src/browserRunner/menora.js';
import { OtpRejectedError } from '../src/browserRunner/providerTypes.js';

async function main(): Promise<void> {
  const [idNumber, phoneNumber, taxYearArg, keysArg] = process.argv.slice(2);
  if (!idNumber || !phoneNumber) {
    console.error('usage: npx tsx scripts/menoraFetchSmoke.ts <idNumber> <phone> [taxYear] [pension_annual,study_fund_annual]');
    process.exit(1);
  }
  const taxYear = taxYearArg ? Number(taxYearArg) : new Date().getFullYear() - 1;
  const documentKeys = (keysArg ?? 'pension_annual,study_fund_annual').split(',').map((k) => k.trim()).filter(Boolean);
  const outDir = join(tmpdir(), 'menora-smoke');
  await mkdir(outDir, { recursive: true });

  const { browser, page } = await launchInteractivePage();
  try {
    console.log('logging in — Menora should send an SMS code shortly…');
    await menoraProvider.startLogin(page, { idNumber, phoneNumber });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    for (;;) {
      const otp = (await rl.question('enter the SMS code: ')).trim();
      try {
        await menoraProvider.submitOtp(page, otp);
        break;
      } catch (err) {
        if (!(err instanceof OtpRejectedError)) throw err;
        console.log('the site rejected that code — try again');
      }
    }
    rl.close();

    console.log(`authenticated — running the report filter for ${taxYear} (${documentKeys.join(', ')})…`);
    const docs = await menoraProvider.downloadDocuments(page, { taxYear, documentKeys });

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

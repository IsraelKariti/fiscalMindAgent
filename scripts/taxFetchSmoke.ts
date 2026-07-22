/**
 * Manual, one-off validation of the tax-authority browser port against the REAL
 * site. Every run sends a real SMS to the citizen whose ID you pass, so use it
 * sparingly and only with consent — iterate on the mock (TAX_FETCH_MOCK=true)
 * for everything else.
 *
 *   npx tsx scripts/taxFetchSmoke.ts <idNumber> <userCode> [taxYear]
 *
 * It opens Chrome, logs in, waits for you to type the OTP you receive by SMS,
 * downloads the Form 106, and writes the PDF next to this script.
 */
import { writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';
import { launchInteractivePage } from '../src/browser/launch.js';
import { israelTaxAuthorityProvider } from '../src/browser/providers/israelTaxAuthority.js';

async function main(): Promise<void> {
  const [idNumber, userCode, taxYearArg] = process.argv.slice(2);
  if (!idNumber || !userCode) {
    console.error('usage: npx tsx scripts/taxFetchSmoke.ts <idNumber> <userCode> [taxYear]');
    process.exit(1);
  }
  const taxYear = taxYearArg ? Number(taxYearArg) : new Date().getFullYear() - 1;

  const { browser, page } = await launchInteractivePage();
  try {
    console.log('logging in — an SMS OTP should arrive shortly…');
    await israelTaxAuthorityProvider.startLogin(page, { idNumber, userCode });

    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const otp = (await rl.question('enter the OTP from SMS: ')).trim();
    rl.close();

    await israelTaxAuthorityProvider.submitOtp(page, otp);
    console.log('authenticated — downloading Form 106…');
    const doc = await israelTaxAuthorityProvider.downloadDocument(page, { taxYear });

    const outPath = new URL(`./${doc.filename}`, import.meta.url).pathname;
    await writeFile(outPath, doc.buffer);
    console.log(`saved ${doc.buffer.length} bytes to ${outPath}`);
  } finally {
    await browser?.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error('smoke test failed:', err);
  process.exit(1);
});

import type { Page } from 'playwright';
import { OtpRejectedError, type DocumentFetchProvider, type FetchedDocument } from './types.js';

// A minimal but valid single-page PDF, so delivery (blob upload, WhatsApp media)
// exercises a real file without touching the tax authority.
const MOCK_PDF = Buffer.from(
  '255044462d312e340a25c7ec8f0a312030206f626a0a3c3c2f547970652f436174616c6f672f50616765732032203020523e3e0a656e646f626a0a322030206f626a0a3c3c2f547970652f50616765732f4b6964735b33203020525d2f436f756e7420313e3e0a656e646f626a0a332030206f626a0a3c3c2f547970652f506167652f506172656e742032203020522f4d65646961426f785b30203020323030203230305d3e3e0a656e646f626a0a787265660a3020340a303030303030303030302036353533352066200a30303030303030303039203030303030206e200a30303030303030303538203030303030206e200a30303030303030313135203030303030206e200a747261696c65720a3c3c2f526f6f742031203020522f53697a6520343e3e0a7374617274787265660a3138320a2525454f46',
  'hex',
);

/**
 * No-browser stand-in for iterating on the whole flow without SMSing a real
 * citizen. Enabled by TAX_FETCH_MOCK=true. Accepts any 6-digit OTP; anything
 * else is rejected like a wrong code so the retry path can be tested.
 */
export const mockProvider: DocumentFetchProvider = {
  id: 'israel_tax_authority',

  async startLogin(_page: Page): Promise<void> {
    await sleep(2000);
  },

  async submitOtp(_page: Page, otp: string): Promise<void> {
    await sleep(500);
    if (!/^\d{6}$/.test(otp.trim())) throw new OtpRejectedError();
  },

  async downloadDocument(_page: Page, opts: { taxYear: number }): Promise<FetchedDocument> {
    await sleep(500);
    return { buffer: MOCK_PDF, filename: `form_106_${opts.taxYear}.pdf`, contentType: 'application/pdf' };
  },
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

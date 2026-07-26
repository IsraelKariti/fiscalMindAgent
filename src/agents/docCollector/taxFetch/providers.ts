import * as clientPortalCredentials from '../../../db/queries/clientPortalCredentials.js';
import type { ClientRow } from '../../../db/types.js';
import type { FetchedDocument, PortalCredentials } from './types.js';

/**
 * Worker-side description of a portal the platform can fetch documents from.
 * Everything provider-specific that the generic session machinery (runner.ts,
 * deliver.ts) needs lives here: how to assemble the login credentials, the
 * canned Hebrew progress lines, and the delivery wording/labels. The browser
 * steps themselves live in the runner sidecar's provider of the same id
 * (src/browserRunner/).
 */
export interface FetchProviderSpec {
  /** Matches client_portal_credentials.provider, tax_fetch_sessions.provider and the runner-side provider id. */
  id: string;
  /** Site name as client-facing Hebrew texts spell it. */
  siteNameHe: string;
  /** Short Hebrew name of what this fetch pulls, for the LLM prompt. */
  documentDescriptionHe: string;
  /** Where the site sends its one-time code — email (tax authority) or SMS. */
  otpChannel: 'email' | 'sms';
  /**
   * True when a required-document row's name marks it as the document this
   * provider fetches (the tax authority: a Form 106; Altshuler: the annual
   * pension report). A pending match is what makes the fetch offerable.
   */
  matchesRequiredDocument(doc: { name: string }): boolean;
  /**
   * Gathers what the runner needs to log in for this client. Null when a
   * required value is missing — the fetch then fails before touching the site.
   */
  buildCredentials(client: ClientRow): Promise<PortalCredentials | null>;
  /** Canned Hebrew progress lines the system sends directly (no LLM) as the fetch moves. */
  messages: {
    loginFailed: string;
    busy: string;
    otpExpired: string;
    otpRejected: string;
    otpGaveUp: string;
    downloadFailed: string;
  };
  /** Client-facing wording for a successful delivery. */
  delivery: {
    /** WhatsApp confirmation line — what was fetched and where the copies went. */
    waConfirmation(docs: FetchedDocument[], canEmail: boolean): string;
    emailSubject(docs: FetchedDocument[], taxYear: number): string;
    /** Body lines after the greeting (deliver.ts adds 'שלום,' and joins). */
    emailBodyLines(docs: FetchedDocument[], taxYear: number): string[];
    /** document_files.label for a fetched doc, or null for no label. */
    fileLabel(doc: FetchedDocument, taxYear: number): string | null;
  };
}

/** The real per-employer forms, excluding the ride-along salary summary. */
const form106sOf = (docs: FetchedDocument[]): FetchedDocument[] => docs.filter((d) => d.kind !== 'salary_summary');
const summaryOf = (docs: FetchedDocument[]): FetchedDocument | undefined =>
  docs.find((d) => d.kind === 'salary_summary');

/**
 * What the client is told was fetched: the 106 count reflects only the real
 * per-employer forms — the salary summary is named separately, never counted
 * as if it were another employer's 106.
 */
function taxAuthorityFetchedWhat(docs: FetchedDocument[]): string {
  const forms = form106sOf(docs);
  const summaryDoc = summaryOf(docs);
  return forms.length === 0
    ? 'את ריכוז נתוני השכר השנתי שלך'
    : (forms.length === 1 ? 'את טופס ה-106 שלך' : `${forms.length} טפסי 106 שלך (אחד מכל מעסיק)`) +
        (summaryDoc ? ' יחד עם ריכוז נתוני השכר השנתי' : '');
}

const israelTaxAuthoritySpec: FetchProviderSpec = {
  id: 'israel_tax_authority',
  siteNameHe: 'רשות המסים',
  documentDescriptionHe: 'טופס 106 (טופס אחד מכל מעסיק אם יש כמה)',
  otpChannel: 'email',

  matchesRequiredDocument(doc: { name: string }): boolean {
    return /106/.test(doc.name);
  },

  async buildCredentials(client: ClientRow): Promise<PortalCredentials | null> {
    const creds = await clientPortalCredentials.getForClient(client.id, 'israel_tax_authority');
    if (!creds) return null;
    return { idNumber: creds.id_number, userCode: creds.user_code };
  },

  messages: {
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר רשות המסים כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת באימייל מרשות המסים.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הטופס כרגע. נוכל לנסות שוב מאוחר יותר.',
  },

  delivery: {
    waConfirmation(docs: FetchedDocument[], canEmail: boolean): string {
      const single = docs.length === 1;
      const fetchedWhat = taxAuthorityFetchedWhat(docs);
      return canEmail
        ? `הצלחתי למשוך ${fetchedWhat} מרשות המסים 🎉 ${single ? 'שלחתי לך עותק למייל.' : 'שלחתי לך עותקים למייל.'}`
        : `הצלחתי למשוך ${fetchedWhat} מרשות המסים 🎉 ${single ? 'המסמך נשמר והועבר לרואה החשבון.' : 'המסמכים נשמרו והועברו לרואה החשבון.'}`;
    },

    emailSubject(docs: FetchedDocument[], taxYear: number): string {
      return form106sOf(docs).length > 1 ? `טפסי 106 לשנת ${taxYear}` : `טופס 106 לשנת ${taxYear}`;
    },

    emailBodyLines(docs: FetchedDocument[], taxYear: number): string[] {
      const forms = form106sOf(docs);
      const summaryDoc = summaryOf(docs);
      const employerLines = forms.filter((d) => d.employerName).map((d) => `• ${d.employerName}`);
      return [
        forms.length === 0
          ? `מצורף ריכוז נתוני השכר שלך לשנת ${taxYear}, שנמשך עבורך מרשות המסים.`
          : forms.length === 1
            ? `מצורף טופס ה-106 שלך לשנת ${taxYear}, שנמשך עבורך מרשות המסים.`
            : `מצורפים ${forms.length} טפסי ה-106 שלך לשנת ${taxYear}, שנמשכו עבורך מרשות המסים — טופס אחד מכל מעסיק:`,
        ...(forms.length > 1 && employerLines.length > 0 ? ['', ...employerLines] : []),
        ...(summaryDoc && forms.length > 0
          ? ['', `מצורף גם ריכוז נתוני השכר מכלל המעסיקים לשנת ${taxYear} — סיכום עזר שמופק באזור האישי של רשות המסים.`]
          : []),
      ];
    },

    fileLabel(doc: FetchedDocument, taxYear: number): string | null {
      if (doc.kind === 'salary_summary') return `ריכוז נתוני שכר מכלל המעסיקים ${taxYear}`;
      return doc.employerName ? `טופס 106 — ${doc.employerName}` : null;
    },
  },
};

/**
 * Altshuler Shaham (בית השקעות) — pulls a client's previous-year short annual
 * pension report + tax certificates (דוח שנתי מקוצר ואישורי מס). One document
 * per fetch; the site sends its OTP by SMS.
 */
const altshulerShahamSpec: FetchProviderSpec = {
  id: 'altshuler_shaham',
  siteNameHe: 'אלטשולר שחם',
  documentDescriptionHe: 'הדוח השנתי המקוצר ואישורי המס',
  otpChannel: 'sms',

  matchesRequiredDocument(doc: { name: string }): boolean {
    return /אלטשולר/.test(doc.name);
  },

  async buildCredentials(client: ClientRow): Promise<PortalCredentials | null> {
    // The login needs a national ID and the client's phone. The ID comes from a
    // portal-credentials row; fall back to the tax-authority row's id_number
    // (same person, same ת"ז) so a client already set up for the 106 fetch needs
    // no new credential. The phone is the client's own WhatsApp number.
    const own = await clientPortalCredentials.getForClient(client.id, 'altshuler_shaham');
    const idNumber = own?.id_number ?? (await clientPortalCredentials.getForClient(client.id, 'israel_tax_authority'))?.id_number;
    if (!idNumber || !client.wa_phone) return null;
    return { idNumber, phoneNumber: client.wa_phone };
  },

  messages: {
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר אלטשולר שחם כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת ב-SMS מאלטשולר שחם.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הדוח כרגע. נוכל לנסות שוב מאוחר יותר.',
  },

  delivery: {
    waConfirmation(_docs: FetchedDocument[], canEmail: boolean): string {
      return canEmail
        ? 'הצלחתי למשוך את הדוח השנתי ואישורי המס שלך מאלטשולר שחם 🎉 שלחתי לך עותק למייל.'
        : 'הצלחתי למשוך את הדוח השנתי ואישורי המס שלך מאלטשולר שחם 🎉 המסמך נשמר והועבר לרואה החשבון.';
    },

    emailSubject(_docs: FetchedDocument[], taxYear: number): string {
      return `דוח שנתי ואישורי מס - אלטשולר שחם - ${taxYear}`;
    },

    emailBodyLines(_docs: FetchedDocument[], taxYear: number): string[] {
      return [`מצורף הדוח השנתי המקוצר ואישורי המס שלך לשנת ${taxYear}, שנמשכו עבורך מאלטשולר שחם.`];
    },

    fileLabel(_doc: FetchedDocument, taxYear: number): string | null {
      return `דוח שנתי מקוצר ואישורי מס — אלטשולר שחם ${taxYear}`;
    },
  },
};

const SPECS: Record<string, FetchProviderSpec> = {
  [israelTaxAuthoritySpec.id]: israelTaxAuthoritySpec,
  [altshulerShahamSpec.id]: altshulerShahamSpec,
};

/** Looks up a provider spec; throws on an id the worker doesn't know (bad row / version skew). */
export function getProviderSpec(providerId: string): FetchProviderSpec {
  const spec = SPECS[providerId];
  if (!spec) throw new Error(`unknown document-fetch provider: ${providerId}`);
  return spec;
}

/** Every registered provider, in a stable order — the offer/prompt layer iterates these. */
export function listProviderSpecs(): FetchProviderSpec[] {
  return Object.values(SPECS);
}

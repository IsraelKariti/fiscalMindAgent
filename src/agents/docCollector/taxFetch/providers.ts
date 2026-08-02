import * as clientPortalCredentials from '../../../db/queries/clientPortalCredentials.js';
import type { ClientRow } from '../../../db/types.js';
import type { FetchedDocument, PortalCredentials } from './types.js';

/**
 * One kind of document a provider can fetch — the unit of both consent and
 * checklist-matching. A provider may offer several (Altshuler: pension + study
 * fund, fetched in one login); the tax authority offers exactly one. `key` is
 * stored in tax_fetch_sessions.document_keys and passed to the runner to select
 * what to download.
 */
export interface FetchDocumentType {
  /** Stable id: session.document_keys entries, the runner's download selector, and (usually) FetchedDocument.kind. */
  key: string;
  /** Short Hebrew name of this document, for the LLM prompt. */
  documentDescriptionHe: string;
  /** True when a required-document row's name marks it as this document (what makes this type offerable). */
  matchesRequiredDocument(doc: { name: string }): boolean;
  /** Which downloaded files count toward this type's checklist item. Defaults to `doc.kind === key`. */
  ownsFetchedDocument?(doc: FetchedDocument): boolean;
}

/**
 * Worker-side description of a portal the platform can fetch documents from.
 * Everything provider-specific that the generic session machinery (runner.ts,
 * deliver.ts) needs lives here: the fetchable document types, login credentials,
 * canned Hebrew progress lines, and delivery wording/labels. The browser steps
 * live in the runner sidecar's provider of the same id (src/browserRunner/).
 */
export interface FetchProviderSpec {
  /** Matches client_portal_credentials.provider, tax_fetch_sessions.provider and the runner-side provider id. */
  id: string;
  /** Site name as client-facing Hebrew texts spell it. */
  siteNameHe: string;
  /** Where the site sends its one-time code — email (tax authority) or SMS. */
  otpChannel: 'email' | 'sms';
  /** The document types this provider can fetch (one login can produce several). */
  documents: FetchDocumentType[];
  /**
   * Gathers what the runner needs to log in for this client. Null when a
   * required value is missing — the fetch then fails before touching the site.
   */
  buildCredentials(client: ClientRow): Promise<PortalCredentials | null>;
  /** Canned Hebrew progress lines the system sends directly (no LLM) as the fetch moves. */
  messages: {
    /** Sent the moment the login submit fired the real OTP — the code lives ~4 minutes, so this must land instantly. */
    otpSent: string;
    loginFailed: string;
    busy: string;
    otpExpired: string;
    otpRejected: string;
    otpGaveUp: string;
    downloadFailed: string;
    /** Login worked but the site listed no matching documents for the year — a retry won't help (NoDocumentsOnSiteError). */
    noDocumentsOnSite: string;
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

/** Does this fetched file count toward the given document type's checklist item? */
export function typeOwnsFetched(type: FetchDocumentType, doc: FetchedDocument): boolean {
  return type.ownsFetchedDocument ? type.ownsFetchedDocument(doc) : doc.kind === type.key;
}

// ── Israel Tax Authority ────────────────────────────────────────────────────

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
  otpChannel: 'email',

  documents: [
    {
      key: 'form106',
      documentDescriptionHe: 'טופס 106 (טופס אחד מכל מעסיק אם יש כמה)',
      matchesRequiredDocument: (doc) => /106/.test(doc.name),
      // One login yields every employer's 106 plus the salary summary; all of
      // them satisfy the single 106 checklist item.
      ownsFetchedDocument: () => true,
    },
  ],

  async buildCredentials(client: ClientRow): Promise<PortalCredentials | null> {
    const creds = await clientPortalCredentials.getForClient(client.id, 'israel_tax_authority');
    if (!creds) return null;
    return { idNumber: creds.id_number, userCode: creds.user_code };
  },

  messages: {
    otpSent: 'הקוד נשלח אליך הרגע מרשות המסים לתיבת האימייל שלך 📧 הוא תקף לדקות ספורות — אנא שלח/י לי אותו כאן ברגע שהוא מגיע.',
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר רשות המסים כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת באימייל מרשות המסים.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הטופס כרגע. נוכל לנסות שוב מאוחר יותר.',
    noDocumentsOnSite:
      'הזדהיתי בהצלחה באתר רשות המסים, אך לא נמצאו שם טפסים זמינים לשנה המבוקשת. ייתכן שהטופס טרם פורסם באתר — נבדוק את זה מול המשרד ונעדכן אותך.',
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

// ── Altshuler Shaham ────────────────────────────────────────────────────────

/** Human product noun per Altshuler document kind, for delivery wording. */
function altshulerProductNoun(kind: string | null | undefined): string {
  return kind === 'study_fund_annual' ? 'קרן ההשתלמות' : 'הפנסיה';
}

/** Joins Hebrew product nouns with the right conjunction ("א' ו-ב'"). */
function joinHe(items: string[]): string {
  if (items.length <= 1) return items[0] ?? '';
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`;
}

/**
 * Altshuler Shaham (בית השקעות). One SMS-OTP login can pull the previous year's
 * short annual report + tax certificates for the client's pension (פנסיה tab)
 * and/or study fund (קרן השתלמות, גמל tab) — whichever the client agreed to.
 * The two reports share an identical filename on the site, so they are told
 * apart only by which product they were fetched under (the kind).
 */
const altshulerShahamSpec: FetchProviderSpec = {
  id: 'altshuler_shaham',
  siteNameHe: 'אלטשולר שחם',
  otpChannel: 'sms',

  documents: [
    {
      key: 'pension_annual',
      documentDescriptionHe: 'דוח שנתי ואישורי מס — פנסיה',
      // Both names carry "אלטשולר"; the study fund adds "קרן השתלמות", so the
      // pension is an Altshuler doc that is NOT the study fund.
      matchesRequiredDocument: (doc) => /אלטשולר/.test(doc.name) && !/השתלמות/.test(doc.name),
    },
    {
      key: 'study_fund_annual',
      documentDescriptionHe: 'דוח שנתי ואישורי מס — קרן השתלמות',
      matchesRequiredDocument: (doc) => /השתלמות/.test(doc.name) && /אלטשולר/.test(doc.name),
    },
  ],

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
    otpSent: 'הקוד נשלח אליך הרגע מאלטשולר שחם ב-SMS 📱 הוא תקף לדקות ספורות — אנא שלח/י לי אותו כאן ברגע שהוא מגיע.',
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר אלטשולר שחם כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת ב-SMS מאלטשולר שחם.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הדוח כרגע. נוכל לנסות שוב מאוחר יותר.',
    noDocumentsOnSite:
      'הזדהיתי בהצלחה באתר אלטשולר שחם, אך לא נמצאו שם דוחות לשנה המבוקשת. ייתכן שהדוח טרם פורסם או שהחשבון מתנהל בחברה אחרת — נבדוק את זה מול המשרד ונעדכן אותך.',
  },

  delivery: {
    waConfirmation(docs: FetchedDocument[], canEmail: boolean): string {
      const products = joinHe(docs.map((d) => altshulerProductNoun(d.kind)));
      const single = docs.length === 1;
      const tail = canEmail
        ? single
          ? 'שלחתי לך עותק למייל.'
          : 'שלחתי לך עותקים למייל.'
        : single
          ? 'המסמך נשמר והועבר לרואה החשבון.'
          : 'המסמכים נשמרו והועברו לרואה החשבון.';
      return `הצלחתי למשוך את הדוח השנתי ואישורי המס של ${products} שלך מאלטשולר שחם 🎉 ${tail}`;
    },

    emailSubject(docs: FetchedDocument[], taxYear: number): string {
      const products = joinHe(docs.map((d) => (d.kind === 'study_fund_annual' ? 'קרן השתלמות' : 'פנסיה')));
      return `דוח שנתי ואישורי מס (${products}) - אלטשולר שחם - ${taxYear}`;
    },

    emailBodyLines(docs: FetchedDocument[], taxYear: number): string[] {
      return [
        `מצורפים הדוחות השנתיים ואישורי המס שלך לשנת ${taxYear}, שנמשכו עבורך מאלטשולר שחם:`,
        '',
        ...docs.map((d) => `• דוח שנתי ואישורי מס — ${d.kind === 'study_fund_annual' ? 'קרן השתלמות' : 'פנסיה'}`),
      ];
    },

    fileLabel(doc: FetchedDocument, taxYear: number): string | null {
      const product = doc.kind === 'study_fund_annual' ? 'קרן השתלמות' : 'פנסיה';
      return `דוח שנתי ואישורי מס — ${product} — אלטשולר שחם ${taxYear}`;
    },
  },
};

// ── Harel ───────────────────────────────────────────────────────────────────

/** A fetched Harel doc's display name: the on-site row title, else a generic noun. */
function harelDocName(doc: FetchedDocument): string {
  return doc.title ?? 'דוח שנתי — קרן השתלמות';
}

/**
 * Harel (הראל ביטוח ופיננסים). One SMS-OTP login pulls the previous year's
 * annual documents for EVERY study fund the client holds there (the personal
 * area's דוחות תקופתיים list filtered to תחום גמל והשתלמות + שנתי + the year) —
 * a client can hold several funds/accounts and Harel names the report documents
 * freely (דוח תקופתי מקוצר / דוחות תקופתיים / אישור מס דוח שנתי מקוצר…, verified
 * live 2026-07-27), so the runner downloads the whole filtered list and each
 * file carries its on-site row title (doc type + account), never a hardcoded
 * document name.
 */
const harelSpec: FetchProviderSpec = {
  id: 'harel',
  siteNameHe: 'הראל',
  otpChannel: 'sms',

  documents: [
    {
      key: 'study_fund_annual',
      documentDescriptionHe: 'דוח שנתי ואישורי מס — קרן השתלמות (כל הדוחות אם יש כמה קרנות)',
      matchesRequiredDocument: (doc) => /השתלמות/.test(doc.name) && /הראל/.test(doc.name),
      // One login yields a report per fund; all of them satisfy the single
      // study-fund checklist item.
      ownsFetchedDocument: () => true,
    },
  ],

  async buildCredentials(client: ClientRow): Promise<PortalCredentials | null> {
    // The login needs a national ID and the client's phone. The ID comes from a
    // portal-credentials row; fall back to the tax-authority row's id_number
    // (same person, same ת"ז) so a client already set up for the 106 fetch needs
    // no new credential. The phone is the client's own WhatsApp number.
    const own = await clientPortalCredentials.getForClient(client.id, 'harel');
    const idNumber = own?.id_number ?? (await clientPortalCredentials.getForClient(client.id, 'israel_tax_authority'))?.id_number;
    if (!idNumber || !client.wa_phone) return null;
    return { idNumber, phoneNumber: client.wa_phone };
  },

  messages: {
    otpSent: 'הקוד נשלח אליך הרגע מהראל ב-SMS 📱 הוא תקף לדקות ספורות — אנא שלח/י לי אותו כאן ברגע שהוא מגיע.',
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר הראל כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת ב-SMS מהראל.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הדוח כרגע. נוכל לנסות שוב מאוחר יותר.',
    noDocumentsOnSite:
      'הזדהיתי בהצלחה באתר הראל, אך לא נמצאו שם דוחות קרן השתלמות לשנה המבוקשת. ייתכן שהדוח טרם פורסם או שהקרן מתנהלת בחברה אחרת — נבדוק את זה מול המשרד ונעדכן אותך.',
  },

  delivery: {
    waConfirmation(docs: FetchedDocument[], canEmail: boolean): string {
      const single = docs.length === 1;
      const fetchedWhat = single
        ? 'את הדוח השנתי של קרן ההשתלמות שלך'
        : `${docs.length} דוחות שנתיים של קרנות ההשתלמות שלך`;
      const tail = canEmail
        ? single
          ? 'שלחתי לך עותק למייל.'
          : 'שלחתי לך עותקים למייל.'
        : single
          ? 'המסמך נשמר והועבר לרואה החשבון.'
          : 'המסמכים נשמרו והועברו לרואה החשבון.';
      return `הצלחתי למשוך ${fetchedWhat} מהראל 🎉 ${tail}`;
    },

    emailSubject(docs: FetchedDocument[], taxYear: number): string {
      return docs.length > 1
        ? `דוחות שנתיים קרנות השתלמות - הראל - ${taxYear}`
        : `דוח שנתי קרן השתלמות - הראל - ${taxYear}`;
    },

    emailBodyLines(docs: FetchedDocument[], taxYear: number): string[] {
      return [
        docs.length === 1
          ? `מצורף הדוח השנתי של קרן ההשתלמות שלך לשנת ${taxYear}, שנמשך עבורך מהראל.`
          : `מצורפים ${docs.length} הדוחות השנתיים של קרנות ההשתלמות שלך לשנת ${taxYear}, שנמשכו עבורך מהראל:`,
        ...(docs.length > 1 ? ['', ...docs.map((d) => `• ${harelDocName(d)}`)] : []),
      ];
    },

    fileLabel(doc: FetchedDocument, taxYear: number): string | null {
      return `${harelDocName(doc)} — הראל ${taxYear}`;
    },
  },
};

const SPECS: Record<string, FetchProviderSpec> = {
  [israelTaxAuthoritySpec.id]: israelTaxAuthoritySpec,
  [altshulerShahamSpec.id]: altshulerShahamSpec,
  [harelSpec.id]: harelSpec,
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

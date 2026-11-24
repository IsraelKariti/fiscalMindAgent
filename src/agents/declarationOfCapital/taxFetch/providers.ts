import * as clientPortalCredentials from '../../../db/queries/clientPortalCredentials.js';
import type { ClientRow } from '../../../db/types.js';
import { clientIdNumber } from './clientId.js';
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
  /**
   * The catalog type (declarationOfCapital/catalog.ts key) this document stands
   * for. Only read for a provider that takes every document it finds
   * (`takesAllDocuments`): a fetched kind with no row of this type that names
   * the provider creates its own row at delivery (openspec `phoenix-fetch`).
   */
  catalogTypeKey?: string;
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
   * The fetch always takes every document type the site holds for the year,
   * whatever the checklist expects (openspec `phoenix-fetch`): the client's
   * consent is to the fetch itself, per-document consent is ignored, and a
   * kind with no row on the list gets one created at delivery. Default false:
   * per-document consent as for Altshuler Shaham.
   */
  takesAllDocuments?: boolean;
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
    /**
     * WhatsApp confirmation line — what was fetched and where the copies went.
     * `createdKinds` names the document kinds the delivery added to the list
     * because the site held them and the list did not (takesAllDocuments
     * providers only; empty otherwise) — the client is told after the fact.
     */
    waConfirmation(docs: FetchedDocument[], canEmail: boolean, createdKinds?: string[]): string;
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
    // The login needs a national ID and the client's phone (the WhatsApp
    // number). The ID comes from clientIdNumber's shared order: own
    // credentials row → tax-authority row → the id the kickoff stored from
    // the CRM card (openspec `document-fetch`).
    const idNumber = (await clientIdNumber(client, 'altshuler_shaham'))?.id;
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

/** A required-document name that mentions Harel. */
const HAREL_NAME = /הראל/;

/** Human product noun per Harel document kind, for delivery wording. */
function harelProductNoun(kind: string | null | undefined): string {
  return kind === 'pension_annual' ? 'הפנסיה' : 'קרן ההשתלמות';
}

/** The distinct products in a delivery, joined for Hebrew prose ("הפנסיה וקרן ההשתלמות"). */
function harelProducts(docs: FetchedDocument[]): string {
  return joinHe([...new Set(docs.map((d) => harelProductNoun(d.kind)))]);
}

/** A fetched Harel doc's display name: the on-site row title, else a generic noun of its product. */
function harelDocName(doc: FetchedDocument): string {
  return doc.title ?? `דוח שנתי — ${harelProductNoun(doc.kind)}`;
}

/**
 * Harel (הראל ביטוח ופיננסים). One email-OTP login pulls the tax year's annual
 * documents for EVERY study fund and pension the client holds there — the
 * personal area's דוחות תקופתיים list filtered per תחום (גמל והשתלמות, then
 * פנסיה) + שנתי + the year, both rounds in the same session (openspec
 * `harel-fetch`). A client can hold several funds/accounts and Harel names
 * the report documents freely (דוח תקופתי מקוצר / דוחות תקופתיים / אישור מס דוח
 * שנתי מקוצר…, verified live 2026-07-27), so the runner downloads each whole
 * filtered list and each file carries its on-site row title (doc type +
 * account), never a hardcoded document name. Like Phoenix, the fetch brings
 * everything it finds: a kind the list lacks gets its own row at delivery.
 */
const harelSpec: FetchProviderSpec = {
  id: 'harel',
  siteNameHe: 'הראל',
  // The login modal offers נייד/SMS (its default) or מייל; the runner selects
  // מייל, so the code goes to the address Harel holds for that ת"ז.
  otpChannel: 'email',
  takesAllDocuments: true,

  documents: [
    {
      key: 'pension_annual',
      documentDescriptionHe: 'דוח שנתי ואישורי מס — פנסיה / קופת גמל (כל הדוחות אם יש כמה)',
      matchesRequiredDocument: (doc) => HAREL_NAME.test(doc.name) && /פנסיה|גמל/.test(doc.name) && !/השתלמות/.test(doc.name),
      catalogTypeKey: 'pension_provident',
    },
    {
      key: 'study_fund_annual',
      documentDescriptionHe: 'דוח שנתי ואישורי מס — קרן השתלמות (כל הדוחות אם יש כמה קרנות)',
      matchesRequiredDocument: (doc) => HAREL_NAME.test(doc.name) && /השתלמות/.test(doc.name),
      catalogTypeKey: 'study_fund',
    },
  ],

  async buildCredentials(client: ClientRow): Promise<PortalCredentials | null> {
    // The login needs a national ID and the client's phone (the WhatsApp
    // number). The ID comes from clientIdNumber's shared order: own
    // credentials row → tax-authority row → the id the kickoff stored from
    // the CRM card (openspec `document-fetch`).
    const idNumber = (await clientIdNumber(client, 'harel'))?.id;
    if (!idNumber || !client.wa_phone) return null;
    return { idNumber, phoneNumber: client.wa_phone };
  },

  messages: {
    otpSent: 'הקוד נשלח אליך הרגע מהראל לתיבת האימייל שלך 📧 הוא תקף לדקות ספורות — אנא שלח/י לי אותו כאן ברגע שהוא מגיע.',
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר הראל כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת באימייל מהראל.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הדוח כרגע. נוכל לנסות שוב מאוחר יותר.',
    noDocumentsOnSite:
      'הזדהיתי בהצלחה באתר הראל, אך לא נמצאו שם דוחות פנסיה או קרן השתלמות לשנה המבוקשת. ייתכן שהדוח טרם פורסם או שהחיסכון מתנהל בחברה אחרת — נבדוק את זה מול המשרד ונעדכן אותך.',
  },

  delivery: {
    waConfirmation(docs: FetchedDocument[], canEmail: boolean, createdKinds: string[] = []): string {
      const single = docs.length === 1;
      const fetchedWhat = single
        ? `את הדוח השנתי של ${harelProducts(docs)} שלך`
        : `${docs.length} דוחות שנתיים של ${harelProducts(docs)} שלך`;
      const tail = canEmail
        ? single
          ? 'שלחתי לך עותק למייל.'
          : 'שלחתי לך עותקים למייל.'
        : single
          ? 'המסמך נשמר והועבר לרואה החשבון.'
          : 'המסמכים נשמרו והועברו לרואה החשבון.';
      // A kind the list did not expect: told after the fact (openspec `harel-fetch`).
      const alsoFound = createdKinds.map(
        (kind) => ` מצאתי שם גם את ${harelProductNoun(kind)} שלך — הוספתי אותה לרשימת המסמכים.`,
      );
      return `הצלחתי למשוך ${fetchedWhat} מהראל 🎉${alsoFound.join('')} ${tail}`;
    },

    emailSubject(docs: FetchedDocument[], taxYear: number): string {
      return docs.length > 1
        ? `דוחות שנתיים ${harelProducts(docs)} - הראל - ${taxYear}`
        : `דוח שנתי ${harelProducts(docs)} - הראל - ${taxYear}`;
    },

    emailBodyLines(docs: FetchedDocument[], taxYear: number): string[] {
      return [
        docs.length === 1
          ? `מצורף הדוח השנתי של ${harelProducts(docs)} שלך לשנת ${taxYear}, שנמשך עבורך מהראל.`
          : `מצורפים ${docs.length} הדוחות השנתיים של ${harelProducts(docs)} שלך לשנת ${taxYear}, שנמשכו עבורך מהראל:`,
        ...(docs.length > 1 ? ['', ...docs.map((d) => `• ${harelDocName(d)} — ${harelProductNoun(d.kind)}`)] : []),
      ];
    },

    fileLabel(doc: FetchedDocument, taxYear: number): string | null {
      return `${harelDocName(doc)} — הראל ${taxYear}`;
    },
  },
};

// ── Phoenix ─────────────────────────────────────────────────────────────────

/** A required-document name that mentions Phoenix (any spelling the catalog or the planner uses). */
const PHOENIX_NAME = /פניקס|phoenix/i;

/** Human product noun per Phoenix document kind, for delivery wording. */
function phoenixProductNoun(kind: string | null | undefined): string {
  return kind === 'study_fund_annual' ? 'קרן ההשתלמות' : 'הפנסיה';
}

/** The product nouns of a delivery, each once, in document order. */
function phoenixProducts(docs: FetchedDocument[]): string {
  return joinHe([...new Set(docs.map((d) => phoenixProductNoun(d.kind)))]);
}

/**
 * Phoenix (הפניקס). One SMS-OTP login pulls the tax year's annual documents
 * for the client's pension (rows under תחום חיים/פנסיה) and/or study fund
 * (rows under גמל והשתלמות) — whichever the client agreed to. The runner walks
 * every page of the personal area's reports list and takes the rows whose
 * NAME carries the tax year and is not a quarterly report (openspec
 * `phoenix-fetch`); a client can hold several policies with the same report
 * name, so each file carries its on-site row title.
 */
const phoenixSpec: FetchProviderSpec = {
  id: 'phoenix',
  siteNameHe: 'הפניקס',
  otpChannel: 'sms',
  // The owner's rule (2026-11-24): the walk takes both kinds whatever the list
  // holds, and a kind the list lacks gets its row at delivery.
  takesAllDocuments: true,

  documents: [
    {
      key: 'pension_annual',
      documentDescriptionHe: 'דוח שנתי ואישורי מס — פנסיה / קופת גמל (כל הדוחות השנתיים אם יש כמה)',
      matchesRequiredDocument: (doc) => PHOENIX_NAME.test(doc.name) && /פנסיה|גמל/.test(doc.name) && !/השתלמות/.test(doc.name),
      catalogTypeKey: 'pension_provident',
    },
    {
      key: 'study_fund_annual',
      documentDescriptionHe: 'דוח שנתי ואישורי מס — קרן השתלמות (כל הדוחות השנתיים אם יש כמה)',
      matchesRequiredDocument: (doc) => PHOENIX_NAME.test(doc.name) && /השתלמות/.test(doc.name),
      catalogTypeKey: 'study_fund',
    },
  ],

  async buildCredentials(client: ClientRow): Promise<PortalCredentials | null> {
    // National id from clientIdNumber's shared order (own credentials row →
    // tax-authority row → the id the kickoff stored from the CRM card) plus the
    // WhatsApp number the site sends the SMS code to.
    const idNumber = (await clientIdNumber(client, 'phoenix'))?.id;
    if (!idNumber || !client.wa_phone) return null;
    return { idNumber, phoneNumber: client.wa_phone };
  },

  messages: {
    otpSent: 'הקוד נשלח אליך הרגע מהפניקס ב-SMS 📱 הוא תקף לדקות ספורות — אנא שלח/י לי אותו כאן ברגע שהוא מגיע.',
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר הפניקס כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת ב-SMS מהפניקס.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הדוח כרגע. נוכל לנסות שוב מאוחר יותר.',
    noDocumentsOnSite:
      'הזדהיתי בהצלחה באתר הפניקס, אך לא נמצאו שם דוחות שנתיים לשנה המבוקשת. ייתכן שהדוח טרם פורסם או שהחשבון מתנהל בחברה אחרת — נבדוק את זה מול המשרד ונעדכן אותך.',
  },

  delivery: {
    waConfirmation(docs: FetchedDocument[], canEmail: boolean, createdKinds: string[] = []): string {
      const single = docs.length === 1;
      const fetchedWhat = single
        ? `את הדוח השנתי של ${phoenixProducts(docs)} שלך`
        : `${docs.length} דוחות שנתיים של ${phoenixProducts(docs)} שלך`;
      const tail = canEmail
        ? single
          ? 'שלחתי לך עותק למייל.'
          : 'שלחתי לך עותקים למייל.'
        : single
          ? 'המסמך נשמר והועבר לרואה החשבון.'
          : 'המסמכים נשמרו והועברו לרואה החשבון.';
      // A kind the list did not expect: told after the fact (openspec `phoenix-fetch`).
      const alsoFound = createdKinds.map(
        (kind) => ` מצאתי שם גם את ${phoenixProductNoun(kind)} שלך — הוספתי אותה לרשימת המסמכים.`,
      );
      return `הצלחתי למשוך ${fetchedWhat} מהפניקס 🎉 ${tail}${alsoFound.join('')}`;
    },

    emailSubject(docs: FetchedDocument[], taxYear: number): string {
      const products = joinHe([...new Set(docs.map((d) => (d.kind === 'study_fund_annual' ? 'קרן השתלמות' : 'פנסיה')))]);
      return docs.length > 1
        ? `דוחות שנתיים ואישורי מס (${products}) - הפניקס - ${taxYear}`
        : `דוח שנתי ואישורי מס (${products}) - הפניקס - ${taxYear}`;
    },

    emailBodyLines(docs: FetchedDocument[], taxYear: number): string[] {
      return [
        docs.length === 1
          ? `מצורף הדוח השנתי של ${phoenixProducts(docs)} שלך לשנת ${taxYear}, שנמשך עבורך מהפניקס.`
          : `מצורפים ${docs.length} הדוחות השנתיים של ${phoenixProducts(docs)} שלך לשנת ${taxYear}, שנמשכו עבורך מהפניקס:`,
        ...(docs.length > 1 ? ['', ...docs.map((d) => `• ${d.title ?? 'דוח שנתי'} — ${phoenixProductNoun(d.kind)}`)] : []),
      ];
    },

    fileLabel(doc: FetchedDocument, taxYear: number): string | null {
      return `${doc.title ?? 'דוח שנתי'} — הפניקס ${taxYear}`;
    },
  },
};

// ── Migdal ──────────────────────────────────────────────────────────────────

/** A required-document name that mentions Migdal (the insurer, מקפת the pension/provident arm, or the Latin name). */
const MIGDAL_NAME = /מגדל|מקפת|migdal/i;

/** Human product noun per Migdal document kind, for delivery wording. */
function migdalProductNoun(kind: string | null | undefined): string {
  return kind === 'study_fund_annual' ? 'קרן ההשתלמות' : 'הפנסיה';
}

/** The product nouns of a delivery, each once, in document order. */
function migdalProducts(docs: FetchedDocument[]): string {
  return joinHe([...new Set(docs.map((d) => migdalProductNoun(d.kind)))]);
}

/**
 * Migdal (מגדל). One SMS-OTP login with the client's national id only — the
 * site sends the code to the mobile number it holds for that id, so no phone
 * is sent. The runner runs four filter rounds on "הדוחות והאישורים שלי": the
 * full annual report ("דוח שנתי") and the short one ("דוח שנתי מקוצר"), each
 * for פנסיה and for השתלמות (openspec `migdal-fetch`); both reports of a
 * product carry the same kind and attach to the same checklist row, titled by
 * their on-site row title.
 */
const migdalSpec: FetchProviderSpec = {
  id: 'migdal',
  siteNameHe: 'מגדל',
  otpChannel: 'sms',
  // Same consent rule as Harel/Phoenix: both products are always searched and
  // a kind the list lacks gets its row at delivery.
  takesAllDocuments: true,

  documents: [
    {
      key: 'pension_annual',
      documentDescriptionHe: 'דוח שנתי מלא ומקוצר — פנסיה / קופת גמל (מגדל מקפת)',
      matchesRequiredDocument: (doc) => MIGDAL_NAME.test(doc.name) && /פנסיה|גמל|מקפת/.test(doc.name) && !/השתלמות/.test(doc.name),
      catalogTypeKey: 'pension_provident',
    },
    {
      key: 'study_fund_annual',
      documentDescriptionHe: 'דוח שנתי מלא ומקוצר — קרן השתלמות (מגדל)',
      matchesRequiredDocument: (doc) => MIGDAL_NAME.test(doc.name) && /השתלמות/.test(doc.name),
      catalogTypeKey: 'study_fund',
    },
  ],

  async buildCredentials(client: ClientRow): Promise<PortalCredentials | null> {
    // National id from clientIdNumber's shared order (own credentials row →
    // tax-authority row → the id the kickoff stored from the CRM card). The
    // site asks for no phone, but the code is relayed over WhatsApp, so a
    // client without a WhatsApp number cannot be served.
    const idNumber = (await clientIdNumber(client, 'migdal'))?.id;
    if (!idNumber || !client.wa_phone) return null;
    return { idNumber };
  },

  messages: {
    otpSent:
      'הקוד נשלח אליך הרגע ממגדל ב-SMS 📱 למספר הנייד הרשום אצלם. הוא תקף לדקות ספורות — אנא שלח/י לי אותו כאן ברגע שהוא מגיע.',
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר מגדל כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת ב-SMS ממגדל.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הדוח כרגע. נוכל לנסות שוב מאוחר יותר.',
    noDocumentsOnSite:
      'הזדהיתי בהצלחה באתר מגדל, אך לא נמצאו שם דוחות שנתיים לשנה המבוקשת. ייתכן שהדוח טרם פורסם או שהחשבון מתנהל בחברה אחרת — נבדוק את זה מול המשרד ונעדכן אותך.',
  },

  delivery: {
    waConfirmation(docs: FetchedDocument[], canEmail: boolean, createdKinds: string[] = []): string {
      const single = docs.length === 1;
      const fetchedWhat = single
        ? `את הדוח השנתי של ${migdalProducts(docs)} שלך`
        : `${docs.length} דוחות שנתיים של ${migdalProducts(docs)} שלך`;
      const tail = canEmail
        ? single
          ? 'שלחתי לך עותק למייל.'
          : 'שלחתי לך עותקים למייל.'
        : single
          ? 'המסמך נשמר והועבר לרואה החשבון.'
          : 'המסמכים נשמרו והועברו לרואה החשבון.';
      // A kind the list did not expect: told after the fact (openspec `migdal-fetch`).
      const alsoFound = createdKinds.map(
        (kind) => ` מצאתי שם גם את ${migdalProductNoun(kind)} שלך — הוספתי אותה לרשימת המסמכים.`,
      );
      return `הצלחתי למשוך ${fetchedWhat} ממגדל 🎉 ${tail}${alsoFound.join('')}`;
    },

    emailSubject(docs: FetchedDocument[], taxYear: number): string {
      const products = joinHe([...new Set(docs.map((d) => (d.kind === 'study_fund_annual' ? 'קרן השתלמות' : 'פנסיה')))]);
      return docs.length > 1
        ? `דוחות שנתיים (${products}) - מגדל - ${taxYear}`
        : `דוח שנתי (${products}) - מגדל - ${taxYear}`;
    },

    emailBodyLines(docs: FetchedDocument[], taxYear: number): string[] {
      return [
        docs.length === 1
          ? `מצורף הדוח השנתי של ${migdalProducts(docs)} שלך לשנת ${taxYear}, שנמשך עבורך ממגדל.`
          : `מצורפים ${docs.length} הדוחות השנתיים של ${migdalProducts(docs)} שלך לשנת ${taxYear}, שנמשכו עבורך ממגדל:`,
        ...(docs.length > 1 ? ['', ...docs.map((d) => `• ${d.title ?? 'דוח שנתי'} — ${migdalProductNoun(d.kind)}`)] : []),
      ];
    },

    fileLabel(doc: FetchedDocument, taxYear: number): string | null {
      return `${doc.title ?? 'דוח שנתי'} — מגדל ${taxYear}`;
    },
  },
};

// ── Meitav ──────────────────────────────────────────────────────────────────

/** A required-document name that mentions Meitav (the gemel/pension company or the Latin name). */
const MEITAV_NAME = /מיטב|meitav/i;
/** Meitav Trade (securities) is a different area of the same portal and never this provider. */
const MEITAV_TRADE = /טרייד|trade|ניירות ערך/i;

/** Human product noun per Meitav document kind, for delivery wording. */
function meitavProductNoun(kind: string | null | undefined): string {
  return kind === 'study_fund_annual' ? 'קרן ההשתלמות' : 'הפנסיה';
}

/** The product nouns of a delivery, each once, in document order. */
function meitavProducts(docs: FetchedDocument[]): string {
  return joinHe([...new Set(docs.map((d) => meitavProductNoun(d.kind)))]);
}

/**
 * Meitav (מיטב). One SMS-OTP login with the client's national id and WhatsApp
 * number (the site takes the phone as a mobile prefix plus seven digits). The
 * runner opens the personal area's "דוחות תקופתיים" page, sets the tax year in
 * its year picker and takes, from every product card, the detailed and the
 * short annual report ("דוח שנתי מפורט/מקוצר דצמבר <year>"; openspec
 * `meitav-fetch`); both reports of a product carry the same kind and attach to
 * the same checklist row, titled by their on-site row title.
 */
const meitavSpec: FetchProviderSpec = {
  id: 'meitav',
  siteNameHe: 'מיטב',
  otpChannel: 'sms',
  // Same consent rule as Harel/Phoenix/Migdal: every product card is read and
  // a kind the list lacks gets its row at delivery.
  takesAllDocuments: true,

  documents: [
    {
      key: 'pension_annual',
      documentDescriptionHe: 'דוח שנתי מפורט ומקוצר — פנסיה / קופת גמל (מיטב)',
      matchesRequiredDocument: (doc) =>
        MEITAV_NAME.test(doc.name) && !MEITAV_TRADE.test(doc.name) && /פנסיה|גמל/.test(doc.name) && !/השתלמות/.test(doc.name),
      catalogTypeKey: 'pension_provident',
    },
    {
      key: 'study_fund_annual',
      documentDescriptionHe: 'דוח שנתי מפורט ומקוצר — קרן השתלמות (מיטב)',
      matchesRequiredDocument: (doc) => MEITAV_NAME.test(doc.name) && !MEITAV_TRADE.test(doc.name) && /השתלמות/.test(doc.name),
      catalogTypeKey: 'study_fund',
    },
  ],

  async buildCredentials(client: ClientRow): Promise<PortalCredentials | null> {
    // National id from clientIdNumber's shared order (own credentials row →
    // tax-authority row → the id the kickoff stored from the CRM card) plus the
    // WhatsApp number the site sends the SMS code to.
    const idNumber = (await clientIdNumber(client, 'meitav'))?.id;
    if (!idNumber || !client.wa_phone) return null;
    return { idNumber, phoneNumber: client.wa_phone };
  },

  messages: {
    otpSent: 'הקוד נשלח אליך הרגע ממיטב ב-SMS 📱 הוא תקף לדקות ספורות — אנא שלח/י לי אותו כאן ברגע שהוא מגיע.',
    loginFailed: 'מצטער, לא הצלחתי להתחבר לאתר מיטב כרגע. נוכל לנסות שוב מאוחר יותר.',
    busy: 'אני מטפל כרגע בכמה בקשות במקביל — ננסה שוב בעוד מספר דקות.',
    otpExpired: 'הקוד הגיע מאוחר מדי ופג תוקפו. נוכל להתחיל את התהליך מחדש מתי שנוח לך.',
    otpRejected: 'הקוד לא התקבל. אנא בדוק/י ושלח/י שוב את הקוד שקיבלת ב-SMS ממיטב.',
    otpGaveUp: 'לא הצלחנו לאמת את הקוד. נוכל לנסות את התהליך שוב מאוחר יותר.',
    downloadFailed: 'הזדהיתי בהצלחה אך לא הצלחתי להוריד את הדוח כרגע. נוכל לנסות שוב מאוחר יותר.',
    noDocumentsOnSite:
      'הזדהיתי בהצלחה באתר מיטב, אך לא נמצאו שם דוחות שנתיים לשנה המבוקשת. ייתכן שהדוח טרם פורסם או שהחשבון מתנהל בחברה אחרת — נבדוק את זה מול המשרד ונעדכן אותך.',
  },

  delivery: {
    waConfirmation(docs: FetchedDocument[], canEmail: boolean, createdKinds: string[] = []): string {
      const single = docs.length === 1;
      const fetchedWhat = single
        ? `את הדוח השנתי של ${meitavProducts(docs)} שלך`
        : `${docs.length} דוחות שנתיים של ${meitavProducts(docs)} שלך`;
      const tail = canEmail
        ? single
          ? 'שלחתי לך עותק למייל.'
          : 'שלחתי לך עותקים למייל.'
        : single
          ? 'המסמך נשמר והועבר לרואה החשבון.'
          : 'המסמכים נשמרו והועברו לרואה החשבון.';
      // A kind the list did not expect: told after the fact (openspec `meitav-fetch`).
      const alsoFound = createdKinds.map(
        (kind) => ` מצאתי שם גם את ${meitavProductNoun(kind)} שלך — הוספתי אותה לרשימת המסמכים.`,
      );
      return `הצלחתי למשוך ${fetchedWhat} ממיטב 🎉 ${tail}${alsoFound.join('')}`;
    },

    emailSubject(docs: FetchedDocument[], taxYear: number): string {
      const products = joinHe([...new Set(docs.map((d) => (d.kind === 'study_fund_annual' ? 'קרן השתלמות' : 'פנסיה')))]);
      return docs.length > 1
        ? `דוחות שנתיים (${products}) - מיטב - ${taxYear}`
        : `דוח שנתי (${products}) - מיטב - ${taxYear}`;
    },

    emailBodyLines(docs: FetchedDocument[], taxYear: number): string[] {
      return [
        docs.length === 1
          ? `מצורף הדוח השנתי של ${meitavProducts(docs)} שלך לשנת ${taxYear}, שנמשך עבורך ממיטב.`
          : `מצורפים ${docs.length} הדוחות השנתיים של ${meitavProducts(docs)} שלך לשנת ${taxYear}, שנמשכו עבורך ממיטב:`,
        ...(docs.length > 1 ? ['', ...docs.map((d) => `• ${d.title ?? 'דוח שנתי'} — ${meitavProductNoun(d.kind)}`)] : []),
      ];
    },

    fileLabel(doc: FetchedDocument, taxYear: number): string | null {
      return `${doc.title ?? 'דוח שנתי'} — מיטב ${taxYear}`;
    },
  },
};

const SPECS: Record<string, FetchProviderSpec> = {
  [israelTaxAuthoritySpec.id]: israelTaxAuthoritySpec,
  [altshulerShahamSpec.id]: altshulerShahamSpec,
  [harelSpec.id]: harelSpec,
  [phoenixSpec.id]: phoenixSpec,
  [migdalSpec.id]: migdalSpec,
  [meitavSpec.id]: meitavSpec,
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

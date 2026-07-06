import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { setDateLocale } from './format';

export type Lang = 'he' | 'en' | 'ru';

const STORAGE_KEY = 'fm.lang';
const DATE_LOCALES: Record<Lang, string> = { he: 'he-IL', en: 'en-US', ru: 'ru-RU' };

/** Russian plural form: one (1, 21…), few (2–4, 22–24…), many (0, 5–20, 25–30…). */
function ruPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** Hebrew is the source catalog; `en` must provide the exact same keys. */
const he = {
  // Shared
  loading: 'טוען…',
  cancel: 'ביטול',
  logoAlt: 'הלוגו של FiscalMind',

  // App shell
  connectBanner: 'בחרו כתובת אימייל לסוכן — הלקוחות יתכתבו איתה.',
  noClientsUseAdd: 'אין עדיין לקוחות — השתמשו בכפתור ה־+ שליד "לקוחות" בסרגל הצד.',

  // Login
  loginLead: 'התחברו כדי לנהל את סוכן איסוף המסמכים.',
  loginFailed: (reason: string) => `ההתחברות נכשלה: ${reason}`,
  loginWithGoogle: 'התחברות עם Google',

  // AccessPending
  accessPendingTitle: 'החשבון שלכם עדיין לא הופעל',
  accessPendingLead: 'FiscalMind זמין ללקוחות משלמים בלבד. פנו למנהל המערכת כדי להפעיל גישה עבור',
  accessPendingYourAccount: ' החשבון שלכם',
  accessPendingTail: '. לאחר ההפעלה, התחברו שוב והדשבורד שלכם יהיה מוכן.',
  accessPendingSwitchAccount: 'התחברות עם חשבון אחר',

  // Sidebar
  navDashboard: 'דשבורד',
  clientsHeading: 'לקוחות',
  addClient: 'הוספת לקוח',
  goalCompleteTitle: 'היעד הושלם',
  goalPendingTitle: 'איסוף בתהליך',
  deleteClientAction: (name: string) => `מחיקת ${name}`,
  sidebarNoClients: 'אין עדיין לקוחות',
  adminTools: 'כלי ניהול',
  systemPrompt: 'פרומפט המערכת',
  settings: 'הגדרות',
  impersonationTitle: 'אתם צופים בדשבורד של המשתמש הזה כמנהל',
  viewingAs: 'צפייה בתור',
  exitImpersonation: 'יציאה',
  googleAccountTitle: 'חשבון Google שאיתו התחברתם',
  logout: 'התנתקות',

  // LogoutConfirmModal
  logoutQuestion: 'להתנתק מהמערכת?',
  logoutNote: 'כדי לחזור, תצטרכו להתחבר שוב עם חשבון Google.',
  loggingOut: 'מתנתק…',

  // ClaimMailbox
  mailboxRulesHint: '3–30 תווים: אותיות לטיניות קטנות, ספרות ומקפים (לא בקצוות).',
  mailboxReserved: 'השם הזה שמור.',
  mailboxTaken: 'השם הזה כבר תפוס.',
  mailboxClaimFailed: 'לא ניתן לשריין את השם. נסו שוב.',
  claiming: 'משריין…',
  claim: 'שריון',
  checking: 'בודק…',
  mailboxAvailableTail: ' פנוי. הבחירה קבועה — לא ניתן לשנות אותה בהמשך.',

  // Settings
  settingsTitle: 'הגדרות',
  agentMailbox: 'תיבת הסוכן',
  agentMailboxDesc: 'תיבת הדואר שממנה הסוכן שולח ומקבל מיילים. הלקוחות מתכתבים עם הכתובת הזו.',
  copied: 'הועתק!',
  copyAddress: 'העתקת הכתובת',
  language: 'שפה',
  languageDesc: 'שפת הממשק של האפליקציה.',

  // ClientView tabs
  tabConversation: 'שיחה',
  tabDashboard: 'דשבורד',
  tabDocuments: 'מסמכים',
  tabDetails: 'פרטים',
  clientSectionsAria: 'מקטעי לקוח',
  clientLoadFailed: 'טעינת הלקוח נכשלה.',

  // ClientHeader
  saveFailed: 'השמירה נכשלה.',
  allDocsReceived: 'כל המסמכים התקבלו',
  docCollectionInProgress: 'איסוף מסמכים בתהליך',
  edit: 'עריכה',
  saving: 'שומר…',
  save: 'שמירה',
  emailLabel: 'אימייל',
  phoneLabel: 'טלפון',
  companyLabel: 'חברה',
  occupationLabel: 'עיסוק',
  clientSinceLabel: 'תחילת ההתקשרות',
  sinceDate: (date: string) => `מאז ${date}`,
  notesLabel: 'הערות',
  nameLabel: 'שם',
  occupationPlaceholder: 'למשל: מהנדס תוכנה',

  // Timeline
  conversationTimeline: 'ציר הזמן של השיחה',
  copyConversation: 'העתקת השיחה',
  oneMessage: 'הודעה אחת',
  nMessages: (n: number) => `${n} הודעות`,
  noEmailsExchangedYet: 'עדיין לא הוחלפו מיילים.',
  agentAuthor: 'הסוכן',
  clientAuthor: 'הלקוח',
  scheduledDivider: 'מתוזמן',
  agentNotSentYet: 'הסוכן · טרם נשלח',
  willBeSentAt: (ts: string) => `יישלח ב־${ts}`,
  sendNow: 'שליחה עכשיו',
  sendingNow: 'שולח…',
  sendNowConfirm: 'לשלוח את המייל המתוזמן עכשיו?',
  sendNowFailed: 'שליחת המייל נכשלה.',
  scheduledDraftUnavailable: 'מעקב מתוזמן (הטיוטה אינה זמינה)',
  draftingEmail: (first: boolean) => `הסוכן מנסח כעת את המייל ${first ? 'הראשון' : 'הבא'}…`,
  goalCompleteFooter: 'היעד הושלם — לא מתוכננים מעקבים נוספים.',

  // StatTiles / shared stats
  docsCollectedLabel: 'מסמכים שנאספו',
  noDocsDefined: 'לא הוגדרו מסמכים',
  allCollected: 'הכול נאסף',
  nMissing: (n: number) => `${n} חסרים`,
  messagesExchangedLabel: 'הודעות שהוחלפו',
  noEmailsYet: 'אין עדיין מיילים',
  sentReceived: (sent: number, received: number) => `${sent} נשלחו · ${received} התקבלו`,
  lastClientReply: 'תגובה אחרונה מהלקוח',
  today: 'היום',
  yesterday: 'אתמול',
  daysAgo: (n: number) => `לפני ${n} ימים`,
  noRepliesYet: 'אין עדיין תגובות',
  noReplyFlag: 'ללא מענה',
  nextFollowUpLabel: 'המעקב הבא',
  doneLabel: 'הושלם',
  atTime: (time: string) => `בשעה ${time}`,
  noFurtherFollowUps: 'אין מעקבים נוספים',
  notScheduled: 'לא מתוכנן',

  // Overview
  dashboardLoadFailed: 'טעינת הדשבורד נכשלה.',
  dashboardFillsUp: 'אין עדיין לקוחות — הדשבורד יתמלא כשיתווספו לקוחות.',
  clientsLabel: 'לקוחות',
  completeAndPending: (complete: number, pending: number) => `${complete} הושלמו · ${pending} בתהליך`,
  sentReceivedFiles: (sent: number, received: number, files: number) =>
    `${sent} נשלחו · ${received} התקבלו · ${files} קבצים`,
  scheduledFollowUpsLabel: 'מעקבים מתוזמנים',
  nextAt: (date: string) => `הקרוב: ${date}`,
  noScheduledFollowUps: 'אין מעקבים מתוזמנים',
  emailActivity: 'פעילות מיילים',
  allClientsLastWeeks: (weeks: number) => `כל הלקוחות · ${weeks} השבועות האחרונים`,
  emailsPerWeekAllClients: 'מיילים לפי שבוע, כל הלקוחות',
  seriesSent: 'נשלחו',
  seriesReceived: 'התקבלו',
  clientStatus: 'סטטוס הלקוחות',
  clientsByStatus: 'לקוחות לפי סטטוס איסוף',
  statusComplete: 'הושלמו',
  statusActive: 'באיסוף פעיל',
  statusNotStarted: 'טרם נאסף דבר',
  progressByClient: 'התקדמות לפי לקוח',
  collectedOfRequested: 'מסמכים שנאספו מתוך המבוקשים',
  noDocuments: 'ללא מסמכים',
  needsAttention: 'דורשים תשומת לב',
  attentionSubtitle: (days: number) => `ללא מענה ${days}+ ימים או ללא מעקב`,
  silentForDays: (n: number) => `ללא מענה ${n} ימים`,
  neverReplied: 'טרם התקבלה תגובה כלשהי',
  noFollowUpScheduled: 'אין מעקב מתוזמן',
  allClear: 'הכול תקין — אף לקוח לא תקוע',
  upcomingFollowUps: 'המעקבים הקרובים',
  upcomingFollowUpsSubtitle: 'מיילים שהסוכן ישלח אוטומטית',
  noFollowUpsRightNow: 'אין מעקבים מתוזמנים כרגע',

  // DocumentsCard
  requiredDocuments: 'מסמכים נדרשים',
  collectedBadge: (collected: number, total: number) => `${collected} / ${total} נאספו`,
  docsUpdateFailed: 'עדכון המסמכים נכשל.',
  noDocsNothingToCollect: 'לא הוגדרו מסמכים — לסוכן אין מה לאסוף מהלקוח הזה.',
  markPending: 'סימון כממתין',
  markCollected: 'סימון כנאסף',
  collectedStatus: 'נאסף',
  pendingStatus: 'ממתין',
  removeDocument: 'הסרת המסמך',
  docNamePlaceholder: 'שם המסמך, למשל טופס 106',
  docNameAria: 'שם המסמך',
  docDescPlaceholder: 'תיאור (אופציונלי, עוזר לסוכן להסביר את המסמך)',
  docDescAria: 'תיאור המסמך',
  addDocument: 'הוספת מסמך',

  // FilesCard
  filesReceived: 'קבצים שהתקבלו',
  analysisPending: 'טרם נותח',
  analysisFailed: 'הניתוח נכשל',
  analysisUnsupported: 'לא ניתן לניתוח תוכן',
  analysisIdentified: (kind: string) => `זוהה בתוכן: ${kind}`,
  analysisTaxYear: (year: string) => `שנת מס ${year}`,
  analysisNotLegible: 'לא קריא',

  // AddClientModal
  addClientTitle: 'הוספת לקוח',
  addClientLead:
    'הסוכן מנסח את המייל הראשון בעצמו ובוחר מתי לשלוח אותו. המייל יופיע בלשונית ההתכתבות כממתין לשליחה, ומשם הסוכן מנהל את המעקבים עד שכל המסמכים נאספים.',
  atLeastOneDoc: 'הוסיפו לפחות מסמך אחד שהסוכן יאסוף.',
  createClientFailed: 'יצירת הלקוח נכשלה.',
  documentsToCollect: 'מסמכים לאיסוף',
  removeNamed: (name: string) => `הסרת ${name}`,
  egForm106: 'למשל טופס 106',
  creating: 'יוצר…',
  create: 'יצירה',

  // DeleteClientModal
  deleteClientFailed: 'מחיקת הלקוח נכשלה.',
  deleteQuestionPrefix: 'למחוק את ',
  deleteQuestionSuffix: '?',
  deleteWarning: 'גם המיילים, המסמכים והקבצים של הלקוח יימחקו. לא ניתן לבטל את הפעולה.',
  deleting: 'מוחק…',
  deleteClient: 'מחיקת הלקוח',

  // PromptSettings
  promptLoadFailed: 'טעינת תבנית הפרומפט נכשלה.',
  promptSaved: 'נשמר. הקריאה הבאה ל־Gemini תשתמש בתבנית הזו.',
  promptRestored: 'שוחזר לתבנית ברירת המחדל המובנית.',
  resetFailed: 'האיפוס נכשל.',
  geminiSystemPrompt: 'פרומפט המערכת של Gemini',
  customTemplate: 'תבנית מותאמת',
  builtinDefault: 'ברירת מחדל מובנית',
  lastSaved: (ts: string) => `נשמר לאחרונה ${ts}`,
  resetToDefault: 'איפוס לברירת המחדל',
  promptLead:
    'התבנית הזו הופכת להנחיית המערכת בכל קריאת החלטה של Gemini (האם היעד הושלם, ואיזה מייל מעקב לנסח). מצייני המקום מתמלאים לכל לקוח בזמן הקריאה:',
  appendAtEnd: 'הוספה בסוף',

  // AdminDashboard
  accountantsLoadFailed: 'טעינת רואי החשבון נכשלה.',
  impersonateFailed: 'הכניסה לחשבון נכשלה.',
  activateFailed: 'הפעלת החשבון נכשלה.',
  revokeFailed: 'ביטול הגישה נכשל.',
  revokeConfirm: (email: string) => `לבטל את הגישה של ${email}? הניתוק ייכנס לתוקף מייד.`,
  noAccessBadge: 'ללא גישה',
  noAccessTitle: 'התחברו עם Google אבל אינם ברשימת ההיתרים — הם רואים רק את מסך הפנייה למנהל.',
  activeBadge: 'פעיל',
  invitedBadge: 'הוזמן',
  invitedTitle: 'ברשימת ההיתרים אך טרם התחברו.',
  adminBadge: 'מנהל',
  accountantsLabel: 'רואי חשבון',
  withAgentMailbox: (n: number) => `${n} עם תיבת סוכן`,
  acrossAllAccountants: 'בכל רואי החשבון',
  clientsCompleteLabel: 'לקוחות שהושלמו',
  stillInProgress: (n: number) => `${n} עדיין בתהליך`,
  noDocsRequestedYet: 'עדיין לא התבקשו מסמכים',
  oneAccount: 'חשבון אחד',
  nAccounts: (n: number) => `${n} חשבונות`,
  addShort: '+ הוספה',
  noAccountantsYet: 'אין עדיין רואי חשבון — הוסיפו כתובת Gmail של לקוח משלם כדי לתת לו גישה.',
  selectAccountant: 'בחרו רואה חשבון מהרשימה כדי לראות את הפרטים שלו.',
  justAMoment: 'רק רגע…',
  enterAccount: 'כניסה לחשבון',
  revokeAccess: 'ביטול גישה',
  activate: 'הפעלה',
  mailboxNotSet: 'לא הוגדרה',
  joinedLabel: 'הצטרפות',
  notSignedInYet: 'טרם התחברו',
  noClients: 'אין לקוחות',
  collectedOfTitle: (collected: number, total: number) => `נאספו ${collected} מתוך ${total} מסמכים`,
  modelLabel: 'מודל',
  inputTokens: 'טוקני קלט',
  outputTokens: 'טוקני פלט',
  thinkingTokens: 'טוקני חשיבה',
  totalCost: 'עלות כוללת',
  adminDetailNote:
    'רק רואי חשבון ברשימת ההיתרים יכולים להשתמש באפליקציה. "כניסה לחשבון" פותחת את הדשבורד שלהם בדיוק כפי שהם רואים אותו — ובזמן הכניסה, כל פעולה שלכם חלה על החשבון שלהם.',
  accountantsRefreshFailed: 'רענון רשימת רואי החשבון נכשל.',
  llmModelTitle: 'מודל השפה',
  llmModelDesc:
    'המודל של Gemini שמשמש את כל קריאות ה־LLM — ניסוח מיילים, החלטות תזמון וניתוח קבצים — עבור כל רואי החשבון וכל הלקוחות. שינוי נכנס לתוקף מייד, מהקריאה הבאה.',
  llmModelSaved: 'נשמר. כל הקריאות הבאות ישתמשו במודל הזה.',
  llmModelLoadFailed: 'טעינת הגדרת המודל נכשלה.',
  llmModelSaveFailed: 'שמירת המודל נכשלה.',
  llmModelEnvDefault: 'ברירת המחדל של השרת',

  // AddAccountantModal
  addAccountantTitle: 'הוספת רואה חשבון',
  addAccountantLead: 'הוסיפו את כתובת ה־Gmail שאיתה רואה החשבון יתחבר. הגישה נפתחת ברגע ההוספה — אפשר להתחבר מייד.',
  googleEmail: 'אימייל Google',
  nameOptional: 'שם (אופציונלי)',
  addAccountantFailed: 'הוספת רואה החשבון נכשלה.',
  adding: 'מוסיף…',

  // Charts
  filePdf: 'קובצי PDF',
  fileImages: 'תמונות',
  fileSheets: 'גיליונות',
  fileDocs: 'מסמכים',
  fileOther: 'אחר',
  removedDocument: 'מסמך שהוסר',
  otherDocuments: 'מסמכים אחרים',
  unlinkedToRequest: 'לא מקושר לבקשה',
  nodeRequested: 'התבקשו',
  nodeCollected: 'נאספו',
  nodeMissing: 'חסרים',
  nodeViaAttachment: 'בצירוף למייל',
  nodeMarkedManually: 'סומנו ידנית',
  nodeFollowUpScheduled: 'מעקב מתוזמן',
  nodeAwaitingClient: 'ממתין ללקוח',
  perWeekLastN: (weeks: number) => `לפי שבוע · ${weeks} השבועות האחרונים`,
  emailsPerWeek: 'מיילים לפי שבוע',
  filesByType: 'קבצים לפי סוג',
  filesCenterLabel: 'קבצים',
  noFilesYet: 'עדיין לא התקבלו קבצים',
  documentJourney: 'מסלול המסמכים',
  documentJourneySubtitle: 'איך המסמכים שהתבקשו מתקדמים',
  documentsUnit: 'מסמכים',
  filesByRequest: 'קבצים לפי בקשה',
  filesByRequestedDoc: 'קבצים לפי מסמך מבוקש',
  cumulativeLastN: (weeks: number) => `מצטבר · ${weeks} השבועות האחרונים`,
  filesOverTime: 'קבצים שהתקבלו לאורך זמן',
  srFrom: 'מ־',
  srTo: 'אל',
  srCategory: 'קטגוריה',
  srCount: 'כמות',
  srPercent: 'אחוז',
  srPeriod: 'תקופה',
};

export type Messages = typeof he;

const en: Messages = {
  // Shared
  loading: 'Loading…',
  cancel: 'Cancel',
  logoAlt: 'FiscalMind logo',

  // App shell
  connectBanner: 'Choose an email address for the agent — your clients will correspond with it.',
  noClientsUseAdd: 'No clients yet — use the + button next to "Clients" in the sidebar.',

  // Login
  loginLead: 'Sign in to manage your document-collection agent.',
  loginFailed: (reason: string) => `Sign-in failed: ${reason}`,
  loginWithGoogle: 'Sign in with Google',

  // AccessPending
  accessPendingTitle: 'Your account is not active yet',
  accessPendingLead: 'FiscalMind is available to paying customers only. Contact the administrator to activate access for',
  accessPendingYourAccount: ' your account',
  accessPendingTail: '. Once activated, sign in again and your dashboard will be ready.',
  accessPendingSwitchAccount: 'Sign in with a different account',

  // Sidebar
  navDashboard: 'Dashboard',
  clientsHeading: 'Clients',
  addClient: 'Add client',
  goalCompleteTitle: 'Goal complete',
  goalPendingTitle: 'Collection in progress',
  deleteClientAction: (name: string) => `Delete ${name}`,
  sidebarNoClients: 'No clients yet',
  adminTools: 'Admin tools',
  systemPrompt: 'System prompt',
  settings: 'Settings',
  impersonationTitle: 'You are viewing this user’s dashboard as an admin',
  viewingAs: 'Viewing as',
  exitImpersonation: 'Exit',
  googleAccountTitle: 'The Google account you signed in with',
  logout: 'Log out',

  // LogoutConfirmModal
  logoutQuestion: 'Log out?',
  logoutNote: 'To come back, you will need to sign in with your Google account again.',
  loggingOut: 'Logging out…',

  // ClaimMailbox
  mailboxRulesHint: '3–30 characters: lowercase Latin letters, digits and hyphens (not at the edges).',
  mailboxReserved: 'This name is reserved.',
  mailboxTaken: 'This name is already taken.',
  mailboxClaimFailed: 'Could not claim this name. Try again.',
  claiming: 'Claiming…',
  claim: 'Claim',
  checking: 'Checking…',
  mailboxAvailableTail: ' is available. This choice is permanent — it cannot be changed later.',

  // Settings
  settingsTitle: 'Settings',
  agentMailbox: 'Agent mailbox',
  agentMailboxDesc: 'The mailbox the agent sends and receives email from. Clients correspond with this address.',
  copied: 'Copied!',
  copyAddress: 'Copy address',
  language: 'Language',
  languageDesc: 'The interface language of the app.',

  // ClientView tabs
  tabConversation: 'Conversation',
  tabDashboard: 'Dashboard',
  tabDocuments: 'Documents',
  tabDetails: 'Details',
  clientSectionsAria: 'Client sections',
  clientLoadFailed: 'Failed to load the client.',

  // ClientHeader
  saveFailed: 'Saving failed.',
  allDocsReceived: 'All documents received',
  docCollectionInProgress: 'Document collection in progress',
  edit: 'Edit',
  saving: 'Saving…',
  save: 'Save',
  emailLabel: 'Email',
  phoneLabel: 'Phone',
  companyLabel: 'Company',
  occupationLabel: 'Occupation',
  clientSinceLabel: 'Client since',
  sinceDate: (date: string) => `Since ${date}`,
  notesLabel: 'Notes',
  nameLabel: 'Name',
  occupationPlaceholder: 'e.g. software engineer',

  // Timeline
  conversationTimeline: 'Conversation timeline',
  copyConversation: 'Copy conversation',
  oneMessage: '1 message',
  nMessages: (n: number) => `${n} messages`,
  noEmailsExchangedYet: 'No emails exchanged yet.',
  agentAuthor: 'Agent',
  clientAuthor: 'Client',
  scheduledDivider: 'Scheduled',
  agentNotSentYet: 'Agent · not sent yet',
  willBeSentAt: (ts: string) => `Will be sent ${ts}`,
  sendNow: 'Send now',
  sendingNow: 'Sending…',
  sendNowConfirm: 'Send the scheduled email now?',
  sendNowFailed: 'Sending the email failed.',
  scheduledDraftUnavailable: 'Scheduled follow-up (draft unavailable)',
  draftingEmail: (first: boolean) => `The agent is drafting the ${first ? 'first' : 'next'} email…`,
  goalCompleteFooter: 'Goal complete — no further follow-ups are planned.',

  // StatTiles / shared stats
  docsCollectedLabel: 'Documents collected',
  noDocsDefined: 'No documents defined',
  allCollected: 'All collected',
  nMissing: (n: number) => `${n} missing`,
  messagesExchangedLabel: 'Messages exchanged',
  noEmailsYet: 'No emails yet',
  sentReceived: (sent: number, received: number) => `${sent} sent · ${received} received`,
  lastClientReply: 'Last client reply',
  today: 'Today',
  yesterday: 'Yesterday',
  daysAgo: (n: number) => `${n} days ago`,
  noRepliesYet: 'No replies yet',
  noReplyFlag: 'No reply',
  nextFollowUpLabel: 'Next follow-up',
  doneLabel: 'Done',
  atTime: (time: string) => `at ${time}`,
  noFurtherFollowUps: 'No further follow-ups',
  notScheduled: 'Not scheduled',

  // Overview
  dashboardLoadFailed: 'Failed to load the dashboard.',
  dashboardFillsUp: 'No clients yet — the dashboard will fill up as clients are added.',
  clientsLabel: 'Clients',
  completeAndPending: (complete: number, pending: number) => `${complete} complete · ${pending} in progress`,
  sentReceivedFiles: (sent: number, received: number, files: number) =>
    `${sent} sent · ${received} received · ${files} files`,
  scheduledFollowUpsLabel: 'Scheduled follow-ups',
  nextAt: (date: string) => `Next: ${date}`,
  noScheduledFollowUps: 'No scheduled follow-ups',
  emailActivity: 'Email activity',
  allClientsLastWeeks: (weeks: number) => `All clients · last ${weeks} weeks`,
  emailsPerWeekAllClients: 'Emails per week, all clients',
  seriesSent: 'Sent',
  seriesReceived: 'Received',
  clientStatus: 'Client status',
  clientsByStatus: 'Clients by collection status',
  statusComplete: 'Complete',
  statusActive: 'Actively collecting',
  statusNotStarted: 'Nothing collected yet',
  progressByClient: 'Progress by client',
  collectedOfRequested: 'Documents collected out of requested',
  noDocuments: 'No documents',
  needsAttention: 'Needs attention',
  attentionSubtitle: (days: number) => `No reply for ${days}+ days, or no follow-up`,
  silentForDays: (n: number) => `No reply for ${n} days`,
  neverReplied: 'No reply received yet',
  noFollowUpScheduled: 'No follow-up scheduled',
  allClear: 'All clear — no client is stuck',
  upcomingFollowUps: 'Upcoming follow-ups',
  upcomingFollowUpsSubtitle: 'Emails the agent will send automatically',
  noFollowUpsRightNow: 'No follow-ups scheduled right now',

  // DocumentsCard
  requiredDocuments: 'Required documents',
  collectedBadge: (collected: number, total: number) => `${collected} / ${total} collected`,
  docsUpdateFailed: 'Updating the documents failed.',
  noDocsNothingToCollect: 'No documents defined — the agent has nothing to collect from this client.',
  markPending: 'Mark as pending',
  markCollected: 'Mark as collected',
  collectedStatus: 'Collected',
  pendingStatus: 'Pending',
  removeDocument: 'Remove document',
  docNamePlaceholder: 'Document name, e.g. Form 106',
  docNameAria: 'Document name',
  docDescPlaceholder: 'Description (optional, helps the agent explain the document)',
  docDescAria: 'Document description',
  addDocument: 'Add document',

  // FilesCard
  filesReceived: 'Files received',
  analysisPending: 'Not analyzed yet',
  analysisFailed: 'Analysis failed',
  analysisUnsupported: 'Content not analyzable',
  analysisIdentified: (kind: string) => `Identified from content: ${kind}`,
  analysisTaxYear: (year: string) => `Tax year ${year}`,
  analysisNotLegible: 'Not legible',

  // AddClientModal
  addClientTitle: 'Add client',
  addClientLead:
    'The agent drafts the first email itself and chooses when to send it. The email will appear in the conversation tab as pending, and from there the agent manages follow-ups until all documents are collected.',
  atLeastOneDoc: 'Add at least one document for the agent to collect.',
  createClientFailed: 'Creating the client failed.',
  documentsToCollect: 'Documents to collect',
  removeNamed: (name: string) => `Remove ${name}`,
  egForm106: 'e.g. Form 106',
  creating: 'Creating…',
  create: 'Create',

  // DeleteClientModal
  deleteClientFailed: 'Deleting the client failed.',
  deleteQuestionPrefix: 'Delete ',
  deleteQuestionSuffix: '?',
  deleteWarning: 'The client’s emails, documents and files will be deleted too. This cannot be undone.',
  deleting: 'Deleting…',
  deleteClient: 'Delete client',

  // PromptSettings
  promptLoadFailed: 'Failed to load the prompt template.',
  promptSaved: 'Saved. The next Gemini call will use this template.',
  promptRestored: 'Restored to the built-in default template.',
  resetFailed: 'Reset failed.',
  geminiSystemPrompt: 'Gemini system prompt',
  customTemplate: 'Custom template',
  builtinDefault: 'Built-in default',
  lastSaved: (ts: string) => `Last saved ${ts}`,
  resetToDefault: 'Reset to default',
  promptLead:
    'This template becomes the system instruction for every Gemini decision call (whether the goal is complete, and which follow-up email to draft). Placeholders are filled per client at call time:',
  appendAtEnd: 'Append at the end',

  // AdminDashboard
  accountantsLoadFailed: 'Failed to load the accountants.',
  impersonateFailed: 'Entering the account failed.',
  activateFailed: 'Activating the account failed.',
  revokeFailed: 'Revoking access failed.',
  revokeConfirm: (email: string) => `Revoke access for ${email}? This takes effect immediately.`,
  noAccessBadge: 'No access',
  noAccessTitle: 'Signed in with Google but not whitelisted — they only see the contact-the-admin screen.',
  activeBadge: 'Active',
  invitedBadge: 'Invited',
  invitedTitle: 'Whitelisted but has not signed in yet.',
  adminBadge: 'Admin',
  accountantsLabel: 'Accountants',
  withAgentMailbox: (n: number) => `${n} with an agent mailbox`,
  acrossAllAccountants: 'Across all accountants',
  clientsCompleteLabel: 'Clients complete',
  stillInProgress: (n: number) => `${n} still in progress`,
  noDocsRequestedYet: 'No documents requested yet',
  oneAccount: '1 account',
  nAccounts: (n: number) => `${n} accounts`,
  addShort: '+ Add',
  noAccountantsYet: 'No accountants yet — add a paying customer’s Gmail address to grant them access.',
  selectAccountant: 'Select an accountant from the list to see their details.',
  justAMoment: 'One moment…',
  enterAccount: 'Enter account',
  revokeAccess: 'Revoke access',
  activate: 'Activate',
  mailboxNotSet: 'Not set',
  joinedLabel: 'Joined',
  notSignedInYet: 'Has not signed in yet',
  noClients: 'No clients',
  collectedOfTitle: (collected: number, total: number) => `${collected} of ${total} documents collected`,
  modelLabel: 'Model',
  inputTokens: 'Input tokens',
  outputTokens: 'Output tokens',
  thinkingTokens: 'Thinking tokens',
  totalCost: 'Total cost',
  adminDetailNote:
    'Only whitelisted accountants can use the app. "Enter account" opens their dashboard exactly as they see it — and while inside, every action you take applies to their account.',
  accountantsRefreshFailed: 'Refreshing the accountant list failed.',
  llmModelTitle: 'LLM model',
  llmModelDesc:
    'The Gemini model behind every LLM call — email drafting, scheduling decisions and file analysis — for every accountant and every client. A change takes effect immediately, from the next call.',
  llmModelSaved: 'Saved. All following calls will use this model.',
  llmModelLoadFailed: 'Failed to load the model setting.',
  llmModelSaveFailed: 'Saving the model failed.',
  llmModelEnvDefault: 'Server default',

  // AddAccountantModal
  addAccountantTitle: 'Add accountant',
  addAccountantLead:
    'Add the Gmail address the accountant will sign in with. Access opens the moment they are added — they can sign in right away.',
  googleEmail: 'Google email',
  nameOptional: 'Name (optional)',
  addAccountantFailed: 'Adding the accountant failed.',
  adding: 'Adding…',

  // Charts
  filePdf: 'PDF files',
  fileImages: 'Images',
  fileSheets: 'Spreadsheets',
  fileDocs: 'Documents',
  fileOther: 'Other',
  removedDocument: 'Removed document',
  otherDocuments: 'Other documents',
  unlinkedToRequest: 'Not linked to a request',
  nodeRequested: 'Requested',
  nodeCollected: 'Collected',
  nodeMissing: 'Missing',
  nodeViaAttachment: 'As email attachment',
  nodeMarkedManually: 'Marked manually',
  nodeFollowUpScheduled: 'Follow-up scheduled',
  nodeAwaitingClient: 'Awaiting client',
  perWeekLastN: (weeks: number) => `Per week · last ${weeks} weeks`,
  emailsPerWeek: 'Emails per week',
  filesByType: 'Files by type',
  filesCenterLabel: 'Files',
  noFilesYet: 'No files received yet',
  documentJourney: 'Document journey',
  documentJourneySubtitle: 'How the requested documents are progressing',
  documentsUnit: 'documents',
  filesByRequest: 'Files by request',
  filesByRequestedDoc: 'Files by requested document',
  cumulativeLastN: (weeks: number) => `Cumulative · last ${weeks} weeks`,
  filesOverTime: 'Files received over time',
  srFrom: 'From',
  srTo: 'To',
  srCategory: 'Category',
  srCount: 'Count',
  srPercent: 'Percent',
  srPeriod: 'Period',
};

const ru: Messages = {
  // Shared
  loading: 'Загрузка…',
  cancel: 'Отмена',
  logoAlt: 'Логотип FiscalMind',

  // App shell
  connectBanner: 'Выберите адрес электронной почты для агента — клиенты будут переписываться с ним.',
  noClientsUseAdd: 'Клиентов пока нет — используйте кнопку «+» рядом с «Клиенты» в боковой панели.',

  // Login
  loginLead: 'Войдите, чтобы управлять агентом по сбору документов.',
  loginFailed: (reason: string) => `Не удалось войти: ${reason}`,
  loginWithGoogle: 'Войти через Google',

  // AccessPending
  accessPendingTitle: 'Ваш аккаунт ещё не активирован',
  accessPendingLead: 'FiscalMind доступен только платным клиентам. Обратитесь к администратору, чтобы активировать доступ для',
  accessPendingYourAccount: ' вашего аккаунта',
  accessPendingTail: '. После активации войдите снова — и ваша панель будет готова.',
  accessPendingSwitchAccount: 'Войти с другим аккаунтом',

  // Sidebar
  navDashboard: 'Панель',
  clientsHeading: 'Клиенты',
  addClient: 'Добавить клиента',
  goalCompleteTitle: 'Цель достигнута',
  goalPendingTitle: 'Сбор в процессе',
  deleteClientAction: (name: string) => `Удалить ${name}`,
  sidebarNoClients: 'Клиентов пока нет',
  adminTools: 'Инструменты администратора',
  systemPrompt: 'Системный промпт',
  settings: 'Настройки',
  impersonationTitle: 'Вы просматриваете панель этого пользователя как администратор',
  viewingAs: 'Просмотр от имени',
  exitImpersonation: 'Выйти',
  googleAccountTitle: 'Аккаунт Google, с которым вы вошли',
  logout: 'Выйти из системы',

  // LogoutConfirmModal
  logoutQuestion: 'Выйти из системы?',
  logoutNote: 'Чтобы вернуться, вам нужно будет снова войти через аккаунт Google.',
  loggingOut: 'Выход…',

  // ClaimMailbox
  mailboxRulesHint: '3–30 символов: строчные латинские буквы, цифры и дефисы (не по краям).',
  mailboxReserved: 'Это имя зарезервировано.',
  mailboxTaken: 'Это имя уже занято.',
  mailboxClaimFailed: 'Не удалось закрепить имя. Попробуйте ещё раз.',
  claiming: 'Закрепление…',
  claim: 'Закрепить',
  checking: 'Проверка…',
  mailboxAvailableTail: ' свободно. Выбор окончательный — изменить его позже нельзя.',

  // Settings
  settingsTitle: 'Настройки',
  agentMailbox: 'Почтовый ящик агента',
  agentMailboxDesc: 'Ящик, с которого агент отправляет и получает письма. Клиенты переписываются с этим адресом.',
  copied: 'Скопировано!',
  copyAddress: 'Скопировать адрес',
  language: 'Язык',
  languageDesc: 'Язык интерфейса приложения.',

  // ClientView tabs
  tabConversation: 'Переписка',
  tabDashboard: 'Панель',
  tabDocuments: 'Документы',
  tabDetails: 'Сведения',
  clientSectionsAria: 'Разделы клиента',
  clientLoadFailed: 'Не удалось загрузить клиента.',

  // ClientHeader
  saveFailed: 'Не удалось сохранить.',
  allDocsReceived: 'Все документы получены',
  docCollectionInProgress: 'Идёт сбор документов',
  edit: 'Редактировать',
  saving: 'Сохранение…',
  save: 'Сохранить',
  emailLabel: 'Эл. почта',
  phoneLabel: 'Телефон',
  companyLabel: 'Компания',
  occupationLabel: 'Род занятий',
  clientSinceLabel: 'Начало сотрудничества',
  sinceDate: (date: string) => `С ${date}`,
  notesLabel: 'Заметки',
  nameLabel: 'Имя',
  occupationPlaceholder: 'например: инженер-программист',

  // Timeline
  conversationTimeline: 'Хронология переписки',
  copyConversation: 'Скопировать переписку',
  oneMessage: '1 сообщение',
  nMessages: (n: number) => `${n} ${ruPlural(n, 'сообщение', 'сообщения', 'сообщений')}`,
  noEmailsExchangedYet: 'Писем пока не было.',
  agentAuthor: 'Агент',
  clientAuthor: 'Клиент',
  scheduledDivider: 'Запланировано',
  agentNotSentYet: 'Агент · ещё не отправлено',
  willBeSentAt: (ts: string) => `Будет отправлено ${ts}`,
  sendNow: 'Отправить сейчас',
  sendingNow: 'Отправка…',
  sendNowConfirm: 'Отправить запланированное письмо сейчас?',
  sendNowFailed: 'Не удалось отправить письмо.',
  scheduledDraftUnavailable: 'Запланированное напоминание (черновик недоступен)',
  draftingEmail: (first: boolean) => `Агент сейчас составляет ${first ? 'первое' : 'следующее'} письмо…`,
  goalCompleteFooter: 'Цель достигнута — дальнейшие напоминания не запланированы.',

  // StatTiles / shared stats
  docsCollectedLabel: 'Собранные документы',
  noDocsDefined: 'Документы не заданы',
  allCollected: 'Всё собрано',
  nMissing: (n: number) => `Не хватает: ${n}`,
  messagesExchangedLabel: 'Обмен сообщениями',
  noEmailsYet: 'Писем пока нет',
  sentReceived: (sent: number, received: number) => `${sent} отправлено · ${received} получено`,
  lastClientReply: 'Последний ответ клиента',
  today: 'Сегодня',
  yesterday: 'Вчера',
  daysAgo: (n: number) => `${n} ${ruPlural(n, 'день', 'дня', 'дней')} назад`,
  noRepliesYet: 'Ответов пока нет',
  noReplyFlag: 'Без ответа',
  nextFollowUpLabel: 'Следующее напоминание',
  doneLabel: 'Готово',
  atTime: (time: string) => `в ${time}`,
  noFurtherFollowUps: 'Дальнейших напоминаний нет',
  notScheduled: 'Не запланировано',

  // Overview
  dashboardLoadFailed: 'Не удалось загрузить панель.',
  dashboardFillsUp: 'Клиентов пока нет — панель заполнится по мере их добавления.',
  clientsLabel: 'Клиенты',
  completeAndPending: (complete: number, pending: number) => `${complete} завершено · ${pending} в процессе`,
  sentReceivedFiles: (sent: number, received: number, files: number) =>
    `${sent} отправлено · ${received} получено · ${files} ${ruPlural(files, 'файл', 'файла', 'файлов')}`,
  scheduledFollowUpsLabel: 'Запланированные напоминания',
  nextAt: (date: string) => `Ближайшее: ${date}`,
  noScheduledFollowUps: 'Нет запланированных напоминаний',
  emailActivity: 'Активность почты',
  allClientsLastWeeks: (weeks: number) => `Все клиенты · последние ${weeks} ${ruPlural(weeks, 'неделя', 'недели', 'недель')}`,
  emailsPerWeekAllClients: 'Письма по неделям, все клиенты',
  seriesSent: 'Отправлено',
  seriesReceived: 'Получено',
  clientStatus: 'Статус клиентов',
  clientsByStatus: 'Клиенты по статусу сбора',
  statusComplete: 'Завершено',
  statusActive: 'Активный сбор',
  statusNotStarted: 'Ещё ничего не собрано',
  progressByClient: 'Прогресс по клиентам',
  collectedOfRequested: 'Собранные документы из запрошенных',
  noDocuments: 'Нет документов',
  needsAttention: 'Требуют внимания',
  attentionSubtitle: (days: number) => `Без ответа ${days}+ дней или без напоминания`,
  silentForDays: (n: number) => `Без ответа ${n} ${ruPlural(n, 'день', 'дня', 'дней')}`,
  neverReplied: 'Ответа ещё не было',
  noFollowUpScheduled: 'Напоминание не запланировано',
  allClear: 'Всё в порядке — ни один клиент не застрял',
  upcomingFollowUps: 'Ближайшие напоминания',
  upcomingFollowUpsSubtitle: 'Письма, которые агент отправит автоматически',
  noFollowUpsRightNow: 'Сейчас нет запланированных напоминаний',

  // DocumentsCard
  requiredDocuments: 'Необходимые документы',
  collectedBadge: (collected: number, total: number) => `${collected} / ${total} собрано`,
  docsUpdateFailed: 'Не удалось обновить документы.',
  noDocsNothingToCollect: 'Документы не заданы — агенту нечего собирать у этого клиента.',
  markPending: 'Отметить как ожидающий',
  markCollected: 'Отметить как собранный',
  collectedStatus: 'Собран',
  pendingStatus: 'Ожидается',
  removeDocument: 'Удалить документ',
  docNamePlaceholder: 'Название документа, например форма 106',
  docNameAria: 'Название документа',
  docDescPlaceholder: 'Описание (необязательно, помогает агенту объяснить документ)',
  docDescAria: 'Описание документа',
  addDocument: 'Добавить документ',

  // FilesCard
  filesReceived: 'Полученные файлы',
  analysisPending: 'Ещё не проанализирован',
  analysisFailed: 'Анализ не удался',
  analysisUnsupported: 'Содержимое нельзя проанализировать',
  analysisIdentified: (kind: string) => `Распознано по содержимому: ${kind}`,
  analysisTaxYear: (year: string) => `Налоговый год ${year}`,
  analysisNotLegible: 'Нечитаемо',

  // AddClientModal
  addClientTitle: 'Добавить клиента',
  addClientLead:
    'Агент сам составляет первое письмо и выбирает, когда его отправить. Письмо появится во вкладке переписки как ожидающее отправки, и дальше агент ведёт напоминания, пока не соберёт все документы.',
  atLeastOneDoc: 'Добавьте хотя бы один документ, который агент будет собирать.',
  createClientFailed: 'Не удалось создать клиента.',
  documentsToCollect: 'Документы для сбора',
  removeNamed: (name: string) => `Удалить ${name}`,
  egForm106: 'например форма 106',
  creating: 'Создание…',
  create: 'Создать',

  // DeleteClientModal
  deleteClientFailed: 'Не удалось удалить клиента.',
  deleteQuestionPrefix: 'Удалить ',
  deleteQuestionSuffix: '?',
  deleteWarning: 'Письма, документы и файлы клиента тоже будут удалены. Это действие нельзя отменить.',
  deleting: 'Удаление…',
  deleteClient: 'Удалить клиента',

  // PromptSettings
  promptLoadFailed: 'Не удалось загрузить шаблон промпта.',
  promptSaved: 'Сохранено. Следующий вызов Gemini будет использовать этот шаблон.',
  promptRestored: 'Восстановлен встроенный шаблон по умолчанию.',
  resetFailed: 'Не удалось выполнить сброс.',
  geminiSystemPrompt: 'Системный промпт Gemini',
  customTemplate: 'Пользовательский шаблон',
  builtinDefault: 'Встроенный по умолчанию',
  lastSaved: (ts: string) => `Последнее сохранение: ${ts}`,
  resetToDefault: 'Сбросить к значению по умолчанию',
  promptLead:
    'Этот шаблон становится системной инструкцией при каждом решении Gemini (достигнута ли цель и какое напоминание составить). Плейсхолдеры заполняются для каждого клиента в момент вызова:',
  appendAtEnd: 'Добавить в конец',

  // AdminDashboard
  accountantsLoadFailed: 'Не удалось загрузить бухгалтеров.',
  impersonateFailed: 'Не удалось войти в аккаунт.',
  activateFailed: 'Не удалось активировать аккаунт.',
  revokeFailed: 'Не удалось отозвать доступ.',
  revokeConfirm: (email: string) => `Отозвать доступ для ${email}? Изменение вступит в силу немедленно.`,
  noAccessBadge: 'Нет доступа',
  noAccessTitle: 'Вошли через Google, но не входят в список разрешённых — они видят только экран обращения к администратору.',
  activeBadge: 'Активен',
  invitedBadge: 'Приглашён',
  invitedTitle: 'В списке разрешённых, но ещё не входил.',
  adminBadge: 'Администратор',
  accountantsLabel: 'Бухгалтеры',
  withAgentMailbox: (n: number) => `${n} с почтовым ящиком агента`,
  acrossAllAccountants: 'По всем бухгалтерам',
  clientsCompleteLabel: 'Завершённые клиенты',
  stillInProgress: (n: number) => `${n} ещё в процессе`,
  noDocsRequestedYet: 'Документы ещё не запрашивались',
  oneAccount: '1 аккаунт',
  nAccounts: (n: number) => `${n} ${ruPlural(n, 'аккаунт', 'аккаунта', 'аккаунтов')}`,
  addShort: '+ Добавить',
  noAccountantsYet: 'Бухгалтеров пока нет — добавьте Gmail-адрес платного клиента, чтобы открыть ему доступ.',
  selectAccountant: 'Выберите бухгалтера из списка, чтобы увидеть его данные.',
  justAMoment: 'Секунду…',
  enterAccount: 'Войти в аккаунт',
  revokeAccess: 'Отозвать доступ',
  activate: 'Активировать',
  mailboxNotSet: 'Не задан',
  joinedLabel: 'Регистрация',
  notSignedInYet: 'Ещё не входил',
  noClients: 'Нет клиентов',
  collectedOfTitle: (collected: number, total: number) => `Собрано ${collected} из ${total} документов`,
  modelLabel: 'Модель',
  inputTokens: 'Входные токены',
  outputTokens: 'Выходные токены',
  thinkingTokens: 'Токены размышления',
  totalCost: 'Общая стоимость',
  adminDetailNote:
    'Пользоваться приложением могут только бухгалтеры из списка разрешённых. «Войти в аккаунт» открывает их панель ровно так, как её видят они, — и пока вы внутри, каждое ваше действие применяется к их аккаунту.',
  accountantsRefreshFailed: 'Не удалось обновить список бухгалтеров.',
  llmModelTitle: 'Языковая модель',
  llmModelDesc:
    'Модель Gemini для всех LLM-вызовов — составления писем, решений о расписании и анализа файлов — для всех бухгалтеров и всех клиентов. Изменение вступает в силу немедленно, со следующего вызова.',
  llmModelSaved: 'Сохранено. Все последующие вызовы будут использовать эту модель.',
  llmModelLoadFailed: 'Не удалось загрузить настройку модели.',
  llmModelSaveFailed: 'Не удалось сохранить модель.',
  llmModelEnvDefault: 'Значение по умолчанию сервера',

  // AddAccountantModal
  addAccountantTitle: 'Добавить бухгалтера',
  addAccountantLead:
    'Добавьте Gmail-адрес, с которым бухгалтер будет входить. Доступ открывается сразу после добавления — войти можно немедленно.',
  googleEmail: 'Google-адрес',
  nameOptional: 'Имя (необязательно)',
  addAccountantFailed: 'Не удалось добавить бухгалтера.',
  adding: 'Добавление…',

  // Charts
  filePdf: 'PDF-файлы',
  fileImages: 'Изображения',
  fileSheets: 'Таблицы',
  fileDocs: 'Документы',
  fileOther: 'Прочее',
  removedDocument: 'Удалённый документ',
  otherDocuments: 'Другие документы',
  unlinkedToRequest: 'Не привязан к запросу',
  nodeRequested: 'Запрошено',
  nodeCollected: 'Собрано',
  nodeMissing: 'Не хватает',
  nodeViaAttachment: 'Вложением в письмо',
  nodeMarkedManually: 'Отмечено вручную',
  nodeFollowUpScheduled: 'Напоминание запланировано',
  nodeAwaitingClient: 'Ожидание клиента',
  perWeekLastN: (weeks: number) => `По неделям · последние ${weeks} ${ruPlural(weeks, 'неделя', 'недели', 'недель')}`,
  emailsPerWeek: 'Письма по неделям',
  filesByType: 'Файлы по типу',
  filesCenterLabel: 'Файлы',
  noFilesYet: 'Файлы ещё не поступали',
  documentJourney: 'Путь документов',
  documentJourneySubtitle: 'Как продвигаются запрошенные документы',
  documentsUnit: 'документы',
  filesByRequest: 'Файлы по запросу',
  filesByRequestedDoc: 'Файлы по запрошенному документу',
  cumulativeLastN: (weeks: number) => `Накопительно · последние ${weeks} ${ruPlural(weeks, 'неделя', 'недели', 'недель')}`,
  filesOverTime: 'Полученные файлы во времени',
  srFrom: 'Откуда',
  srTo: 'Куда',
  srCategory: 'Категория',
  srCount: 'Количество',
  srPercent: 'Процент',
  srPeriod: 'Период',
};

const CATALOGS: Record<Lang, Messages> = { he, en, ru };

function storedLang(): Lang {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'en' || stored === 'ru' ? stored : 'he';
}

interface I18n {
  lang: Lang;
  t: Messages;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(storedLang);

  // Date formatting reads a module-level locale; it must be current before the
  // subtree re-renders with the new language, so set it during render.
  setDateLocale(DATE_LOCALES[lang]);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === 'he' ? 'rtl' : 'ltr';
  }, [lang]);

  const setLang = (next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  };

  return <I18nContext.Provider value={{ lang, t: CATALOGS[lang], setLang }}>{children}</I18nContext.Provider>;
}

export function useT(): I18n {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useT must be used inside I18nProvider');
  return ctx;
}

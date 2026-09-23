import type { ItemColumnDetail } from '../shared/mondayData.js';
import { isValidIsraeliId } from './verifyChecks.js';
import { mergeSpouse, type MaritalStatus, type SpouseOnFile } from './spouseIdentity.js';

/**
 * Which cells of a monday card (the CRM card, or the questionnaire item) are
 * the client's national id (ת"ז), the spouse's name / id, and the marital
 * status — the pure rules shared by the kickoff (enrollment / refresh) and by
 * document verification's fallback fetch (openspec `declaration-kickoff`,
 * `spouse-identity`).
 *
 * A client-id candidate is a non-empty cell whose column title names an id —
 * Hebrew (`מספר זהות`, `תעודת זהות`, `זהות`, `ת"ז` in any punctuation) or
 * English (`id`, `id number`, `national id`, `identity` as words) — with at
 * least five digits, and whose title does NOT name the spouse. Titles that
 * name a monday/item/board id are never candidates. Among several candidates
 * the one whose digits pass the Israeli checksum wins, else the first. The
 * title must name an id: a value-only rule would let a tax file number or
 * phone fragment through by chance.
 */
const ID_TITLE_HE = /מספר זהות|תעודת זהות|זהות|ת\.?["”״׳']?ז\.?/;
const ID_TITLE_EN = /\b(id|id number|national id|identity)\b/i;
const NOT_AN_ID_TITLE = /item|board|monday|pulse/i;
/** A title that names the spouse — the cell belongs to the spouse, never to the client. */
export const SPOUSE_TITLE = /בן\s*\/?\s*(או\s+)?בת\s+ה?זוג|בן\s+ה?זוג|בת\s+ה?זוג|\b(spouse|partner)\b/i;
const MARITAL_TITLE = /סטטוס משפחתי|מצב משפחתי|marital/i;
const MARRIED_VALUE = /נשוי|נשואה|married/i;
const NOT_MARRIED_VALUE = /רווק|גרוש|אלמן|פרוד|single|divorced|widow|separated/i;

function namesId(title: string): boolean {
  return !NOT_AN_ID_TITLE.test(title) && (ID_TITLE_HE.test(title) || ID_TITLE_EN.test(title));
}

function pickId(cells: readonly ItemColumnDetail[]): string | null {
  const candidates = cells.map((c) => c.text.replace(/\D/g, '')).filter((digits) => digits.length >= 5);
  return candidates.find((digits) => isValidIsraeliId(digits)) ?? candidates[0] ?? null;
}

export function crmIdNumber(columns: readonly ItemColumnDetail[]): string | null {
  return pickId(
    columns.filter((c) => c.text.trim() !== '').filter((c) => namesId(c.title.trim()) && !SPOUSE_TITLE.test(c.title.trim())),
  );
}

/**
 * The spouse as the card states them: a spouse-titled cell that also names an
 * id (≥ 5 digits, checksum-valid preferred) is the spouse's id; a spouse-titled
 * cell that names no id and holds at least two letters is the spouse's name.
 */
export function crmSpouse(columns: readonly ItemColumnDetail[]): { name: string | null; idNumber: string | null } {
  const spouseCells = columns.filter((c) => c.text.trim() !== '' && SPOUSE_TITLE.test(c.title.trim()));
  const idNumber = pickId(spouseCells.filter((c) => namesId(c.title.trim())));
  const nameCell = spouseCells.find((c) => !namesId(c.title.trim()) && (c.text.match(/\p{L}/gu) ?? []).length >= 2);
  return { name: nameCell ? nameCell.text.trim() : null, idNumber };
}

/**
 * The spouse and marital status the kickoff records from the two cards, merged
 * onto what the client already has: the questionnaire item's cells first, the
 * CRM card's second, each replacing only a value of lower trust (a document-
 * inferred one) and never clearing what is on file. `maritalStatus` is null
 * when neither card states it — the caller then leaves the stored status alone.
 */
export function spouseFromCards(
  current: SpouseOnFile,
  formColumns: readonly ItemColumnDetail[],
  crmColumns: readonly ItemColumnDetail[],
): { spouse: SpouseOnFile; maritalStatus: MaritalStatus | null } {
  const spouse = mergeSpouse(mergeSpouse(current, crmSpouse(formColumns), 'questionnaire'), crmSpouse(crmColumns), 'crm');
  return { spouse, maritalStatus: crmMaritalStatus(formColumns) ?? crmMaritalStatus(crmColumns) };
}

/** The marital status as the card states it; null when no cell says, or the value is neither married nor not married. */
export function crmMaritalStatus(columns: readonly ItemColumnDetail[]): MaritalStatus | null {
  const cell = columns.find((c) => c.text.trim() !== '' && MARITAL_TITLE.test(c.title.trim()));
  if (!cell) return null;
  if (MARRIED_VALUE.test(cell.text)) return 'married';
  if (NOT_MARRIED_VALUE.test(cell.text)) return 'not_married';
  return null;
}

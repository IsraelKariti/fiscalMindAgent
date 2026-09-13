import type { ItemColumnDetail } from '../shared/mondayData.js';
import { isValidIsraeliId } from './verifyChecks.js';

/**
 * Which cell of a monday CRM card is the client's national id (ת"ז) — the
 * pure rule shared by the kickoff (enrollment / refresh) and by document
 * verification's fallback fetch (openspec `declaration-kickoff`).
 *
 * A candidate is a non-empty cell whose column title names an id — Hebrew
 * (`מספר זהות`, `תעודת זהות`, `זהות`, `ת"ז` in any punctuation) or English
 * (`id`, `id number`, `national id`, `identity` as words) — with at least five
 * digits. Titles that name a monday/item/board id are never candidates. Among
 * several candidates the one whose digits pass the Israeli checksum wins,
 * else the first. The title must name an id: a value-only rule would let a
 * tax file number or phone fragment through by chance.
 */
const ID_TITLE_HE = /מספר זהות|תעודת זהות|זהות|ת\.?["”״׳']?ז\.?/;
const ID_TITLE_EN = /\b(id|id number|national id|identity)\b/i;
const NOT_AN_ID_TITLE = /item|board|monday|pulse/i;

export function crmIdNumber(columns: readonly ItemColumnDetail[]): string | null {
  const candidates = columns
    .filter((c) => c.text.trim() !== '')
    .filter((c) => {
      const title = c.title.trim();
      return !NOT_AN_ID_TITLE.test(title) && (ID_TITLE_HE.test(title) || ID_TITLE_EN.test(title));
    })
    .map((c) => c.text.replace(/\D/g, ''))
    .filter((digits) => digits.length >= 5);
  return candidates.find((digits) => isValidIsraeliId(digits)) ?? candidates[0] ?? null;
}

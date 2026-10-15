import type { WaTemplateRow } from '../../db/types.js';

/** A template of the agent type the planner may not send to this client, with the reason. */
export interface HiddenTemplate {
  template: WaTemplateRow;
  /** Why the planner may not send it to this client, in the prompt's language. */
  reason: string;
}

/**
 * Which templates the planner may send to this client (openspec
 * `whatsapp-templates`): `intro` ones only until a message was delivered,
 * `reopen` ones only after. The others are listed as hidden, with the reason,
 * so the prompt and the gate agree. Pure.
 */
export function splitTemplatesByPurpose(
  all: WaTemplateRow[],
  firstContactDone: boolean,
): { templates: WaTemplateRow[]; hiddenTemplates: HiddenTemplate[] } {
  const templates: WaTemplateRow[] = [];
  const hiddenTemplates: HiddenTemplate[] = [];
  for (const t of all) {
    const usable = t.purpose === 'intro' ? !firstContactDone : firstContactDone;
    if (usable) templates.push(t);
    else hiddenTemplates.push({ template: t, reason: hiddenTemplateReason(t) });
  }
  return { templates, hiddenTemplates };
}

/** One sentence the prompt and the gate both use for a template of the wrong purpose. */
export function hiddenTemplateReason(t: WaTemplateRow): string {
  return t.purpose === 'intro'
    ? 'intro template, already delivered to this client — never send it twice'
    : 'reopen template: the client has not had the first contact yet';
}

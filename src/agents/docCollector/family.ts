/**
 * Agent types that share the doc collector's behavior wholesale: a
 * required-documents checklist chased over email/WhatsApp, client-import
 * sources with a mapped documents column, due-date/overdue handling and the
 * documents CRUD router. The declaration-of-capital collector differs only in
 * what the documents are for (a once-every-four-years הצהרת הון instead of the
 * annual tax return), which lives in its own prompt template.
 */
export const DOC_COLLECTOR_FAMILY = ['doc_collector', 'declaration_of_capital'] as const;

export type DocCollectorFamilyType = (typeof DOC_COLLECTOR_FAMILY)[number];

export function isDocCollectorFamily(agentType: string): agentType is DocCollectorFamilyType {
  return (DOC_COLLECTOR_FAMILY as readonly string[]).includes(agentType);
}

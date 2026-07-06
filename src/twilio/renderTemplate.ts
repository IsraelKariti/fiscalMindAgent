/**
 * Substitutes {{1}}..{{n}} slots locally so the stored draft/message row (and
 * therefore the transcript and the GUI) shows the text the client actually
 * receives, not the raw template.
 */
export function renderTemplateBody(body: string, variables: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (match, n: string) => variables[Number(n) - 1] ?? match);
}

import { useMemo } from 'react';
import DOMPurify from 'dompurify';
import { marked } from 'marked';

/**
 * Renders a prompt (system instruction) as markdown instead of raw text, so
 * the bold markers, bullets and numbered steps the prompt files use read as
 * formatting rather than as `**` and `-` characters.
 *
 * Direction is decided per paragraph (CSS `unicode-bidi: plaintext`), so a
 * Hebrew prompt with English technical lines renders each line the way it
 * was written. The HTML is sanitized before it is injected; raw HTML inside
 * the prompt text is dropped, and `{{placeholder}}` tokens are highlighted
 * when `highlightPlaceholders` is set (the LLM-stages page).
 */
export function MarkdownPane({
  text,
  tone,
  highlightPlaceholders,
}: {
  text: string;
  tone: string;
  highlightPlaceholders?: boolean;
}) {
  const html = useMemo(() => renderMarkdown(text, highlightPlaceholders ?? false), [text, highlightPlaceholders]);
  return <div className={`llm-pane llm-pane-md llm-pane-${tone}`} dir="auto" dangerouslySetInnerHTML={{ __html: html }} />;
}

function renderMarkdown(text: string, highlightPlaceholders: boolean): string {
  // `breaks: true` keeps the author's single line breaks (the prompt files
  // rely on them inside a block); `gfm` for tables and task lists.
  const raw = marked.parse(text, { gfm: true, breaks: true, async: false }) as string;
  const marked_ = highlightPlaceholders
    ? raw.replace(/\{\{[a-z_]+\}\}/g, (m) => `<mark class="llm-placeholder">${m}</mark>`)
    : raw;
  return DOMPurify.sanitize(marked_, { USE_PROFILES: { html: true } });
}

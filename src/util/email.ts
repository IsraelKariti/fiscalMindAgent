/** Parses a "Display Name <address@example.com>" or bare "address@example.com" header into just the address. */
export function parseEmailAddress(headerValue: string): string {
  const match = headerValue.match(/<([^>]+)>/);
  return (match?.[1] ?? headerValue).trim().toLowerCase();
}

const OUTLOOK_DIVIDER = /^-{2,}\s*(Original Message|Forwarded message|הודעה מקורית)\s*-{2,}$/i;
const OUTLOOK_FROM_LINE = /^(From|מאת):\s/;
const OUTLOOK_SECOND_LINE = /^(Sent|Date|To|Subject|נשלח|תאריך|אל|נושא):\s/;

/** Trims a line and drops bidi control marks (U+200E/F, U+202A-E) Gmail sprinkles into RTL attribution lines. */
function cleanLine(line: string): string {
  return line.replace(/[\u200E\u200F\u202A-\u202E]/g, '').trim();
}

/**
 * Removes the trailing quoted copy of the previous thread that mail clients
 * append to a reply, so only the text the client actually typed is kept.
 *
 * Handled shapes:
 * - Gmail-style: an "On ... wrote:" / "בתאריך ... :" attribution line (possibly
 *   wrapped over a few lines) followed by ">"-quoted lines. Stripped only when
 *   nothing but quoted/blank lines follows, so inline replies survive intact.
 * - Outlook-style: an "-----Original Message-----" divider or a "From:"+"Sent:"
 *   header block; everything from there down is the old message.
 *
 * If stripping would leave an empty body, the original text is returned.
 */
export function stripQuotedReply(text: string): string {
  const lines = text.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = cleanLine(lines[i] ?? '');

    if (
      OUTLOOK_DIVIDER.test(line) ||
      (OUTLOOK_FROM_LINE.test(line) && OUTLOOK_SECOND_LINE.test(cleanLine(lines[i + 1] ?? '')))
    ) {
      return truncatedAt(lines, i, text);
    }

    let quoteStart = -1; // first line of the ">"-quoted block that must fill the rest
    if (/^(On|בתאריך)\s/.test(line)) {
      // The attribution may wrap; try joining up to three physical lines.
      for (let k = i; k < Math.min(i + 3, lines.length); k++) {
        const joined = lines.slice(i, k + 1).map(cleanLine).join(' ');
        if (/^On\s.{0,300}wrote:$/.test(joined) || /^בתאריך\s.{0,300}:$/.test(joined)) {
          quoteStart = k + 1;
          break;
        }
      }
    } else if (line.startsWith('>')) {
      quoteStart = i;
    }

    if (quoteStart !== -1) {
      const rest = lines.slice(quoteStart).map(cleanLine);
      if (rest.every((l) => l === '' || l.startsWith('>'))) return truncatedAt(lines, i, text);
    }
  }
  return text.trim();
}

function truncatedAt(lines: string[], cutAt: number, original: string): string {
  const kept = lines.slice(0, cutAt).join('\n').trim();
  return kept !== '' ? kept : original.trim();
}

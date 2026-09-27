/** Normalise for a wording comparison: case, curly quotes, whitespace and trailing punctuation don't count. */
function norm(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[…]/g, "...")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * True when every sentence of the display quote appears word-for-word in the client's answers,
 * i.e. the owner only selected and trimmed. Anything reworded should be approved by the client.
 */
export function isVerbatimQuote(quote: string | null | undefined, answers: string[]): boolean {
  if (!quote?.trim()) return true;
  const source = norm(answers.join(" "));
  const parts = quote.match(/[^.!?\n]+[.!?]*/g) ?? [quote];
  return parts
    .map((p) => norm(p).replace(/^["'(]+|["')]+$/g, "").replace(/[.!?]+$/, "").trim())
    .filter(Boolean)
    .every((p) => source.includes(p));
}

/** Download filename for a client's video: `jordan-blake-testimonial-2026-09-27.webm`. */
export function videoDownloadName(clientName: string, date: string | null, path: string): string {
  const slug =
    clientName
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "client";
  const ext = /\.(webm|mp4|mov)$/i.exec(path)?.[1]?.toLowerCase() ?? "webm";
  return `${slug}-testimonial-${(date ?? "").slice(0, 10) || "video"}.${ext}`;
}

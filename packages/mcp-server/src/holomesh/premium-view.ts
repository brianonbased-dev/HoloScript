/**
 * What a reader who has NOT paid sees of a premium knowledge entry.
 *
 * Doors audit 2026-09-15, round 3. A premium entry is one with a price above
 * zero. Its full text goes only to an entitled reader: the author, a founder
 * key, or a caller with a recorded purchase. WHO is entitled is decided in one
 * place, `entryForViewer` / `premiumEntryAccess` in entry-lookup.ts. WHAT
 * everyone else sees is decided here, in `hidePremiumText`, and nowhere else.
 *
 * The teaser is at most a third of the text and never more than 120
 * characters, so a short premium entry is never shown whole. Metadata is
 * dropped from a locked entry because orchestrator metadata can carry page
 * text or titles written by the author.
 *
 * This module imports nothing on purpose. Exits that can never know who the
 * reader is (the oracle and founder tools that read the orchestrator directly,
 * the search snippet builder, daemon replies to remote agents) call
 * `hidePremiumText` directly without loading the HoloMesh state stores.
 */

export const PREMIUM_TEASER_MAX_CHARS = 120;
export const PREMIUM_LOCK_MARKER =
  '\n... [premium content, open to its author or a recorded purchase]';

/** Price of an entry, read from `price` or, for raw orchestrator rows, `metadata.price`. */
export function premiumPrice(entry: { price?: unknown; metadata?: unknown }): number {
  const top = Number(entry?.price);
  if (Number.isFinite(top) && top > 0) return top;
  const meta = entry?.metadata;
  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const nested = Number((meta as Record<string, unknown>).price);
    if (Number.isFinite(nested) && nested > 0) return nested;
  }
  return 0;
}

export function isPremiumEntry(entry: { price?: unknown; metadata?: unknown }): boolean {
  return premiumPrice(entry) > 0;
}

/** At most a third of the text, never more than 120 characters, then the lock marker. */
export function premiumTeaser(content: unknown): string {
  const text = typeof content === 'string' ? content : '';
  const shown = Math.min(PREMIUM_TEASER_MAX_CHARS, Math.floor(text.length / 3));
  return `${text.slice(0, shown)}${PREMIUM_LOCK_MARKER}`;
}

/** A premium entry as an unentitled reader may see it: teaser only, no metadata, marked locked. */
export function hidePremiumText<T extends { content?: unknown; metadata?: unknown }>(
  entry: T
): T & { premium: true; locked: true } {
  return {
    ...entry,
    content: premiumTeaser(entry.content),
    metadata: undefined,
    premium: true,
    locked: true,
  };
}

/** Free entries pass through unchanged; premium entries lose their text. For readers who can never be entitled. */
export function hidePremiumTextIfPremium<
  T extends { content?: unknown; metadata?: unknown; price?: unknown },
>(entry: T): T {
  return isPremiumEntry(entry) ? hidePremiumText(entry) : entry;
}

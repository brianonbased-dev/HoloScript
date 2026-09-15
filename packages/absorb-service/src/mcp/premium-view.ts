/**
 * What a reader who has NOT paid sees of a premium knowledge entry.
 *
 * ONE RULE, THREE SERVERS. This file is kept byte-identical in
 *   packages/mcp-server/src/holomesh/premium-view.ts   (HoloMesh, the canonical copy)
 *   packages/studio/src/lib/premium-view.ts            (Studio)
 *   packages/absorb-service/src/mcp/premium-view.ts    (absorb MCP)
 * because the three deploy separately and cannot import each other. The guard
 * test packages/mcp-server/src/holomesh/__tests__/premium-exit-guard.test.ts
 * fails if the copies drift. Edit the HoloMesh copy, then copy it over the
 * other two.
 *
 * Doors audit 2026-09-15. A premium entry is one with a price above zero (or,
 * in a cached or foreign row, a premium flag). Its full text goes only to an
 * entitled reader: the author, a founder key, or a caller with a recorded
 * purchase. WHO is entitled is decided on the HoloMesh server, in
 * `entryForViewer` / `premiumEntryAccess` (holomesh/entry-lookup.ts). WHAT
 * everyone else sees is decided here and nowhere else.
 *
 * The teaser is at most a third of the text and never more than 120
 * characters, so a short premium entry is never shown whole. Metadata is
 * dropped from a locked entry because orchestrator metadata can carry page
 * text or titles written by the author.
 *
 * This module imports nothing on purpose, so any exit can use it without
 * loading the HoloMesh state stores.
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

/**
 * A premium row in any shape our servers pass around: a price (top level or in
 * metadata), or a premium flag as cached rows (`premium`), absorb rows
 * (`is_premium`) and database rows (`isPremium`) carry it.
 */
export function isPremiumRow(row: unknown): boolean {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return false;
  const r = row as Record<string, unknown>;
  return isPremiumEntry(r) || r.premium === true || r.is_premium === true || r.isPremium === true;
}

/** The part of the text an unentitled reader may see: at most a third, never more than 120 characters. */
export function premiumTeaserText(content: unknown): string {
  const text = typeof content === 'string' ? content : '';
  const shown = Math.min(PREMIUM_TEASER_MAX_CHARS, Math.floor(text.length / 3));
  return text.slice(0, shown);
}

/** The teaser text followed by the lock marker. */
export function premiumTeaser(content: unknown): string {
  return `${premiumTeaserText(content)}${PREMIUM_LOCK_MARKER}`;
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

/** Field names that carry entry text inside a row or a listing preview. */
const PREMIUM_TEXT_FIELDS = new Set(['content', 'snippet', 'text', 'body', 'excerpt']);

/** Plain JSON-style objects only: a Date or a class instance passes through untouched. */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function carriesText(row: Record<string, unknown>): boolean {
  for (const [key, value] of Object.entries(row)) {
    if (PREMIUM_TEXT_FIELDS.has(key) && typeof value === 'string') return true;
    if (key === 'preview' && isPlainObject(value)) return true;
  }
  return false;
}

function lockRowText(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(lockRowText);
  if (!isPlainObject(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(value as Record<string, unknown>)) {
    if (key === 'metadata') continue;
    out[key] =
      PREMIUM_TEXT_FIELDS.has(key) && typeof inner === 'string'
        ? premiumTeaser(inner)
        : lockRowText(inner);
  }
  return out;
}

/**
 * For a payload whose reader is not known to be entitled: walk any JSON value
 * and replace every premium row that carries text (content, snippet, text,
 * body, excerpt, or a listing preview) with its teaser, drop its metadata and
 * mark it locked. Free rows and everything else pass through unchanged.
 */
export function hidePremiumRowsDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map((item) => hidePremiumRowsDeep(item)) as T;
  if (!isPlainObject(value)) return value;
  const obj = value;
  if (isPremiumRow(obj) && carriesText(obj)) {
    return { ...(lockRowText(obj) as Record<string, unknown>), premium: true, locked: true } as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, inner] of Object.entries(obj)) out[key] = hidePremiumRowsDeep(inner);
  return out as T;
}

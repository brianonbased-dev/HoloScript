/**
 * Safe JSON parsing with Zod — avoids silent crashes and supports schema validation
 * (Wave 2 audit: W2-T1).
 */
import { z, type ZodType } from 'zod';

export type JsonParseError =
  | { kind: 'json-parse'; message: string; cause?: unknown }
  | { kind: 'schema'; message: string; zodError: z.ZodError };

export type SafeJsonResult<T> = { ok: true; value: T } | { ok: false; error: JsonParseError };

/**
 * Parse JSON, then validate with a Zod schema. Use for untrusted or persisted strings.
 */
export function safeJsonParse<T>(s: string, schema: ZodType<T>): SafeJsonResult<T> {
  let raw: unknown;
  try {
    raw = JSON.parse(s);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: { kind: 'json-parse', message, cause: e } };
  }
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, value: parsed.data };
  }
  return {
    ok: false,
    error: { kind: 'schema', message: parsed.error.message, zodError: parsed.error },
  };
}

/**
 * Like `JSON.parse` but the non-throwing core is `safeJsonParse` + `z.unknown()`.
 * Throws `SyntaxError` on invalid JSON to match `JSON.parse` behavior for callers
 * that expect throws.
 */
export function readJson(s: string): unknown {
  const r = safeJsonParse(s, z.unknown());
  if (r.ok) {
    return r.value;
  }
  if (r.error.kind === 'json-parse') {
    const err = new SyntaxError(r.error.message);
    (err as Error & { cause?: unknown }).cause = r.error.cause;
    throw err;
  }
  throw new Error(`[readJson] schema failure on z.unknown: ${r.error.message}`);
}

/** Deep clone via JSON round-trip (same caveats as JSON.parse/stringify). */
export function jsonClone<T>(value: T): T {
  return readJson(JSON.stringify(value)) as T;
}

/** Alias for `safeJsonParse` (barrel / legacy name). */
export const safeJsonParseSchema = safeJsonParse;

/** Alias for `SafeJsonResult` in older export tables. */
export type { SafeJsonResult as JsonParseResult };

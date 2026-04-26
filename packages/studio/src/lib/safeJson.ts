/**
 * Safe JSON parsing helpers for Studio — non-throwing wrappers around
 * `JSON.parse` for trust-untyped boundaries: localStorage reads, WebSocket /
 * EventSource messages, postMessage payloads, drag-drop data, file imports.
 *
 * Mirrors `tryParseJson` from `@holoscript/core` (errors/safeJsonParse.ts).
 * We keep a studio-local copy to avoid pulling the core barrel into the Next.js
 * bundle for a 12-line helper, and because the hand-crafted core `dist/index.d.ts`
 * does not currently re-export this surface.
 *
 * Filed under task_1776983047367_7vx1: "Audit: Add error handling to JSON.parse calls".
 */

/**
 * Non-throwing JSON parse with a typed fallback. Returns `fallback` on:
 *   - `null` / `undefined` input
 *   - `JSON.parse` throws (SyntaxError on malformed JSON)
 *
 * Does NOT validate shape — the caller is responsible for narrowing the
 * runtime value if it matters. The return type is widened to `T` purely for
 * callsite ergonomics.
 *
 * Example:
 *   const favorites = tryParseJson<string[]>(localStorage.getItem(KEY), []);
 *   const evt = tryParseJson<RoomEvent | null>(message.data, null);
 */
export function tryParseJson<T>(s: string | null | undefined, fallback: T): T {
  if (s === null || s === undefined) {
    return fallback;
  }
  try {
    return JSON.parse(s) as T;
  } catch {
    return fallback;
  }
}

/**
 * Result-type variant for cases that need to distinguish "missing input" from
 * "malformed input" from "valid input." Useful at user-facing import paths
 * where you want to surface a specific error message.
 */
export type SafeJsonResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: 'empty' | 'parse'; message?: string };

export function safeParseJson<T = unknown>(s: string | null | undefined): SafeJsonResult<T> {
  if (s === null || s === undefined || s === '') {
    return { ok: false, error: 'empty' };
  }
  try {
    return { ok: true, value: JSON.parse(s) as T };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, error: 'parse', message };
  }
}

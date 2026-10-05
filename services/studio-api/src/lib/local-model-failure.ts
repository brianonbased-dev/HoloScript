/**
 * What a local model server said when it failed goes to the server log, not to the client.
 *
 * studio-api has no auth on its model routes (only the CSRF check in src/proxy.ts), and the
 * detail can name the server's host. So the routes answer with generic text and call this
 * with the detail. The same line from the same route is written at most once a minute:
 * autocomplete fails on every keystroke while the server is down.
 */
const REPEAT_AFTER_MS = 60_000;

const lastLine = new Map<string, { detail: string; at: number }>();

export function logLocalModelFailure(caller: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  const now = Date.now();
  const previous = lastLine.get(caller);
  if (previous && previous.detail === detail && now - previous.at < REPEAT_AFTER_MS) return;
  lastLine.set(caller, { detail, at: now });
  console.warn(`[${caller}] local model server failed: ${detail}`);
}

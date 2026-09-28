/**
 * The local step of Studio's cloud-first web routes (/api/generate, /api/material/generate,
 * /api/autocomplete), and what /api/health reports: our own model server (D.117 retired
 * Ollama). @holoscript/llm-provider's resolveOwnedLocalProvider picks HoloServe (HOLOSERVE_URL),
 * else HoloLlama (HOLOLLAMA_URL), else nothing, and refuses a URL that is not this machine or
 * its LAN.
 *
 * Two rules live here so that no route can drop one:
 *   - One attempt (maxRetries 0), as the old Ollama fallbacks made. A retry after a 5xx gets a
 *     fresh timeout, so a failing server would otherwise hold a web request for minutes.
 *   - A failure's text goes to the server log only, never into a response: it names the
 *     server's LAN host. Each distinct failure is logged once per process, because a
 *     misconfiguration repeats on every request (autocomplete runs per keystroke).
 */
import {
  resolveOwnedLocalProvider,
  type LLMCompletionRequest,
  type ResolvedSovereignProvider,
} from '@holoscript/llm-provider';

/** Our own local server for this route, or null: nothing is configured, or the URL was refused. */
export function resolveRouteLocalModel(
  caller: string,
  timeoutMs?: number
): ResolvedSovereignProvider | null {
  try {
    return resolveOwnedLocalProvider({
      caller,
      maxRetries: 0,
      ...(timeoutMs ? { timeoutMs } : {}),
    });
  } catch (err) {
    // e.g. REFUSING HOLOLLAMA_URL (a public address): the route skips its local step.
    logRouteLocalFailure(caller, err);
    return null;
  }
}

/** One attempt at the local server: its text, or null when it failed or answered nothing. */
export async function completeWithRouteLocalModel(
  local: ResolvedSovereignProvider,
  caller: string,
  request: LLMCompletionRequest
): Promise<string | null> {
  try {
    const result = await local.provider.complete(request, local.model);
    return result.content || null;
  } catch (err) {
    logRouteLocalFailure(caller, err);
    return null;
  }
}

const MAX_LOGGED_FAILURES = 50;
const loggedFailures = new Set<string>();

function logRouteLocalFailure(caller: string, err: unknown): void {
  const detail = err instanceof Error ? err.message : String(err);
  const key = `${caller}\n${detail}`;
  if (loggedFailures.has(key) || loggedFailures.size >= MAX_LOGGED_FAILURES) return;
  loggedFailures.add(key);
  console.warn(`[${caller}] local model fallback failed (not sent to the client): ${detail}`);
}

/** Test hook: forget which failures were already logged in this process. */
export function __resetRouteLocalFailureLog(): void {
  loggedFailures.clear();
}

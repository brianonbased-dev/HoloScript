import type { StudioPublishToolName } from '@/core-ui/UXCommandPalette';

/**
 * Runs a /create palette command's mesh tool, and makes sure a failure is seen.
 *
 * Why this is a module and not a closure in page.tsx: the palette awaits a
 * command's action with no try/catch of its own (`UXCommandPalette.executeSelected`)
 * and the app registers no `unhandledrejection` handler. So before this existed,
 * BOTH failure shapes reached the user as nothing at all — no toast, no console
 * line, a keypress that appeared to do nothing:
 *
 *  - the 403 `ownKeyRequired` body from /api/mcp/call, which is what a
 *    signed-in caller now gets for the two palette tools that publish to the
 *    mesh (they were dropped from the session allowlist on purpose: under the
 *    server key they published as US);
 *  - the local sign-in refusal below.
 *
 * The 403 path is not an edge case. `meshToolsLocked` is derived from
 * `sessionStatus === 'unauthenticated'`, so it is FALSE while the session is
 * still `'loading'`. A palette keypress in that window sails past the local
 * check and meets the route's 403 instead — the same silence, by a different
 * road. Both end here.
 *
 * The error is raised as a toast and then rethrown, so a caller that wants to
 * react to the failure still can, and the palette command's own success
 * `notify` never runs.
 */
export type PaletteNotify = (
  message: string,
  type?: 'info' | 'success' | 'warning' | 'error'
) => void;

export interface PaletteMcpToolRequest {
  tool: StudioPublishToolName;
  input: Record<string, unknown>;
  /** True only once the session is known to be signed OUT — not while loading. */
  meshToolsLocked: boolean;
  notify: PaletteNotify;
  /** Injectable for tests; defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

export const PALETTE_SIGN_IN_MESSAGE =
  'Sign in to use this — publishing to the mesh needs an account.';

export async function runPaletteMcpToolRequest({
  tool,
  input,
  meshToolsLocked,
  notify,
  fetchImpl,
}: PaletteMcpToolRequest): Promise<unknown> {
  try {
    if (meshToolsLocked) {
      throw new Error(PALETTE_SIGN_IN_MESSAGE);
    }

    const doFetch = fetchImpl ?? fetch;
    const response = await doFetch('/api/mcp/call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tool, input }),
    });

    const payload = (await response.json()) as {
      error?: string;
      result?: unknown;
      offline?: boolean;
    };

    if (!response.ok || payload.error) {
      throw new Error(payload.error ?? `${tool} failed with status ${response.status}`);
    }

    return payload.result ?? payload;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    notify(message, 'error');
    throw error instanceof Error ? error : new Error(message);
  }
}

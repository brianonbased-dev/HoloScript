/**
 * The two /create palette commands, and what the user sees when they fail.
 *
 * Both Ctrl+Shift+M and Ctrl+Shift+P were dropped from the Studio-session
 * allowlist on purpose (they publish to the mesh, and under the server key they
 * published as US). That turned them into commands that refuse — and the
 * refusal reached nobody: `UXCommandPalette.executeSelected` awaits the action
 * with no try/catch, and the app registers no `unhandledrejection` handler, so
 * a keypress simply appeared to do nothing.
 *
 * Nothing here touches the network; the gateway is an injected double.
 */
import { describe, expect, it, vi } from 'vitest';
import type { StudioPublishToolName } from '@/core-ui/UXCommandPalette';

import { PALETTE_SIGN_IN_MESSAGE, runPaletteMcpToolRequest } from './paletteMcpTool';

const TOOL = 'holomesh_publish_agent_template' as StudioPublishToolName;

const OWN_KEY_REFUSAL =
  'Tool "holomesh_publish_agent_template" is not available to a Studio session. Send your own mesh API key as "x-mcp-api-key: <your key>" to run it as yourself.';

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('runPaletteMcpToolRequest — a failed palette command is seen', () => {
  it('raises the 403 refusal as an error toast, and still rethrows', async () => {
    const notify = vi.fn();
    const gateway = vi.fn(async () =>
      jsonResponse({ error: OWN_KEY_REFUSAL, ownKeyRequired: true }, 403)
    );

    await expect(
      runPaletteMcpToolRequest({
        tool: TOOL,
        input: {},
        // FALSE is the interesting case: `meshToolsLocked` is derived from
        // `sessionStatus === 'unauthenticated'`, so it is false while the
        // session is still loading. An early keypress takes this path.
        meshToolsLocked: false,
        notify,
        fetchImpl: gateway,
      })
    ).rejects.toThrow(/x-mcp-api-key/);

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain('x-mcp-api-key');
    expect(notify.mock.calls[0][1]).toBe('error');
  });

  it('raises the sign-in refusal as an error toast, and never calls the gateway', async () => {
    const notify = vi.fn();
    const gateway = vi.fn();

    await expect(
      runPaletteMcpToolRequest({
        tool: TOOL,
        input: {},
        meshToolsLocked: true,
        notify,
        fetchImpl: gateway,
      })
    ).rejects.toThrow(PALETTE_SIGN_IN_MESSAGE);

    expect(notify).toHaveBeenCalledWith(PALETTE_SIGN_IN_MESSAGE, 'error');
    expect(gateway).not.toHaveBeenCalled();
  });

  it('does not vanish when the gateway answers something that is not JSON', async () => {
    const notify = vi.fn();
    const gateway = vi.fn(async () => new Response('<html>502 Bad Gateway</html>', { status: 502 }));

    await expect(
      runPaletteMcpToolRequest({
        tool: TOOL,
        input: {},
        meshToolsLocked: false,
        notify,
        fetchImpl: gateway,
      })
    ).rejects.toThrow();

    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][1]).toBe('error');
  });

  it('returns the result and raises no error toast when the call succeeds', async () => {
    const notify = vi.fn();
    const gateway = vi.fn(async () => jsonResponse({ result: { published: true } }, 200));

    const result = await runPaletteMcpToolRequest({
      tool: TOOL,
      input: { name: 'A scene' },
      meshToolsLocked: false,
      notify,
      fetchImpl: gateway,
    });

    expect(result).toEqual({ published: true });
    expect(notify).not.toHaveBeenCalled();
  });

  it('sends the tool name the command asked for', async () => {
    const notify = vi.fn();
    const gateway = vi.fn(async () => jsonResponse({ result: {} }, 200));

    await runPaletteMcpToolRequest({
      tool: TOOL,
      input: { name: 'A scene' },
      meshToolsLocked: false,
      notify,
      fetchImpl: gateway,
    });

    const sent = JSON.parse(String(gateway.mock.calls[0][1]?.body)) as { tool?: string };
    expect(sent.tool).toBe(TOOL);
  });
});

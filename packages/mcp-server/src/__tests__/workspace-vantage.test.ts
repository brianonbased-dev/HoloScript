import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleDeveloperTool } from '../developer-tools';

/**
 * get_workspace_info must never present the SERVER's filesystem as the caller's.
 *
 * On 2026-08-04 both production servers did exactly that: the containerized MCP
 * answered a customer's "what is in my workspace?" with root '/app', the Jetson
 * anchor with '/mnt/nvme/holo/HoloScript/packages/mcp-server', and both then
 * advised `holoscript workspace init` — an action that would have created a
 * workspace on the server, not on the machine of the person asking.
 *
 * The rule these tests hold the handler to: a path may be presented as the
 * caller's only when the caller named it, or when the transport is stdio and the
 * two filesystems are therefore the same one. Everything else is blindness, and
 * blindness must be declared rather than papered over with a confident path.
 */
describe('get_workspace_info declares whose filesystem it is describing', () => {
  const original = process.env.HOLOSCRIPT_MCP_TRANSPORT;

  beforeEach(() => {
    delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
  });

  afterEach(() => {
    if (original === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
    else process.env.HOLOSCRIPT_MCP_TRANSPORT = original;
  });

  const call = (args: Record<string, unknown> = {}) =>
    handleDeveloperTool('get_workspace_info', args) as Promise<Record<string, unknown>>;

  it('declares blindness over HTTP instead of describing its own container', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const result = await call();

    expect(result.describes).toBe('nothing');
    expect(result.canSeeYourFilesystem).toBe(false);
    // The defect was never the wrong path specifically — it was printing ANY path
    // the customer would read as theirs. So the assertion is that there is none.
    expect(result.root).toBeUndefined();
    expect(JSON.stringify(result)).not.toContain(process.cwd());
    // And they are left with something to do.
    expect(Array.isArray(result.howToGetAnAnswer)).toBe(true);
    expect((result.howToGetAnAnswer as string[]).length).toBeGreaterThan(0);
  });

  it('does not advise an init that would run on the server', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const result = await call();
    const advice = (result.howToGetAnAnswer as string[]).join(' ');

    // `holoscript workspace init` may be MENTIONED, but only to say it will not help
    // here. It must never be the instruction, which is what both servers gave.
    expect(String(result.message)).not.toMatch(/use `holoscript workspace init` to create one/i);
    if (advice.includes('workspace init')) {
      expect(advice).toMatch(/not|do not|would create a workspace on the server/i);
    }
  });

  it('defaults to blindness when the transport is unknown', async () => {
    // An unknown transport is not evidence of a shared filesystem. A wrong "I can't
    // see" costs one follow-up; a wrong "here is your workspace" costs the customer
    // their trust in every path this server prints.
    const result = await call();
    expect(result.describes).toBe('nothing');
    expect(result.canSeeYourFilesystem).toBe(false);
  });

  it('answers about a path the caller named, even over HTTP', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const result = await call({ root: process.cwd() });

    expect(result.describes).toBe('caller');
    expect(result.canSeeYourFilesystem).toBe(true);
    expect(result.root).toBe(process.cwd());
    expect(String(result.because)).toContain('you named this path');
  });

  it('answers about its working directory over stdio, where it is the caller’s', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const result = await call();

    expect(result.describes).toBe('caller');
    expect(result.canSeeYourFilesystem).toBe(true);
    expect(result.root).toBe(process.cwd());
  });
});

/**
 * holomesh_feed_source is a tools:read tool. With a page extract in its arguments it writes that
 * extract into world state, which is holomesh_contribute's act (tools:write). The write half must
 * ask for write scope against the caller's own scopes, so a read-only key reads and nothing more.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { handleHoloMeshTool } from '../holomesh-tools';
import type { SigningContext } from '../identity/signing-middleware';

const OBSERVE = {
  operation: 'observe',
  session: { url: 'https://docs.holoscript.example/observe' },
  markdown: '# Observe Fixture\n\nfixture body text for mesh fold',
  dom: {
    url: 'https://docs.holoscript.example/observe',
    title: 'Observe Fixture',
    bodyText: 'fixture body text for mesh fold',
    elementCount: 4,
  },
};

const ctx = (scopes: string[]): SigningContext => ({
  signedRequest: false,
  signingValid: false,
  signer: 'oauth:test-client',
  scopes,
});

let savedTransport: string | undefined;
let savedWorldState: string | undefined;

beforeEach(() => {
  savedTransport = process.env.HOLOSCRIPT_MCP_TRANSPORT;
  savedWorldState = process.env.HOLOMESH_WORLD_STATE_PATH;
  delete process.env.HOLOSCRIPT_MCP_TRANSPORT; // the hosted server, not the local stdio user
  delete process.env.HOLOMESH_WORLD_STATE_PATH; // extract writes stay in memory
});

afterEach(() => {
  if (savedTransport === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
  else process.env.HOLOSCRIPT_MCP_TRANSPORT = savedTransport;
  if (savedWorldState === undefined) delete process.env.HOLOMESH_WORLD_STATE_PATH;
  else process.env.HOLOMESH_WORLD_STATE_PATH = savedWorldState;
});

describe('holomesh_feed_source page-extract write needs tools:write', () => {
  it('a read-only caller is refused the write', async () => {
    const result = (await handleHoloMeshTool(
      'holomesh_feed_source',
      { observe: OBSERVE },
      ctx(['tools:read'])
    )) as Record<string, unknown>;
    expect(result.error).toBe('insufficient_scope');
    expect(result.required).toEqual(['tools:write']);
    expect(result.success).toBeUndefined();
  });

  it('a hosted call with no caller context is refused too', async () => {
    const result = (await handleHoloMeshTool('holomesh_feed_source', {
      observe: OBSERVE,
    })) as Record<string, unknown>;
    expect(result.error).toBe('insufficient_scope');
  });

  it('a write-scoped caller writes the extract', async () => {
    const result = (await handleHoloMeshTool(
      'holomesh_feed_source',
      { observe: OBSERVE },
      ctx(['tools:write'])
    )) as Record<string, unknown>;
    expect(result.error, JSON.stringify(result)).toBeUndefined();
    expect(result.success).toBe(true);
    expect(result.pageExtractPresent).toBe(true);
  });

  it('the local stdio user (no context) still writes', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const result = (await handleHoloMeshTool('holomesh_feed_source', {
      observe: OBSERVE,
    })) as Record<string, unknown>;
    expect(result.success, JSON.stringify(result)).toBe(true);
  });
});

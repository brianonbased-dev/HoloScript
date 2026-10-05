import { describe, expect, it } from 'vitest';
import { _handleSingleToolLogic } from '../index';
import type { SigningContext } from '../holomesh/identity/signing-middleware';

const READ_ONLY_SIGNING_CONTEXT: SigningContext = {
  signedRequest: true,
  signingValid: true,
  signer: `0x${'1'.repeat(40)}`,
  signingProtocol: 'classical',
  scopes: ['tools:read'],
};

// A stateless HTTP caller always arrives with a context (securedToolExecution builds one).
const READ_WRITE_SIGNING_CONTEXT: SigningContext = {
  ...READ_ONLY_SIGNING_CONTEXT,
  scopes: ['tools:read', 'tools:write'],
};

/** Run `body` with HOLOSCRIPT_MCP_TRANSPORT set to `transport`, then restore it. */
async function onTransport<T>(transport: string, body: () => Promise<T>): Promise<T> {
  const saved = process.env.HOLOSCRIPT_MCP_TRANSPORT;
  process.env.HOLOSCRIPT_MCP_TRANSPORT = transport;
  try {
    return await body();
  } finally {
    if (saved === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
    else process.env.HOLOSCRIPT_MCP_TRANSPORT = saved;
  }
}

function parseBatchResponse(response: unknown): {
  results: Array<{ name: string; ok: boolean; result?: unknown; error?: string }>;
  summary: { total: number; succeeded: number; failed: number; stoppedEarly: boolean };
} {
  const text = (response as { content: Array<{ text: string }> }).content[0].text;
  return JSON.parse(text) as {
    results: Array<{ name: string; ok: boolean; result?: unknown; error?: string }>;
    summary: { total: number; succeeded: number; failed: number; stoppedEarly: boolean };
  };
}

describe('stateless HTTP batch_tool_call dispatch parity', () => {
  it('routes parse, validate, and compile through the full advertised tool registry', async () => {
    const code = 'composition "BatchCanary" { object "Cube" { geometry: "cube" } }';

    const response = await _handleSingleToolLogic(
      'batch_tool_call',
      {
        calls: [
          { name: 'parse_hs', args: { code } },
          { name: 'validate_holoscript', args: { code } },
          { name: 'compile_holoscript', args: { code, target: 'webgpu' } },
        ],
      },
      READ_WRITE_SIGNING_CONTEXT
    );

    expect((response as { isError?: boolean }).isError).not.toBe(true);

    const payload = parseBatchResponse(response);

    expect(payload.summary).toEqual({ total: 3, succeeded: 3, failed: 0, stoppedEarly: false });
    expect(payload.results.map((result) => result.name)).toEqual([
      'parse_hs',
      'validate_holoscript',
      'compile_holoscript',
    ]);
    expect(payload.results.every((result) => result.ok)).toBe(true);
    expect(JSON.stringify(payload.results[2])).not.toContain('Unknown tool');
  });

  it('denies a tools:admin paid launch nested under a tools:read batch', async () => {
    const response = await _handleSingleToolLogic(
      'batch_tool_call',
      {
        calls: [{ name: 'holo_from_scratch_launch', args: { model: 'holorunner-s0' } }],
      },
      READ_ONLY_SIGNING_CONTEXT
    );

    const payload = parseBatchResponse(response);
    expect(payload.summary).toEqual({
      total: 1,
      succeeded: 0,
      failed: 1,
      stoppedEarly: false,
    });
    expect(payload.results[0]).toMatchObject({
      name: 'holo_from_scratch_launch',
      ok: false,
    });
    expect(payload.results[0].error).toContain('Batch inner tool authorization denied');
    expect(payload.results[0].error).toContain('tools:admin');
  });

  it('preserves an allowed tools:read inner call under a tools:read batch', async () => {
    const code = 'composition "ReadBatch" { object "Cube" { geometry: "cube" } }';
    const response = await _handleSingleToolLogic(
      'batch_tool_call',
      { calls: [{ name: 'parse_hs', args: { code } }] },
      READ_ONLY_SIGNING_CONTEXT
    );

    const payload = parseBatchResponse(response);
    expect(payload.summary).toEqual({
      total: 1,
      succeeded: 1,
      failed: 0,
      stoppedEarly: false,
    });
    expect(payload.results[0]).toMatchObject({ name: 'parse_hs', ok: true });
  });

  // task mplw: a batch that arrives with NO context lost its caller inside the server (off the
  // stdio server). Since #407 dispatch checks the caller's scopes for the batch itself, so the
  // batch is refused before any child runs; were it not, each child would be checked against no
  // scopes (assertBatchInnerToolAuthorized).
  it('with no caller context over HTTP, the batch is refused before any child runs', async () => {
    const code = 'composition "NobodyBatch" { object "Cube" { geometry: "cube" } }';
    const response = (await onTransport('http', () =>
      _handleSingleToolLogic('batch_tool_call', { calls: [{ name: 'parse_hs', args: { code } }] })
    )) as { isError?: boolean; content?: Array<{ text?: string }> };
    expect(response.isError).toBe(true);
    expect(response.content?.[0]?.text ?? '').toContain('authorization denied');
    expect(response.content?.[0]?.text ?? '').not.toContain('NobodyBatch');
  });

  it('with no caller context on the stdio server, the batch is the local user and runs', async () => {
    const code = 'composition "LocalBatch" { object "Cube" { geometry: "cube" } }';
    const response = await onTransport('stdio', () =>
      _handleSingleToolLogic('batch_tool_call', { calls: [{ name: 'parse_hs', args: { code } }] })
    );
    const payload = parseBatchResponse(response);
    expect(payload.summary).toMatchObject({ total: 1, succeeded: 1, failed: 0 });
  });
});

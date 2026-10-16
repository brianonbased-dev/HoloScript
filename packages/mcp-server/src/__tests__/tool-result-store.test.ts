/**
 * MCP large-response cap (PLAN /workspace/mcp-large-response/PLAN.md §3-4).
 * Over the cap a tool result is stored and replaced by summary + resource_link;
 * resources/read pages it back byte-for-byte; other callers are denied.
 */
import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { gateToolCall, classifyMcpEnvelopeResult, type ToolCallReceipt } from '../tool-call-gate';
import {
  ToolResultStore,
  capItems,
  capMcpToolResult,
  readHoloResult,
  resultScope,
  parseHoloResultUri,
  HoloResultNotFoundError,
  HOLO_RESULT_META_KEY,
  DEFAULT_RESPONSE_MAX_BYTES,
  setDefaultToolResultStore,
  getDefaultToolResultStore,
} from '../tool-result-store';
import { getMcpServerSizing } from '../server-sizing';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-result-store-test-'));
const RECEIPT_PATH = path.join(TMP_DIR, 'tool-calls.ndjson');
process.env.HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH = RECEIPT_PATH;

const receipts = (): ToolCallReceipt[] =>
  fs.existsSync(RECEIPT_PATH)
    ? fs
        .readFileSync(RECEIPT_PATH, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => JSON.parse(l))
    : [];

const sha = (s: string) => createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');

/** ~1 MB JSON with multi-byte characters so window cuts must respect UTF-8. */
function bigPayload(): { text: string; items: number } {
  const diagnostics = Array.from({ length: 7000 }, (_, i) => ({
    code: 'HS1006',
    message: `Unknown trait "@nope_${i}" — did you mean @grabbable? ✓ ünïcødé 🚀`,
    line: i + 1,
  }));
  return { text: JSON.stringify({ ok: false, diagnostics }, null, 2), items: diagnostics.length };
}

const env = (text: string) => ({ content: [{ type: 'text', text }] });
const STDIO = resultScope('stdio', null);

/** Read every window of a stored result, following nextUri. */
function readAll(uri: string, scope: string, store: ToolResultStore, maxBytes: number) {
  let next: string | undefined = uri;
  let text = '';
  let windows = 0;
  while (next) {
    const r = readHoloResult(next, { scope, store, maxBytes });
    const wire = Buffer.byteLength(JSON.stringify(r), 'utf8');
    expect(wire).toBeLessThanOrEqual(maxBytes); // each fetch is itself under the cap
    text += r.contents[0].text;
    windows++;
    next = (r._meta[HOLO_RESULT_META_KEY] as { nextUri?: string }).nextUri;
    expect(windows).toBeLessThan(1000);
  }
  return { text, windows };
}

beforeEach(() => {
  fs.rmSync(RECEIPT_PATH, { force: true });
  setDefaultToolResultStore(null);
});
afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH;
  setDefaultToolResultStore(null);
});

describe('response cap through gateToolCall', () => {
  it('1 MB result -> summary + resource_link; sha256 matches the stored payload', async () => {
    const { text, items } = bigPayload();
    expect(Buffer.byteLength(text)).toBeGreaterThan(1_000_000);
    const store = new ToolResultStore();
    const out = (await gateToolCall(
      { name: 'validate_holoscript', args: {} },
      { transport: 'stdio', callerId: null },
      async () => env(text),
      { classifyResult: classifyMcpEnvelopeResult, responseCap: { store } }
    )) as any;

    const wire = Buffer.byteLength(JSON.stringify(out), 'utf8');
    expect(wire).toBeLessThanOrEqual(DEFAULT_RESPONSE_MAX_BYTES);
    expect(out.content[0].type).toBe('text');
    expect(out.content[0].text).toMatch(/Result too large to return inline: validate_holoscript/);
    expect(out.content[0].text).toContain(sha(text));
    expect(out.content[0].text).toContain(`items: ${items} (in "diagnostics")`);
    const link = out.content[1];
    expect(link.type).toBe('resource_link');
    expect(link.uri).toMatch(/^holo-result:\/\/[0-9a-f]{64}\/[0-9a-f]{32}$/);
    expect(link.size).toBe(Buffer.byteLength(text));
    expect(link.mimeType).toBe('application/json');
    const meta = out._meta[HOLO_RESULT_META_KEY];
    expect(meta).toMatchObject({ truncated: true, sha256: sha(text), totalItems: items });
    expect(parseHoloResultUri(link.uri)?.sha256).toBe(sha(text));

    const r = receipts();
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ status: 'ok', truncated: true, resultSha256: sha(text) });
    expect(r[0].resultBytes).toBeGreaterThan(1_000_000);
  });

  it('reading with cursors pages back the exact bytes, each window under the cap', async () => {
    const { text } = bigPayload();
    const store = new ToolResultStore();
    const out = (await gateToolCall(
      { name: 't', args: {} },
      { transport: 'stdio', callerId: null },
      async () => env(text),
      { responseCap: { store } }
    )) as any;
    const { text: back, windows } = readAll(
      out.content[1].uri,
      STDIO,
      store,
      DEFAULT_RESPONSE_MAX_BYTES
    );
    expect(windows).toBeGreaterThan(1);
    expect(back).toBe(text);
    expect(sha(back)).toBe(sha(text));
  });

  it('another caller (or transport) cannot read it; error is the same as for an unknown id', async () => {
    const store = new ToolResultStore();
    const out = (await gateToolCall(
      { name: 't', args: {} },
      { transport: 'http', callerId: 'agent-a' },
      async () => env(bigPayload().text),
      { responseCap: { store } }
    )) as any;
    const uri = out.content[1].uri as string;
    expect(() =>
      readHoloResult(uri, { scope: resultScope('http', 'agent-a'), store })
    ).not.toThrow();
    for (const scope of [
      resultScope('http', 'agent-b'),
      resultScope('stdio', null),
      resultScope('http', null),
    ]) {
      expect(() => readHoloResult(uri, { scope, store })).toThrow(HoloResultNotFoundError);
    }
    const fake = uri.replace(/\/[0-9a-f]{32}$/, '/' + '0'.repeat(32));
    expect(() => readHoloResult(fake, { scope: resultScope('http', 'agent-a'), store })).toThrow(
      HoloResultNotFoundError
    );
  });

  it('under the cap the envelope is returned unchanged (same object), no truncation receipt', async () => {
    const payload = env('small');
    const out = await gateToolCall(
      { name: 't', args: {} },
      { transport: 'stdio', callerId: null },
      async () => payload
    );
    expect(out).toBe(payload);
    const r = receipts()[0];
    expect(r.truncated).toBeUndefined();
    expect(r.resultBytes).toBe(Buffer.byteLength(JSON.stringify(payload)));
  });

  it('non-envelope results are never touched; responseCap:false disables', async () => {
    const big = { result: 'x'.repeat(400_000), isError: false };
    expect(
      await gateToolCall({ name: 't', args: {} }, { transport: 'http' }, async () => big)
    ).toBe(big);
    const bigEnv = env('y'.repeat(400_000));
    expect(
      await gateToolCall({ name: 't', args: {} }, { transport: 'stdio' }, async () => bigEnv, {
        responseCap: false,
      })
    ).toBe(bigEnv);
  });

  it('isError survives truncation and the receipt stays error', async () => {
    const store = new ToolResultStore();
    const out = (await gateToolCall(
      { name: 't', args: {} },
      { transport: 'stdio' },
      async () => ({ ...env('e'.repeat(400_000)), isError: true }),
      { classifyResult: classifyMcpEnvelopeResult, responseCap: { store } }
    )) as any;
    expect(out.isError).toBe(true);
    expect(receipts()[0]).toMatchObject({ status: 'error', truncated: true });
  });

  it('default threshold comes from server sizing (256 KiB) and MCP_RESPONSE_MAX_BYTES', async () => {
    expect(getMcpServerSizing({}).responseMaxBytes).toBe(256 * 1024);
    const just = env('z'.repeat(200 * 1024)); // under 256 KiB
    expect(
      await gateToolCall({ name: 't', args: {} }, { transport: 'stdio' }, async () => just)
    ).toBe(just);
    process.env.MCP_RESPONSE_MAX_BYTES = String(64 * 1024);
    try {
      const out = (await gateToolCall({ name: 't', args: {} }, { transport: 'stdio' }, async () =>
        env('z'.repeat(200 * 1024))
      )) as any;
      expect(out.content[1].type).toBe('resource_link');
      expect(getDefaultToolResultStore().size).toBe(1);
    } finally {
      delete process.env.MCP_RESPONSE_MAX_BYTES;
    }
  });
});

describe('ToolResultStore bounds', () => {
  it('expires after TTL', () => {
    let now = 1_000;
    const store = new ToolResultStore({ ttlMs: 100, now: () => now });
    const { result } = capMcpToolResult(env('q'.repeat(50_000)), {
      tool: 't',
      scope: STDIO,
      maxBytes: 16 * 1024,
      store,
    });
    const uri = (result.content[1] as { uri: string }).uri;
    expect(() => readHoloResult(uri, { scope: STDIO, store })).not.toThrow();
    now += 101;
    expect(() => readHoloResult(uri, { scope: STDIO, store })).toThrow(/not found or expired/);
  });

  it('evicts least-recently-used entries to stay under the byte budget', () => {
    const store = new ToolResultStore({ maxTotalBytes: 250_000 });
    const put = () =>
      (
        capMcpToolResult(env('w'.repeat(100_000)), {
          tool: 't',
          scope: STDIO,
          maxBytes: 16_384,
          store,
        }).result.content[1] as { uri: string }
      ).uri;
    const a = put();
    put();
    put(); // a evicted
    expect(store.bytes).toBeLessThanOrEqual(250_000);
    expect(() => readHoloResult(a, { scope: STDIO, store })).toThrow(HoloResultNotFoundError);
  });

  it('a payload bigger than the whole store is summarized, not stored, and says so', () => {
    const store = new ToolResultStore({ maxTotalBytes: 50_000 });
    const { result, info } = capMcpToolResult(env('v'.repeat(100_000)), {
      tool: 't',
      scope: STDIO,
      maxBytes: 16_384,
      store,
    });
    expect(result.content).toHaveLength(1);
    expect(result.content[0].text).toMatch(/not stored/);
    expect(info).toMatchObject({ truncated: true, unstored: true });
    expect(store.size).toBe(0);
  });

  it('rejects malformed URIs and cursors', () => {
    const store = new ToolResultStore();
    for (const bad of [
      'holo-result://x/y',
      'holo-result://' + 'a'.repeat(64) + '/' + 'b'.repeat(32) + '?cursor=../../etc',
      'holo-result://' +
        'a'.repeat(64) +
        '/' +
        'b'.repeat(32) +
        '?cursor=' +
        Buffer.from('o:-1').toString('base64url'),
    ]) {
      expect(() => readHoloResult(bad, { scope: STDIO, store })).toThrow(HoloResultNotFoundError);
    }
  });
});

describe('capItems', () => {
  it('first N + counts (HS1006 100-cap pattern)', () => {
    const arr = Array.from({ length: 20_000 }, (_, i) => i);
    expect(capItems(arr)).toMatchObject({ total: 20_000, omitted: 19_900 });
    expect(capItems(arr).items).toHaveLength(100);
    expect(capItems([1, 2], 5)).toEqual({ items: [1, 2], total: 2, omitted: 0 });
  });
});

/**
 * tool-call-gate.test.ts — WRAP-WITH-RECEIPTS gate contract
 * (dependency-sovereignty-ladder, ratified 2026-07-16).
 *
 * Verifies the fold-point gate's contract:
 *   1. receipt emitted on success (status ok) with hash of canonical-JSON args,
 *   2. receipt emitted on dispatch throw (status error + error class) and the
 *      error propagates UNCHANGED (same instance),
 *   3. receipts contain the sha256 hash, never the raw args (secrets stay out),
 *   4. isError result envelopes classify onto the receipt's error status
 *      without changing the returned result,
 *   5. a denying check short-circuits dispatch, writes a receipt, and throws
 *      ToolCallGateDeniedError.
 */

import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  gateToolCall,
  classifyMcpEnvelopeResult,
  canonicalJsonStringify,
  sha256OfCanonicalJson,
  frameDeclarationFromMcpMeta,
  resolveToolCallReceiptPath,
  ToolCallGateDeniedError,
  type ToolCallReceipt,
  type ToolCallCheck,
} from '../tool-call-gate';

const TMP_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'tool-call-gate-test-'));
const RECEIPT_PATH = path.join(TMP_DIR, 'receipts', 'tool-calls.ndjson');
process.env.HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH = RECEIPT_PATH;

function readReceipts(): ToolCallReceipt[] {
  if (!fs.existsSync(RECEIPT_PATH)) return [];
  return fs
    .readFileSync(RECEIPT_PATH, 'utf8')
    .split('\n')
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as ToolCallReceipt);
}

beforeEach(() => {
  fs.rmSync(RECEIPT_PATH, { force: true });
});

afterAll(() => {
  fs.rmSync(TMP_DIR, { recursive: true, force: true });
  delete process.env.HOLOSCRIPT_TOOL_CALL_RECEIPT_PATH;
});

describe('gateToolCall', () => {
  it('env override routes receipts into the test lane', () => {
    expect(resolveToolCallReceiptPath()).toBe(RECEIPT_PATH);
  });

  it('emits one ok receipt on success and returns the dispatch result unchanged', async () => {
    const payload = { content: [{ type: 'text', text: 'hello' }] };
    const result = await gateToolCall(
      { name: 'parse_holo', args: { code: 'composition "x" {}' } },
      { transport: 'stdio', callerId: null },
      async () => payload,
      { classifyResult: classifyMcpEnvelopeResult }
    );

    expect(result).toBe(payload);

    const receipts = readReceipts();
    expect(receipts).toHaveLength(1);
    const r = receipts[0];
    expect(r.v).toBe(1);
    expect(r.tool).toBe('parse_holo');
    expect(r.status).toBe('ok');
    expect(r.transport).toBe('stdio');
    expect(r.caller).toBeNull();
    expect(r.errorClass).toBeUndefined();
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
    expect(Date.parse(r.startedAt)).not.toBeNaN();
    expect(Date.parse(r.endedAt)).not.toBeNaN();
    expect(r.argsSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('emits an error receipt on dispatch throw and propagates the same error instance', async () => {
    class BoomError extends Error {}
    const boom = new BoomError('dispatch exploded');

    await expect(
      gateToolCall(
        { name: 'compile_holoscript', args: { target: 'unity' } },
        { transport: 'http', callerId: 'agent-x', sessionId: 'sess-1' },
        async () => {
          throw boom;
        }
      )
    ).rejects.toBe(boom); // exact instance — error propagates unchanged

    const receipts = readReceipts();
    expect(receipts).toHaveLength(1);
    const r = receipts[0];
    expect(r.status).toBe('error');
    expect(r.errorClass).toBe('BoomError');
    expect(r.tool).toBe('compile_holoscript');
    expect(r.caller).toBe('agent-x');
    expect(r.sessionId).toBe('sess-1');
    expect(r.transport).toBe('http');
  });

  it('receipt contains the canonical-JSON sha256, never the raw args', async () => {
    const secret = 'sk-super-secret-value-do-not-persist';
    const args = { apiKey: secret, nested: { b: 2, a: 1 } };

    await gateToolCall(
      { name: 'holo_secrets_resolve', args },
      { transport: 'http', callerId: 'agent-y' },
      async () => ({ ok: true })
    );

    const raw = fs.readFileSync(RECEIPT_PATH, 'utf8');
    expect(raw).not.toContain(secret); // raw args never touch disk
    expect(raw).not.toContain('nested');

    const [r] = readReceipts();
    // Independent recomputation: sorted-key canonical JSON hashed with sha256.
    const expected = createHash('sha256')
      .update(JSON.stringify({ apiKey: secret, nested: { a: 1, b: 2 } }))
      .digest('hex');
    expect(r.argsSha256).toBe(expected);
    // Key order must not change the hash (canonicalization contract).
    expect(sha256OfCanonicalJson({ nested: { a: 1, b: 2 }, apiKey: secret })).toBe(expected);
  });

  it('classifies isError result envelopes as error receipts without altering the result', async () => {
    const errEnvelope = { content: [{ type: 'text', text: '{"error":"nope"}' }], isError: true };
    const result = await gateToolCall(
      { name: 'validate_holoscript', args: {} },
      { transport: 'stdio', callerId: null },
      async () => errEnvelope,
      { classifyResult: classifyMcpEnvelopeResult }
    );

    expect(result).toBe(errEnvelope); // behavior-neutral: envelope returned unchanged

    const [r] = readReceipts();
    expect(r.status).toBe('error');
    expect(r.errorClass).toBe('ToolResultError');
  });

  it('a denying check short-circuits dispatch, writes a receipt, and throws typed', async () => {
    let dispatched = false;
    const denyAll: ToolCallCheck = () => ({
      allowed: false,
      check: 'founder-gate-stub',
      reason: 'custody-class tool requires founder review',
    });

    await expect(
      gateToolCall(
        { name: 'holo_secrets_grant', args: {} },
        { transport: 'http', callerId: 'agent-z' },
        async () => {
          dispatched = true;
          return {};
        },
        { check: denyAll }
      )
    ).rejects.toBeInstanceOf(ToolCallGateDeniedError);

    expect(dispatched).toBe(false); // denial short-circuits dispatch

    const [r] = readReceipts();
    expect(r.status).toBe('error');
    expect(r.errorClass).toBe('ToolCallGateDeniedError');
    expect(r.deniedBy).toBe('founder-gate-stub');
  });

  it('canonicalJsonStringify sorts keys recursively and drops undefined entries', () => {
    expect(canonicalJsonStringify({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 0 }] } })).toBe(
      '{"a":{"c":[2,{"y":0,"z":1}]},"b":1}'
    );
  });

  it('parses valid frame metadata and marks malformed declarations as invalid', () => {
    const declaration = {
      domain: 'holoscript-language',
      horizon: '2026-07',
      capability_tier: 2,
      trust_tier: 2,
      allowed_tools: ['parse_hs'],
      denied_domains: ['finance'],
    } as const;

    expect(
      frameDeclarationFromMcpMeta({ 'holoscript.dev/frame-declaration': declaration })
    ).toEqual(declaration);
    expect(frameDeclarationFromMcpMeta({})).toBeUndefined();
    expect(
      frameDeclarationFromMcpMeta({
        'holoscript.dev/frame-declaration': { ...declaration, capability_tier: 7 },
      })
    ).toBeNull();
  });
});

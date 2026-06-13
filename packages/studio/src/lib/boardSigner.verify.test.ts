/**
 * boardSigner.verify.test.ts — F.113 proof.
 *
 * Proves a signature produced by lib/boardSigner.ts VERIFIES TRUE against the
 * MCP board route's ACTUAL server-side verifier. We import the REAL server code
 * — packages/mcp-server/src/holomesh/request-signing.ts (verifyEnvelope /
 * verifyRequestBody, the exact functions the board POST handler calls via
 * extractAndVerifySigning) — by relative path and run our envelope through it.
 * Nothing is mocked or re-implemented; the verifier under test is the deployed
 * code path.
 *
 * If any of these fail, the end-to-end "Request run" path does NOT work and the
 * claim must not be made.
 */

import { describe, it, expect } from 'vitest';
import { generatePrivateKey, privateKeyToAccount } from 'viem/accounts';

import { signBoardRequest, canonicalizeBody, buildSigningPayload } from './boardSigner';

// The REAL server verifier (not a port). Relative import into the sibling
// mcp-server package source — vitest transpiles it. These are the exact
// functions board-routes.ts → extractAndVerifySigning → verifyEnvelope use.
import {
  verifyEnvelope,
  verifyRequestBody,
  canonicalizeBody as serverCanonicalize,
  buildSigningPayload as serverBuildPayload,
  extractEnvelope,
} from '../../../mcp-server/src/holomesh/request-signing';

const SAMPLE_TASK_BODY = {
  tasks: [
    {
      title: '[capability-request] Fleet bench provision',
      description: 'Run: python scripts/fleet-bench-provision.py --model x --tp 2',
      priority: 5,
      tags: ['capability-request', 'spend', 'fleet-bench-provision'],
    },
  ],
};

describe('boardSigner ⇄ server request-signing verifier (F.113)', () => {
  it('canonicalization is byte-identical to the server', () => {
    const inputs: unknown[] = [
      SAMPLE_TASK_BODY,
      { b: 1, a: 2, z: { y: [3, 2, 1], x: 'q' } },
      null,
      [1, 'two', { three: 3 }],
      { nested: { deep: { deeper: { k: 'v' } } } },
    ];
    for (const v of inputs) {
      expect(canonicalizeBody(v)).toBe(serverCanonicalize(v));
    }
  });

  it('the signed payload string matches the server payload builder', async () => {
    const env = await signBoardRequest(SAMPLE_TASK_BODY, {
      env: { STUDIO_SEAT_SIGNING_KEY: generatePrivateKey() },
    });
    const local = buildSigningPayload(env);
    const server = serverBuildPayload({ body: env.body, nonce: env.nonce, timestamp: env.timestamp });
    expect(local).toBe(server);
  });

  it('a studio-seat signature VERIFIES TRUE against the real server verifyEnvelope', async () => {
    const privateKey = generatePrivateKey();
    const expectedAddress = privateKeyToAccount(privateKey).address;

    const env = await signBoardRequest(SAMPLE_TASK_BODY, {
      env: { STUDIO_SEAT_SIGNING_KEY: privateKey },
    });

    // The envelope must extract as a valid signed-envelope shape on the server.
    expect(extractEnvelope(env)).not.toBeNull();
    expect(env.signer_address.toLowerCase()).toBe(expectedAddress.toLowerCase());

    // THE PROOF: the server's verifier recovers our address from our signature.
    // Empty registry (Phase-1 default) → registryCheck omitted, matching prod.
    const result = await verifyEnvelope(env);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
    expect(result.signer?.toLowerCase()).toBe(expectedAddress.toLowerCase());
  });

  it('verifyRequestBody (the convenience wrapper) also accepts the envelope', async () => {
    const env = await signBoardRequest(SAMPLE_TASK_BODY, {
      env: { STUDIO_SEAT_SIGNING_KEY: generatePrivateKey() },
    });
    const result = await verifyRequestBody(env);
    expect(result.valid).toBe(true);
  });

  it('a tampered body is REJECTED (signature-mismatch) — signing is real, not cosmetic', async () => {
    const env = await signBoardRequest(SAMPLE_TASK_BODY, {
      env: { STUDIO_SEAT_SIGNING_KEY: generatePrivateKey() },
    });
    // Mutate the body after signing — the recovered address won't match.
    const tampered = {
      ...env,
      body: { tasks: [{ title: 'INJECTED malicious task', description: 'x', priority: 5 }] },
    };
    const result = await verifyEnvelope(tampered);
    expect(result.valid).toBe(false);
  });

  it('a stale timestamp is REJECTED (replay-window enforced)', async () => {
    const env = await signBoardRequest(SAMPLE_TASK_BODY, {
      // 10 minutes ago — beyond the server's 5-minute freshness window.
      nowMs: Date.now() - 10 * 60 * 1000,
      env: { STUDIO_SEAT_SIGNING_KEY: generatePrivateKey() },
    });
    const result = await verifyEnvelope(env);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('timestamp-stale');
  });
});

/**
 * Tests for Tier-2 self-custody export routes (task_1776990890662_ards).
 *
 * Spec: research/2026-04-23_tier2-self-custody-export-escape-hatch-v3.md
 *   §"Acceptance tests" #1-#4 + route-layer invariants.
 *
 * Test shape mirrors http-routes.test.ts: mocks fs so state.ts doesn't touch
 * disk, constructs EventEmitter-backed mock requests, and drives the handler
 * directly rather than spinning up a real HTTP listener.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ── Mock fs before import ────────────────────────────────────────────────────

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

// ── Imports (post-mock) ──────────────────────────────────────────────────────

import {
  handleIdentityExportRoutes,
  ROUTE_PREPARE,
  ROUTE_PACKAGE,
  ROUTE_FINALIZE,
  userCustodyMode,
  retireCustodialSigner,
  _resetIdentityExportStateForTests,
  _resetPrepareRateLimitForTests,
} from '../identity-export-routes';
import {
  RETIRED_ID_SHAPE,
  _setFailAfterStageForTests,
  _resetCustodyRegistryForTests,
  isSelfCustodyActive,
} from '../../identity/custody-registry';
import { keyRegistry, exportSessionStore } from '../../state';
import type { KeyRecord } from '../../types';

// ── Test helpers ─────────────────────────────────────────────────────────────

const TEST_API_KEY = 'test_export_key_ards';
const TEST_USER_ID = 'agent_test_ards';

function seedTestKey(): void {
  const record: KeyRecord = {
    key: TEST_API_KEY,
    walletAddress: '0x0000000000000000000000000000000000000002',
    agentId: TEST_USER_ID,
    agentName: 'TestExportAgent',
    scopes: ['*'],
    createdAt: new Date().toISOString(),
    isFounder: false,
  };
  keyRegistry.set(TEST_API_KEY, record);
}

function mockReq(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers || {};

  if (body) {
    const data = JSON.stringify(body);
    setTimeout(() => {
      req.emit('data', Buffer.from(data));
      req.emit('end');
    }, 10);
  } else {
    setTimeout(() => req.emit('end'), 10);
  }

  return req;
}

interface CapturedRes extends http.ServerResponse {
  _status: number;
  _body: any;
  _headers: Record<string, string>;
}

function mockRes(): CapturedRes {
  const res = {
    _status: 0,
    _body: null as any,
    _headers: {} as Record<string, string>,
    writeHead(status: number, headers?: Record<string, string>) {
      res._status = status;
      if (headers) Object.assign(res._headers, headers);
    },
    end(data?: string) {
      if (data) {
        try {
          res._body = JSON.parse(data);
        } catch {
          res._body = data;
        }
      }
    },
  } as any;
  return res;
}

async function callRoute(
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>
): Promise<CapturedRes> {
  const req = mockReq(method, path, body, headers);
  const res = mockRes();
  await handleIdentityExportRoutes(req, res, path, method, path);
  return res;
}

function authHeader(key: string = TEST_API_KEY): Record<string, string> {
  return { authorization: `Bearer ${key}` };
}

// Generate a wallet keypair we control so we can sign the nonce for finalize.
function makeWallet(): {
  privateKey: crypto.KeyObject;
  publicKey: crypto.KeyObject;
  publicKeyPem: string;
} {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  return {
    privateKey,
    publicKey,
    publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(),
  };
}

function signNonce(nonce: string, privateKey: crypto.KeyObject): string {
  return crypto.sign(null, Buffer.from(nonce, 'utf8'), privateKey).toString('base64');
}

// Drive the full prepare → package → finalize flow and return intermediate state.
async function runFlow(opts?: {
  wallet?: ReturnType<typeof makeWallet>;
  idempotencyKey?: string;
}): Promise<{
  wallet: ReturnType<typeof makeWallet>;
  sessionId: string;
  nonce: string;
  manifestHash: string;
  packageBody: any;
}> {
  const wallet = opts?.wallet ?? makeWallet();
  const prepRes = await callRoute(
    'POST',
    ROUTE_PREPARE,
    { idempotency_key: opts?.idempotencyKey ?? `idem-${Date.now()}` },
    authHeader()
  );
  expect(prepRes._status).toBe(200);
  const sessionId = prepRes._body.export_session_id;
  const nonce = prepRes._body.nonce;

  const pkgRes = await callRoute(
    'POST',
    ROUTE_PACKAGE,
    {
      export_session_id: sessionId,
      recovery_password: 'correct-horse-battery-staple',
      recovery_bytes_b64: Buffer.from('seed-bytes-test').toString('base64'),
    },
    authHeader()
  );
  expect(pkgRes._status).toBe(200);

  return {
    wallet,
    sessionId,
    nonce,
    manifestHash: pkgRes._body.manifest_hash,
    packageBody: pkgRes._body.package,
  };
}

// ── Test setup / teardown ────────────────────────────────────────────────────

const originalEnv = { ...process.env };

beforeEach(() => {
  keyRegistry.clear();
  exportSessionStore.clear();
  _resetIdentityExportStateForTests();
  _resetPrepareRateLimitForTests();
  _resetCustodyRegistryForTests();
  _setFailAfterStageForTests(null);
  seedTestKey();
  // Disable 2FA gate by default — specific tests re-enable it.
  delete process.env.REQUIRE_2FA;
});

afterEach(() => {
  _setFailAfterStageForTests(null);
  process.env = { ...originalEnv };
});

// ── Dispatcher sanity ────────────────────────────────────────────────────────

describe('handleIdentityExportRoutes — dispatcher', () => {
  it('returns false for unknown paths', async () => {
    const req = mockReq('POST', '/api/identity/unknown');
    const res = mockRes();
    const handled = await handleIdentityExportRoutes(
      req,
      res,
      '/api/identity/unknown',
      'POST',
      '/api/identity/unknown'
    );
    expect(handled).toBe(false);
  });

  it('returns false for GET method on valid paths', async () => {
    const req = mockReq('GET', ROUTE_PREPARE);
    const res = mockRes();
    const handled = await handleIdentityExportRoutes(
      req,
      res,
      ROUTE_PREPARE,
      'GET',
      ROUTE_PREPARE
    );
    expect(handled).toBe(false);
  });
});

// ── Acceptance test #1: Happy path ──────────────────────────────────────────

describe('POST /api/identity/self-custody/export/* — happy path (spec #1)', () => {
  it('prepare → package → finalize yields self_custody_active + retired signer', async () => {
    const flow = await runFlow();

    // Finalize with ownership proof.
    const sig = signNonce(flow.nonce, flow.wallet.privateKey);
    const finRes = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xNewSelfCustodyWallet1234',
        nonce_signature_b64: sig,
        package_manifest_hash: flow.manifestHash,
        new_wallet_public_key_pem: flow.wallet.publicKeyPem,
      },
      authHeader()
    );

    expect(finRes._status).toBe(200);
    expect(finRes._body.status).toBe('self_custody_active');
    // _dny4 shipped: retired-id now matches the canonical registry shape
    // `retired-custodial-<userId>-<iso-timestamp>`. Shape asserted via the
    // exported RETIRED_ID_SHAPE regex so both sides stay in sync.
    expect(finRes._body.retired_custodial_signer_id).toMatch(RETIRED_ID_SHAPE);
    expect(finRes._body.effective_at).toBeTruthy();
    expect(userCustodyMode.get(TEST_USER_ID)).toBe('self_custody_active');
  });
});

// ── Acceptance test #2: Expired session ─────────────────────────────────────

describe('expired session (spec #2)', () => {
  it('finalize after TTL fails and keeps custodial_active', async () => {
    const flow = await runFlow();

    // Manually expire the session.
    const session = exportSessionStore.get(flow.sessionId);
    expect(session).toBeDefined();
    session!.expiresAt = Date.now() - 1000;

    const sig = signNonce(flow.nonce, flow.wallet.privateKey);
    const finRes = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xNewWallet',
        nonce_signature_b64: sig,
        package_manifest_hash: flow.manifestHash,
        new_wallet_public_key_pem: flow.wallet.publicKeyPem,
      },
      authHeader()
    );

    expect(finRes._status).toBe(400);
    expect(finRes._body.error).toBe('session_expired');
    // Invariant #1: no custody-mode transition on failure.
    expect(userCustodyMode.get(TEST_USER_ID)).not.toBe('self_custody_active');
  });
});

// ── Acceptance test #3: Replay ─────────────────────────────────────────────

describe('replay (spec #3)', () => {
  it('duplicate finalize is idempotent and emits no second retirement', async () => {
    const flow = await runFlow();
    const sig = signNonce(flow.nonce, flow.wallet.privateKey);

    const finRes1 = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xReplayWallet',
        nonce_signature_b64: sig,
        package_manifest_hash: flow.manifestHash,
        new_wallet_public_key_pem: flow.wallet.publicKeyPem,
      },
      authHeader()
    );
    expect(finRes1._status).toBe(200);
    const firstRetiredId = finRes1._body.retired_custodial_signer_id;

    const finRes2 = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xReplayWallet',
        nonce_signature_b64: sig,
        package_manifest_hash: flow.manifestHash,
        new_wallet_public_key_pem: flow.wallet.publicKeyPem,
      },
      authHeader()
    );

    // Must NOT produce a second retirement — return 200 idempotent or 409.
    expect([200, 409]).toContain(finRes2._status);
    if (finRes2._status === 200) {
      expect(finRes2._body.replay).toBe(true);
      // Critically: no NEW retired signer id emitted.
      expect(finRes2._body.retired_custodial_signer_id).toBeUndefined();
    }
    // Custody mode stays self_custody_active (no double-transition).
    expect(userCustodyMode.get(TEST_USER_ID)).toBe('self_custody_active');
    // Sanity: the first retirement id is still the canonical one.
    expect(firstRetiredId).toMatch(RETIRED_ID_SHAPE);
  });
});

// ── Acceptance test #4: Bad ownership proof ────────────────────────────────

describe('bad ownership proof (spec #4)', () => {
  it('finalize rejects on bad signature; no custody-mode transition', async () => {
    const flow = await runFlow();

    // Sign with DIFFERENT key — ownership proof will fail against our public key.
    const decoy = makeWallet();
    const badSig = signNonce(flow.nonce, decoy.privateKey);

    const finRes = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xNewWallet',
        nonce_signature_b64: badSig,
        package_manifest_hash: flow.manifestHash,
        new_wallet_public_key_pem: flow.wallet.publicKeyPem, // original, not decoy
      },
      authHeader()
    );

    expect(finRes._status).toBe(400);
    expect(finRes._body.error).toBe('bad_ownership_proof');
    expect(userCustodyMode.get(TEST_USER_ID)).not.toBe('self_custody_active');
  });

  it('finalize rejects on manifest-hash mismatch', async () => {
    const flow = await runFlow();
    const sig = signNonce(flow.nonce, flow.wallet.privateKey);

    const finRes = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xNewWallet',
        nonce_signature_b64: sig,
        package_manifest_hash: 'sha256:wrong-hash-0000',
        new_wallet_public_key_pem: flow.wallet.publicKeyPem,
      },
      authHeader()
    );

    expect(finRes._status).toBe(400);
    expect(finRes._body.error).toBe('manifest_hash_mismatch');
  });
});

// ── Auth / edge cases ──────────────────────────────────────────────────────

describe('authentication gates', () => {
  it('prepare without bearer token returns 401', async () => {
    const res = await callRoute('POST', ROUTE_PREPARE, { idempotency_key: 'x' });
    expect(res._status).toBe(401);
  });

  it('prepare with invalid bearer token returns 401', async () => {
    const res = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: 'x' },
      { authorization: 'Bearer invalid-key' }
    );
    expect(res._status).toBe(401);
  });

  it('package rejects session_id belonging to a different user', async () => {
    const flow = await runFlow();

    // Swap key registry to a second agent.
    const otherKey = 'other_agent_key';
    keyRegistry.set(otherKey, {
      key: otherKey,
      walletAddress: '0x3',
      agentId: 'agent_other',
      agentName: 'Other',
      scopes: ['*'],
      createdAt: new Date().toISOString(),
      isFounder: false,
    });

    const pkgRes = await callRoute(
      'POST',
      ROUTE_PACKAGE,
      {
        export_session_id: flow.sessionId,
        recovery_password: 'pw',
        recovery_bytes_b64: Buffer.from('bytes').toString('base64'),
      },
      authHeader(otherKey)
    );

    expect(pkgRes._status).toBe(403);
    expect(pkgRes._body.error).toBe('session_not_owned_by_caller');
  });
});

// ── 2FA gate (Invariant #4) ────────────────────────────────────────────────

describe('two-factor gate', () => {
  it('prepare without 2FA token returns 403 when REQUIRE_2FA=true', async () => {
    process.env.REQUIRE_2FA = 'true';
    const res = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: 'test' },
      authHeader()
    );
    expect(res._status).toBe(403);
    expect(res._body.error).toBe('two_factor_required');
  });

  it('prepare with valid 2FA shape passes when REQUIRE_2FA=true', async () => {
    process.env.REQUIRE_2FA = 'true';
    const res = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: 'test', two_factor_token: '2fa:valid-dev-token' },
      authHeader()
    );
    expect(res._status).toBe(200);
    expect(res._body.export_session_id).toBeTruthy();
  });

  it('prepare with malformed 2FA token rejected when REQUIRE_2FA=true', async () => {
    process.env.REQUIRE_2FA = 'true';
    const res = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: 'test', two_factor_token: 'not-a-valid-shape' },
      authHeader()
    );
    expect(res._status).toBe(403);
  });

  it('prepare passes without 2FA when REQUIRE_2FA is unset (documented dev gate)', async () => {
    delete process.env.REQUIRE_2FA;
    const res = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: 'test' },
      authHeader()
    );
    expect(res._status).toBe(200);
  });
});

// ── Idempotency ────────────────────────────────────────────────────────────

describe('idempotency', () => {
  it('prepare with missing idempotency_key returns 400', async () => {
    const res = await callRoute('POST', ROUTE_PREPARE, {}, authHeader());
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('idempotency_key_required');
  });

  it('prepare with same idempotency_key returns same session_id', async () => {
    const idemKey = 'same-key';
    const res1 = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: idemKey },
      authHeader()
    );
    const res2 = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: idemKey },
      authHeader()
    );

    expect(res1._status).toBe(200);
    expect(res2._status).toBe(200);
    expect(res2._body.export_session_id).toBe(res1._body.export_session_id);
    expect(res2._body.replay).toBe(true);
  });
});

// ── One-time consumable (Invariant #2) ─────────────────────────────────────

describe('one-time consumable invariant', () => {
  it('calling package twice returns 409 on the second call', async () => {
    const flow = await runFlow();

    const pkgRes2 = await callRoute(
      'POST',
      ROUTE_PACKAGE,
      {
        export_session_id: flow.sessionId,
        recovery_password: 'pw',
        recovery_bytes_b64: Buffer.from('bytes').toString('base64'),
      },
      authHeader()
    );

    expect(pkgRes2._status).toBe(409);
    expect(pkgRes2._body.error).toBe('session_not_in_prepared_state');
  });

  it('finalize without prior package returns 409', async () => {
    const prepRes = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: 'no-package-first' },
      authHeader()
    );
    const wallet = makeWallet();
    const sig = signNonce(prepRes._body.nonce, wallet.privateKey);

    const finRes = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: prepRes._body.export_session_id,
        new_wallet_address: '0xWallet',
        nonce_signature_b64: sig,
        package_manifest_hash: 'sha256:something',
        new_wallet_public_key_pem: wallet.publicKeyPem,
      },
      authHeader()
    );

    expect(finRes._status).toBe(409);
    expect(finRes._body.error).toBe('session_not_packaged');
  });
});

// ── Rate limiting ──────────────────────────────────────────────────────────

describe('rate limiting (enumeration defense)', () => {
  it('prepare limits to 3 per hour per agent', async () => {
    for (let i = 0; i < 3; i++) {
      const r = await callRoute(
        'POST',
        ROUTE_PREPARE,
        { idempotency_key: `rl-${i}` },
        authHeader()
      );
      expect(r._status).toBe(200);
    }
    const fourth = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: 'rl-4' },
      authHeader()
    );
    expect(fourth._status).toBe(429);
    expect(fourth._body.error).toBe('rate_limited');
  });
});

// ── Session-id tampering ───────────────────────────────────────────────────

describe('session-id tampering', () => {
  it('finalize with unknown session_id returns 404', async () => {
    const wallet = makeWallet();
    const res = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: 'session_does_not_exist',
        new_wallet_address: '0xWallet',
        nonce_signature_b64: 'AA==',
        package_manifest_hash: 'sha256:x',
        new_wallet_public_key_pem: wallet.publicKeyPem,
      },
      authHeader()
    );
    expect(res._status).toBe(404);
    expect(res._body.error).toBe('session_not_found');
  });

  it('package with unknown session_id returns 404', async () => {
    const res = await callRoute(
      'POST',
      ROUTE_PACKAGE,
      {
        export_session_id: 'session_missing',
        recovery_password: 'pw',
        recovery_bytes_b64: Buffer.from('x').toString('base64'),
      },
      authHeader()
    );
    expect(res._status).toBe(404);
  });
});

// ── Retirement delegate — structural contract (post-_dny4) ─────────────────

describe('retireCustodialSigner — registry delegation (post-_dny4)', () => {
  it('delegates to custody-registry and returns a canonical retired-id', () => {
    const result = retireCustodialSigner('user-x', '0xNewWallet');
    // Registry shape: `retired-custodial-<userId>-<iso-timestamp>`. Asserted
    // against RETIRED_ID_SHAPE so the route and registry cannot drift.
    expect(result.retiredCustodialSignerId).toMatch(RETIRED_ID_SHAPE);
    expect(result.effectiveAt).toBeTruthy();
    expect(userCustodyMode.get('user-x')).toBe('self_custody_active');
  });
});

// ── /finalize registry-throw hardening (task_1777008639101_xq23) ───────────
//
// Defense-in-depth: when retireCustodialSigner throws (any stage), /finalize
// MUST convert it to a structured 500 JSON response, NEVER leak the internal
// error message, and leave zero side effects. The cross-layer suite
// (tier2-self-custody-integration.test.ts) asserts the full pipeline; this
// block asserts the route-layer contract in isolation and at least one
// non-registry-wrapped injection path.

describe('/finalize registry-throw hardening (task_xq23)', () => {
  it('returns structured 500 { error: registry_transaction_failed, code: registry_error } when registry throws', async () => {
    const flow = await runFlow();
    const sig = signNonce(flow.nonce, flow.wallet.privateKey);

    // Arm the same injection used by the cross-layer suite.
    _setFailAfterStageForTests('pre_commit');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const finRes = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xNewWalletAddress',
        nonce_signature_b64: sig,
        package_manifest_hash: flow.manifestHash,
        new_wallet_public_key_pem: flow.wallet.publicKeyPem,
      },
      authHeader()
    );

    _setFailAfterStageForTests(null);

    // Structured 500 (NOT a rejected promise, NOT a connection-level 500).
    expect(finRes._status).toBe(500);
    expect(finRes._body.success).toBe(false);
    expect(finRes._body.error).toBe('registry_transaction_failed');
    expect(finRes._body.code).toBe('registry_error');
    expect(typeof finRes._body.message).toBe('string');
    // Internal error detail MUST NOT leak to client body.
    expect(finRes._body.message).not.toMatch(/injected failure/);
    expect(finRes._body.message).not.toMatch(/stage_mode|stage_pubkey|stage_audit|pre_commit/);

    // Server-side log captured the original error for debugging.
    // Capture call state before mockRestore (which clears mock history).
    const errCallCount = errSpy.mock.calls.length;
    const logArg = errSpy.mock.calls[0]?.[0];
    errSpy.mockRestore();
    expect(errCallCount).toBeGreaterThan(0);
    expect(typeof logArg).toBe('string');
    expect(logArg).toContain('[identity-export]');

    // Atomicity: registry unchanged, session NOT marked finalized.
    expect(isSelfCustodyActive(TEST_USER_ID)).toBe(false);
    expect(userCustodyMode.get(TEST_USER_ID)).toBeUndefined();
    const session = exportSessionStore.get(flow.sessionId);
    expect(session?.status).toBe('packaged');
  });

  it('retry after injection cleared converges to self_custody_active', async () => {
    const flow = await runFlow();
    const sig = signNonce(flow.nonce, flow.wallet.privateKey);

    _setFailAfterStageForTests('stage_audit');
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const fail = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xRetryAddress',
        nonce_signature_b64: sig,
        package_manifest_hash: flow.manifestHash,
        new_wallet_public_key_pem: flow.wallet.publicKeyPem,
      },
      authHeader()
    );
    expect(fail._status).toBe(500);
    expect(fail._body.error).toBe('registry_transaction_failed');

    _setFailAfterStageForTests(null);
    errSpy.mockRestore();

    // Retry on the SAME session — session was left in 'packaged', session is
    // re-finalizable, no latent corrupt state.
    const retry = await callRoute(
      'POST',
      ROUTE_FINALIZE,
      {
        export_session_id: flow.sessionId,
        new_wallet_address: '0xRetryAddress',
        nonce_signature_b64: sig,
        package_manifest_hash: flow.manifestHash,
        new_wallet_public_key_pem: flow.wallet.publicKeyPem,
      },
      authHeader()
    );
    expect(retry._status).toBe(200);
    expect(retry._body.status).toBe('self_custody_active');
    expect(retry._body.retired_custodial_signer_id).toMatch(RETIRED_ID_SHAPE);
    expect(isSelfCustodyActive(TEST_USER_ID)).toBe(true);
  });
});

// ── Invariant #1: one active signing authority ─────────────────────────────

describe('invariant #1 — single active signing authority', () => {
  it('prepare returns 409 when user is already self_custody_active', async () => {
    userCustodyMode.set(TEST_USER_ID, 'self_custody_active');
    const res = await callRoute(
      'POST',
      ROUTE_PREPARE,
      { idempotency_key: 'should-be-rejected' },
      authHeader()
    );
    expect(res._status).toBe(409);
    expect(res._body.error).toBe('already_self_custody');
  });
});

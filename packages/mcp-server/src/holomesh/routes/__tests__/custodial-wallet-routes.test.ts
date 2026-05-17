/**
 * Route-level regression tests for POST /api/identity/custodial/sign
 * (task_1779051172129_1fpf — custodial signing endpoint).
 *
 * These tests drive `handleCustodialWalletRoutes` directly — no HTTP listener.
 * Pattern mirrors identity-export-routes.test.ts.
 *
 * Covered:
 *   §happy-path  — provision a wallet then sign a payload
 *   §401         — unauthenticated request returns 401
 *   §400         — missing payload_base64 returns 400
 *   §404         — sign without a provisioned wallet returns 404
 *   §403-migrated — migrated-to-self-custody returns 403 (Invariant #1 guard)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';
import * as crypto from 'crypto';

// ── Mock fs before any module import ────────────────────────────────────────

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
  readFileSync: vi.fn(() => ''),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
  renameSync: vi.fn(),
}));

// ── Imports (post-mock) ──────────────────────────────────────────────────────

import {
  handleCustodialWalletRoutes,
  ROUTE_SIGN,
  ROUTE_PROVISION,
} from '../custodial-wallet-routes';
import {
  _resetCustodialWalletForTests,
  _generateTestWrappingKey,
  provisionCustodialWallet,
} from '../../identity/custodial-wallet';
import { _resetAuditLogForTests } from '../../identity/audit-log';
import { _resetCustodyRegistryForTests } from '../../identity/custody-registry';
import { keyRegistry } from '../../state';
import type { KeyRecord } from '../../types';

// ── Constants ────────────────────────────────────────────────────────────────

const TEST_API_KEY = 'test_cust_sign_key_1fpf';
const TEST_USER_ID = 'agent_test_1fpf';

// ── Test helpers ──────────────────────────────────────────────────────────────

function seedTestKey(userId = TEST_USER_ID, apiKey = TEST_API_KEY): void {
  const record: KeyRecord = {
    key: apiKey,
    walletAddress: '0x0000000000000000000000000000000000001fpf',
    agentId: userId,
    // Match name to id so handler sends userId as callerId (agent.name ?? agent.id = agentId = userId).
    // decryptForSigning checks `callerId === userId` for the owner path.
    agentName: userId,
    scopes: ['*'],
    createdAt: new Date().toISOString(),
    rotationCount: 0,
    lastRotatedAt: null,
    isFounder: false,
  };
  keyRegistry.set(apiKey, record);
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
  req.headers = { ...(headers ?? {}) };
  // @ts-expect-error — test stub; handlers read socket.remoteAddress
  req.socket = { remoteAddress: '127.0.0.1' };

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
  _body: Record<string, unknown>;
}

function mockRes(): CapturedRes {
  const res = {
    _status: 0,
    _body: {} as Record<string, unknown>,
    writeHead(status: number) {
      (res as CapturedRes)._status = status;
    },
    end(data?: string) {
      if (data) {
        try {
          (res as CapturedRes)._body = JSON.parse(data);
        } catch {
          (res as CapturedRes)._body = { raw: data } as Record<string, unknown>;
        }
      }
    },
    // The route helper also calls res.socket — stub it.
    socket: { remoteAddress: '127.0.0.1' },
  } as unknown as CapturedRes;
  return res;
}

async function callSign(
  body?: Record<string, unknown>,
  apiKey = TEST_API_KEY
): Promise<CapturedRes> {
  const req = mockReq('POST', ROUTE_SIGN, body, { authorization: `Bearer ${apiKey}` });
  const res = mockRes();
  await handleCustodialWalletRoutes(req, res, ROUTE_SIGN, 'POST', ROUTE_SIGN);
  return res;
}

// ── Setup / teardown ──────────────────────────────────────────────────────────

let wrappingKeyB64: string;

beforeEach(() => {
  // Generate a fresh wrapping key per test so tests don't share state.
  wrappingKeyB64 = _generateTestWrappingKey().toString('base64');
  process.env.HOLOMESH_KMS_WRAPPING_KEY_B64 = wrappingKeyB64;

  seedTestKey();
});

afterEach(() => {
  delete process.env.HOLOMESH_KMS_WRAPPING_KEY_B64;
  keyRegistry.clear();
  _resetCustodialWalletForTests();
  _resetAuditLogForTests();
  _resetCustodyRegistryForTests();
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('POST /api/identity/custodial/sign — happy path', () => {
  it('signs a payload and returns signature_base64 + audit_event_id', async () => {
    // Provision a wallet first using the library function directly (not via HTTP)
    // so the test is focused on the sign endpoint, not the provision flow.
    const wrappingKey = Buffer.from(wrappingKeyB64, 'base64');
    provisionCustodialWallet(TEST_USER_ID, TEST_USER_ID, { wrappingKey });

    const payload = Buffer.from('hello from 1fpf test', 'utf8');
    const payloadBase64 = payload.toString('base64');

    const res = await callSign({ payload_base64: payloadBase64 });

    expect(res._status).toBe(200);
    expect(res._body.success).toBe(true);
    expect(typeof res._body.signature_base64).toBe('string');
    expect((res._body.signature_base64 as string).length).toBeGreaterThan(0);
    expect(typeof res._body.audit_event_id).toBe('string');
    expect((res._body.audit_event_id as string).length).toBeGreaterThan(0);
  });

  it('returned signature verifies against the provisioned public key', async () => {
    const wrappingKey = Buffer.from(wrappingKeyB64, 'base64');
    const { wallet } = provisionCustodialWallet(TEST_USER_ID, TEST_USER_ID, { wrappingKey });

    const payload = Buffer.from('verify me', 'utf8');
    const res = await callSign({ payload_base64: payload.toString('base64') });

    expect(res._status).toBe(200);

    // wallet.publicKeyBase64 is the raw 32-byte Ed25519 key (not full SPKI).
    // Reconstruct SPKI by prepending the standard Ed25519 OID header.
    const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
    const rawKey = Buffer.from(wallet.publicKeyBase64, 'base64');
    const spkiDer = Buffer.concat([ED25519_SPKI_PREFIX, rawKey]);
    const publicKey = crypto.createPublicKey({ key: spkiDer, format: 'der', type: 'spki' });
    const signature = Buffer.from(res._body.signature_base64 as string, 'base64');
    const valid = crypto.verify(null, payload, publicKey, signature);
    expect(valid).toBe(true);
  });
});

describe('POST /api/identity/custodial/sign — error cases', () => {
  it('returns 401 when no Authorization header', async () => {
    const req = mockReq('POST', ROUTE_SIGN, { payload_base64: 'aGVsbG8=' });
    const res = mockRes();
    await handleCustodialWalletRoutes(req, res, ROUTE_SIGN, 'POST', ROUTE_SIGN);
    expect(res._status).toBe(401);
  });

  it('returns 400 when payload_base64 is missing', async () => {
    const wrappingKey = Buffer.from(wrappingKeyB64, 'base64');
    provisionCustodialWallet(TEST_USER_ID, TEST_USER_ID, { wrappingKey });

    const res = await callSign({}); // no payload_base64
    expect(res._status).toBe(400);
    expect(res._body.error).toBe('payload_base64_required');
  });

  it('returns 404 when the user has no custodial wallet', async () => {
    // Don't provision — sign immediately.
    const res = await callSign({ payload_base64: 'aGVsbG8=' });
    expect(res._status).toBe(404);
    expect(res._body.error).toBe('no_wallet_found');
  });

  it('returns 403 when user has migrated to self-custody (Invariant #1)', async () => {
    const wrappingKey = Buffer.from(wrappingKeyB64, 'base64');
    provisionCustodialWallet(TEST_USER_ID, TEST_USER_ID, { wrappingKey });

    // Simulate the self-custody migration (custody-registry isSelfCustodyActive path).
    // The custodial-wallet-routes handler calls rejectIfMigratedToSelfCustody before decrypting.
    // We trigger this by marking self-custody via the custody-registry directly.
    const { markSelfCustodyActive } = await import('../../identity/custodial-wallet');
    markSelfCustodyActive(TEST_USER_ID);

    const res = await callSign({ payload_base64: 'aGVsbG8=' });
    expect(res._status).toBe(403);
    expect(res._body.error).toBe('user_migrated_to_self_custody');
  });
});

describe('Route dispatcher — sign route is wired', () => {
  it('returns false for an unrelated route (dispatcher pass-through)', async () => {
    const req = mockReq('GET', '/api/identity/custodial/unknown', undefined, {
      authorization: `Bearer ${TEST_API_KEY}`,
    });
    const res = mockRes();
    const matched = await handleCustodialWalletRoutes(
      req,
      res,
      '/api/identity/custodial/unknown',
      'GET',
      '/api/identity/custodial/unknown'
    );
    expect(matched).toBe(false);
  });

  it('ROUTE_SIGN constant equals /api/identity/custodial/sign', () => {
    expect(ROUTE_SIGN).toBe('/api/identity/custodial/sign');
  });
});

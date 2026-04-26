/**
 * Tests for HoloMesh HTTP Routes — Wallet Identity, Auth, Persistence
 *
 * Validates: register, key/challenge, key/recover, auth enforcement,
 * agent store persistence.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type http from 'http';
import { EventEmitter } from 'events';

// ── Mock fs before import (prevents loadAgentStore from touching disk) ──

const mockExistsSync = vi.fn(() => false);
const mockReadFileSync = vi.fn(() => '');
const mockWriteFileSync = vi.fn();
const mockMkdirSync = vi.fn();
const mockRenameSync = vi.fn();

vi.mock('fs', () => ({
  existsSync: (...args: any[]) => mockExistsSync(...args),
  readFileSync: (...args: any[]) => mockReadFileSync(...args),
  writeFileSync: (...args: any[]) => mockWriteFileSync(...args),
  mkdirSync: (...args: any[]) => mockMkdirSync(...args),
  renameSync: (...args: any[]) => mockRenameSync(...args),
}));

// ── Mock viem/accounts for wallet generation ──

const mockPrivateKeyToAccount = vi.fn((key: string) => ({
  address: `0x${key.replace('0x', '').slice(0, 40)}` as `0x${string}`,
}));

vi.mock('viem/accounts', () => ({
  privateKeyToAccount: (...args: any[]) => mockPrivateKeyToAccount(...args),
}));

// ── Mock viem for signature verification ──

const mockVerifyMessage = vi.fn().mockResolvedValue(true);
const mockVerifyTypedData = vi.fn().mockResolvedValue(true);

vi.mock('viem', () => ({
  verifyMessage: (...args: any[]) => mockVerifyMessage(...args),
  verifyTypedData: (...args: any[]) => mockVerifyTypedData(...args),
}));

// ── Mock @holoscript/core for PaymentGateway ──

const mockGateway = {
  createPaymentAuthorization: vi.fn((resource: string, amount: number) => ({
    x402Version: 1,
    accepts: [
      {
        scheme: 'exact',
        network: 'base-sepolia',
        maxAmountRequired: Math.round(amount * 1_000_000).toString(),
        resource,
        description: 'Premium HoloMesh entry',
        payTo: '0x0000000000000000000000000000000000000000',
        asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
        maxTimeoutSeconds: 60,
      },
    ],
    error: 'Payment required',
    chainId: 84532,
  })),
  verifyPayment: vi.fn(() => ({
    isValid: true,
    decodedPayload: { x402Version: 1, scheme: 'exact', network: 'base-sepolia', payload: {} },
  })),
  settlePayment: vi.fn().mockResolvedValue({ success: true }),
};

vi.mock('@holoscript/core', () => ({
  // W.011: function(){} for constructor mock
  PaymentGateway: vi.fn(function () {
    return mockGateway;
  }),
}));

// ── Mock orchestrator client ──

const mockClient = {
  registerAgent: vi.fn().mockResolvedValue('mock-agent-id'),
  discoverPeers: vi.fn().mockResolvedValue([]),
  queryKnowledge: vi.fn().mockResolvedValue([]),
  contributeKnowledge: vi.fn().mockResolvedValue(1),
  getAgentCard: vi.fn().mockResolvedValue(null),
  getAgentReputation: vi.fn().mockResolvedValue({
    score: 10,
    tier: 'contributor',
    contributions: 5,
    queriesAnswered: 3,
    reuseRate: 0.5,
  }),
  getAgentId: vi.fn().mockReturnValue('server-agent-id'),
  heartbeat: vi.fn().mockResolvedValue(true),
};

vi.mock('../orchestrator-client', () => ({
  // W.011: function(){} for constructor mock
  HoloMeshOrchestratorClient: vi.fn(function (this: any) {
    Object.assign(this, mockClient);
  }),
  getClient: vi.fn(() => mockClient),
}));

// ── Mock process.env ──

const originalEnv = { ...process.env };

// ── Import after mocks ──

import { handleHoloMeshRoute } from '../http-routes';
import {
  teamStore,
  teamPresenceStore,
  agentAuditStore,
  appendCaelAuditRecord,
  type CaelAuditRecord,
} from '../state';

// ── Test Helpers ──

/** Create a mock HTTP request */
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

  // Simulate body stream — delay must exceed any async work (dynamic imports, etc.)
  // that happens before parseJsonBody attaches its listeners
  if (body) {
    const data = JSON.stringify(body);
    setTimeout(() => {
      req.emit('data', Buffer.from(data));
      req.emit('end');
    }, 200);
  } else {
    setTimeout(() => req.emit('end'), 200);
  }

  return req;
}

/** Create a mock HTTP response that captures output */
function mockRes(): http.ServerResponse & {
  _status: number;
  _body: any;
  _headers: Record<string, string>;
} {
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

// ── Tests ──

describe('HoloMesh HTTP Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExistsSync.mockReturnValue(false);
    mockVerifyMessage.mockResolvedValue(true);
    mockVerifyTypedData.mockResolvedValue(true);
    process.env.HOLOSCRIPT_API_KEY = 'test-api-key';
    process.env.HOLOMESH_AGENT_NAME = 'test-agent';
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // ── Register ──

  describe('POST /api/holomesh/register', () => {
    it('registers a new agent with auto-generated wallet', async () => {
      const req = mockReq('POST', '/api/holomesh/register', { name: 'test-bot' });
      const res = mockRes();

      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._status).toBe(201);
      expect(res._body.success).toBe(true);
      expect(res._body.agent.name).toBe('test-bot');
      expect(res._body.agent.api_key).toMatch(/^holomesh_sk_/);
      expect(res._body.agent.wallet_address).toMatch(/^0x/);
      expect(res._body.wallet.private_key).toMatch(/^0x/);
      expect(res._body.wallet.important).toContain('Save your private_key');
    });

    it('registers with x402 challenge-verified client wallet', async () => {
      // SEC-T-Zero 2026-04-22: wallet_address now requires challenge + signature proof.
      const walletAddress = '0xABCDef1234567890abcdef1234567890ABCDef12';

      // Step 1: challenge
      const chalReq = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: walletAddress });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/register/challenge');
      expect(chalRes._status).toBe(200);
      const nonce = chalRes._body.nonce;

      // Step 2: register with signature
      mockVerifyTypedData.mockResolvedValue(true);
      const req = mockReq('POST', '/api/holomesh/register', {
        name: 'wallet-bot',
        wallet_address: walletAddress,
        nonce,
        signature: '0xvalidsig',
      });
      const res = mockRes();

      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._status).toBe(201);
      expect(res._body.agent.wallet_address).toBe(walletAddress);
      // CRITICAL: no private_key in response
      expect(res._body.wallet.private_key).toBeUndefined();
      expect(res._body.wallet.source).toContain('client-provided');
    });

    it('rejects short names', async () => {
      const req = mockReq('POST', '/api/holomesh/register', { name: 'a' });
      const res = mockRes();

      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('2-64 chars');
    });

    it('rejects missing name', async () => {
      const req = mockReq('POST', '/api/holomesh/register', {});
      const res = mockRes();

      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._status).toBe(400);
    });

    it('rejects duplicate names (case-insensitive)', async () => {
      // Register first agent
      const req1 = mockReq('POST', '/api/holomesh/register', { name: 'UniqueBot' });
      const res1 = mockRes();
      await handleHoloMeshRoute(req1, res1, '/api/holomesh/register');
      expect(res1._status).toBe(201);

      // Try duplicate
      const req2 = mockReq('POST', '/api/holomesh/register', { name: 'uniquebot' });
      const res2 = mockRes();
      await handleHoloMeshRoute(req2, res2, '/api/holomesh/register');

      expect(res2._status).toBe(409);
      expect(res2._body.error).toContain('already registered');
    });

    it('rejects duplicate wallet address (at challenge step)', async () => {
      // SEC-T-Zero 2026-04-22: duplicate wallet blocked at /register/challenge now (earlier in flow).
      const wallet = '0x1111111111111111111111111111111111111111';

      // Step 1: first agent gets challenge + registers
      const chal1Req = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: wallet });
      const chal1Res = mockRes();
      await handleHoloMeshRoute(chal1Req, chal1Res, '/api/holomesh/register/challenge');
      const nonce1 = chal1Res._body.nonce;

      mockVerifyTypedData.mockResolvedValue(true);
      const req1 = mockReq('POST', '/api/holomesh/register', {
        name: 'bot-a',
        wallet_address: wallet,
        nonce: nonce1,
        signature: '0xsig',
      });
      const res1 = mockRes();
      await handleHoloMeshRoute(req1, res1, '/api/holomesh/register');
      expect(res1._status).toBe(201);

      // Step 2: duplicate blocked at challenge step
      const chal2Req = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: wallet });
      const chal2Res = mockRes();
      await handleHoloMeshRoute(chal2Req, chal2Res, '/api/holomesh/register/challenge');
      expect(chal2Res._status).toBe(409);
      expect(chal2Res._body.error).toContain('already registered');
    });

    it('persists agent store to disk after registration', async () => {
      const req = mockReq('POST', '/api/holomesh/register', { name: 'persist-bot' });
      const res = mockRes();

      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._status).toBe(201);
      // Atomic write: writeFileSync to .tmp, then renameSync
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenData = mockWriteFileSync.mock.calls[0][1];
      const parsed = JSON.parse(writtenData);
      expect(parsed.version).toBe(1);
      expect(parsed.agents).toBeInstanceOf(Array);
      expect(parsed.agents.length).toBeGreaterThan(0);
      expect(mockRenameSync).toHaveBeenCalled();
    });
  });

  // ── Key Challenge ──

  describe('POST /api/holomesh/key/challenge', () => {
    it('returns challenge for registered wallet', async () => {
      // Register first
      const regReq = mockReq('POST', '/api/holomesh/register', { name: 'challenge-bot' });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const walletAddress = regRes._body.agent.wallet_address;

      // Request challenge
      const req = mockReq('POST', '/api/holomesh/key/challenge', { wallet_address: walletAddress });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/key/challenge');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.challenge.agent).toContain('challenge-bot');
      expect(res._body.nonce).toBeTruthy();
      expect(res._body.expires_in).toBe(300); // 5 minutes
    });

    it('returns 400 if wallet_address missing', async () => {
      const req = mockReq('POST', '/api/holomesh/key/challenge', {});
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/key/challenge');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('wallet_address is required');
    });

    it('returns 404 for unregistered wallet', async () => {
      const req = mockReq('POST', '/api/holomesh/key/challenge', {
        wallet_address: '0x0000000000000000000000000000000000000000',
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/key/challenge');

      expect(res._status).toBe(404);
      expect(res._body.error).toContain('No agent registered');
    });
  });

  // ── Key Recovery ──

  describe('POST /api/holomesh/key/recover', () => {
    it('recovers API key with valid signature', async () => {
      // Register
      const regReq = mockReq('POST', '/api/holomesh/register', { name: 'recover-bot' });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const walletAddress = regRes._body.agent.wallet_address;
      const expectedApiKey = regRes._body.agent.api_key;

      // Get challenge
      const chalReq = mockReq('POST', '/api/holomesh/key/challenge', {
        wallet_address: walletAddress,
      });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/key/challenge');
      const nonce = chalRes._body.nonce;

      // Recover with valid signature
      mockVerifyTypedData.mockResolvedValue(true);
      const recReq = mockReq('POST', '/api/holomesh/key/recover', {
        wallet_address: walletAddress,
        nonce,
        signature: '0xvalidsignature',
      });
      const recRes = mockRes();
      await handleHoloMeshRoute(recReq, recRes, '/api/holomesh/key/recover');

      expect(recRes._status).toBe(200);
      expect(recRes._body.success).toBe(true);
      expect(recRes._body.recovered).toBe(true);
      expect(recRes._body.agent.api_key).toBe(expectedApiKey);
      expect(recRes._body.agent.name).toBe('recover-bot');
    });

    it('rejects invalid signature', async () => {
      // Register
      const regReq = mockReq('POST', '/api/holomesh/register', { name: 'reject-bot' });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const walletAddress = regRes._body.agent.wallet_address;

      // Get challenge
      const chalReq = mockReq('POST', '/api/holomesh/key/challenge', {
        wallet_address: walletAddress,
      });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/key/challenge');
      const nonce = chalRes._body.nonce;

      // Reject bad signature
      mockVerifyTypedData.mockResolvedValue(false);
      const recReq = mockReq('POST', '/api/holomesh/key/recover', {
        wallet_address: walletAddress,
        nonce,
        signature: '0xbadsig',
      });
      const recRes = mockRes();
      await handleHoloMeshRoute(recReq, recRes, '/api/holomesh/key/recover');

      expect(recRes._status).toBe(401);
      expect(recRes._body.error).toContain('Signature verification failed');
    });

    it('rejects missing fields', async () => {
      const req = mockReq('POST', '/api/holomesh/key/recover', { wallet_address: '0xabc' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/key/recover');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('wallet_address, nonce, and signature are required');
    });

    it('rejects invalid/expired nonce', async () => {
      const req = mockReq('POST', '/api/holomesh/key/recover', {
        wallet_address: '0xabc',
        nonce: 'nonexistent-nonce',
        signature: '0xsig',
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/key/recover');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('Invalid or expired nonce');
    });

    it('consumes nonce after use (single-use)', async () => {
      // Register
      const regReq = mockReq('POST', '/api/holomesh/register', { name: 'nonce-bot' });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const walletAddress = regRes._body.agent.wallet_address;

      // Get challenge
      const chalReq = mockReq('POST', '/api/holomesh/key/challenge', {
        wallet_address: walletAddress,
      });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/key/challenge');
      const nonce = chalRes._body.nonce;

      // First recover — succeeds
      mockVerifyTypedData.mockResolvedValue(true);
      const rec1Req = mockReq('POST', '/api/holomesh/key/recover', {
        wallet_address: walletAddress,
        nonce,
        signature: '0xsig',
      });
      const rec1Res = mockRes();
      await handleHoloMeshRoute(rec1Req, rec1Res, '/api/holomesh/key/recover');
      expect(rec1Res._status).toBe(200);

      // Second recover with same nonce — fails
      const rec2Req = mockReq('POST', '/api/holomesh/key/recover', {
        wallet_address: walletAddress,
        nonce,
        signature: '0xsig',
      });
      const rec2Res = mockRes();
      await handleHoloMeshRoute(rec2Req, rec2Res, '/api/holomesh/key/recover');
      expect(rec2Res._status).toBe(400);
      expect(rec2Res._body.error).toContain('Invalid or expired nonce');
    });

    it('rejects wallet address mismatch', async () => {
      // Register two agents
      const reg1Req = mockReq('POST', '/api/holomesh/register', { name: 'mismatch-a' });
      const reg1Res = mockRes();
      await handleHoloMeshRoute(reg1Req, reg1Res, '/api/holomesh/register');
      const walletA = reg1Res._body.agent.wallet_address;

      const reg2Req = mockReq('POST', '/api/holomesh/register', { name: 'mismatch-b' });
      const reg2Res = mockRes();
      await handleHoloMeshRoute(reg2Req, reg2Res, '/api/holomesh/register');
      const walletB = reg2Res._body.agent.wallet_address;

      // Get challenge for wallet A
      const chalReq = mockReq('POST', '/api/holomesh/key/challenge', { wallet_address: walletA });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/key/challenge');
      const nonce = chalRes._body.nonce;

      // Try to recover with wallet B's address using A's nonce
      const recReq = mockReq('POST', '/api/holomesh/key/recover', {
        wallet_address: walletB,
        nonce,
        signature: '0xsig',
      });
      const recRes = mockRes();
      await handleHoloMeshRoute(recReq, recRes, '/api/holomesh/key/recover');

      expect(recRes._status).toBe(400);
      expect(recRes._body.error).toContain('does not match');
    });
  });

  // ── x402 Challenge-Verified Registration (SEC-T-Zero fix 2026-04-22) ──

  describe('POST /api/holomesh/register/challenge', () => {
    it('issues a nonce for a fresh wallet_address', async () => {
      const walletAddress = '0x' + 'a'.repeat(40);
      const req = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: walletAddress });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register/challenge');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.nonce).toBeTruthy();
      expect(res._body.expires_in).toBe(300);
      expect(res._body.challenge.walletAddress).toBe(walletAddress);
      expect(res._body.instructions).toBeTruthy();
    });

    it('returns 400 for malformed wallet_address', async () => {
      const req = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: 'not-an-address' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register/challenge');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('must be a valid');
    });

    it('returns 409 for already-registered wallet', async () => {
      // Register first (legacy path, server-gen)
      const regReq = mockReq('POST', '/api/holomesh/register', { name: 'already-registered-bot' });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const existingWallet = regRes._body.agent.wallet_address;

      // Challenge for that wallet → 409
      const req = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: existingWallet });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register/challenge');

      expect(res._status).toBe(409);
      expect(res._body.error).toContain('already registered');
    });
  });

  describe('POST /api/holomesh/register (x402 path)', () => {
    it('happy path: challenge + sign + register, NO private_key in response', async () => {
      const walletAddress = '0x' + 'b'.repeat(40);
      // Step 1: challenge
      const chalReq = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: walletAddress });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/register/challenge');
      const nonce = chalRes._body.nonce;

      // Step 2: register with valid signature (mocked)
      mockVerifyTypedData.mockResolvedValue(true);
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: 'x402-happy-bot',
        wallet_address: walletAddress,
        nonce,
        signature: '0xvalidsig',
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');

      expect(regRes._status).toBe(201);
      expect(regRes._body.success).toBe(true);
      expect(regRes._body.agent.wallet_address).toBe(walletAddress);
      // CRITICAL: server never returned private_key
      expect(regRes._body.wallet.private_key).toBeUndefined();
      expect(regRes._body.wallet.source).toContain('client-provided');
      expect(regRes._body.wallet.source).toContain('x402 challenge-verified');
    });

    it('rejects wallet_address without nonce/signature with migration hint', async () => {
      const req = mockReq('POST', '/api/holomesh/register', {
        name: 'no-proof-bot',
        wallet_address: '0x' + 'c'.repeat(40),
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('proof-of-ownership');
      expect(res._body.see).toContain('/register/challenge');
    });

    it('rejects invalid signature with 401', async () => {
      const walletAddress = '0x' + 'd'.repeat(40);
      const chalReq = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: walletAddress });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/register/challenge');
      const nonce = chalRes._body.nonce;

      mockVerifyTypedData.mockResolvedValue(false);
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: 'bad-sig-bot',
        wallet_address: walletAddress,
        nonce,
        signature: '0xbadsig',
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');

      expect(regRes._status).toBe(401);
      expect(regRes._body.error).toContain('Signature verification failed');
    });

    it('rejects replay (same nonce twice)', async () => {
      const walletA = '0x' + 'e'.repeat(40);
      const chalReq = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: walletA });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/register/challenge');
      const nonce = chalRes._body.nonce;

      // First use — succeeds
      mockVerifyTypedData.mockResolvedValue(true);
      const reg1Req = mockReq('POST', '/api/holomesh/register', {
        name: 'replay-first',
        wallet_address: walletA,
        nonce,
        signature: '0xsig',
      });
      const reg1Res = mockRes();
      await handleHoloMeshRoute(reg1Req, reg1Res, '/api/holomesh/register');
      expect(reg1Res._status).toBe(201);

      // Second use of same nonce — fails (already consumed)
      const reg2Req = mockReq('POST', '/api/holomesh/register', {
        name: 'replay-second',
        wallet_address: '0x' + 'f'.repeat(40),  // different wallet, doesn't matter
        nonce,
        signature: '0xsig',
      });
      const reg2Res = mockRes();
      await handleHoloMeshRoute(reg2Req, reg2Res, '/api/holomesh/register');
      expect(reg2Res._status).toBe(400);
      expect(reg2Res._body.error).toContain('Invalid or expired nonce');
    });

    it('rejects wallet mismatch (nonce for A, register attempts B)', async () => {
      // Use unique wallet values — walletA='1' and walletB='2' collide with earlier
      // "rejects duplicate wallet address" test (challengeStore + walletToAgent share state).
      const walletA = '0x' + '3'.repeat(40);
      const walletB = '0x' + '4'.repeat(40);
      const chalReq = mockReq('POST', '/api/holomesh/register/challenge', { wallet_address: walletA });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/register/challenge');
      const nonce = chalRes._body.nonce;

      mockVerifyTypedData.mockResolvedValue(true);
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: 'mismatch-bot',
        wallet_address: walletB,   // different wallet than challenge was for
        nonce,
        signature: '0xsig',
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');

      expect(regRes._status).toBe(400);
      expect(regRes._body.error).toContain('does not match');
    });
  });

  describe('POST /api/holomesh/register (legacy path, deprecated)', () => {
    it('still succeeds with no wallet_address but sets deprecation signal in body', async () => {
      const req = mockReq('POST', '/api/holomesh/register', { name: 'legacy-deprecated-bot' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._status).toBe(201);
      expect(res._body.agent.api_key).toBeTruthy();
      expect(res._body.wallet.private_key).toBeTruthy();  // legacy behavior preserved
      expect(res._body.wallet.deprecated).toContain('deprecated');
      // Deprecation signal in body tells clients to migrate
      expect(res._body.deprecation).toBeTruthy();
      expect(res._body.deprecation.path).toBe('server-side-wallet-gen');
      expect(res._body.deprecation.migrate_to).toContain('/register/challenge');
    });
  });

  // ── Auth Enforcement ──

  describe('Auth enforcement', () => {
    let apiKey: string;
    let authBotCounter = 0;

    beforeEach(async () => {
      authBotCounter++;
      const req = mockReq('POST', '/api/holomesh/register', {
        name: `auth-bot-${Date.now()}-${authBotCounter}-${Math.random().toString(36).slice(2, 8)}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');
      apiKey = res._body.agent.api_key;
    });

    it('POST /contribute requires auth', async () => {
      const req = mockReq('POST', '/api/holomesh/contribute', {
        type: 'wisdom',
        content: 'Test insight',
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/contribute');

      expect(res._status).toBe(401);
      expect(res._body.error).toContain('Authentication required');
    });

    it('POST /contribute succeeds with valid Bearer token', async () => {
      const req = mockReq(
        'POST',
        '/api/holomesh/contribute',
        {
          type: 'wisdom',
          content: 'Test insight from auth test',
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/contribute');

      expect(res._status).toBe(201);
      expect(res._body.success).toBe(true);
      expect(res._body.provenanceHash).toBeTruthy();
    });

    it('POST /entry/:id/vote requires auth', async () => {
      const req = mockReq('POST', '/api/holomesh/entry/test-entry/vote', { value: 1 });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/test-entry/vote');

      expect(res._status).toBe(401);
    });

    it('POST /entry/:id/comment requires auth', async () => {
      const req = mockReq('POST', '/api/holomesh/entry/test-entry/comment', { content: 'test' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/test-entry/comment');

      expect(res._status).toBe(401);
    });

    it('POST /entry/:id/vote returns 404 when entry does not exist (no orphan votes)', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([]);
      const req = mockReq(
        'POST',
        '/api/holomesh/entry/phantom-id/vote',
        { value: 1 },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/phantom-id/vote');
      expect(res._status).toBe(404);
      expect(String(res._body.error || '')).toMatch(/not found/i);
    });

    it('POST /entry/:id/comment returns 404 when entry does not exist (no orphan comments)', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([]);
      const req = mockReq(
        'POST',
        '/api/holomesh/entry/phantom-id/comment',
        { content: 'orphan' },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/phantom-id/comment');
      expect(res._status).toBe(404);
      expect(String(res._body.error || '')).toMatch(/not found/i);
    });

    it('POST /entry/:id/vote succeeds when entry exists', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'vote-target-entry',
          workspaceId: 'w',
          type: 'wisdom',
          content: 'c',
          provenanceHash: 'h',
          authorId: 'a',
          authorName: 'A',
          price: 0,
          queryCount: 0,
          reuseCount: 0,
          domain: 'general',
          tags: [],
          confidence: 0.9,
          createdAt: new Date().toISOString(),
        },
      ]);
      const req = mockReq(
        'POST',
        '/api/holomesh/entry/vote-target-entry/vote',
        { value: 1 },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/vote-target-entry/vote');
      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
    });

    it('rejects invalid API key', async () => {
      const req = mockReq(
        'POST',
        '/api/holomesh/contribute',
        {
          type: 'wisdom',
          content: 'Test',
        },
        { authorization: 'Bearer holomesh_sk_INVALID' }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/contribute');

      expect(res._status).toBe(401);
      expect(res._body.error).toContain('Invalid API key');
    });
  });

  // ── Read Endpoints (no auth required) ──

  describe('Read endpoints (unauthenticated)', () => {
    it('GET /api/holomesh/health exposes board warnings contract metadata', async () => {
      const req = mockReq('GET', '/api/holomesh/health');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/health');

      expect(res._status).toBe(200);
      expect(res._body.status).toBe('operational');
      expect(res._body.contracts?.board_add_warnings_field).toEqual({
        path: '/api/holomesh/team/:id/board',
        expectedType: 'array',
        requiredForLongDescriptions: true,
        reason: 'description truncation metadata must be machine-detectable',
      });
    });

    it('GET /feed works without auth', async () => {
      const req = mockReq('GET', '/api/holomesh/feed');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/feed');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.entries).toBeInstanceOf(Array);
    });

    it('GET /agents works without auth', async () => {
      const req = mockReq('GET', '/api/holomesh/agents');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/agents');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
    });

    it('GET /dashboard returns not_registered without auth', async () => {
      const req = mockReq('GET', '/api/holomesh/dashboard');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/dashboard');

      expect(res._status).toBe(200);
      expect(res._body.status).toBe('not_registered');
    });

    it('GET /dashboard returns stats with auth', async () => {
      // Register
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `dash-bot-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      const req = mockReq('GET', '/api/holomesh/dashboard', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/dashboard');

      expect(res._status).toBe(200);
      expect(res._body.status).toBe('active');
    });
  });

  describe('GET /api/holomesh/me', () => {
    it('returns 401 without Bearer token', async () => {
      const req = mockReq('GET', '/api/holomesh/me');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/me');

      expect(res._status).toBe(401);
      expect(res._body.error).toContain('Authentication required');
    });

    it('returns agentId, wallet, teams, permissions with Bearer after register', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `me-bot-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;
      const expectedId = regRes._body.agent.id;

      const req = mockReq('GET', '/api/holomesh/me', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/me');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.agentId).toBe(expectedId);
      expect(res._body.name).toBeTruthy();
      expect(res._body.wallet).toMatch(/^0x/);
      expect(res._body.teams).toEqual([]);
      expect(res._body.teamId).toBe(null);
      expect(Array.isArray(res._body.permissions)).toBe(true);
    });

    it('also accepts x-mcp-api-key header (orchestrator convention) — closes W.087 gap-bearer-mismatch', async () => {
      // task_1777073616424_klls regression: shared/registered key sent under
      // x-mcp-api-key (the convention used by orchestrator-client +
      // holomesh-tools.ts) used to fail 401 because resolveRequestingAgent
      // only inspected `Authorization: Bearer`. Now both header forms route
      // through the same key-registry / agent-store / env-fallback chain.
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `me-mcp-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;
      const expectedId = regRes._body.agent.id;

      const req = mockReq('GET', '/api/holomesh/me', undefined, {
        'x-mcp-api-key': apiKey,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/me');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.agentId).toBe(expectedId);
    });

    it('still 401s when neither auth header is present', async () => {
      const req = mockReq('GET', '/api/holomesh/me', undefined, {
        'x-some-other-header': 'irrelevant',
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/me');

      expect(res._status).toBe(401);
    });
  });

  // ── Space ──

  describe('GET /api/holomesh/space', () => {
    it('returns wallet_address when authenticated', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `space-bot-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      const req = mockReq('GET', '/api/holomesh/space', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/space');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.your_agent.wallet_address).toMatch(/^0x/);
      expect(res._body.quick_links.key_challenge).toBe('POST /api/holomesh/key/challenge');
      expect(res._body.quick_links.key_recover).toBe('POST /api/holomesh/key/recover');
    });
  });

  // ── Premium Entries (x402 Payment Gate) ──

  describe('Premium entries (x402)', () => {
    it('feed truncates content of premium entries for unauthenticated users', async () => {
      const longContent = 'A'.repeat(200);
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'premium-1',
          type: 'wisdom',
          content: longContent,
          domain: 'security',
          price: 0.05,
          authorId: 'other',
          authorName: 'author',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/feed');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/feed');

      expect(res._status).toBe(200);
      expect(res._body.entries[0].premium).toBe(true);
      expect(res._body.entries[0].paid).toBe(false);
      expect(res._body.entries[0].content).toContain('[premium');
      expect(res._body.entries[0].content.length).toBeLessThan(longContent.length);
    });

    it('feed shows full content for free entries', async () => {
      const content = 'Free knowledge for all';
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'free-1',
          type: 'wisdom',
          content,
          domain: 'general',
          price: 0,
          authorId: 'other',
          authorName: 'author',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/feed');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/feed');

      expect(res._status).toBe(200);
      expect(res._body.entries[0].premium).toBe(false);
      expect(res._body.entries[0].content).toBe(content);
    });

    it('entry detail returns 402 for premium entry without payment', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'premium-2',
          type: 'pattern',
          content: 'Secret pattern',
          domain: 'agents',
          price: 0.1,
          authorId: 'other',
          authorName: 'author',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/entry/premium-2');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/premium-2');

      expect(res._status).toBe(402);
      expect(res._body.accepts).toBeInstanceOf(Array);
      expect(res._body.accepts[0].maxAmountRequired).toBe('100000'); // 0.10 USDC = 100000 base units
      expect(res._body.preview).toBeDefined();
      expect(res._body.preview.price).toBe(0.1);
      expect(res._body.hint).toContain('X-PAYMENT');
    });

    it('entry detail returns full content for free entry', async () => {
      const content = 'Free knowledge accessible to all';
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'free-2',
          type: 'wisdom',
          content,
          domain: 'general',
          price: 0,
          authorId: 'other',
          authorName: 'author',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/entry/free-2');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/free-2');

      expect(res._status).toBe(200);
      expect(res._body.entry.content).toBe(content);
    });

    it('entry detail accepts X-PAYMENT header for premium entry (testnet fallback)', async () => {
      // Register agent for auth
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `pay-bot-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'premium-3',
          type: 'gotcha',
          content: 'Full premium secret gotcha',
          domain: 'compilation',
          price: 0.05,
          authorId: 'other',
          authorName: 'author',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/entry/premium-3', undefined, {
        authorization: `Bearer ${apiKey}`,
        'x-payment': 'eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCJ9.mock-payment-token-long-enough',
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/premium-3');

      expect(res._status).toBe(200);
      expect(res._body.entry.content).toBe('Full premium secret gotcha');
      expect(res._body.entry.premium).toBe(true);
      expect(res._body.entry.paid).toBe(true);
    });
  });

  // ── Profile Customization ──

  describe('Profile customization', () => {
    let apiKey: string;

    beforeEach(async () => {
      const req = mockReq('POST', '/api/holomesh/register', {
        name: `profile-bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');
      apiKey = res._body.agent.api_key;
    });

    it('GET /profile returns default profile', async () => {
      const req = mockReq('GET', '/api/holomesh/profile', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.profile.bio).toBe('A knowledge agent on the HoloMesh network.');
      expect(res._body.profile.themeColor).toBe('#6366f1');
    });

    it('GET /profile requires auth', async () => {
      const req = mockReq('GET', '/api/holomesh/profile');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(401);
    });

    it('PATCH /profile updates bio and theme', async () => {
      const req = mockReq(
        'PATCH',
        '/api/holomesh/profile',
        {
          bio: 'I trade wisdom for wisdom.',
          themeColor: '#ff6b6b',
          statusText: 'Open for trades',
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.profile.bio).toBe('I trade wisdom for wisdom.');
      expect(res._body.profile.themeColor).toBe('#ff6b6b');
      expect(res._body.profile.statusText).toBe('Open for trades');
      expect(res._body.updated).toEqual(
        expect.arrayContaining(['bio', 'themeColor', 'statusText'])
      );
    });

    it('PATCH /profile persists changes', async () => {
      const req = mockReq(
        'PATCH',
        '/api/holomesh/profile',
        {
          customTitle: 'The Oracle',
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(200);
      expect(mockWriteFileSync).toHaveBeenCalled(); // persist called
    });

    it('PATCH /profile rejects invalid hex color', async () => {
      const req = mockReq(
        'PATCH',
        '/api/holomesh/profile',
        {
          themeColor: 'not-a-color',
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('hex color');
    });

    it('PATCH /profile rejects overly long bio', async () => {
      const req = mockReq(
        'PATCH',
        '/api/holomesh/profile',
        {
          bio: 'x'.repeat(501),
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('500 characters');
    });

    it('PATCH /profile rejects empty update', async () => {
      const req = mockReq(
        'PATCH',
        '/api/holomesh/profile',
        {
          unknown_field: 'ignored',
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('No valid profile fields');
    });

    it('PUT /profile also works (same as PATCH)', async () => {
      const req = mockReq(
        'PUT',
        '/api/holomesh/profile',
        {
          themeAccent: '#a78bfa',
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(200);
      expect(res._body.profile.themeAccent).toBe('#a78bfa');
    });
  });

  // ── Private Knowledge Store ──

  describe('Private knowledge store', () => {
    let apiKey: string;
    let agentName: string;

    beforeEach(async () => {
      agentName = `vault-bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const req = mockReq('POST', '/api/holomesh/register', { name: agentName });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');
      apiKey = res._body.agent.api_key;
    });

    it('registration auto-provisions private workspace', async () => {
      // The register call should have called contributeKnowledge with a workspace init entry
      const initCalls = mockClient.contributeKnowledge.mock.calls;
      const wsInitCall = initCalls.find((call: any[]) =>
        call[0]?.some?.((e: any) => e.id.endsWith(':init') && e.workspaceId.startsWith('private:'))
      );
      expect(wsInitCall).toBeDefined();
    });

    it('registration response includes private_workspace info', async () => {
      const name = `ws-check-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const req = mockReq('POST', '/api/holomesh/register', { name });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._body.private_workspace).toBeDefined();
      expect(res._body.private_workspace.id).toMatch(/^private:0x/);
      expect(res._body.private_workspace.query).toContain('/knowledge/private');
    });

    it('GET /knowledge/private requires auth', async () => {
      const req = mockReq('GET', '/api/holomesh/knowledge/private');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._status).toBe(401);
    });

    it('GET /knowledge/private returns entries from private workspace', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'W.test.priv.1',
          type: 'wisdom',
          content: 'Private insight',
          domain: 'security',
          authorId: 'me',
          authorName: agentName,
          workspaceId: 'private:0xabc',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/knowledge/private', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.workspace_id).toMatch(/^private:0x/);
      expect(res._body.entries).toHaveLength(1);
      expect(res._body.entries[0].content).toBe('Private insight');
      expect(res._body.domains).toContain('security');
    });

    it('GET /knowledge/private filters by domain', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'W.1',
          type: 'wisdom',
          content: 'A',
          domain: 'security',
          authorId: 'me',
          authorName: 'x',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'W.2',
          type: 'pattern',
          content: 'B',
          domain: 'agents',
          authorId: 'me',
          authorName: 'x',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/knowledge/private?domain=security', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private?domain=security');

      expect(res._status).toBe(200);
      expect(res._body.entries).toHaveLength(1);
      expect(res._body.entries[0].domain).toBe('security');
    });

    it('GET /knowledge/private excludes workspace-init entries', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'private:0xabc:init',
          type: 'wisdom',
          content: 'Init',
          domain: 'general',
          authorId: 'me',
          authorName: 'x',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'W.real',
          type: 'wisdom',
          content: 'Real entry',
          domain: 'general',
          authorId: 'me',
          authorName: 'x',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/knowledge/private', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._body.entries).toHaveLength(1);
      expect(res._body.entries[0].id).toBe('W.real');
    });

    it('POST /knowledge/private syncs entries to private workspace', async () => {
      mockClient.contributeKnowledge.mockResolvedValueOnce(2);

      const req = mockReq(
        'POST',
        '/api/holomesh/knowledge/private',
        {
          entries: [
            { type: 'wisdom', content: 'Private wisdom A', domain: 'security' },
            { type: 'gotcha', content: 'Private gotcha B', domain: 'agents', tags: ['vitest'] },
          ],
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._status).toBe(201);
      expect(res._body.success).toBe(true);
      expect(res._body.workspace_id).toMatch(/^private:0x/);
      expect(res._body.entries).toHaveLength(2);
      expect(res._body.entries[0].type).toBe('wisdom');
      expect(res._body.entries[1].type).toBe('gotcha');

      // Verify the contributeKnowledge call used the private workspace
      const lastCall = mockClient.contributeKnowledge.mock.calls.at(-1);
      expect(lastCall[0][0].workspaceId).toMatch(/^private:0x/);
      expect(lastCall[0][0].tags).toContain('private');
    });

    it('POST /knowledge/private requires auth', async () => {
      const req = mockReq('POST', '/api/holomesh/knowledge/private', {
        entries: [{ type: 'wisdom', content: 'test' }],
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._status).toBe(401);
    });

    it('POST /knowledge/private rejects empty entries', async () => {
      const req = mockReq(
        'POST',
        '/api/holomesh/knowledge/private',
        {
          entries: [],
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('entries');
    });

    it('POST /knowledge/private rejects more than 100 entries', async () => {
      const bigBatch = Array.from({ length: 101 }, (_, i) => ({
        type: 'wisdom',
        content: `Entry ${i}`,
      }));

      const req = mockReq(
        'POST',
        '/api/holomesh/knowledge/private',
        {
          entries: bigBatch,
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('100');
    });

    it('POST /knowledge/promote promotes private entry to public feed', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'W.priv.1',
          type: 'wisdom',
          content: 'Promotable insight',
          domain: 'security',
          authorId: 'me',
          authorName: agentName,
          workspaceId: 'private:0xabc',
          tags: ['private'],
          provenanceHash: 'abc123',
          price: 0,
          queryCount: 0,
          reuseCount: 0,
          createdAt: new Date().toISOString(),
        },
      ]);
      mockClient.contributeKnowledge.mockResolvedValueOnce(1);

      const req = mockReq(
        'POST',
        '/api/holomesh/knowledge/promote',
        {
          entry_id: 'W.priv.1',
          price: 0.05,
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/promote');

      expect(res._status).toBe(201);
      expect(res._body.success).toBe(true);
      expect(res._body.promoted.from).toBe('W.priv.1');
      expect(res._body.promoted.to).toMatch(/^pub\./);
      expect(res._body.promoted.price).toBe(0.05);

      // Verify the public entry was synced to the shared workspace (NOT private)
      const lastCall = mockClient.contributeKnowledge.mock.calls.at(-1);
      expect(lastCall[0][0].workspaceId).not.toMatch(/^private:/);
      expect(lastCall[0][0].tags).toContain('promoted');
      expect(lastCall[0][0].tags).not.toContain('private');
    });

    it('POST /knowledge/promote returns 404 for missing entry', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([]);

      const req = mockReq(
        'POST',
        '/api/holomesh/knowledge/promote',
        {
          entry_id: 'nonexistent',
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/promote');

      expect(res._status).toBe(404);
      expect(res._body.error).toContain('not found');
    });

    it('DELETE /knowledge/private/:id deletes entry via tombstone', async () => {
      mockClient.contributeKnowledge.mockResolvedValueOnce(1);

      const req = mockReq('DELETE', '/api/holomesh/knowledge/private/W.priv.1', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private/W.priv.1');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.deleted).toBe('W.priv.1');

      // Verify tombstone was synced
      const lastCall = mockClient.contributeKnowledge.mock.calls.at(-1);
      expect(lastCall[0][0].content).toBe('[deleted]');
      expect(lastCall[0][0].tags).toContain('tombstone');
    });

    it('DELETE /knowledge/private/:id requires auth', async () => {
      const req = mockReq('DELETE', '/api/holomesh/knowledge/private/W.priv.1');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private/W.priv.1');

      expect(res._status).toBe(401);
    });

    it('/space includes private_workspace in your_agent', async () => {
      const req = mockReq('GET', '/api/holomesh/space', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/space');

      expect(res._status).toBe(200);
      expect(res._body.your_agent.private_workspace).toBeDefined();
      expect(res._body.your_agent.private_workspace.id).toMatch(/^private:0x/);
      expect(res._body.quick_links.private_knowledge).toBeDefined();
    });
  });

  // ── Enterprise Team Workspaces ──

  describe('Enterprise Team Workspaces', () => {
    let ownerApiKey: string;
    let ownerAgentId: string;
    let memberApiKey: string;
    let memberAgentId: string;
    let teamId: string;
    let inviteCode: string;

    let agentCounter = 0;

    // Helper: register an agent and return api_key + id
    async function registerAgent(name: string): Promise<{ apiKey: string; agentId: string }> {
      const uniqueName = `${name}-${++agentCounter}-${Math.random().toString(36).slice(2, 8)}`;
      const req = mockReq('POST', '/api/holomesh/register', { name: uniqueName });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');
      if (res._status !== 201) throw new Error(`Register failed: ${JSON.stringify(res._body)}`);
      return { apiKey: res._body.agent.api_key, agentId: res._body.agent.id };
    }

    // Setup: register owner + member agents before team tests
    beforeEach(async () => {
      const owner = await registerAgent('team-owner');
      ownerApiKey = owner.apiKey;
      ownerAgentId = owner.agentId;

      const member = await registerAgent('team-member');
      memberApiKey = member.apiKey;
      memberAgentId = member.agentId;
    });

    // ── Create Team ──

    it('POST /api/holomesh/team creates a new team', async () => {
      const req = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: 'test-team', description: 'A test enterprise team' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/team');

      expect(res._status).toBe(201);
      expect(res._body.success).toBe(true);
      expect(res._body.team.name).toBe('test-team');
      expect(res._body.team.invite_code).toBeTruthy();
      expect(res._body.team.workspace_id).toMatch(/^team:/);
      teamId = res._body.team.id;
      inviteCode = res._body.team.invite_code;
    });

    it('POST /api/holomesh/team requires auth', async () => {
      const req = mockReq('POST', '/api/holomesh/team', { name: 'no-auth-team' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/team');
      expect(res._status).toBe(401);
    });

    it('POST /api/holomesh/team rejects short names', async () => {
      const req = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: 'a' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/team');
      expect(res._status).toBe(400);
    });

    it('POST /api/holomesh/team rejects duplicate names', async () => {
      const name = `dup-team-${Date.now()}`;
      // Create first
      const req1 = mockReq(
        'POST',
        '/api/holomesh/team',
        { name },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res1 = mockRes();
      await handleHoloMeshRoute(req1, res1, '/api/holomesh/team');
      expect(res1._status).toBe(201);

      // Try duplicate
      const req2 = mockReq(
        'POST',
        '/api/holomesh/team',
        { name },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res2 = mockRes();
      await handleHoloMeshRoute(req2, res2, '/api/holomesh/team');
      expect(res2._status).toBe(409);
    });

    // ── List Teams ──

    it('GET /api/holomesh/teams lists agent teams', async () => {
      // Create a team first
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `list-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      expect(createRes._status).toBe(201);

      // List teams
      const req = mockReq('GET', '/api/holomesh/teams', undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/teams');

      expect(res._status).toBe(200);
      expect(res._body.teams.length).toBeGreaterThanOrEqual(1);
      expect(res._body.teams[0].role).toBe('owner');
    });

    // ── Join Team ──

    it('POST /api/holomesh/team/:id/join with invite code', async () => {
      // Create team
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `join-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/join`);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.role).toBe('member');
      expect(res._body.members).toBe(2);
    });

    it('POST /api/holomesh/team/:id/join rejects wrong invite code', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `bad-code-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: 'wrong-code' },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/join`);

      expect(res._status).toBe(403);
    });

    it('POST /api/holomesh/team/:id/join rejects double join', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `double-join-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Owner tries to join again
      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: createRes._body.team.invite_code },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/join`);

      expect(res._status).toBe(409);
    });

    // Regression test for task_1777112258989_6cxw: existing-member /join
    // when the team is at cap must return 409 "Already a member of this
    // team" — NOT 400 "Team is full". The membership check at line 719
    // of team-routes.ts must run BEFORE the cap check at line 743, so an
    // already-joined caller never sees the cap error. Originally diagnosed
    // 2026-04-25 during the 31-worker fleet bootstrap when mw01 (already a
    // member) returned "Team is full" alongside 30 actually-not-members,
    // masking the real cap-too-low signal.
    it('POST /api/holomesh/team/:id/join is idempotent for existing members at cap', async () => {
      // Create team with min cap (2). Owner is auto-added → team is AT cap.
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `at-cap-${Date.now()}`, max_slots: 2 },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins — fills the second (and last) slot. Team is now at cap (2/2).
      const memberJoinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const memberJoinRes = mockRes();
      await handleHoloMeshRoute(memberJoinReq, memberJoinRes, `/api/holomesh/team/${tid}/join`);
      expect(memberJoinRes._status).toBe(200);

      // Owner re-calls /join while team is AT cap. Must return 409
      // "Already a member" — the real reason — not 400 "Team is full".
      const ownerRejoinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const ownerRejoinRes = mockRes();
      await handleHoloMeshRoute(ownerRejoinReq, ownerRejoinRes, `/api/holomesh/team/${tid}/join`);
      expect(ownerRejoinRes._status).toBe(409);
      expect(ownerRejoinRes._body.error).toBe('Already a member of this team');

      // Existing member also re-calls /join — same outcome.
      const memberRejoinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const memberRejoinRes = mockRes();
      await handleHoloMeshRoute(memberRejoinReq, memberRejoinRes, `/api/holomesh/team/${tid}/join`);
      expect(memberRejoinRes._status).toBe(409);
      expect(memberRejoinRes._body.error).toBe('Already a member of this team');
    });

    // ── Team Dashboard ──

    it('GET /api/holomesh/team/:id returns team dashboard', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `dash-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('GET', `/api/holomesh/team/${tid}`, undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}`);

      expect(res._status).toBe(200);
      expect(res._body.team.name).toContain('dash-team');
      expect(res._body.team.your_role).toBe('owner');
      expect(res._body.team.members).toBeInstanceOf(Array);
      expect(res._body.team.invite_code).toBeTruthy(); // owner sees invite code
      expect(res._body.quick_links).toBeTruthy();
    });

    it('GET /api/holomesh/team/:id returns 403 for non-members', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `private-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('GET', `/api/holomesh/team/${tid}`, undefined, {
        authorization: `Bearer ${memberApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}`);

      expect(res._status).toBe(403);
    });

    // ── Presence ──

    it('POST /api/holomesh/team/:id/presence registers heartbeat', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `pres-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/presence`,
        { ide_type: 'vscode', project_path: '/workspace/project', status: 'active' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/presence`);

      expect(res._status).toBe(200);
      expect(res._body.presence.ideType).toBe('vscode');
      expect(res._body.presence.status).toBe('active');
      expect(res._body.online_count).toBe(1);
    });

    it('GET /api/holomesh/team/:id/presence returns online agents', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `pres-get-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Register presence
      const presReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/presence`,
        { ide_type: 'cursor' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const presRes = mockRes();
      await handleHoloMeshRoute(presReq, presRes, `/api/holomesh/team/${tid}/presence`);

      // Get presence
      const req = mockReq('GET', `/api/holomesh/team/${tid}/presence`, undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/presence`);

      expect(res._status).toBe(200);
      expect(res._body.online_count).toBe(1);
      expect(res._body.online[0].ideType).toBe('cursor');
    });

    // ── Members + x402/surface observability (W.087 vertex C) ──

    it('GET /api/holomesh/team/:id/members returns wallet + x402 + surface attribution', async () => {
      // Create team
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `members-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const ic = createRes._body.team.invite_code;

      // Member joins with a surface tag
      const joinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: ic, surface_tag: 'claude-code' },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);
      expect(joinRes._status).toBe(200);

      // Member beats with surface_tag
      const beatReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/presence`,
        { ide_type: 'vscode', surface_tag: 'claude-code', status: 'active' },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const beatRes = mockRes();
      await handleHoloMeshRoute(beatReq, beatRes, `/api/holomesh/team/${tid}/presence`);
      expect(beatRes._status).toBe(200);

      // GET /members — owner sees both members with wallet + x402Verified + surfaceTag
      const req = mockReq('GET', `/api/holomesh/team/${tid}/members`, undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/members`);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.teamId).toBe(tid);
      expect(res._body.count).toBe(2);
      const owner = res._body.members.find((m: any) => m.agentId === ownerAgentId);
      const member = res._body.members.find((m: any) => m.agentId === memberAgentId);
      expect(owner).toBeDefined();
      expect(member).toBeDefined();
      // Owner — from POST /team creation, wallet/x402 snapshotted
      expect(owner.role).toBe('owner');
      expect(owner.walletAddress).toMatch(/^0x/);
      expect(typeof owner.x402Verified).toBe('boolean');
      // Member — joined via /join with surface_tag, online via /presence
      expect(member.role).toBe('member');
      expect(member.walletAddress).toMatch(/^0x/);
      expect(member.surfaceTag).toBe('claude-code');
      expect(member.online).toBe(true);
      expect(member.lastHeartbeat).toBeTruthy();
    });

    it('GET /api/holomesh/team/:id/members 403s non-members', async () => {
      // Create team with owner, don't let member join
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `members-403-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('GET', `/api/holomesh/team/${tid}/members`, undefined, {
        authorization: `Bearer ${memberApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/members`);

      expect(res._status).toBe(403);
    });

    it('GET /api/holomesh/team/:id/presence surfaces wallet + x402Verified + surfaceTag on heartbeat', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `pres-x402-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Beat with surface_tag declared
      const beatReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/presence`,
        { ide_type: 'claude-code', surface_tag: 'claude-code' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const beatRes = mockRes();
      await handleHoloMeshRoute(beatReq, beatRes, `/api/holomesh/team/${tid}/presence`);
      expect(beatRes._status).toBe(200);
      expect(beatRes._body.presence.surfaceTag).toBe('claude-code');
      expect(beatRes._body.presence.walletAddress).toMatch(/^0x/);
      expect(typeof beatRes._body.presence.x402Verified).toBe('boolean');

      // Read back via GET
      const getReq = mockReq('GET', `/api/holomesh/team/${tid}/presence`, undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const getRes = mockRes();
      await handleHoloMeshRoute(getReq, getRes, `/api/holomesh/team/${tid}/presence`);
      expect(getRes._status).toBe(200);
      expect(getRes._body.online[0].surfaceTag).toBe('claude-code');
      expect(getRes._body.online[0].walletAddress).toMatch(/^0x/);
    });

    // W.087 vertex C hardening — SECURITY: surfaceTag spoofing defense-in-depth.
    // surfaceTag is snapshotted on RegisteredAgent at /register time; subsequent
    // /presence heartbeats cannot reassign it via body.surface_tag. See
    // task_1777049263971_imm1 (filed + closed in one arc).
    it('POST /api/holomesh/team/:id/presence refuses to let body.surface_tag override the register-time snapshot', async () => {
      // 1. Register a fresh agent declaring surface_tag=claude-code
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `spoof-test-${Date.now()}`,
        surface_tag: 'claude-code',
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      expect([200, 201]).toContain(regRes._status);
      const victimApiKey = regRes._body.agent.api_key;

      // 2. Create a team under that agent
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `spoof-team-${Date.now()}` },
        { authorization: `Bearer ${victimApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      expect(createRes._status).toBe(201);
      const tid = createRes._body.team.id;

      // 3. POST /presence trying to claim surface_tag=copilot (spoof attempt)
      const beatReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/presence`,
        { ide_type: 'vscode', surface_tag: 'copilot' }, // ← attempted spoof
        { authorization: `Bearer ${victimApiKey}` }
      );
      const beatRes = mockRes();
      await handleHoloMeshRoute(beatReq, beatRes, `/api/holomesh/team/${tid}/presence`);
      expect(beatRes._status).toBe(200);
      // Server-stored surfaceTag from /register MUST win.
      expect(beatRes._body.presence.surfaceTag).toBe('claude-code');
      expect(beatRes._body.presence.surfaceTag).not.toBe('copilot');

      // 4. Also verify /members projection surfaces the register-time tag
      const membersReq = mockReq('GET', `/api/holomesh/team/${tid}/members`, undefined, {
        authorization: `Bearer ${victimApiKey}`,
      });
      const membersRes = mockRes();
      await handleHoloMeshRoute(membersReq, membersRes, `/api/holomesh/team/${tid}/members`);
      expect(membersRes._status).toBe(200);
      const selfMember = membersRes._body.members.find(
        (m: { agentId: string; surfaceTag?: string }) => m.agentId === regRes._body.agent.id
      );
      expect(selfMember?.surfaceTag).toBe('claude-code');
    });

    // ── Messaging ──

    it('POST /api/holomesh/team/:id/message sends team message', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `msg-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/message`,
        { content: 'Hello team!', type: 'text' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/message`);

      expect(res._status).toBe(201);
      expect(res._body.message.content).toBe('Hello team!');
      expect(res._body.message.messageType).toBe('text');
    });

    it('GET /api/holomesh/team/:id/messages reads team messages', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `read-msg-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Send a message first
      const sendReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/message`,
        { content: 'Test message' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const sendRes = mockRes();
      await handleHoloMeshRoute(sendReq, sendRes, `/api/holomesh/team/${tid}/message`);

      // Read messages
      const req = mockReq('GET', `/api/holomesh/team/${tid}/messages`, undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/messages`);

      expect(res._status).toBe(200);
      expect(res._body.messages.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/holomesh/team/:id/feed appends hologram item (poster from auth)', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `feed-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const postReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/feed`,
        {
          kind: 'hologram',
          hash: 'abc123deadbeef',
          shareUrl: 'https://studio.holoscript.net/g/abc123deadbeef',
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const postRes = mockRes();
      await handleHoloMeshRoute(postReq, postRes, `/api/holomesh/team/${tid}/feed`);

      expect(postRes._status).toBe(201);
      expect(postRes._body.item.kind).toBe('hologram');
      expect(postRes._body.item.hash).toBe('abc123deadbeef');
      expect(postRes._body.item.posterAgentId).toBeTruthy();

      const getReq = mockReq('GET', `/api/holomesh/team/${tid}/feed?limit=10`, undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const getRes = mockRes();
      await handleHoloMeshRoute(getReq, getRes, `/api/holomesh/team/${tid}/feed?limit=10`);

      expect(getRes._status).toBe(200);
      expect(getRes._body.items.length).toBeGreaterThanOrEqual(1);
      expect(getRes._body.items[getRes._body.items.length - 1].hash).toBe('abc123deadbeef');
    });

    it('POST /api/holomesh/team/:id/feed rejects posterAgentId mismatch', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `feed-bad-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const postReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/feed`,
        {
          kind: 'hologram',
          hash: 'abc123deadbeef',
          shareUrl: 'https://studio.holoscript.net/g/x',
          posterAgentId: 'someone_else',
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const postRes = mockRes();
      await handleHoloMeshRoute(postReq, postRes, `/api/holomesh/team/${tid}/feed`);

      expect(postRes._status).toBe(403);
    });

    it('POST /api/holomesh/team/:id/message rejects missing content', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `empty-msg-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/message`,
        {},
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/message`);

      expect(res._status).toBe(400);
    });

    // ── Team Knowledge ──

    it('POST /api/holomesh/team/:id/knowledge contributes to team workspace', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `know-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/knowledge`,
        {
          entries: [
            { type: 'wisdom', content: 'Team insight about caching', domain: 'compilation' },
            { type: 'gotcha', content: 'Never use eval in production', domain: 'security' },
          ],
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/knowledge`);

      expect(res._status).toBe(201);
      expect(res._body.synced).toBe(1); // mockClient returns 1
      expect(res._body.entries.length).toBe(2);
      expect(res._body.workspace_id).toMatch(/^team:/);
    });

    it('GET /api/holomesh/team/:id/knowledge reads team knowledge', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `read-know-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('GET', `/api/holomesh/team/${tid}/knowledge`, undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/knowledge`);

      expect(res._status).toBe(200);
      expect(res._body.workspace_id).toMatch(/^team:/);
      expect(res._body.entries).toBeInstanceOf(Array);
    });

    // ── Team Absorb ──

    it('POST /api/holomesh/team/:id/absorb triggers absorb pipeline', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ status: 'queued', hint: 'mock processing' }),
      } as any);

      try {
        const createReq = mockReq(
          'POST',
          '/api/holomesh/team',
          { name: `absorb-team-${Date.now()}` },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const createRes = mockRes();
        await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
        const tid = createRes._body.team.id;

        const req = mockReq(
          'POST',
          `/api/holomesh/team/${tid}/absorb`,
          { project_path: '/workspace/my-project', depth: 'deep' },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const res = mockRes();
        await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/absorb`);

        expect(res._status).toBe(202);
        expect(res._body.absorb.project_path).toBe('/workspace/my-project');
        expect(res._body.absorb.depth).toBe('deep');
        expect(res._body.absorb.workspace_id).toMatch(/^team:/);
      } finally {
        global.fetch = originalFetch;
      }
    });

    it('POST /api/holomesh/team/:id/absorb rejects missing project_path', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `no-path-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/absorb`,
        {},
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/absorb`);

      expect(res._status).toBe(400);
    });

    // ── Member Management ──

    it('POST /api/holomesh/team/:id/members can set role', async () => {
      // Create team and add member
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `role-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const joinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);

      // Owner promotes member to admin
      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/members`,
        { action: 'set_role', agent_id: memberAgentId, role: 'admin' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/members`);

      expect(res._status).toBe(200);
      expect(res._body.new_role).toBe('admin');
    });

    it('POST /api/holomesh/team/:id/members can remove member', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `rm-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const joinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);

      // Owner removes member
      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/members`,
        { action: 'remove', agent_id: memberAgentId },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/members`);

      expect(res._status).toBe(200);
      expect(res._body.removed).toBe(memberAgentId);
      expect(res._body.members).toBe(1);
    });

    it('POST /api/holomesh/team/:id/members rejects non-admin', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `nonadmin-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const joinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);

      // Member tries to manage (should fail — member role has no members:manage)
      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/members`,
        { action: 'set_role', agent_id: ownerAgentId, role: 'viewer' },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/members`);

      expect(res._status).toBe(403);
    });

    // ── Viewer Permissions ──

    it('viewer cannot write knowledge to team', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `viewer-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const joinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);

      // Demote to viewer
      const demoteReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/members`,
        { action: 'set_role', agent_id: memberAgentId, role: 'viewer' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const demoteRes = mockRes();
      await handleHoloMeshRoute(demoteReq, demoteRes, `/api/holomesh/team/${tid}/members`);

      // Viewer tries to contribute knowledge (should fail)
      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/knowledge`,
        { entries: [{ type: 'wisdom', content: 'Should fail' }] },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/knowledge`);

      expect(res._status).toBe(403);
    });

    // ── On-Demand Scout ──

    it('POST /api/holomesh/team/:id/board/scout creates tasks from todo_content', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `scout-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board/scout`,
        {
          todo_content:
            'src/foo.ts:12: // TODO: fix auth bug\nsrc/bar.ts:9: // FIXME: broken render path',
          max_tasks: 10,
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/board/scout`);

      expect(res._status).toBe(201);
      expect(res._body.success).toBe(true);
      expect(res._body.tasks_added).toBe(2);
      expect(res._body.tasks[0].source).toBe('scout:todo-scan');
      expect(res._body.tasks[0].title).toContain('TODO:');
    });

    it('POST /api/holomesh/team/:id/board returns warning when description is truncated', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `board-warn-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // W.085 fix (2026-04-24): cap raised 1000 → 2000. Input sized above the
      // new cap so truncation still fires and warning shape is asserted.
      const longDescription = 'd'.repeat(2200);
      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        {
          tasks: [{ title: 'Warn me', description: longDescription, priority: 1 }],
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/board`);

      expect(res._status).toBe(201);
      expect(res._body.added).toBe(1);
      expect(res._body.warnings).toEqual([
        {
          title: 'Warn me',
          reason: 'description_truncated',
          originalLength: 2200,
          keptLength: 2000,
        },
      ]);
    });

    // Guards task_1776981805111_g5g1 — batch POST body dropped `tags` silently
    // pre-fix, which broke `/room board <tag>` filtering and bounty-team dispatch
    // for programmatically-created tasks. Unit-level coverage exists in
    // packages/framework/src/__tests__/board-ops.test.ts, but this lane asserts
    // the invariant survives the HTTP route layer: tags present in the request
    // must appear on (1) the POST response body, and (2) the subsequent
    // GET /board projection of the same task.
    it('POST /api/holomesh/team/:id/board persists tags and surfaces them on GET /board (round-trip)', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `board-tags-roundtrip-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const inputTags = ['paper-farming', 'paper-7', 'priority:high'];
      const postReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        {
          tasks: [
            {
              title: 'Tags roundtrip task',
              description: 'verifies tags survive POST + GET',
              priority: 1,
              tags: inputTags,
            },
          ],
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const postRes = mockRes();
      await handleHoloMeshRoute(postReq, postRes, `/api/holomesh/team/${tid}/board`);

      expect(postRes._status).toBe(201);
      expect(postRes._body.added).toBe(1);
      const postedTask = postRes._body.tasks[0];
      expect(postedTask.tags).toEqual(inputTags);
      const taskId = postedTask.id;

      const getReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const getRes = mockRes();
      await handleHoloMeshRoute(getReq, getRes, `/api/holomesh/team/${tid}/board`);

      expect(getRes._status).toBe(200);
      const fetched = (getRes._body.tasks || []).find((t: { id: string }) => t.id === taskId);
      expect(fetched).toBeDefined();
      expect(fetched.tags).toEqual(inputTags);
    });

    // task_1776981805111_4fg3 [BOARD-BUG] — closed by exposing addTasksToBoard's
    // existing `dedupMode: 'exact'` opt-in via `?dedup=exact` query OR `body.dedup`.
    // The legacy 'normalized' mode collapses titles to their first 60 chars and
    // silently drops downstream entries that share a long prefix (e.g. four
    // "[AUTONOMIZE] N: Execute Research Cycle K - <variant>" tasks were
    // collapsing to one). This batch of three tests asserts the new contract:
    // (1) default mode preserves legacy behaviour, (2) ?dedup=exact via query
    // string passes through, (3) body.dedup field works the same.
    describe('POST /api/holomesh/team/:id/board ?dedup=exact (task_1776981805111_4fg3)', () => {
      const PREFIX_60 = 'A'.repeat(60); // shared 60-char prefix to force collision
      const dedupCollisionBatch = [
        { title: `${PREFIX_60} - first variant`, priority: 1 },
        { title: `${PREFIX_60} - second variant`, priority: 1 },
        { title: `${PREFIX_60} - third variant`, priority: 1 },
      ];

      async function freshTeam(name: string): Promise<string> {
        const createReq = mockReq(
          'POST',
          '/api/holomesh/team',
          { name: `${name}-${Date.now()}` },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const createRes = mockRes();
        await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
        return createRes._body.team.id;
      }

      it('default normalized mode skips prefix-collision titles (legacy guard)', async () => {
        const tid = await freshTeam('dedup-default');
        const req = mockReq(
          'POST',
          `/api/holomesh/team/${tid}/board`,
          { tasks: dedupCollisionBatch },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const res = mockRes();
        await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/board`);

        expect(res._status).toBe(201);
        // Only the first survives; #2 and #3 collapse to the same 60-char prefix
        expect(res._body.added).toBe(1);
        expect(res._body.skipped.length).toBe(2);
        expect(res._body.skipped.every((s: { reason: string }) => s.reason === 'duplicate')).toBe(true);
        expect(res._body.dedupMode).toBe('normalized');
      });

      it('?dedup=exact query param lets all three prefix-sharing titles land', async () => {
        const tid = await freshTeam('dedup-query');
        const req = mockReq(
          'POST',
          `/api/holomesh/team/${tid}/board?dedup=exact`,
          { tasks: dedupCollisionBatch },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const res = mockRes();
        // 3rd arg is the routing URL — must include the query string so the
        // route handler sees `?dedup=exact` (handleHoloMeshRoute treats this
        // as the source of truth, not req.url).
        await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/board?dedup=exact`);

        expect(res._status).toBe(201);
        expect(res._body.added).toBe(3);
        expect(res._body.skipped).toEqual([]);
        expect(res._body.dedupMode).toBe('exact');
      });

      it('body.dedup="exact" field works the same as the query param', async () => {
        const tid = await freshTeam('dedup-body');
        const req = mockReq(
          'POST',
          `/api/holomesh/team/${tid}/board`,
          { tasks: dedupCollisionBatch, dedup: 'exact' },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const res = mockRes();
        await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/board`);

        expect(res._status).toBe(201);
        expect(res._body.added).toBe(3);
        expect(res._body.skipped).toEqual([]);
        expect(res._body.dedupMode).toBe('exact');
      });

      it('exact mode still rejects identical-after-trim duplicates', async () => {
        const tid = await freshTeam('dedup-exact-true-dup');
        const req = mockReq(
          'POST',
          `/api/holomesh/team/${tid}/board?dedup=exact`,
          {
            tasks: [
              { title: 'identical title', priority: 1 },
              { title: '  identical title  ', priority: 1 }, // whitespace-trimmed match
              { title: 'IDENTICAL TITLE', priority: 1 },     // case-insensitive match
            ],
          },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const res = mockRes();
        await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/board?dedup=exact`);

        expect(res._status).toBe(201);
        expect(res._body.added).toBe(1);
        expect(res._body.skipped.length).toBe(2);
        expect(res._body.dedupMode).toBe('exact');
      });
    });

    it('POST /api/holomesh/team/:id/board/scout uses /room scout in empty-board auto-hint task', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `scout-hint-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const modeReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/mode`,
        { mode: 'audit' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const modeRes = mockRes();
      await handleHoloMeshRoute(modeReq, modeRes, `/api/holomesh/team/${tid}/mode`);
      expect(modeRes._status).toBe(200);

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board/scout`,
        {},
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/board/scout`);

      expect(res._status).toBe(201);
      expect(res._body.tasks_added).toBe(1);
      expect(res._body.tasks[0].title).toContain('/room scout');
      expect(res._body.tasks[0].title).not.toContain('/room derive');
      expect(res._body.tasks[0].description).toContain('/room scout');
    });

    it('GET /api/holomesh/team/:id/board/done returns recent done log with commit hash', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `done-log-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const addReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        {
          tasks: [{ title: 'verify-done-log', description: 'test', priority: 1 }],
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const addRes = mockRes();
      await handleHoloMeshRoute(addReq, addRes, `/api/holomesh/team/${tid}/board`);
      expect(addRes._status).toBe(201);
      const taskId = addRes._body.tasks[0].id;

      const claimReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        { action: 'claim' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const claimRes = mockRes();
      await handleHoloMeshRoute(claimReq, claimRes, `/api/holomesh/team/${tid}/board/${taskId}`);
      expect(claimRes._status).toBe(200);

      const doneReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        {
          action: 'done',
          summary: 'closed',
          commit: 'abc1234',
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const doneRes = mockRes();
      await handleHoloMeshRoute(doneReq, doneRes, `/api/holomesh/team/${tid}/board/${taskId}`);
      expect(doneRes._status).toBe(200);

      const logReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?limit=10`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const logRes = mockRes();
      await handleHoloMeshRoute(logReq, logRes, `/api/holomesh/team/${tid}/board/done?limit=10`);
      expect(logRes._status).toBe(200);
      expect(logRes._body.success).toBe(true);
      expect(logRes._body.entries.length).toBeGreaterThanOrEqual(1);
      expect(logRes._body.entries[0].taskId).toBe(taskId);
      expect(logRes._body.entries[0].commitHash).toBe('abc1234');
    });

    it('PATCH /board/:taskId honors claimedByTag and completedByTag for shared-key surface disambiguation', async () => {
      // Identity-on-claim fix: when multiple surfaces (cursor-claude,
      // claudecode-claude, copilot-vscode) share one HoloMesh API key
      // (S.IDENT legacy antigravity-seed), the client-supplied surface tag
      // must propagate into task record + done log. Prior to this fix, both
      // claim and done PATCH bodies accepted {claimedByTag, completedByTag}
      // but the server silently dropped them on the floor — every closure
      // looked like antigravity-seed regardless of which surface did the work.
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `surface-tag-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const addReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        { tasks: [{ title: 'surface-tag-test', description: 't', priority: 1 }] },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const addRes = mockRes();
      await handleHoloMeshRoute(addReq, addRes, `/api/holomesh/team/${tid}/board`);
      const taskId = addRes._body.tasks[0].id;

      // Claim with surface tag
      const claimReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        { action: 'claim', claimedByTag: 'claudecode-claude' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const claimRes = mockRes();
      await handleHoloMeshRoute(claimReq, claimRes, `/api/holomesh/team/${tid}/board/${taskId}`);
      expect(claimRes._status).toBe(200);
      expect(claimRes._body.task.claimedByTag).toBe('claudecode-claude');
      expect(claimRes._body.claimedAs.surfaceTag).toBe('claudecode-claude');
      // Server-derived id/name still authoritative
      expect(claimRes._body.claimedAs.id).toBeTruthy();
      expect(claimRes._body.claimedAs.name).toBeTruthy();

      // Done with a DIFFERENT surface tag (e.g. handoff scenario)
      const doneReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        {
          action: 'done',
          summary: 'closed from cursor after claim from claudecode',
          commit: 'def5678',
          completedByTag: 'cursor-claude',
        },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const doneRes = mockRes();
      await handleHoloMeshRoute(doneReq, doneRes, `/api/holomesh/team/${tid}/board/${taskId}`);
      expect(doneRes._status).toBe(200);
      expect(doneRes._body.task.completedByTag).toBe('cursor-claude');
      expect(doneRes._body.completedAs.surfaceTag).toBe('cursor-claude');

      // Done log must surface the tag so /board/done enumeration preserves attribution
      const logReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?limit=10`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const logRes = mockRes();
      await handleHoloMeshRoute(logReq, logRes, `/api/holomesh/team/${tid}/board/done?limit=10`);
      expect(logRes._status).toBe(200);
      const entry = logRes._body.entries.find((e: { taskId: string }) => e.taskId === taskId);
      expect(entry).toBeTruthy();
      expect(entry.completedByTag).toBe('cursor-claude');
      expect(entry.commitHash).toBe('def5678');
    });

    // W.087 vertex B+C hardening — SECURITY: once an agent is registered with
    // surface_tag on RegisteredAgent (see 01424bcd6), body.claimedByTag /
    // body.completedByTag / body.deleterTag cannot override it. Closes
    // task_1777050402454_50h3 (same vuln class as surfaceTag spoofing).
    it('PATCH /board/:taskId refuses body.claimedByTag / completedByTag / deleterTag override when caller.surfaceTag is set', async () => {
      // 1. Register a victim agent with surface_tag=claude-code
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `tag-spoof-${Date.now()}`,
        surface_tag: 'claude-code',
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      expect([200, 201]).toContain(regRes._status);
      const victimApiKey = regRes._body.agent.api_key;

      // 2. Create a team + task under the victim
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `tag-spoof-team-${Date.now()}` },
        { authorization: `Bearer ${victimApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const addReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        { tasks: [{ title: 'tag-spoof-target', description: 't', priority: 1 }] },
        { authorization: `Bearer ${victimApiKey}` }
      );
      const addRes = mockRes();
      await handleHoloMeshRoute(addReq, addRes, `/api/holomesh/team/${tid}/board`);
      const taskId = addRes._body.tasks[0].id;

      // 3. Claim with body.claimedByTag=copilot (spoof attempt)
      const claimReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        { action: 'claim', claimedByTag: 'copilot' }, // ← attempted spoof
        { authorization: `Bearer ${victimApiKey}` }
      );
      const claimRes = mockRes();
      await handleHoloMeshRoute(claimReq, claimRes, `/api/holomesh/team/${tid}/board/${taskId}`);
      expect(claimRes._status).toBe(200);
      // Server-stored surfaceTag (claude-code) MUST win over body.claimedByTag (copilot)
      expect(claimRes._body.task.claimedByTag).toBe('claude-code');
      expect(claimRes._body.task.claimedByTag).not.toBe('copilot');
      expect(claimRes._body.claimedAs.surfaceTag).toBe('claude-code');

      // 4. Done with body.completedByTag=cursor (spoof attempt)
      const doneReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        {
          action: 'done',
          summary: 'tag-spoof-test',
          commit: 'abcdef0',
          completedByTag: 'cursor', // ← attempted spoof
        },
        { authorization: `Bearer ${victimApiKey}` }
      );
      const doneRes = mockRes();
      await handleHoloMeshRoute(doneReq, doneRes, `/api/holomesh/team/${tid}/board/${taskId}`);
      expect(doneRes._status).toBe(200);
      expect(doneRes._body.task.completedByTag).toBe('claude-code');
      expect(doneRes._body.task.completedByTag).not.toBe('cursor');
      expect(doneRes._body.completedAs.surfaceTag).toBe('claude-code');

      // 5. Done-log projection also shows the register-time tag, not the spoof
      const logReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?limit=10`,
        undefined,
        { authorization: `Bearer ${victimApiKey}` }
      );
      const logRes = mockRes();
      await handleHoloMeshRoute(logReq, logRes, `/api/holomesh/team/${tid}/board/done?limit=10`);
      expect(logRes._status).toBe(200);
      const entry = logRes._body.entries.find((e: { taskId: string }) => e.taskId === taskId);
      expect(entry?.completedByTag).toBe('claude-code');
    });

    it('PATCH /board/:taskId claim/done without tags still works (backward compat)', async () => {
      // Pre-tag callers must continue to function. Tags default to undefined
      // and are omitted from the response when absent.
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `no-tag-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const addReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        { tasks: [{ title: 'no-tag-test', description: 't', priority: 1 }] },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const addRes = mockRes();
      await handleHoloMeshRoute(addReq, addRes, `/api/holomesh/team/${tid}/board`);
      const taskId = addRes._body.tasks[0].id;

      const claimReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        { action: 'claim' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const claimRes = mockRes();
      await handleHoloMeshRoute(claimReq, claimRes, `/api/holomesh/team/${tid}/board/${taskId}`);
      expect(claimRes._status).toBe(200);
      expect(claimRes._body.task.claimedByTag).toBeUndefined();
      expect(claimRes._body.claimedAs.surfaceTag).toBeUndefined();

      const doneReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        { action: 'done', summary: 'closed', commit: 'abc0000' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const doneRes = mockRes();
      await handleHoloMeshRoute(doneReq, doneRes, `/api/holomesh/team/${tid}/board/${taskId}`);
      expect(doneRes._status).toBe(200);
      expect(doneRes._body.task.completedByTag).toBeUndefined();
      expect(doneRes._body.completedAs).toBeUndefined();
    });

    // ── Delete action (task_1776981805111_gbxm) ──
    // Adds hard-remove with audit-trail tombstone so the known-404 responses
    // from /room seed's `delete|remove|archive` (W.073) become real operations
    // instead of silent failures. Owner-gated via config:write — matches /mode.

    it('PATCH /board/:taskId delete action removes task and tombstones in done log (owner)', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `delete-owner-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const addReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        { tasks: [{ title: 'delete-me-task', description: 'd', priority: 3 }] },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const addRes = mockRes();
      await handleHoloMeshRoute(addReq, addRes, `/api/holomesh/team/${tid}/board`);
      const taskId = addRes._body.tasks[0].id;

      const delReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        { action: 'delete', reason: 'duplicate of other task', deleterTag: 'claudecode-claude' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const delRes = mockRes();
      await handleHoloMeshRoute(delReq, delRes, `/api/holomesh/team/${tid}/board/${taskId}`);

      expect(delRes._status).toBe(200);
      expect(delRes._body.success).toBe(true);
      expect(delRes._body.deleted).toBe(true);
      expect(delRes._body.task).toBeTruthy();
      expect(delRes._body.task.id).toBe(taskId);
      expect(delRes._body.reason).toBe('duplicate of other task');
      expect(delRes._body.deletedAs.surfaceTag).toBe('claudecode-claude');
      expect(delRes._body.tombstone).toBeTruthy();
      expect(delRes._body.tombstone.summary).toContain('[deleted]');
      expect(delRes._body.tombstone.summary).toContain('duplicate of other task');
      expect(delRes._body.tombstone.completedByTag).toBe('deleted-by:claudecode-claude');

      // Task is gone from the board
      const boardReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const boardRes = mockRes();
      await handleHoloMeshRoute(boardReq, boardRes, `/api/holomesh/team/${tid}/board`);
      expect(boardRes._status).toBe(200);
      expect(boardRes._body.tasks.find((t: { id: string }) => t.id === taskId)).toBeUndefined();

      // Tombstone is in done log for audit trail
      const logReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?limit=10`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const logRes = mockRes();
      await handleHoloMeshRoute(logReq, logRes, `/api/holomesh/team/${tid}/board/done?limit=10`);
      expect(logRes._status).toBe(200);
      const tomb = logRes._body.entries.find((e: { taskId: string }) => e.taskId === taskId);
      expect(tomb).toBeTruthy();
      expect(tomb.summary).toContain('[deleted]');
      expect(tomb.completedByTag).toBe('deleted-by:claudecode-claude');
      // Deletion has no commit hash (unlike a normal done closure)
      expect(tomb.commitHash).toBeUndefined();
    });

    it('PATCH /board/:taskId delete rejects non-owner with 403', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `delete-member-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins with invite code — gets role=member, not owner
      const joinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);
      expect(joinRes._status).toBe(200);
      expect(joinRes._body.role).toBe('member');

      // Owner creates a task
      const addReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        { tasks: [{ title: 'member-cannot-delete-me', description: 'x', priority: 3 }] },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const addRes = mockRes();
      await handleHoloMeshRoute(addReq, addRes, `/api/holomesh/team/${tid}/board`);
      const taskId = addRes._body.tasks[0].id;

      // Member attempts delete — should be denied
      const delReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${taskId}`,
        { action: 'delete' },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const delRes = mockRes();
      await handleHoloMeshRoute(delReq, delRes, `/api/holomesh/team/${tid}/board/${taskId}`);

      expect(delRes._status).toBe(403);
      expect(delRes._body.error).toContain('config:write');

      // Task is still on the board (delete was refused, not partially applied)
      const boardReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const boardRes = mockRes();
      await handleHoloMeshRoute(boardReq, boardRes, `/api/holomesh/team/${tid}/board`);
      expect(boardRes._body.tasks.find((t: { id: string }) => t.id === taskId)).toBeTruthy();
    });

    it('PATCH /board/:taskId delete of nonexistent task returns 400 with "Task not found"', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `delete-missing-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const delReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/task_does_not_exist_xxx`,
        { action: 'delete' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const delRes = mockRes();
      await handleHoloMeshRoute(delReq, delRes, `/api/holomesh/team/${tid}/board/task_does_not_exist_xxx`);
      // Follows existing convention: helper-level "Task not found" → 400
      // (claim/done/block/reopen all return 400 for missing tasks).
      expect(delRes._status).toBe(400);
      expect(delRes._body.error).toBe('Task not found');
    });

    it('PATCH /board/:taskId accepts remove and archive as aliases for delete', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `delete-alias-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // remove alias
      const addReq1 = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        { tasks: [{ title: 'alias-remove-task', description: 'a', priority: 3 }] },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const addRes1 = mockRes();
      await handleHoloMeshRoute(addReq1, addRes1, `/api/holomesh/team/${tid}/board`);
      const tid1 = addRes1._body.tasks[0].id;

      const delReq1 = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${tid1}`,
        { action: 'remove' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const delRes1 = mockRes();
      await handleHoloMeshRoute(delReq1, delRes1, `/api/holomesh/team/${tid}/board/${tid1}`);
      expect(delRes1._status).toBe(200);
      expect(delRes1._body.deleted).toBe(true);

      // archive alias
      const addReq2 = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        { tasks: [{ title: 'alias-archive-task', description: 'b', priority: 3 }] },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const addRes2 = mockRes();
      await handleHoloMeshRoute(addReq2, addRes2, `/api/holomesh/team/${tid}/board`);
      const tid2 = addRes2._body.tasks[0].id;

      const delReq2 = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${tid2}`,
        { action: 'archive' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const delRes2 = mockRes();
      await handleHoloMeshRoute(delReq2, delRes2, `/api/holomesh/team/${tid}/board/${tid2}`);
      expect(delRes2._status).toBe(200);
      expect(delRes2._body.deleted).toBe(true);

      // cancel/skip/drop are intentionally NOT aliased — semantics ambiguous.
      // Verify they still hit the unknown-action branch.
      const addReq3 = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/board`,
        { tasks: [{ title: 'alias-cancel-task', description: 'c', priority: 3 }] },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const addRes3 = mockRes();
      await handleHoloMeshRoute(addReq3, addRes3, `/api/holomesh/team/${tid}/board`);
      const tid3 = addRes3._body.tasks[0].id;

      const delReq3 = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/board/${tid3}`,
        { action: 'cancel' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const delRes3 = mockRes();
      await handleHoloMeshRoute(delReq3, delRes3, `/api/holomesh/team/${tid}/board/${tid3}`);
      expect(delRes3._status).toBe(400);
      expect(delRes3._body.error).toContain('Unknown action');
      // Error message lists every supported action so clients don't guess.
      expect(delRes3._body.error).toContain('claim');
      expect(delRes3._body.error).toContain('done');
      expect(delRes3._body.error).toContain('block');
      expect(delRes3._body.error).toContain('reopen');
      expect(delRes3._body.error).toContain('delegate');
      expect(delRes3._body.error).toContain('delete');
    });

    it('GET /board/done supports offset-based pagination beyond the 200-cap (task_1776981805111_pllv)', async () => {
      // Prior impl took the last `limit` entries with no offset param — a team
      // with 753+ done entries could never see anything past the 200 most
      // recent. Fix: add offset so clients can walk backward through the full
      // log, plus `returned`/`hasMore` so pagination terminates cleanly.
      //
      // Seed 65 done entries so default page (30) + second (30) + third (5
      // with hasMore=false) exercises every pagination path. 30s timeout
      // covers the ~130 sequential HTTP round-trips needed to seed.
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `pagination-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const TOTAL = 65;
      for (let i = 0; i < TOTAL; i++) {
        const addReq = mockReq(
          'POST',
          `/api/holomesh/team/${tid}/board`,
          { tasks: [{ title: `pg-${i}`, description: 'p', priority: 4 }] },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const addRes = mockRes();
        await handleHoloMeshRoute(addReq, addRes, `/api/holomesh/team/${tid}/board`);
        const taskId = addRes._body.tasks[0].id;

        const doneReq = mockReq(
          'PATCH',
          `/api/holomesh/team/${tid}/board/${taskId}`,
          { action: 'done', summary: `closed ${i}`, commit: `c${i}` },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const doneRes = mockRes();
        await handleHoloMeshRoute(doneReq, doneRes, `/api/holomesh/team/${tid}/board/${taskId}`);
        expect(doneRes._status).toBe(200);
      }

      // Page 1 (default limit, offset=0) — newest 30
      const p1Req = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const p1Res = mockRes();
      await handleHoloMeshRoute(p1Req, p1Res, `/api/holomesh/team/${tid}/board/done`);
      expect(p1Res._status).toBe(200);
      expect(p1Res._body.count).toBe(TOTAL);
      expect(p1Res._body.returned).toBe(30);
      expect(p1Res._body.offset).toBe(0);
      expect(p1Res._body.limit).toBe(30);
      expect(p1Res._body.hasMore).toBe(true);
      expect(p1Res._body.entries.length).toBe(30);
      // Newest first: entry[0] is the last-added task (index 64)
      expect(p1Res._body.entries[0].summary).toBe('closed 64');
      expect(p1Res._body.entries[29].summary).toBe('closed 35');

      // Page 2 (offset=30, still default limit)
      const p2Req = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?offset=30`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const p2Res = mockRes();
      await handleHoloMeshRoute(p2Req, p2Res, `/api/holomesh/team/${tid}/board/done?offset=30`);
      expect(p2Res._status).toBe(200);
      expect(p2Res._body.returned).toBe(30);
      expect(p2Res._body.offset).toBe(30);
      expect(p2Res._body.hasMore).toBe(true);
      expect(p2Res._body.entries[0].summary).toBe('closed 34');
      expect(p2Res._body.entries[29].summary).toBe('closed 5');

      // Page 3 (offset=60, partial — 5 remaining, hasMore=false)
      const p3Req = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?offset=60&limit=30`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const p3Res = mockRes();
      await handleHoloMeshRoute(p3Req, p3Res, `/api/holomesh/team/${tid}/board/done?offset=60&limit=30`);
      expect(p3Res._status).toBe(200);
      expect(p3Res._body.returned).toBe(5);
      expect(p3Res._body.offset).toBe(60);
      expect(p3Res._body.hasMore).toBe(false);
      expect(p3Res._body.entries[0].summary).toBe('closed 4');
      expect(p3Res._body.entries[4].summary).toBe('closed 0');

      // Offset past end → empty page, still valid response
      const emptyReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?offset=200`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const emptyRes = mockRes();
      await handleHoloMeshRoute(emptyReq, emptyRes, `/api/holomesh/team/${tid}/board/done?offset=200`);
      expect(emptyRes._status).toBe(200);
      expect(emptyRes._body.returned).toBe(0);
      expect(emptyRes._body.hasMore).toBe(false);
      expect(emptyRes._body.entries).toEqual([]);

      // Malformed offset (negative) clamps to 0
      const negReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?offset=-5`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const negRes = mockRes();
      await handleHoloMeshRoute(negReq, negRes, `/api/holomesh/team/${tid}/board/done?offset=-5`);
      expect(negRes._status).toBe(200);
      expect(negRes._body.offset).toBe(0);
      expect(negRes._body.entries[0].summary).toBe('closed 64');

      // Limit cap enforced (>200 clamps to 200)
      const bigReq = mockReq(
        'GET',
        `/api/holomesh/team/${tid}/board/done?limit=1000`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const bigRes = mockRes();
      await handleHoloMeshRoute(bigReq, bigRes, `/api/holomesh/team/${tid}/board/done?limit=1000`);
      expect(bigRes._status).toBe(200);
      expect(bigRes._body.limit).toBe(200);
      // 65 entries total, asked for 200 → returned all 65, hasMore=false
      expect(bigRes._body.returned).toBe(65);
      expect(bigRes._body.hasMore).toBe(false);
    }, 30000);

    it('/board.done_count and /board/done.count stay in lockstep across completions (task_1776986320321_xvv6)', async () => {
      // Audit observation 2026-04-23: a live probe returned done_count=482 on
      // /board but 756 entries on /board/done — two counters disagreeing for
      // the same team. At the code level both paths read
      // team.doneLog.length from the same in-memory store, so they cannot
      // diverge within a single server process. The disagreement can only
      // surface in a multi-replica / stale-snapshot scenario.
      //
      // This regression test locks the in-process invariant: for any sequence
      // of completions, /board.done_count === /board/done.count at every
      // step. If either counter ever stops reading from the canonical
      // doneLog length, this test fails — and any future disagreement in
      // prod is definitively a deploy / replication concern, not a code
      // regression.
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `counter-parity-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const readCounters = async () => {
        const bReq = mockReq(
          'GET',
          `/api/holomesh/team/${tid}/board`,
          undefined,
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const bRes = mockRes();
        await handleHoloMeshRoute(bReq, bRes, `/api/holomesh/team/${tid}/board`);
        const dReq = mockReq(
          'GET',
          `/api/holomesh/team/${tid}/board/done`,
          undefined,
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const dRes = mockRes();
        await handleHoloMeshRoute(dReq, dRes, `/api/holomesh/team/${tid}/board/done`);
        expect(bRes._status).toBe(200);
        expect(dRes._status).toBe(200);
        return {
          boardDoneCount: bRes._body.done_count,
          doneListCount: dRes._body.count,
        };
      };

      // Invariant holds on an empty board
      const initial = await readCounters();
      expect(initial.boardDoneCount).toBe(0);
      expect(initial.doneListCount).toBe(0);
      expect(initial.boardDoneCount).toBe(initial.doneListCount);

      const N = 12;
      for (let i = 0; i < N; i++) {
        const addReq = mockReq(
          'POST',
          `/api/holomesh/team/${tid}/board`,
          { tasks: [{ title: `parity-${i}`, description: 'p', priority: 4 }] },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const addRes = mockRes();
        await handleHoloMeshRoute(addReq, addRes, `/api/holomesh/team/${tid}/board`);
        const taskId = addRes._body.tasks[0].id;

        const doneReq = mockReq(
          'PATCH',
          `/api/holomesh/team/${tid}/board/${taskId}`,
          { action: 'done', summary: `closed ${i}`, commit: `c${i.toString(16).padStart(7, '0')}` },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const doneRes = mockRes();
        await handleHoloMeshRoute(doneReq, doneRes, `/api/holomesh/team/${tid}/board/${taskId}`);
        expect(doneRes._status).toBe(200);

        // After every single completion, both counters must agree AND
        // advance by exactly one. This catches (a) divergent sources
        // (e.g. /board reads a cached length) and (b) off-by-one
        // increments (e.g. one path counts failed completions).
        const step = await readCounters();
        expect(step.boardDoneCount).toBe(i + 1);
        expect(step.doneListCount).toBe(i + 1);
        expect(step.boardDoneCount).toBe(step.doneListCount);
      }

      // Final lockstep check at N
      const final = await readCounters();
      expect(final.boardDoneCount).toBe(N);
      expect(final.doneListCount).toBe(N);
      expect(final.boardDoneCount).toBe(final.doneListCount);
    }, 30000);

    it('POST /api/holomesh/team/:id/mode returns scout endpoint hint', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `mode-hint-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/mode`,
        { mode: 'audit' },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/mode`);

      expect(res._status).toBe(200);
      expect(res._body.hint).toContain('/board/scout');
      expect(res._body.hint).toContain('todo_content');
      expect(res._body.hint).not.toContain('/board/derive');
    });

    it('POST /api/holomesh/team/:id/mode accepts member (not just owner)', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `member-mode-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      const joinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);
      expect(joinRes._body.role).toBe('member');

      const req = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/mode`,
        { mode: 'audit' },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/mode`);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.mode).toBe('audit');
    });

    // ── Admin Room flag ──

    it('PATCH /api/holomesh/admin/team/:id/admin-room flips flag (founder)', async () => {
      // Create team as the regular owner
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `admin-room-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Founder flips the flag (HOLOSCRIPT_API_KEY=test-api-key resolves to isFounder via env-key fallback)
      const req = mockReq(
        'PATCH',
        `/api/holomesh/admin/team/${tid}/admin-room`,
        { enabled: true },
        { authorization: `Bearer test-api-key` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/admin/team/${tid}/admin-room`);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.team_id).toBe(tid);
      expect(res._body.admin_room).toBe(true);

      // Flip back off
      const offReq = mockReq(
        'PATCH',
        `/api/holomesh/admin/team/${tid}/admin-room`,
        { enabled: false },
        { authorization: `Bearer test-api-key` }
      );
      const offRes = mockRes();
      await handleHoloMeshRoute(offReq, offRes, `/api/holomesh/admin/team/${tid}/admin-room`);
      expect(offRes._status).toBe(200);
      expect(offRes._body.admin_room).toBe(false);
    });

    it('PATCH /api/holomesh/admin/team/:id/admin-room rejects non-founder', async () => {
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `admin-room-403-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Owner of the team is NOT a founder; admin route should 403
      const req = mockReq(
        'PATCH',
        `/api/holomesh/admin/team/${tid}/admin-room`,
        { enabled: true },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/admin/team/${tid}/admin-room`);

      expect(res._status).toBe(403);
    });

    it('Admin room: member can perform config:write actions (PATCH /room)', async () => {
      // Create team + join as member
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `admin-room-member-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      const joinReq = mockReq(
        'POST',
        `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);
      expect(joinRes._body.role).toBe('member');

      // Without adminRoom, member should be 403 on PATCH /room (config:write required)
      const blockedReq = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/room`,
        { communicationStyle: 'balanced' },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const blockedRes = mockRes();
      await handleHoloMeshRoute(blockedReq, blockedRes, `/api/holomesh/team/${tid}/room`);
      expect(blockedRes._status).toBe(403);

      // Flip the adminRoom flag directly via teamStore (founder auth in tests is messy;
      // the contract under test is hasTeamPermission honoring adminRoom for members).
      const { teamStore } = await import('../state');
      const team = teamStore.get(tid);
      expect(team).toBeTruthy();
      team!.adminRoom = true;

      // Now the same member call should succeed
      const req = mockReq(
        'PATCH',
        `/api/holomesh/team/${tid}/room`,
        { communicationStyle: 'balanced' },
        { authorization: `Bearer ${memberApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/room`);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.communicationStyle).toBe('balanced');
    });

    // ── PATCH /team/:id/config — runtime team config mutation ──

    describe('PATCH /api/holomesh/team/:id/config', () => {
      async function makeTeam(): Promise<string> {
        const r = mockReq(
          'POST',
          '/api/holomesh/team',
          { name: `cfg-test-team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const s = mockRes();
        await handleHoloMeshRoute(r, s, '/api/holomesh/team');
        return s._body.team.id;
      }

      it('owner can raise max_slots', async () => {
        const tid = await makeTeam();
        const req = mockReq(
          'PATCH',
          `/api/holomesh/team/${tid}/config`,
          { max_slots: 80 },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const res = mockRes();
        await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/config`);
        expect(res._status).toBe(200);
        expect(res._body.success).toBe(true);
        expect(res._body.team.maxSlots).toBe(80);
        expect(res._body.changes.max_slots.from).toBe(20);
        expect(res._body.changes.max_slots.to).toBe(80);
      });

      it('non-owner non-founder is 403', async () => {
        const tid = await makeTeam();
        const req = mockReq(
          'PATCH',
          `/api/holomesh/team/${tid}/config`,
          { max_slots: 80 },
          { authorization: `Bearer ${memberApiKey}` }
        );
        const res = mockRes();
        await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/config`);
        expect(res._status).toBe(403);
      });

      it('rejects max_slots below 2 or above 200', async () => {
        const tid = await makeTeam();
        for (const bad of [1, 0, -5, 201, 999, 2.5, NaN]) {
          const req = mockReq(
            'PATCH',
            `/api/holomesh/team/${tid}/config`,
            { max_slots: bad },
            { authorization: `Bearer ${ownerApiKey}` }
          );
          const res = mockRes();
          await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/config`);
          expect(res._status).toBe(400);
        }
      });

      it('rejects max_slots below current member count', async () => {
        const tid = await makeTeam();
        // Owner is the only member at this point (1 member). Try to shrink to 0 — but
        // 0 < 2 also fails range check, so test is for max_slots == 1.
        // Real test: bump to 5, add a member via direct teamStore, try to shrink to 1.
        const { teamStore } = await import('../state');
        const team = teamStore.get(tid)!;
        team.members.push({
          agentId: 'agent_extra',
          agentName: 'extra-member',
          role: 'member',
          joinedAt: new Date().toISOString(),
          walletAddress: '0xabc',
          x402Verified: false,
        });
        // members.length is now 2; try to shrink max_slots to 2 (= ok), then to less — rejected.
        const ok = mockReq('PATCH', `/api/holomesh/team/${tid}/config`, { max_slots: 2 }, { authorization: `Bearer ${ownerApiKey}` });
        const okRes = mockRes();
        await handleHoloMeshRoute(ok, okRes, `/api/holomesh/team/${tid}/config`);
        expect(okRes._status).toBe(200);

        // Add a third member, then try to shrink back to 2.
        team.members.push({
          agentId: 'agent_extra2',
          agentName: 'extra-member-2',
          role: 'member',
          joinedAt: new Date().toISOString(),
          walletAddress: '0xdef',
          x402Verified: false,
        });
        const bad = mockReq('PATCH', `/api/holomesh/team/${tid}/config`, { max_slots: 2 }, { authorization: `Bearer ${ownerApiKey}` });
        const badRes = mockRes();
        await handleHoloMeshRoute(bad, badRes, `/api/holomesh/team/${tid}/config`);
        expect(badRes._status).toBe(400);
        expect(badRes._body.error).toMatch(/cannot be less than current member count/);
      });

      it('empty body 400', async () => {
        const tid = await makeTeam();
        const req = mockReq('PATCH', `/api/holomesh/team/${tid}/config`, {}, { authorization: `Bearer ${ownerApiKey}` });
        const res = mockRes();
        await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/config`);
        expect(res._status).toBe(400);
      });

      it('unknown team 404', async () => {
        const req = mockReq(
          'PATCH',
          '/api/holomesh/team/team_does_not_exist/config',
          { max_slots: 50 },
          { authorization: `Bearer ${ownerApiKey}` }
        );
        const res = mockRes();
        await handleHoloMeshRoute(req, res, '/api/holomesh/team/team_does_not_exist/config');
        expect(res._status).toBe(404);
      });
    });

    // ── /space includes teams ──

    it('/space includes agent teams in your_agent', async () => {
      // Create team
      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `space-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');

      // Check /space
      const req = mockReq('GET', '/api/holomesh/space', undefined, {
        authorization: `Bearer ${ownerApiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/space');

      expect(res._status).toBe(200);
      expect(res._body.your_agent.teams).toBeInstanceOf(Array);
      expect(res._body.your_agent.teams.length).toBeGreaterThanOrEqual(1);
      expect(res._body.quick_links.create_team).toBeTruthy();
      expect(res._body.quick_links.team_dashboard).toBeTruthy();
    });
  });

  // ── Onboarding Room ──

  describe('GET /api/holomesh/onboard', () => {
    it('returns self-service onboarding guide for new agents', async () => {
      mockClient.discoverPeers.mockResolvedValue([
        { id: 'peer-1', name: 'agent-alpha', traits: ['@research'], reputation: 5 },
      ]);
      mockClient.queryKnowledge.mockResolvedValue([
        {
          id: 'W.001',
          type: 'wisdom',
          content: 'Test entry',
          domain: 'security',
          authorName: 'alpha',
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/onboard');
      const res = mockRes();
      const handled = await handleHoloMeshRoute(req, res, '/api/holomesh/onboard');

      expect(handled).toBe(true);
      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.welcome).toContain('HoloMesh');
      expect(res._body.network_stats).toBeDefined();
      expect(res._body.network_stats.agents).toBeGreaterThanOrEqual(1);
      expect(res._body.how_to_join).toBeDefined();
      expect(res._body.how_to_join.step_1.action).toBe('Register');
      expect(res._body.how_to_join.step_2.action).toBe('Set up your profile');
      expect(res._body.how_to_join.step_3.action).toBe('Contribute knowledge');
      expect(res._body.knowledge_types).toBeDefined();
      expect(res._body.knowledge_types.wisdom).toBeTruthy();
      expect(res._body.knowledge_types.pattern).toBeTruthy();
      expect(res._body.knowledge_types.gotcha).toBeTruthy();
      expect(res._body.reputation_tiers).toBeInstanceOf(Array);
      expect(res._body.reputation_tiers.length).toBe(4);
      expect(res._body.top_domains).toBeInstanceOf(Array);
      expect(res._body.sample_entries).toBeInstanceOf(Array);
      expect(res._body.mcp_endpoint).toBeDefined();
      expect(res._body.mcp_endpoint.tools).toBeInstanceOf(Array);
      expect(res._body.links).toBeDefined();
    });
  });

  // ── Feed ──

  describe('GET /api/holomesh/feed', () => {
    it('returns feed without auth (unauthenticated preview)', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'e1',
          type: 'wisdom',
          content: 'Test entry',
          domain: 'general',
          authorName: 'bob',
          price: 0,
          createdAt: new Date().toISOString(),
        },
      ]);
      const req = mockReq('GET', '/api/holomesh/feed');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/feed');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.entries).toBeInstanceOf(Array);
      expect(res._body.entries[0].voteCount).toBeDefined();
      expect(res._body.entries[0].commentCount).toBeDefined();
    });

    it('truncates premium content for unauthenticated users', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'premium1',
          type: 'pattern',
          content: 'A'.repeat(200),
          domain: 'security',
          authorName: 'alice',
          price: 0.5,
          createdAt: new Date().toISOString(),
        },
      ]);
      const req = mockReq('GET', '/api/holomesh/feed');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/feed');

      expect(res._body.entries[0].premium).toBe(true);
      expect(res._body.entries[0].content.length).toBeLessThan(200);
      expect(res._body.entries[0].content).toContain('premium');
    });
  });

  // ── Contribute ──

  describe('POST /api/holomesh/contribute', () => {
    it('creates a knowledge entry with auth', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `contrib-bot-${Date.now()}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      const req = mockReq(
        'POST',
        '/api/holomesh/contribute',
        {
          type: 'wisdom',
          content: 'Agents learn faster through knowledge exchange',
          domain: 'agents',
          tags: ['learning', 'exchange'],
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/contribute');

      expect(res._status).toBe(201);
      expect(res._body.success).toBe(true);
      expect(res._body.provenanceHash).toBeTruthy();
      expect(res._body.type).toBe('wisdom');
    });

    it('rejects missing content', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `contrib-empty-${Date.now()}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      const req = mockReq(
        'POST',
        '/api/holomesh/contribute',
        { type: 'wisdom' },
        {
          authorization: `Bearer ${apiKey}`,
        }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/contribute');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('content');
    });
  });

  // ── Space (Command Center) ──

  describe('GET /api/holomesh/space', () => {
    it('returns command center for authenticated agent', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `space-bot-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      mockClient.queryKnowledge.mockResolvedValueOnce([]);
      mockClient.discoverPeers.mockResolvedValueOnce([]);

      const req = mockReq('GET', '/api/holomesh/space', undefined, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/space');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.your_agent).toBeDefined();
      expect(res._body.your_agent.registered).toBe(true);
      expect(res._body.feed_summary).toBeDefined();
      expect(res._body.what_to_do_next).toBeInstanceOf(Array);
      expect(res._body.quick_links).toBeDefined();
    });

    it('returns space data without auth (server identity fallback)', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([]);
      mockClient.discoverPeers.mockResolvedValueOnce([]);

      const req = mockReq('GET', '/api/holomesh/space');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/space');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.domains).toBeInstanceOf(Array);
    });
  });

  // ── Profile ──

  describe('PATCH /api/holomesh/profile', () => {
    it('updates agent profile fields', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `profile-bot-${Date.now()}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      const req = mockReq(
        'PATCH',
        '/api/holomesh/profile',
        {
          bio: 'I analyze security patterns',
          themeColor: '#ff6600',
          statusText: 'Scanning...',
        },
        { authorization: `Bearer ${apiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.profile.bio).toBe('I analyze security patterns');
      expect(res._body.profile.themeColor).toBe('#ff6600');
    });

    it('requires auth', async () => {
      const req = mockReq('PATCH', '/api/holomesh/profile', { bio: 'test' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(401);
    });
  });

  // ── Domains ──

  describe('GET /api/holomesh/domains', () => {
    it('returns domain list with descriptions', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'e1',
          domain: 'security',
          content: 'test',
          type: 'wisdom',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'e2',
          domain: 'security',
          content: 'test2',
          type: 'pattern',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'e3',
          domain: 'agents',
          content: 'test3',
          type: 'gotcha',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('GET', '/api/holomesh/domains');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/domains');

      expect(res._status).toBe(200);
      expect(res._body.domains).toBeInstanceOf(Array);
      expect(res._body.domains[0].name).toBe('security');
      expect(res._body.domains[0].entryCount).toBe(2);
      expect(res._body.domains[0].description).toBeTruthy();
    });
  });

  // ── Search ──

  describe('GET /api/holomesh/search', () => {
    it('returns search results', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        { id: 's1', content: 'MCP security', type: 'wisdom', domain: 'security' },
      ]);

      const req = mockReq('GET', '/api/holomesh/search?q=security');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/search?q=security');

      expect(res._status).toBe(200);
      expect(res._body.results).toBeInstanceOf(Array);
      expect(res._body.query).toBe('security');
    });

    it('rejects missing query', async () => {
      const req = mockReq('GET', '/api/holomesh/search');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/search');

      expect(res._status).toBe(400);
    });
  });

  // ── Dashboard ──

  describe('GET /api/holomesh/dashboard', () => {
    it('returns not_registered for unauthenticated', async () => {
      const req = mockReq('GET', '/api/holomesh/dashboard');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/dashboard');

      expect(res._status).toBe(200);
      expect(res._body.status).toBe('not_registered');
    });
  });

  // ── MCP Config Endpoint (P2) ──

  describe('GET /api/holomesh/mcp-config', () => {
    it('returns Claude config by default', async () => {
      const req = mockReq('GET', '/api/holomesh/mcp-config');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/mcp-config');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.format).toBe('claude');
      expect(res._body.config.mcpServers.holomesh).toBeDefined();
      expect(res._body.config.mcpServers.holomesh.command).toBe('npx');
      expect(res._body.instructions).toContain('claude');
      expect(res._body.available_tools).toBeInstanceOf(Array);
      expect(res._body.available_tools.length).toBeGreaterThan(5);
    });

    it('returns Cursor config when format=cursor', async () => {
      const req = mockReq('GET', '/api/holomesh/mcp-config?format=cursor');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/mcp-config?format=cursor');

      expect(res._status).toBe(200);
      expect(res._body.format).toBe('cursor');
      expect(res._body.config.mcpServers.holomesh.url).toContain('mcp.holoscript.net');
      expect(res._body.config.mcpServers.holomesh.transport).toBe('sse');
    });

    it('returns generic config when format=generic', async () => {
      const req = mockReq('GET', '/api/holomesh/mcp-config?format=generic');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/mcp-config?format=generic');

      expect(res._status).toBe(200);
      expect(res._body.format).toBe('generic');
      expect(res._body.config.mcpServers.holomesh.command).toBe('npx');
    });

    it('includes quick_start and alternative_formats', async () => {
      const req = mockReq('GET', '/api/holomesh/mcp-config');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/mcp-config');

      expect(res._body.quick_start).toBeDefined();
      expect(res._body.quick_start.step_1).toContain('Copy');
      expect(res._body.alternative_formats.claude).toContain('format=claude');
      expect(res._body.alternative_formats.cursor).toContain('format=cursor');
    });
  });

  // ── Leaderboard Endpoint (P4) ──

  describe('GET /api/holomesh/leaderboard', () => {
    it('returns leaderboard with empty data', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([]);
      mockClient.discoverPeers.mockResolvedValueOnce([]);

      const req = mockReq('GET', '/api/holomesh/leaderboard');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/leaderboard');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.summary).toBeDefined();
      expect(res._body.top_contributors).toBeInstanceOf(Array);
      expect(res._body.most_engaged_entries).toBeInstanceOf(Array);
      expect(res._body.active_domains).toBeInstanceOf(Array);
    });

    it('ranks contributors by entry count', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'e1',
          authorId: 'a1',
          authorName: 'Alice',
          domain: 'agents',
          content: 'test',
          type: 'wisdom',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'e2',
          authorId: 'a1',
          authorName: 'Alice',
          domain: 'agents',
          content: 'test2',
          type: 'pattern',
          createdAt: new Date().toISOString(),
        },
        {
          id: 'e3',
          authorId: 'a2',
          authorName: 'Bob',
          domain: 'security',
          content: 'test3',
          type: 'gotcha',
          createdAt: new Date().toISOString(),
        },
      ]);
      mockClient.discoverPeers.mockResolvedValueOnce([]);

      const req = mockReq('GET', '/api/holomesh/leaderboard');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/leaderboard');

      expect(res._status).toBe(200);
      expect(res._body.top_contributors[0].name).toBe('Alice');
      expect(res._body.top_contributors[0].contributions).toBe(2);
      expect(res._body.top_contributors[0].rank).toBe(1);
      expect(res._body.top_contributors[1].name).toBe('Bob');
      expect(res._body.active_domains.length).toBe(2);
      expect(res._body.summary.total_entries).toBe(3);
    });

    it('respects limit parameter', async () => {
      const entries = Array.from({ length: 20 }, (_, i) => ({
        id: `e${i}`,
        authorId: `a${i}`,
        authorName: `Agent${i}`,
        domain: 'general',
        content: `entry ${i}`,
        type: 'wisdom',
        createdAt: new Date().toISOString(),
      }));
      mockClient.queryKnowledge.mockResolvedValueOnce(entries);
      mockClient.discoverPeers.mockResolvedValueOnce([]);

      const req = mockReq('GET', '/api/holomesh/leaderboard?limit=3');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/leaderboard?limit=3');

      expect(res._body.top_contributors.length).toBeLessThanOrEqual(3);
    });
  });

  // ── Quickstart Endpoint (P3) ──

  describe('GET /api/holomesh/quickstart', () => {
    it('returns curated onboarding payload', async () => {
      mockClient.queryKnowledge
        .mockResolvedValueOnce([
          {
            id: 'a1',
            type: 'wisdom',
            domain: 'agents',
            content: 'agent collaboration pattern',
            authorName: 'alice',
            createdAt: new Date().toISOString(),
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 's1',
            type: 'pattern',
            domain: 'security',
            content: 'sign everything',
            authorName: 'sec-bot',
            createdAt: new Date().toISOString(),
          },
        ])
        .mockResolvedValueOnce([]);

      const req = mockReq('GET', '/api/holomesh/quickstart');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/quickstart');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.welcome).toBeDefined();
      expect(res._body.top_domains).toBeInstanceOf(Array);
      expect(res._body.sample_entries).toBeInstanceOf(Array);
      expect(res._body.quick_actions).toBeInstanceOf(Array);
      expect(res._body.top_domains[0].domain).toBe('agents');
    });
  });

  describe('POST /api/holomesh/quickstart', () => {
    it('registers agent, auto-contributes, and returns feed', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'sample1',
          type: 'wisdom',
          domain: 'agents',
          content: 'Sample entry',
          authorName: 'someone',
          createdAt: new Date().toISOString(),
        },
      ]);

      const req = mockReq('POST', '/api/holomesh/quickstart', {
        name: `quickstart-bot-${Date.now()}`,
        description: 'A test bot for quickstart',
      }, { authorization: 'Bearer test-api-key' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/quickstart');

      expect(res._status).toBe(201);
      expect(res._body.success).toBe(true);
      expect(res._body.agent.api_key).toMatch(/^holomesh_sk_/);
      expect(res._body.agent.wallet_address).toMatch(/^0x/);
      expect(res._body.wallet.private_key).toMatch(/^0x/);
      expect(res._body.your_first_entry).toBeDefined();
      expect(res._body.your_first_entry.type).toBe('wisdom');
      expect(res._body.feed_preview).toBeInstanceOf(Array);
      expect(res._body.next_steps).toBeInstanceOf(Array);
      expect(res._body.mcp_config).toBeDefined();

      // Verify auto-contribution was called
      expect(mockClient.contributeKnowledge).toHaveBeenCalled();
    });

    it('rejects short names', async () => {
      const req = mockReq('POST', '/api/holomesh/quickstart', { name: 'x' }, { authorization: 'Bearer test-api-key' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/quickstart');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('2-64 chars');
    });

    it('rejects duplicate names', async () => {
      // Register first
      const req1 = mockReq('POST', '/api/holomesh/quickstart', { name: `dup-test-${Date.now()}` }, { authorization: 'Bearer test-api-key' });
      const res1 = mockRes();
      await handleHoloMeshRoute(req1, res1, '/api/holomesh/quickstart');
      expect(res1._status).toBe(201);

      // Try same name
      const req2 = mockReq('POST', '/api/holomesh/quickstart', { name: res1._body.agent.name }, { authorization: 'Bearer test-api-key' });
      const res2 = mockRes();
      await handleHoloMeshRoute(req2, res2, '/api/holomesh/quickstart');

      expect(res2._status).toBe(409);
    });

    it('includes description in hello entry', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([]);

      const req = mockReq('POST', '/api/holomesh/quickstart', {
        name: `desc-bot-${Date.now()}`,
        description: 'I analyze security patterns',
      }, { authorization: 'Bearer test-api-key' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/quickstart');

      expect(res._status).toBe(201);
      expect(res._body.your_first_entry.content).toContain('security patterns');
    });
  });

  // ── Crosspost to Moltbook (P5) ──

  describe('POST /api/holomesh/crosspost/moltbook', () => {
    it('requires authentication', async () => {
      const req = mockReq('POST', '/api/holomesh/crosspost/moltbook', { entry_id: 'test' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(401);
    });

    it('requires entry_id field', async () => {
      // Register an agent first to get API key
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `crosspost-bot-${Date.now()}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      const req = mockReq(
        'POST',
        '/api/holomesh/crosspost/moltbook',
        {},
        {
          authorization: `Bearer ${apiKey}`,
        }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('entry_id');
    });

    it('returns 404 for nonexistent entry', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `crosspost-404-${Date.now()}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      mockClient.queryKnowledge.mockResolvedValueOnce([]);

      const req = mockReq(
        'POST',
        '/api/holomesh/crosspost/moltbook',
        { entry_id: 'nonexistent' },
        {
          authorization: `Bearer ${apiKey}`,
        }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(404);
    });

    it('rejects cross-post by non-author', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `crosspost-noauth-${Date.now()}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'entry-by-other',
          authorId: 'different-agent',
          content: 'test',
          type: 'wisdom',
          domain: 'general',
        },
      ]);

      const req = mockReq(
        'POST',
        '/api/holomesh/crosspost/moltbook',
        { entry_id: 'entry-by-other' },
        {
          authorization: `Bearer ${apiKey}`,
        }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(403);
    });

    it('returns 503 if MOLTBOOK_API_KEY not set', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `crosspost-nokey-${Date.now()}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;
      const agentId = regRes._body.agent.id;

      mockClient.queryKnowledge.mockResolvedValueOnce([
        {
          id: 'my-entry',
          authorId: agentId,
          content: 'my knowledge',
          type: 'wisdom',
          domain: 'general',
          confidence: 0.9,
        },
      ]);

      delete process.env.MOLTBOOK_API_KEY;

      const req = mockReq(
        'POST',
        '/api/holomesh/crosspost/moltbook',
        { entry_id: 'my-entry' },
        {
          authorization: `Bearer ${apiKey}`,
        }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(503);
      expect(res._body.error).toContain('MOLTBOOK_API_KEY');
    });
  });

  // ── Sovereign Migrate (founder-override gate) ──
  //
  // task_1777050402454_28wq (2026-04-24): POST /api/holomesh/sovereign/migrate
  // must not let non-founder callers fabricate migration records for other
  // agents by supplying body.agentId. Non-founders always get caller.id in
  // migration.agentId; founders may override for legitimate simulation.
  describe('POST /api/holomesh/sovereign/migrate', () => {
    let nonFounderApiKey: string;
    let nonFounderAgentId: string;
    let counter = 0;

    async function registerAgent(name: string): Promise<{ apiKey: string; agentId: string }> {
      const uniqueName = `${name}-${++counter}-${Math.random().toString(36).slice(2, 8)}`;
      const req = mockReq('POST', '/api/holomesh/register', { name: uniqueName });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');
      if (res._status !== 201) throw new Error(`Register failed: ${JSON.stringify(res._body)}`);
      return { apiKey: res._body.agent.api_key, agentId: res._body.agent.id };
    }

    beforeEach(async () => {
      const agent = await registerAgent('migrate-nonfounder');
      nonFounderApiKey = agent.apiKey;
      nonFounderAgentId = agent.agentId;
    });

    it('non-founder: body.agentId=<other> is IGNORED and migration.agentId = caller.id', async () => {
      const victimId = 'agent_victim_9999';

      const req = mockReq(
        'POST',
        '/api/holomesh/sovereign/migrate',
        { agentId: victimId, fromCluster: 'cluster_a', toCluster: 'cluster_b' },
        { authorization: `Bearer ${nonFounderApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/sovereign/migrate');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      // The core assertion: body.agentId was IGNORED — migration.agentId is caller's id,
      // not the attacker-supplied victim id.
      expect(res._body.migration.agentId).toBe(nonFounderAgentId);
      expect(res._body.migration.agentId).not.toBe(victimId);
      expect(res._body.migration.impersonated).toBe(false);
      // signedBy/signedById agree with the coerced agentId.
      expect(res._body.migration.signedById).toBe(nonFounderAgentId);
    });

    it('non-founder: omitting body.agentId still yields migration.agentId = caller.id', async () => {
      const req = mockReq(
        'POST',
        '/api/holomesh/sovereign/migrate',
        { fromCluster: 'cluster_1', toCluster: 'cluster_2' },
        { authorization: `Bearer ${nonFounderApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/sovereign/migrate');

      expect(res._status).toBe(200);
      expect(res._body.migration.agentId).toBe(nonFounderAgentId);
      expect(res._body.migration.impersonated).toBe(false);
    });

    it('founder: body.agentId=<other> is HONORED but response flags impersonated=true', async () => {
      // HOLOSCRIPT_API_KEY=test-api-key resolves to isFounder via env-key fallback.
      const otherAgentId = 'agent_other_12345';

      const req = mockReq(
        'POST',
        '/api/holomesh/sovereign/migrate',
        { agentId: otherAgentId, fromCluster: 'cluster_a', toCluster: 'cluster_b' },
        { authorization: `Bearer test-api-key` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/sovereign/migrate');

      expect(res._status).toBe(200);
      expect(res._body.migration.agentId).toBe(otherAgentId);
      expect(res._body.migration.impersonated).toBe(true);
      // signedById differs from migration.agentId — downstream consumers see the split.
      expect(res._body.migration.signedById).not.toBe(otherAgentId);
    });

    it('founder: omitting body.agentId defaults to caller.id and impersonated=false', async () => {
      const req = mockReq(
        'POST',
        '/api/holomesh/sovereign/migrate',
        { fromCluster: 'cluster_1' },
        { authorization: `Bearer test-api-key` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/sovereign/migrate');

      expect(res._status).toBe(200);
      expect(res._body.migration.impersonated).toBe(false);
      // For founder self-migration, agentId equals signedById.
      expect(res._body.migration.agentId).toBe(res._body.migration.signedById);
    });

    it('unauthenticated: 401/403 before any migration record is produced', async () => {
      const req = mockReq(
        'POST',
        '/api/holomesh/sovereign/migrate',
        { agentId: 'agent_victim_0001' }
        // no authorization header
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/sovereign/migrate');

      // requireAuth returns 401; the exact code belongs to auth-utils, we only
      // care that no migration body was returned.
      expect(res._status).toBeGreaterThanOrEqual(401);
      expect(res._body?.migration).toBeUndefined();
    });
  });

  // ── GET /api/holomesh/fleet/status ──
  // Composite fleet meta-monitor — supersedes per-team /fleet-status (b39239e28)
  // by joining presence + CAEL + claimed + done into one drift-detection diagnostic.
  // Closes _xq6q meta-monitor gap (would have caught mw02 W.107 27.5h earlier).
  describe('GET /api/holomesh/fleet/status', () => {
    let ownerApiKey: string;
    let teamId: string;

    function makeCael(overrides: Partial<CaelAuditRecord> = {}): CaelAuditRecord {
      return {
        tick_iso: new Date().toISOString(),
        layer_hashes: ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'h7'],
        operation: 'audit/trial.tick',
        prev_hash: null,
        fnv1a_chain: 'fnv-stub',
        version_vector_fingerprint: 'vv-stub',
        received_at: '',
        ...overrides,
      };
    }

    beforeEach(async () => {
      // Fresh state — presence + audit are in-memory ring buffers.
      teamPresenceStore.clear();
      agentAuditStore.clear();

      // Register owner + create team
      const regReq = mockReq('POST', '/api/holomesh/register', {
        name: `fleet-owner-${Math.random().toString(36).slice(2, 8)}`,
      });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      ownerApiKey = regRes._body.agent.api_key;

      const createReq = mockReq(
        'POST',
        '/api/holomesh/team',
        { name: `fleet-team-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` },
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      teamId = createRes._body.team.id;
    });

    it('returns empty agents + zero totals when no presence/CAEL/claimed/done', async () => {
      const req = mockReq(
        'GET',
        `/api/holomesh/fleet/status?team=${teamId}`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/fleet/status?team=${teamId}`);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.team_id).toBe(teamId);
      expect(res._body.asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      // Owner is the only configured member (auto-added on team create)
      expect(res._body.fleetTotals.agentsConfigured).toBeGreaterThanOrEqual(1);
      expect(res._body.fleetTotals.claimedTasks).toBe(0);
      expect(res._body.fleetTotals.caelRecords24h).toBe(0);
      expect(res._body.fleetTotals.doneEntries24h).toBe(0);
      expect(res._body.fleetTotals.drift_alerts).toEqual([]);
      // Owner shows up as agentObserved (member-only, no CAEL/presence yet) with trust=ok
      const owner = res._body.agents.find((a: any) => a.agentId !== null);
      if (owner) {
        expect(owner.trustScore).toBe('ok');
        expect(owner.drift).toEqual([]);
        expect(owner.caelRecords24h).toBe(0);
      }
    });

    it('joins presence + CAEL + claimed + done into per-agent rows (happy path)', async () => {
      // Seed CAEL records for two handles: one healthy (with a done entry),
      // one without. The healthy one should have trust=ok.
      const handleA = 'fleet-worker-A';
      const handleB = 'fleet-worker-B';
      const tickIso = new Date(Date.now() - 30 * 60_000).toISOString(); // 30min ago

      appendCaelAuditRecord(handleA, makeCael({ tick_iso: tickIso, brain_class: 'security-auditor' }));
      appendCaelAuditRecord(handleA, makeCael({ tick_iso: tickIso, brain_class: 'security-auditor' }));
      appendCaelAuditRecord(handleB, makeCael({ tick_iso: tickIso, brain_class: 'lean-theorist' }));

      // Seed presence for handleA
      const presenceMap = new Map();
      presenceMap.set('agent-a-id', {
        agentId: 'agent-a-id',
        agentName: handleA,
        ideType: 'mesh-worker',
        status: 'active',
        lastHeartbeat: new Date().toISOString(),
        walletAddress: '0xAAAA000000000000000000000000000000000000',
        x402Verified: true,
        surfaceTag: 'mesh-worker-a',
      });
      teamPresenceStore.set(teamId, presenceMap);

      // Seed a done entry for handleA via direct team mutation
      const team = teamStore.get(teamId)!;
      team.doneLog = [
        {
          id: 'task-done-1',
          title: 'closed work',
          description: '',
          status: 'done',
          completedBy: handleA,
          claimedByName: handleA,
          completedAt: new Date(Date.now() - 10 * 60_000).toISOString(),
          createdAt: new Date(Date.now() - 60 * 60_000).toISOString(),
          priority: 1,
          commitHash: 'abc1234',
        } as any,
      ];

      const req = mockReq(
        'GET',
        `/api/holomesh/fleet/status?team=${teamId}`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/fleet/status?team=${teamId}`);

      expect(res._status).toBe(200);
      const rowA = res._body.agents.find((a: any) => a.handle === handleA);
      const rowB = res._body.agents.find((a: any) => a.handle === handleB);

      // handleA: has CAEL + presence + 1 done with commit → trust=ok
      expect(rowA).toBeDefined();
      expect(rowA.online).toBe(true);
      expect(rowA.caelRecords24h).toBe(2);
      expect(rowA.doneEntries24h).toBe(1);
      expect(rowA.doneEntriesWithCommit24h).toBe(1);
      expect(rowA.observedBrains).toEqual(['security-auditor']);
      expect(rowA.wallet).toBe('0xAAAA000000000000000000000000000000000000');
      expect(rowA.trustScore).toBe('ok');
      expect(rowA.drift).toEqual([]);
      expect(rowA.commitsByWallet24h).toBeNull(); // server-side: not measured

      // handleB: CAEL but no done → cael_no_artifacts drift → degraded
      expect(rowB).toBeDefined();
      expect(rowB.caelRecords24h).toBe(1);
      expect(rowB.doneEntries24h).toBe(0);
      expect(rowB.drift.some((d: string) => d.startsWith('cael_no_artifacts:'))).toBe(true);
      expect(rowB.trustScore).toBe('degraded');

      // Fleet totals
      expect(res._body.fleetTotals.caelRecords24h).toBe(3);
      expect(res._body.fleetTotals.doneEntries24h).toBe(1);
      expect(res._body.fleetTotals.drift_alerts.length).toBeGreaterThan(0);
      expect(res._body.fleetTotals.drift_alerts.some((s: string) => s.includes(handleB))).toBe(true);
      expect(res._body.fleetTotals.trust_distribution.degraded).toBeGreaterThanOrEqual(1);
    });

    it('flags stale_claim + brain_drift + escalates to untrusted at 24h+ cael_no_artifacts (W.107)', async () => {
      const handle = 'mesh-worker-mw02-sim';
      // 27.5h-old claim (the actual mw02 pattern that triggered this endpoint)
      const claimedAt = new Date(Date.now() - 27.5 * 3_600_000).toISOString();
      // CAEL records under TWO distinct brain classes → brain_drift
      const recentTick = new Date(Date.now() - 60 * 60_000).toISOString();
      for (let i = 0; i < 8; i++) {
        appendCaelAuditRecord(
          handle,
          makeCael({
            tick_iso: recentTick,
            brain_class: i % 2 === 0 ? 'trait-inference' : 'sesl-training',
          })
        );
      }

      const team = teamStore.get(teamId)!;
      team.taskBoard = [
        ...(team.taskBoard ?? []),
        {
          id: 'task-stale-1',
          title: 'stale claim',
          description: '',
          status: 'claimed',
          claimedBy: 'agent-mw02',
          claimedByName: handle,
          createdAt: claimedAt,
          priority: 1,
          metadata: { claimedAt },
        } as any,
      ];
      // No doneLog → cael_no_artifacts active

      const req = mockReq(
        'GET',
        `/api/holomesh/fleet/status?team=${teamId}`,
        undefined,
        { authorization: `Bearer ${ownerApiKey}` }
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/fleet/status?team=${teamId}`);

      expect(res._status).toBe(200);
      const row = res._body.agents.find((a: any) => a.handle === handle);
      expect(row).toBeDefined();
      expect(row.claimedTasks).toBe(1);
      expect(row.claimedTaskAgeHours).toBeGreaterThan(24);
      expect(row.observedBrains.sort()).toEqual(['sesl-training', 'trait-inference']);
      // All four drift rules should have fired
      expect(row.drift.some((d: string) => d.startsWith('cael_no_artifacts:'))).toBe(true);
      expect(row.drift.some((d: string) => d.startsWith('stale_claim_age_hours:'))).toBe(true);
      expect(row.drift.some((d: string) => d.startsWith('brain_drift:'))).toBe(true);
      // 24h+ cael_no_artifacts hard-escalates to untrusted (per spec)
      expect(row.trustScore).toBe('untrusted');
      expect(res._body.fleetTotals.trust_distribution.untrusted).toBeGreaterThanOrEqual(1);
      // Untrusted rows sort first
      expect(res._body.agents[0].trustScore).toBe('untrusted');
    });

    it('rejects missing team param (400), unknown team (404), unauth (401), non-member (403)', async () => {
      // 400: missing team
      const r400 = mockRes();
      await handleHoloMeshRoute(
        mockReq('GET', '/api/holomesh/fleet/status', undefined, {
          authorization: `Bearer ${ownerApiKey}`,
        }),
        r400,
        '/api/holomesh/fleet/status'
      );
      expect(r400._status).toBe(400);
      expect(r400._body.error).toMatch(/team query param required/);

      // 404: unknown team
      const r404 = mockRes();
      await handleHoloMeshRoute(
        mockReq(
          'GET',
          '/api/holomesh/fleet/status?team=team_nonexistent',
          undefined,
          { authorization: `Bearer ${ownerApiKey}` }
        ),
        r404,
        '/api/holomesh/fleet/status?team=team_nonexistent'
      );
      expect(r404._status).toBe(404);

      // 401: no auth
      const r401 = mockRes();
      await handleHoloMeshRoute(
        mockReq('GET', `/api/holomesh/fleet/status?team=${teamId}`),
        r401,
        `/api/holomesh/fleet/status?team=${teamId}`
      );
      expect(r401._status).toBe(401);

      // 403: authenticated but not in team
      const otherReg = mockReq('POST', '/api/holomesh/register', {
        name: `fleet-outsider-${Math.random().toString(36).slice(2, 8)}`,
      });
      const otherRes = mockRes();
      await handleHoloMeshRoute(otherReg, otherRes, '/api/holomesh/register');
      const outsiderKey = otherRes._body.agent.api_key;

      const r403 = mockRes();
      await handleHoloMeshRoute(
        mockReq('GET', `/api/holomesh/fleet/status?team=${teamId}`, undefined, {
          authorization: `Bearer ${outsiderKey}`,
        }),
        r403,
        `/api/holomesh/fleet/status?team=${teamId}`
      );
      expect(r403._status).toBe(403);
    });
  });

  // ── Route Matching ──

  describe('Route matching', () => {
    it('returns false for non-holomesh routes', async () => {
      const req = mockReq('GET', '/api/other');
      const res = mockRes();
      const handled = await handleHoloMeshRoute(req, res, '/api/other');

      expect(handled).toBe(false);
    });

    it('returns false for unmatched holomesh routes', async () => {
      const req = mockReq('GET', '/api/holomesh/nonexistent');
      const res = mockRes();
      const handled = await handleHoloMeshRoute(req, res, '/api/holomesh/nonexistent');

      expect(handled).toBe(false);
    });
  });
});

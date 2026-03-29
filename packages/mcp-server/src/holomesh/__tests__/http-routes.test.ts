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

vi.mock('viem', () => ({
  verifyMessage: (...args: any[]) => mockVerifyMessage(...args),
}));

// ── Mock @holoscript/core for PaymentGateway ──

const mockGateway = {
  createPaymentAuthorization: vi.fn((resource: string, amount: number) => ({
    x402Version: 1,
    accepts: [{
      scheme: 'exact',
      network: 'base-sepolia',
      maxAmountRequired: Math.round(amount * 1_000_000).toString(),
      resource,
      description: 'Premium HoloMesh entry',
      payTo: '0x0000000000000000000000000000000000000000',
      asset: '0x036CbD53842c5426634e7929541eC2318f3dCF7e',
      maxTimeoutSeconds: 60,
    }],
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
  PaymentGateway: vi.fn(function () { return mockGateway; }),
}));

// ── Mock orchestrator client ──

const mockClient = {
  registerAgent: vi.fn().mockResolvedValue('mock-agent-id'),
  discoverPeers: vi.fn().mockResolvedValue([]),
  queryKnowledge: vi.fn().mockResolvedValue([]),
  contributeKnowledge: vi.fn().mockResolvedValue(1),
  getAgentCard: vi.fn().mockResolvedValue(null),
  getAgentReputation: vi.fn().mockResolvedValue({
    score: 10, tier: 'contributor', contributions: 5,
    queriesAnswered: 3, reuseRate: 0.5,
  }),
  getAgentId: vi.fn().mockReturnValue('server-agent-id'),
  heartbeat: vi.fn().mockResolvedValue(true),
};

vi.mock('../orchestrator-client', () => ({
  // W.011: function(){} for constructor mock
  HoloMeshOrchestratorClient: vi.fn(function (this: any) {
    Object.assign(this, mockClient);
  }),
}));

// ── Mock process.env ──

const originalEnv = { ...process.env };

// ── Import after mocks ──

import { handleHoloMeshRoute } from '../http-routes';

// ── Test Helpers ──

/** Create a mock HTTP request */
function mockReq(
  method: string,
  url: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = method;
  req.url = url;
  req.headers = headers || {};

  // Simulate body stream
  if (body) {
    const data = JSON.stringify(body);
    process.nextTick(() => {
      req.emit('data', Buffer.from(data));
      req.emit('end');
    });
  } else {
    process.nextTick(() => req.emit('end'));
  }

  return req;
}

/** Create a mock HTTP response that captures output */
function mockRes(): http.ServerResponse & { _status: number; _body: any; _headers: Record<string, string> } {
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
        try { res._body = JSON.parse(data); } catch { res._body = data; }
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
    process.env.MCP_API_KEY = 'test-api-key';
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

    it('registers with existing wallet address', async () => {
      const req = mockReq('POST', '/api/holomesh/register', {
        name: 'wallet-bot',
        wallet_address: '0xABCDef1234567890abcdef1234567890ABCDef12',
      });
      const res = mockRes();

      await handleHoloMeshRoute(req, res, '/api/holomesh/register');

      expect(res._status).toBe(201);
      expect(res._body.agent.wallet_address).toBe('0xABCDef1234567890abcdef1234567890ABCDef12');
      expect(res._body.wallet.private_key).toBeUndefined();
      expect(res._body.wallet.note).toContain('existing wallet');
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

    it('rejects duplicate wallet address', async () => {
      const wallet = '0x1111111111111111111111111111111111111111';

      // Register first
      const req1 = mockReq('POST', '/api/holomesh/register', {
        name: 'bot-a', wallet_address: wallet,
      });
      const res1 = mockRes();
      await handleHoloMeshRoute(req1, res1, '/api/holomesh/register');
      expect(res1._status).toBe(201);

      // Try same wallet
      const req2 = mockReq('POST', '/api/holomesh/register', {
        name: 'bot-b', wallet_address: wallet,
      });
      const res2 = mockRes();
      await handleHoloMeshRoute(req2, res2, '/api/holomesh/register');

      expect(res2._status).toBe(409);
      expect(res2._body.error).toContain('wallet is already registered');
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
      expect(res._body.challenge).toContain('HoloMesh Key Recovery');
      expect(res._body.challenge).toContain('challenge-bot');
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
      const chalReq = mockReq('POST', '/api/holomesh/key/challenge', { wallet_address: walletAddress });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/key/challenge');
      const nonce = chalRes._body.nonce;

      // Recover with valid signature
      mockVerifyMessage.mockResolvedValue(true);
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
      const chalReq = mockReq('POST', '/api/holomesh/key/challenge', { wallet_address: walletAddress });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/key/challenge');
      const nonce = chalRes._body.nonce;

      // Reject bad signature
      mockVerifyMessage.mockResolvedValue(false);
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
      const chalReq = mockReq('POST', '/api/holomesh/key/challenge', { wallet_address: walletAddress });
      const chalRes = mockRes();
      await handleHoloMeshRoute(chalReq, chalRes, '/api/holomesh/key/challenge');
      const nonce = chalRes._body.nonce;

      // First recover — succeeds
      mockVerifyMessage.mockResolvedValue(true);
      const rec1Req = mockReq('POST', '/api/holomesh/key/recover', {
        wallet_address: walletAddress, nonce, signature: '0xsig',
      });
      const rec1Res = mockRes();
      await handleHoloMeshRoute(rec1Req, rec1Res, '/api/holomesh/key/recover');
      expect(rec1Res._status).toBe(200);

      // Second recover with same nonce — fails
      const rec2Req = mockReq('POST', '/api/holomesh/key/recover', {
        wallet_address: walletAddress, nonce, signature: '0xsig',
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
        wallet_address: walletB, nonce, signature: '0xsig',
      });
      const recRes = mockRes();
      await handleHoloMeshRoute(recReq, recRes, '/api/holomesh/key/recover');

      expect(recRes._status).toBe(400);
      expect(recRes._body.error).toContain('does not match');
    });
  });

  // ── Auth Enforcement ──

  describe('Auth enforcement', () => {
    let apiKey: string;
    let authBotCounter = 0;

    beforeEach(async () => {
      authBotCounter++;
      const req = mockReq('POST', '/api/holomesh/register', { name: `auth-bot-${Date.now()}-${authBotCounter}-${Math.random().toString(36).slice(2, 8)}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/register');
      apiKey = res._body.agent.api_key;
    });

    it('POST /contribute requires auth', async () => {
      const req = mockReq('POST', '/api/holomesh/contribute', {
        type: 'wisdom', content: 'Test insight',
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/contribute');

      expect(res._status).toBe(401);
      expect(res._body.error).toContain('Authentication required');
    });

    it('POST /contribute succeeds with valid Bearer token', async () => {
      const req = mockReq('POST', '/api/holomesh/contribute', {
        type: 'wisdom', content: 'Test insight from auth test',
      }, { authorization: `Bearer ${apiKey}` });
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

    it('rejects invalid API key', async () => {
      const req = mockReq('POST', '/api/holomesh/contribute', {
        type: 'wisdom', content: 'Test',
      }, { authorization: 'Bearer holomesh_sk_INVALID' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/contribute');

      expect(res._status).toBe(401);
      expect(res._body.error).toContain('Invalid API key');
    });
  });

  // ── Read Endpoints (no auth required) ──

  describe('Read endpoints (unauthenticated)', () => {
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
      mockClient.queryKnowledge.mockResolvedValueOnce([{
        id: 'premium-1', type: 'wisdom', content: longContent,
        domain: 'security', price: 0.05, authorId: 'other',
        authorName: 'author', createdAt: new Date().toISOString(),
      }]);

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
      mockClient.queryKnowledge.mockResolvedValueOnce([{
        id: 'free-1', type: 'wisdom', content,
        domain: 'general', price: 0, authorId: 'other',
        authorName: 'author', createdAt: new Date().toISOString(),
      }]);

      const req = mockReq('GET', '/api/holomesh/feed');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/feed');

      expect(res._status).toBe(200);
      expect(res._body.entries[0].premium).toBe(false);
      expect(res._body.entries[0].content).toBe(content);
    });

    it('entry detail returns 402 for premium entry without payment', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([{
        id: 'premium-2', type: 'pattern', content: 'Secret pattern',
        domain: 'agents', price: 0.10, authorId: 'other',
        authorName: 'author', createdAt: new Date().toISOString(),
      }]);

      const req = mockReq('GET', '/api/holomesh/entry/premium-2');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/premium-2');

      expect(res._status).toBe(402);
      expect(res._body.accepts).toBeInstanceOf(Array);
      expect(res._body.accepts[0].maxAmountRequired).toBe('100000'); // 0.10 USDC = 100000 base units
      expect(res._body.preview).toBeDefined();
      expect(res._body.preview.price).toBe(0.10);
      expect(res._body.hint).toContain('X-PAYMENT');
    });

    it('entry detail returns full content for free entry', async () => {
      const content = 'Free knowledge accessible to all';
      mockClient.queryKnowledge.mockResolvedValueOnce([{
        id: 'free-2', type: 'wisdom', content,
        domain: 'general', price: 0, authorId: 'other',
        authorName: 'author', createdAt: new Date().toISOString(),
      }]);

      const req = mockReq('GET', '/api/holomesh/entry/free-2');
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/entry/free-2');

      expect(res._status).toBe(200);
      expect(res._body.entry.content).toBe(content);
    });

    it('entry detail accepts X-PAYMENT header for premium entry (testnet fallback)', async () => {
      // Register agent for auth
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `pay-bot-${Date.now()}-${Math.random().toString(36).slice(2)}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      mockClient.queryKnowledge.mockResolvedValueOnce([{
        id: 'premium-3', type: 'gotcha', content: 'Full premium secret gotcha',
        domain: 'compilation', price: 0.05, authorId: 'other',
        authorName: 'author', createdAt: new Date().toISOString(),
      }]);

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
      const req = mockReq('POST', '/api/holomesh/register', { name: `profile-bot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` });
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
      const req = mockReq('PATCH', '/api/holomesh/profile', {
        bio: 'I trade wisdom for wisdom.',
        themeColor: '#ff6b6b',
        statusText: 'Open for trades',
      }, { authorization: `Bearer ${apiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.profile.bio).toBe('I trade wisdom for wisdom.');
      expect(res._body.profile.themeColor).toBe('#ff6b6b');
      expect(res._body.profile.statusText).toBe('Open for trades');
      expect(res._body.updated).toEqual(expect.arrayContaining(['bio', 'themeColor', 'statusText']));
    });

    it('PATCH /profile persists changes', async () => {
      const req = mockReq('PATCH', '/api/holomesh/profile', {
        customTitle: 'The Oracle',
      }, { authorization: `Bearer ${apiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(200);
      expect(mockWriteFileSync).toHaveBeenCalled(); // persist called
    });

    it('PATCH /profile rejects invalid hex color', async () => {
      const req = mockReq('PATCH', '/api/holomesh/profile', {
        themeColor: 'not-a-color',
      }, { authorization: `Bearer ${apiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('hex color');
    });

    it('PATCH /profile rejects overly long bio', async () => {
      const req = mockReq('PATCH', '/api/holomesh/profile', {
        bio: 'x'.repeat(501),
      }, { authorization: `Bearer ${apiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('500 characters');
    });

    it('PATCH /profile rejects empty update', async () => {
      const req = mockReq('PATCH', '/api/holomesh/profile', {
        unknown_field: 'ignored',
      }, { authorization: `Bearer ${apiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/profile');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('No valid profile fields');
    });

    it('PUT /profile also works (same as PATCH)', async () => {
      const req = mockReq('PUT', '/api/holomesh/profile', {
        themeAccent: '#a78bfa',
      }, { authorization: `Bearer ${apiKey}` });
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
        call[0]?.some?.((e: any) => e.id.endsWith(':init') && e.workspaceId.startsWith('private:')),
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
          id: 'W.test.priv.1', type: 'wisdom', content: 'Private insight',
          domain: 'security', authorId: 'me', authorName: agentName,
          workspaceId: 'private:0xabc', createdAt: new Date().toISOString(),
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
        { id: 'W.1', type: 'wisdom', content: 'A', domain: 'security', authorId: 'me', authorName: 'x', createdAt: new Date().toISOString() },
        { id: 'W.2', type: 'pattern', content: 'B', domain: 'agents', authorId: 'me', authorName: 'x', createdAt: new Date().toISOString() },
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
        { id: 'private:0xabc:init', type: 'wisdom', content: 'Init', domain: 'general', authorId: 'me', authorName: 'x', createdAt: new Date().toISOString() },
        { id: 'W.real', type: 'wisdom', content: 'Real entry', domain: 'general', authorId: 'me', authorName: 'x', createdAt: new Date().toISOString() },
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

      const req = mockReq('POST', '/api/holomesh/knowledge/private', {
        entries: [
          { type: 'wisdom', content: 'Private wisdom A', domain: 'security' },
          { type: 'gotcha', content: 'Private gotcha B', domain: 'agents', tags: ['vitest'] },
        ],
      }, { authorization: `Bearer ${apiKey}` });
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
      const req = mockReq('POST', '/api/holomesh/knowledge/private', {
        entries: [],
      }, { authorization: `Bearer ${apiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('entries');
    });

    it('POST /knowledge/private rejects more than 100 entries', async () => {
      const bigBatch = Array.from({ length: 101 }, (_, i) => ({
        type: 'wisdom', content: `Entry ${i}`,
      }));

      const req = mockReq('POST', '/api/holomesh/knowledge/private', {
        entries: bigBatch,
      }, { authorization: `Bearer ${apiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/knowledge/private');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('100');
    });

    it('POST /knowledge/promote promotes private entry to public feed', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([{
        id: 'W.priv.1', type: 'wisdom', content: 'Promotable insight',
        domain: 'security', authorId: 'me', authorName: agentName,
        workspaceId: 'private:0xabc', tags: ['private'],
        provenanceHash: 'abc123', price: 0,
        queryCount: 0, reuseCount: 0,
        createdAt: new Date().toISOString(),
      }]);
      mockClient.contributeKnowledge.mockResolvedValueOnce(1);

      const req = mockReq('POST', '/api/holomesh/knowledge/promote', {
        entry_id: 'W.priv.1',
        price: 0.05,
      }, { authorization: `Bearer ${apiKey}` });
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

      const req = mockReq('POST', '/api/holomesh/knowledge/promote', {
        entry_id: 'nonexistent',
      }, { authorization: `Bearer ${apiKey}` });
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
      const req = mockReq('POST', '/api/holomesh/team',
        { name: 'test-team', description: 'A test enterprise team' },
        { authorization: `Bearer ${ownerApiKey}` },
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
      const req = mockReq('POST', '/api/holomesh/team',
        { name: 'a' },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/team');
      expect(res._status).toBe(400);
    });

    it('POST /api/holomesh/team rejects duplicate names', async () => {
      const name = `dup-team-${Date.now()}`;
      // Create first
      const req1 = mockReq('POST', '/api/holomesh/team', { name }, { authorization: `Bearer ${ownerApiKey}` });
      const res1 = mockRes();
      await handleHoloMeshRoute(req1, res1, '/api/holomesh/team');
      expect(res1._status).toBe(201);

      // Try duplicate
      const req2 = mockReq('POST', '/api/holomesh/team', { name }, { authorization: `Bearer ${ownerApiKey}` });
      const res2 = mockRes();
      await handleHoloMeshRoute(req2, res2, '/api/holomesh/team');
      expect(res2._status).toBe(409);
    });

    // ── List Teams ──

    it('GET /api/holomesh/teams lists agent teams', async () => {
      // Create a team first
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `list-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      expect(createRes._status).toBe(201);

      // List teams
      const req = mockReq('GET', '/api/holomesh/teams', undefined, { authorization: `Bearer ${ownerApiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/teams');

      expect(res._status).toBe(200);
      expect(res._body.teams.length).toBeGreaterThanOrEqual(1);
      expect(res._body.teams[0].role).toBe('owner');
    });

    // ── Join Team ──

    it('POST /api/holomesh/team/:id/join with invite code', async () => {
      // Create team
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `join-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const req = mockReq('POST', `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/join`);

      expect(res._status).toBe(200);
      expect(res._body.success).toBe(true);
      expect(res._body.role).toBe('member');
      expect(res._body.members).toBe(2);
    });

    it('POST /api/holomesh/team/:id/join rejects wrong invite code', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `bad-code-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('POST', `/api/holomesh/team/${tid}/join`,
        { invite_code: 'wrong-code' },
        { authorization: `Bearer ${memberApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/join`);

      expect(res._status).toBe(403);
    });

    it('POST /api/holomesh/team/:id/join rejects double join', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `double-join-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Owner tries to join again
      const req = mockReq('POST', `/api/holomesh/team/${tid}/join`,
        { invite_code: createRes._body.team.invite_code },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/join`);

      expect(res._status).toBe(409);
    });

    // ── Team Dashboard ──

    it('GET /api/holomesh/team/:id returns team dashboard', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `dash-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('GET', `/api/holomesh/team/${tid}`, undefined, { authorization: `Bearer ${ownerApiKey}` });
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
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `private-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('GET', `/api/holomesh/team/${tid}`, undefined, { authorization: `Bearer ${memberApiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}`);

      expect(res._status).toBe(403);
    });

    // ── Presence ──

    it('POST /api/holomesh/team/:id/presence registers heartbeat', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `pres-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('POST', `/api/holomesh/team/${tid}/presence`,
        { ide_type: 'vscode', project_path: '/workspace/project', status: 'active' },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/presence`);

      expect(res._status).toBe(200);
      expect(res._body.presence.ideType).toBe('vscode');
      expect(res._body.presence.status).toBe('active');
      expect(res._body.online_count).toBe(1);
    });

    it('GET /api/holomesh/team/:id/presence returns online agents', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `pres-get-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Register presence
      const presReq = mockReq('POST', `/api/holomesh/team/${tid}/presence`,
        { ide_type: 'cursor' },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const presRes = mockRes();
      await handleHoloMeshRoute(presReq, presRes, `/api/holomesh/team/${tid}/presence`);

      // Get presence
      const req = mockReq('GET', `/api/holomesh/team/${tid}/presence`, undefined, { authorization: `Bearer ${ownerApiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/presence`);

      expect(res._status).toBe(200);
      expect(res._body.online_count).toBe(1);
      expect(res._body.online[0].ideType).toBe('cursor');
    });

    // ── Messaging ──

    it('POST /api/holomesh/team/:id/message sends team message', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `msg-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('POST', `/api/holomesh/team/${tid}/message`,
        { content: 'Hello team!', type: 'text' },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/message`);

      expect(res._status).toBe(201);
      expect(res._body.message.content).toBe('Hello team!');
      expect(res._body.message.messageType).toBe('text');
    });

    it('GET /api/holomesh/team/:id/messages reads team messages', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `read-msg-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      // Send a message first
      const sendReq = mockReq('POST', `/api/holomesh/team/${tid}/message`,
        { content: 'Test message' },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const sendRes = mockRes();
      await handleHoloMeshRoute(sendReq, sendRes, `/api/holomesh/team/${tid}/message`);

      // Read messages
      const req = mockReq('GET', `/api/holomesh/team/${tid}/messages`, undefined, { authorization: `Bearer ${ownerApiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/messages`);

      expect(res._status).toBe(200);
      expect(res._body.messages.length).toBeGreaterThanOrEqual(1);
    });

    it('POST /api/holomesh/team/:id/message rejects missing content', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `empty-msg-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('POST', `/api/holomesh/team/${tid}/message`,
        {},
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/message`);

      expect(res._status).toBe(400);
    });

    // ── Team Knowledge ──

    it('POST /api/holomesh/team/:id/knowledge contributes to team workspace', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `know-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('POST', `/api/holomesh/team/${tid}/knowledge`,
        {
          entries: [
            { type: 'wisdom', content: 'Team insight about caching', domain: 'compilation' },
            { type: 'gotcha', content: 'Never use eval in production', domain: 'security' },
          ],
        },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/knowledge`);

      expect(res._status).toBe(201);
      expect(res._body.synced).toBe(1); // mockClient returns 1
      expect(res._body.entries.length).toBe(2);
      expect(res._body.workspace_id).toMatch(/^team:/);
    });

    it('GET /api/holomesh/team/:id/knowledge reads team knowledge', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `read-know-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('GET', `/api/holomesh/team/${tid}/knowledge`, undefined, { authorization: `Bearer ${ownerApiKey}` });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/knowledge`);

      expect(res._status).toBe(200);
      expect(res._body.workspace_id).toMatch(/^team:/);
      expect(res._body.entries).toBeInstanceOf(Array);
    });

    // ── Team Absorb ──

    it('POST /api/holomesh/team/:id/absorb triggers absorb pipeline', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `absorb-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('POST', `/api/holomesh/team/${tid}/absorb`,
        { project_path: '/workspace/my-project', depth: 'deep' },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/absorb`);

      expect(res._status).toBe(202);
      expect(res._body.absorb.project_path).toBe('/workspace/my-project');
      expect(res._body.absorb.depth).toBe('deep');
      expect(res._body.absorb.workspace_id).toMatch(/^team:/);
    });

    it('POST /api/holomesh/team/:id/absorb rejects missing project_path', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `no-path-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;

      const req = mockReq('POST', `/api/holomesh/team/${tid}/absorb`,
        {},
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/absorb`);

      expect(res._status).toBe(400);
    });

    // ── Member Management ──

    it('POST /api/holomesh/team/:id/members can set role', async () => {
      // Create team and add member
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `role-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const joinReq = mockReq('POST', `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` },
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);

      // Owner promotes member to admin
      const req = mockReq('POST', `/api/holomesh/team/${tid}/members`,
        { action: 'set_role', agent_id: memberAgentId, role: 'admin' },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/members`);

      expect(res._status).toBe(200);
      expect(res._body.new_role).toBe('admin');
    });

    it('POST /api/holomesh/team/:id/members can remove member', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `rm-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const joinReq = mockReq('POST', `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` },
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);

      // Owner removes member
      const req = mockReq('POST', `/api/holomesh/team/${tid}/members`,
        { action: 'remove', agent_id: memberAgentId },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/members`);

      expect(res._status).toBe(200);
      expect(res._body.removed).toBe(memberAgentId);
      expect(res._body.members).toBe(1);
    });

    it('POST /api/holomesh/team/:id/members rejects non-admin', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `nonadmin-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const joinReq = mockReq('POST', `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` },
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);

      // Member tries to manage (should fail — member role has no members:manage)
      const req = mockReq('POST', `/api/holomesh/team/${tid}/members`,
        { action: 'set_role', agent_id: ownerAgentId, role: 'viewer' },
        { authorization: `Bearer ${memberApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/members`);

      expect(res._status).toBe(403);
    });

    // ── Viewer Permissions ──

    it('viewer cannot write knowledge to team', async () => {
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `viewer-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');
      const tid = createRes._body.team.id;
      const code = createRes._body.team.invite_code;

      // Member joins
      const joinReq = mockReq('POST', `/api/holomesh/team/${tid}/join`,
        { invite_code: code },
        { authorization: `Bearer ${memberApiKey}` },
      );
      const joinRes = mockRes();
      await handleHoloMeshRoute(joinReq, joinRes, `/api/holomesh/team/${tid}/join`);

      // Demote to viewer
      const demoteReq = mockReq('POST', `/api/holomesh/team/${tid}/members`,
        { action: 'set_role', agent_id: memberAgentId, role: 'viewer' },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const demoteRes = mockRes();
      await handleHoloMeshRoute(demoteReq, demoteRes, `/api/holomesh/team/${tid}/members`);

      // Viewer tries to contribute knowledge (should fail)
      const req = mockReq('POST', `/api/holomesh/team/${tid}/knowledge`,
        { entries: [{ type: 'wisdom', content: 'Should fail' }] },
        { authorization: `Bearer ${memberApiKey}` },
      );
      const res = mockRes();
      await handleHoloMeshRoute(req, res, `/api/holomesh/team/${tid}/knowledge`);

      expect(res._status).toBe(403);
    });

    // ── /space includes teams ──

    it('/space includes agent teams in your_agent', async () => {
      // Create team
      const createReq = mockReq('POST', '/api/holomesh/team',
        { name: `space-team-${Date.now()}` },
        { authorization: `Bearer ${ownerApiKey}` },
      );
      const createRes = mockRes();
      await handleHoloMeshRoute(createReq, createRes, '/api/holomesh/team');

      // Check /space
      const req = mockReq('GET', '/api/holomesh/space', undefined, { authorization: `Bearer ${ownerApiKey}` });
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
        { id: 'W.001', type: 'wisdom', content: 'Test entry', domain: 'security', authorName: 'alpha' },
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
        { id: 'e1', authorId: 'a1', authorName: 'Alice', domain: 'agents', content: 'test', type: 'wisdom', createdAt: new Date().toISOString() },
        { id: 'e2', authorId: 'a1', authorName: 'Alice', domain: 'agents', content: 'test2', type: 'pattern', createdAt: new Date().toISOString() },
        { id: 'e3', authorId: 'a2', authorName: 'Bob', domain: 'security', content: 'test3', type: 'gotcha', createdAt: new Date().toISOString() },
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
        id: `e${i}`, authorId: `a${i}`, authorName: `Agent${i}`,
        domain: 'general', content: `entry ${i}`, type: 'wisdom',
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

  describe('POST /api/holomesh/quickstart', () => {
    it('registers agent, auto-contributes, and returns feed', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([
        { id: 'sample1', type: 'wisdom', domain: 'agents', content: 'Sample entry', authorName: 'someone', createdAt: new Date().toISOString() },
      ]);

      const req = mockReq('POST', '/api/holomesh/quickstart', {
        name: `quickstart-bot-${Date.now()}`,
        description: 'A test bot for quickstart',
      });
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
      const req = mockReq('POST', '/api/holomesh/quickstart', { name: 'x' });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/quickstart');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('2-64 chars');
    });

    it('rejects duplicate names', async () => {
      // Register first
      const req1 = mockReq('POST', '/api/holomesh/quickstart', { name: `dup-test-${Date.now()}` });
      const res1 = mockRes();
      await handleHoloMeshRoute(req1, res1, '/api/holomesh/quickstart');
      expect(res1._status).toBe(201);

      // Try same name
      const req2 = mockReq('POST', '/api/holomesh/quickstart', { name: res1._body.agent.name });
      const res2 = mockRes();
      await handleHoloMeshRoute(req2, res2, '/api/holomesh/quickstart');

      expect(res2._status).toBe(409);
    });

    it('includes description in hello entry', async () => {
      mockClient.queryKnowledge.mockResolvedValueOnce([]);

      const req = mockReq('POST', '/api/holomesh/quickstart', {
        name: `desc-bot-${Date.now()}`,
        description: 'I analyze security patterns',
      });
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
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `crosspost-bot-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      const req = mockReq('POST', '/api/holomesh/crosspost/moltbook', {}, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(400);
      expect(res._body.error).toContain('entry_id');
    });

    it('returns 404 for nonexistent entry', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `crosspost-404-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      mockClient.queryKnowledge.mockResolvedValueOnce([]);

      const req = mockReq('POST', '/api/holomesh/crosspost/moltbook', { entry_id: 'nonexistent' }, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(404);
    });

    it('rejects cross-post by non-author', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `crosspost-noauth-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;

      mockClient.queryKnowledge.mockResolvedValueOnce([
        { id: 'entry-by-other', authorId: 'different-agent', content: 'test', type: 'wisdom', domain: 'general' },
      ]);

      const req = mockReq('POST', '/api/holomesh/crosspost/moltbook', { entry_id: 'entry-by-other' }, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(403);
    });

    it('returns 503 if MOLTBOOK_API_KEY not set', async () => {
      const regReq = mockReq('POST', '/api/holomesh/register', { name: `crosspost-nokey-${Date.now()}` });
      const regRes = mockRes();
      await handleHoloMeshRoute(regReq, regRes, '/api/holomesh/register');
      const apiKey = regRes._body.agent.api_key;
      const agentId = regRes._body.agent.id;

      mockClient.queryKnowledge.mockResolvedValueOnce([
        { id: 'my-entry', authorId: agentId, content: 'my knowledge', type: 'wisdom', domain: 'general', confidence: 0.9 },
      ]);

      delete process.env.MOLTBOOK_API_KEY;

      const req = mockReq('POST', '/api/holomesh/crosspost/moltbook', { entry_id: 'my-entry' }, {
        authorization: `Bearer ${apiKey}`,
      });
      const res = mockRes();
      await handleHoloMeshRoute(req, res, '/api/holomesh/crosspost/moltbook');

      expect(res._status).toBe(503);
      expect(res._body.error).toContain('MOLTBOOK_API_KEY');
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

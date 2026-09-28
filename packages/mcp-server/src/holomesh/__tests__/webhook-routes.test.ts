import { EventEmitter } from 'node:events';
import { createHmac } from 'node:crypto';
import type http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The Railway deploy-alert webhook was fully implemented, documented as the URL
 * to paste into the Railway dashboard, and unreachable: it matches
 * `/webhook/railway`, and the only dispatcher that invokes it was entered solely
 * for paths starting `/api/holomesh/`. Every crash, OOM and failed-deploy alert
 * Railway sent was answered by a 404. Nobody noticed, because a dropped alert is
 * indistinguishable from no crash.
 *
 * Making it reachable is the fix, and it carries a trap that these cases pin:
 * the signature check used to accept ANY unsigned body whenever NODE_ENV was not
 * 'production'. While the route was dead that was merely untidy. Reachable, it
 * would have been an unauthenticated writer into a team room, gated by a variable
 * nobody had verified was set on the deployed box.
 */

const SECRET = 'railway-test-secret';

interface CapturedRes extends http.ServerResponse {
  _status: number;
  _body: unknown;
}

function mockReq(body: string, headers: Record<string, string> = {}): http.IncomingMessage {
  const req = new EventEmitter() as http.IncomingMessage;
  req.method = 'POST';
  req.url = '/webhook/railway';
  req.headers = headers;
  setTimeout(() => {
    req.emit('data', Buffer.from(body, 'utf-8'));
    req.emit('end');
  }, 0);
  return req;
}

function mockRes(): CapturedRes {
  const captured = {
    _status: 0,
    _body: undefined as unknown,
    writeHead(status: number) {
      captured._status = status;
      return captured;
    },
    setHeader() {
      return captured;
    },
    end(data?: string) {
      if (!data) return;
      try {
        captured._body = JSON.parse(data);
      } catch {
        captured._body = data;
      }
    },
  };
  return captured as unknown as CapturedRes;
}

const sign = (body: string, secret = SECRET) =>
  createHmac('sha256', secret).update(body).digest('hex');

describe('the Railway webhook refuses what it cannot verify', () => {
  const EVENT = JSON.stringify({
    type: 'DEPLOY',
    status: 'CRASHED',
    project: { name: 'mcp-server' },
    environment: { name: 'production' },
  });

  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv('RAILWAY_WEBHOOK_SECRET', SECRET);
    vi.stubEnv('HOLOMESH_TEAM_ID', 'team_webhook_probe');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  const loadHandler = async () => (await import('../routes/webhook-routes')).handleWebhookRoutes;

  it('THE TRAP: an unsigned body is refused when no secret is configured', async () => {
    // This is the case that would have become an open writer the moment the
    // route was made reachable. NODE_ENV is deliberately left unset, which is
    // exactly the state that used to return true.
    vi.stubEnv('RAILWAY_WEBHOOK_SECRET', '');
    vi.stubEnv('NODE_ENV', '');
    const { verifyRailwaySignature } = await import('../routes/webhook-routes');
    expect(verifyRailwaySignature(EVENT, undefined)).toBe(false);
    expect(verifyRailwaySignature(EVENT, 'anything')).toBe(false);
  });

  it('still refuses an unsigned body with no secret in a dev-looking env', async () => {
    vi.stubEnv('RAILWAY_WEBHOOK_SECRET', '');
    vi.stubEnv('NODE_ENV', 'development');
    const { verifyRailwaySignature } = await import('../routes/webhook-routes');
    expect(verifyRailwaySignature(EVENT, undefined)).toBe(false);
  });

  it('THE REAL MECHANISM: an unsigned Railway POST with the URL token is accepted', async () => {
    // Railway does not sign webhook payloads at all. The previous fix verified an
    // HMAC against x-railway-signature, a header Railway never sends — so it would
    // have rejected 100% of genuine alerts while looking correct.
    const handle = await loadHandler();
    const res = mockRes();
    const url = '/webhook/railway?token=' + SECRET;
    const req = mockReq(EVENT);
    req.url = url;
    const handled = await handle(req, res, '/webhook/railway', 'POST', url);
    expect(handled).toBe(true);
    expect(res._status).toBeLessThan(400);
  });

  it('refuses a wrong URL token', async () => {
    const handle = await loadHandler();
    const res = mockRes();
    const url = '/webhook/railway?token=not-the-secret';
    const req = mockReq(EVENT);
    req.url = url;
    await handle(req, res, '/webhook/railway', 'POST', url);
    expect(res._status).toBe(401);
  });

  it('refuses an unsigned POST carrying no token at all', async () => {
    const handle = await loadHandler();
    const res = mockRes();
    await handle(mockReq(EVENT), res, '/webhook/railway', 'POST');
    expect(res._status).toBe(401);
  });

  it('accepts ?secret= as well as ?token=', async () => {
    const handle = await loadHandler();
    const res = mockRes();
    const url = '/webhook/railway?secret=' + SECRET;
    const req = mockReq(EVENT);
    req.url = url;
    await handle(req, res, '/webhook/railway', 'POST', url);
    expect(res._status).toBeLessThan(400);
  });

  it('still refuses a URL token when no secret is configured', async () => {
    vi.stubEnv('RAILWAY_WEBHOOK_SECRET', '');
    vi.stubEnv('NODE_ENV', '');
    const { verifyRailwayRequest } = await import('../routes/webhook-routes');
    expect(verifyRailwayRequest('/webhook/railway?token=anything', EVENT, undefined)).toBe(false);
  });

  it('rejects a wrong signature with 401', async () => {
    const handle = await loadHandler();
    const res = mockRes();
    const handled = await handle(
      mockReq(EVENT, { 'x-railway-signature': sign(EVENT, 'not-the-secret') }),
      res,
      '/webhook/railway',
      'POST'
    );
    expect(handled).toBe(true);
    expect(res._status).toBe(401);
  });

  it('rejects a missing signature with 401', async () => {
    const handle = await loadHandler();
    const res = mockRes();
    await handle(mockReq(EVENT), res, '/webhook/railway', 'POST');
    expect(res._status).toBe(401);
  });

  it('accepts a correctly signed Railway event', async () => {
    const handle = await loadHandler();
    const res = mockRes();
    const handled = await handle(
      mockReq(EVENT, { 'x-railway-signature': sign(EVENT) }),
      res,
      '/webhook/railway',
      'POST'
    );
    expect(handled).toBe(true);
    expect(res._status).toBeLessThan(400);
  });

  it('declines paths and methods that are not its own', async () => {
    const handle = await loadHandler();
    expect(await handle(mockReq(''), mockRes(), '/webhook/other', 'POST')).toBe(false);
    expect(await handle(mockReq(''), mockRes(), '/webhook/railway', 'GET')).toBe(false);
  });
});

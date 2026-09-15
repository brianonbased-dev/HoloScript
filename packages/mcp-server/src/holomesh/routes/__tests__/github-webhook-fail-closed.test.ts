/**
 * POST /webhook/github must verify the HMAC in production.
 *
 * verifyGithubSignature returned true ("dev: skip verification") whenever no
 * secret was configured, in every environment — so a production deploy that
 * lost GITHUB_WEBHOOK_SECRET would accept forged push events and dispatch CI.
 */
import { createHmac } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type * as http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleGithubWebhookRoutes } from '../github-webhook-routes';

const PING = JSON.stringify({ zen: 'Keep it logically awesome.', repository: { full_name: 'o/r' } });

function fakeReq(body: string, headers: Record<string, string>): http.IncomingMessage {
  const stream = Object.assign(new PassThrough(), { headers });
  stream.end(body);
  return stream as unknown as http.IncomingMessage;
}

class FakeRes {
  status = 0;
  body = '';
  writeHead(code: number): this {
    this.status = code;
    return this;
  }
  end(chunk?: string): this {
    this.body = chunk ?? '';
    return this;
  }
}

async function post(headers: Record<string, string>, body = PING): Promise<FakeRes> {
  const res = new FakeRes();
  const handled = await handleGithubWebhookRoutes(
    fakeReq(body, headers),
    res as unknown as http.ServerResponse,
    '/webhook/github',
    'POST'
  );
  expect(handled).toBe(true);
  return res;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('github webhook signature — missing secret', () => {
  it('production + no secret configured: refuses an unsigned event', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', undefined);
    vi.stubEnv('HOLOCI_WEBHOOK_SECRETS', undefined);
    const res = await post({ 'x-github-event': 'ping' });
    expect(res.status).toBe(401);
    expect(JSON.parse(res.body).error).toBe('invalid_signature');
  });

  it('production + blank secret: refuses', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', '   ');
    vi.stubEnv('HOLOCI_WEBHOOK_SECRETS', undefined);
    const res = await post({ 'x-github-event': 'ping', 'x-hub-signature-256': 'sha256=deadbeef' });
    expect(res.status).toBe(401);
  });

  it('local development + no secret: keeps the documented skip', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', undefined);
    vi.stubEnv('HOLOCI_WEBHOOK_SECRETS', undefined);
    const res = await post({ 'x-github-event': 'ping' });
    expect(res.status).toBe(200);
  });
});

describe('github webhook signature — secret configured', () => {
  const SECRET = 'whsec_for_tests_0123456789';

  it('accepts a correctly signed event and refuses a wrong signature', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', SECRET);
    vi.stubEnv('HOLOCI_WEBHOOK_SECRETS', undefined);
    const good = 'sha256=' + createHmac('sha256', SECRET).update(PING).digest('hex');
    expect((await post({ 'x-github-event': 'ping', 'x-hub-signature-256': good })).status).toBe(200);
    const bad = 'sha256=' + '0'.repeat(64);
    expect((await post({ 'x-github-event': 'ping', 'x-hub-signature-256': bad })).status).toBe(401);
  });
});

/**
 * The webhook route uses decideGithubCiDispatch. These cases check the HTTP
 * edge: same-repo agent pushes queue, fork agent pushes and pull_request do not.
 */
import { createHmac } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type * as http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleGithubWebhookRoutes } from '../github-webhook-routes';

vi.mock('../../../holo-ci-tools', () => ({
  buildWorkload: vi.fn(() => ({
    workload: { id: 'w', jobs: [] },
    contexts: ['holo-ci/type-check'],
  })),
  postGithubStatuses: vi.fn(async () => undefined),
  submitWorkload: vi.fn(async () => ({ ok: true, workloadId: 'w', jobIdToGate: {} })),
  pollWorkloadAndReport: vi.fn(async () => undefined),
}));

const SHA = '0123456789abcdef0123456789abcdef01234567';

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

function fakeReq(body: string, headers: Record<string, string>): http.IncomingMessage {
  const stream = Object.assign(new PassThrough(), { headers });
  stream.end(body);
  return stream as unknown as http.IncomingMessage;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('POST /webhook/github agent-branch admission', () => {
  const secret = 'whsec_dispatch_test';

  function pushBody(ref: string, fork: boolean): string {
    return JSON.stringify({
      ref,
      after: SHA,
      repository: { full_name: 'brianonbased-dev/HoloScript', fork },
      pusher: { name: 'agent' },
      head_commit: { message: 'agent push' },
    });
  }

  async function post(event: string, body: string, signed: boolean): Promise<FakeRes> {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', secret);
    vi.stubEnv('HOLOCI_WEBHOOK_SECRETS', undefined);
    const headers: Record<string, string> = { 'x-github-event': event };
    if (signed) {
      headers['x-hub-signature-256'] =
        'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
    }
    const res = new FakeRes();
    const handled = await handleGithubWebhookRoutes(
      fakeReq(body, headers),
      res as unknown as http.ServerResponse,
      '/webhook/github',
      'POST'
    );
    expect(handled).toBe(true);
    await new Promise((resolve) => setImmediate(resolve));
    return res;
  }

  it('queues a same-repo cursor branch push', async () => {
    const res = await post(
      'push',
      pushBody('refs/heads/cursor/restore-frontier-fallback-generic-4e0a', false),
      true
    );
    const parsed = JSON.parse(res.body) as { queued?: boolean; skipped?: boolean };
    expect(res.status).toBe(200);
    expect(parsed.queued).toBe(true);
    expect(parsed.skipped).toBeUndefined();
  });

  it('skips a fork cursor branch push', async () => {
    const res = await post(
      'push',
      pushBody('refs/heads/cursor/restore-frontier-fallback-generic-4e0a', true),
      true
    );
    const parsed = JSON.parse(res.body) as { skipped?: boolean; reason?: string };
    expect(parsed.skipped).toBe(true);
    expect(parsed.reason).toContain('fork');
  });

  it('skips pull_request even when the head is a same-repo agent branch', async () => {
    const body = JSON.stringify({
      action: 'opened',
      pull_request: {
        head: {
          ref: 'cursor/restore-frontier-fallback-generic-4e0a',
          sha: SHA,
          repo: { fork: false, full_name: 'brianonbased-dev/HoloScript' },
        },
      },
      repository: { full_name: 'brianonbased-dev/HoloScript', fork: false },
    });
    const res = await post('pull_request', body, true);
    const parsed = JSON.parse(res.body) as { skipped?: boolean; reason?: string };
    expect(parsed.skipped).toBe(true);
    expect(parsed.reason).toContain('pull_request');
  });

  it('keeps an unsigned production call refused', async () => {
    const res = await post('push', pushBody('refs/heads/cursor/x', false), false);
    expect(res.status).toBe(401);
  });
});

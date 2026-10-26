/**
 * HTTP edge of the webhook receiver. Agent-branch pushes queue. A same-repo
 * pull_request (opened/synchronize/reopened) queues its head commit; a fork PR,
 * or a PR whose agent-branch push already queued it, is skipped.
 */
import { createHmac } from 'node:crypto';
import { PassThrough } from 'node:stream';
import type * as http from 'http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleGithubWebhookRoutes, pullRequestDispatchTarget } from '../github-webhook-routes';
import { buildWorkload, postGithubStatuses, submitWorkload } from '../../../holo-ci-tools';

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
  vi.mocked(buildWorkload).mockClear();
  vi.mocked(postGithubStatuses).mockClear();
  vi.mocked(submitWorkload).mockClear();
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

  it('skips a pull_request from a fork head', async () => {
    const body = JSON.stringify({
      action: 'opened',
      pull_request: {
        head: {
          ref: 'cursor/from-a-fork',
          sha: SHA,
          repo: { fork: true, full_name: 'someone/HoloScript' },
        },
      },
      repository: { full_name: 'brianonbased-dev/HoloScript', fork: false },
    });
    const res = await post('pull_request', body, true);
    const parsed = JSON.parse(res.body) as { skipped?: boolean; reason?: string };
    expect(parsed.skipped).toBe(true);
    expect(parsed.reason).toContain('pull_request');
  });

  it('skips a same-repo agent-branch PR: its push already queued the commit', async () => {
    const body = prBody({ ref: 'cursor/restore-frontier-fallback-generic-4e0a' });
    const res = await post('pull_request', body, true);
    const parsed = JSON.parse(res.body) as { skipped?: boolean; reason?: string };
    expect(parsed.skipped).toBe(true);
    expect(parsed.reason).toContain('pull_request');
    expect(parsed.reason).toContain('push already dispatched');
    expect(buildWorkload).not.toHaveBeenCalled();
  });

  function prBody({
    action = 'opened',
    ref = 'grok/fix-something',
    sha = SHA,
    headRepo = 'brianonbased-dev/HoloScript' as string | null,
    baseRepo = 'brianonbased-dev/HoloScript',
    fork = false,
  } = {}): string {
    return JSON.stringify({
      action,
      number: 661,
      pull_request: {
        number: 661,
        title: 'fix: something',
        user: { login: 'agent' },
        head: { ref, sha, repo: headRepo === null ? null : { fork, full_name: headRepo } },
        base: { ref: 'main', repo: { full_name: baseRepo } },
      },
      repository: { full_name: baseRepo, fork: false },
    });
  }

  for (const action of ['opened', 'synchronize', 'reopened']) {
    it(`queues the head commit of a same-repo PR on ${action}, the way a push does`, async () => {
      const res = await post('pull_request', prBody({ action }), true);
      const parsed = JSON.parse(res.body) as { queued?: boolean; sha?: string };
      expect(res.status).toBe(200);
      expect(parsed.queued).toBe(true);
      expect(parsed.sha).toBe(SHA.slice(0, 8));
      expect(buildWorkload).toHaveBeenCalledWith({ repo: 'brianonbased-dev/HoloScript', sha: SHA, profile: 'quick' });
      expect(postGithubStatuses).toHaveBeenCalledWith('brianonbased-dev/HoloScript', SHA, ['holo-ci/type-check'], 'pending', 'HoloCI queued');
      expect(submitWorkload).toHaveBeenCalledTimes(1);
    });
  }

  it('skips other PR actions (closed, edited, labeled)', async () => {
    for (const action of ['closed', 'edited', 'labeled']) {
      const res = await post('pull_request', prBody({ action }), true);
      const parsed = JSON.parse(res.body) as { skipped?: boolean; reason?: string };
      expect(parsed.skipped).toBe(true);
      expect(parsed.reason).toContain(action);
    }
    expect(buildWorkload).not.toHaveBeenCalled();
  });

  it('skips a fork PR, a fork with the same repo name, and a deleted head repo', async () => {
    for (const body of [
      prBody({ headRepo: 'someone/HoloScript', fork: true }),
      prBody({ headRepo: 'someone/HoloScript', fork: false }),
      prBody({ headRepo: null }),
    ]) {
      const res = await post('pull_request', body, true);
      const parsed = JSON.parse(res.body) as { skipped?: boolean; reason?: string };
      expect(res.status).toBe(200);
      expect(parsed.skipped).toBe(true);
      expect(parsed.reason).toContain('not in the base repository');
    }
    expect(buildWorkload).not.toHaveBeenCalled();
    expect(postGithubStatuses).not.toHaveBeenCalled();
  });

  it('skips a PR with a malformed head sha', async () => {
    const res = await post('pull_request', prBody({ sha: 'not-a-sha' }), true);
    expect(JSON.parse(res.body).skipped).toBe(true);
    expect(buildWorkload).not.toHaveBeenCalled();
  });

  it('refuses an unsigned or wrongly signed pull_request before anything else', async () => {
    const unsigned = await post('pull_request', prBody(), false);
    expect(unsigned.status).toBe(401);
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('GITHUB_WEBHOOK_SECRET', secret);
    const body = prBody();
    const res = new FakeRes();
    await handleGithubWebhookRoutes(
      fakeReq(body, {
        'x-github-event': 'pull_request',
        'x-hub-signature-256': 'sha256=' + createHmac('sha256', 'wrong').update(body).digest('hex'),
      }),
      res as unknown as http.ServerResponse,
      '/webhook/github',
      'POST'
    );
    await new Promise((resolve) => setImmediate(resolve));
    expect(res.status).toBe(401);
    expect(buildWorkload).not.toHaveBeenCalled();
    expect(postGithubStatuses).not.toHaveBeenCalled();
  });

  it('pullRequestDispatchTarget compares repos case-insensitively and lowercases the sha', () => {
    const t = pullRequestDispatchTarget(
      JSON.parse(prBody({ headRepo: 'BrianOnBased-Dev/holoscript', sha: SHA.toUpperCase() }))
    );
    expect(t.ok).toBe(true);
    if (t.ok) expect(t.sha).toBe(SHA);
  });

  it('keeps an unsigned production call refused', async () => {
    const res = await post('push', pushBody('refs/heads/cursor/x', false), false);
    expect(res.status).toBe(401);
  });
});

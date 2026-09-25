/**
 * POST /webhook/github validates pull requests from every agent lane.
 *
 * The push path only covers main/master and claude/* / codex/* branches, so PRs from
 * cursor/*, claude1/*, hardware/* … never got HoloCI statuses. pull_request events for
 * a head in the same repository now queue the quick profile; fork heads never do.
 */
import { PassThrough } from 'node:stream';
import type * as http from 'http';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../holo-ci-tools', () => ({
  buildWorkload: vi.fn(() => ({ workload: { id: 'w' }, contexts: ['holo-ci/type-check'] })),
  postGithubStatuses: vi.fn(async () => undefined),
  submitWorkload: vi.fn(async () => ({ ok: false, error: 'not in tests' })),
  pollWorkloadAndReport: vi.fn(async () => undefined),
}));

const { handleGithubWebhookRoutes } = await import('../github-webhook-routes');
const { buildWorkload } = await import('../../../holo-ci-tools');

const REPO = 'brianonbased-dev/HoloScript';
const SHA = 'a'.repeat(40);

function prEvent(opts: { action?: string; ref?: string; headRepo?: string | null }): string {
  return JSON.stringify({
    action: opts.action ?? 'opened',
    number: 342,
    repository: { full_name: REPO },
    sender: { login: 'agent' },
    pull_request: {
      title: 'fix something',
      head: {
        sha: SHA,
        ref: opts.ref ?? 'cursor/fix-something',
        repo: opts.headRepo === null ? null : { full_name: opts.headRepo ?? REPO },
      },
    },
  });
}

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

async function deliver(body: string, event = 'pull_request'): Promise<Record<string, unknown>> {
  const res = new FakeRes();
  await handleGithubWebhookRoutes(
    fakeReq(body, { 'x-github-event': event }),
    res as unknown as http.ServerResponse,
    '/webhook/github',
    'POST'
  );
  expect(res.status).toBe(200);
  return JSON.parse(res.body) as Record<string, unknown>;
}

beforeEach(() => {
  // Local development with no secret keeps the documented signature skip.
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('GITHUB_WEBHOOK_SECRET', undefined);
  vi.stubEnv('HOLOCI_WEBHOOK_SECRETS', undefined);
  vi.mocked(buildWorkload).mockClear();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('github webhook — pull_request events', () => {
  it.each(['opened', 'reopened', 'synchronize', 'ready_for_review'])(
    'queues the quick profile for a same-repo head on "%s"',
    async (action) => {
      const out = await deliver(prEvent({ action }));
      expect(out.queued).toBe(true);
      expect(buildWorkload).toHaveBeenCalledWith({ repo: REPO, sha: SHA, profile: 'quick' });
    }
  );

  it('never dispatches a head from a fork', async () => {
    const out = await deliver(prEvent({ headRepo: 'someone/HoloScript' }));
    expect(out.skipped).toBe(true);
    expect(String(out.reason)).toMatch(/fork PRs are never run on the fleet/);
    expect(buildWorkload).not.toHaveBeenCalled();
  });

  it('never dispatches a head whose repository was deleted', async () => {
    const out = await deliver(prEvent({ headRepo: null }));
    expect(out.skipped).toBe(true);
    expect(buildWorkload).not.toHaveBeenCalled();
  });

  it('leaves claude/* and codex/* heads to their push event, so a sha is not run twice', async () => {
    for (const ref of ['claude/agent-context-ledger', 'codex/x']) {
      const out = await deliver(prEvent({ ref }));
      expect(out.skipped).toBe(true);
      expect(String(out.reason)).toMatch(/already validated by its push event/);
    }
    expect(buildWorkload).not.toHaveBeenCalled();
  });

  it('ignores actions that do not change the head (closed, labeled, edited)', async () => {
    for (const action of ['closed', 'labeled', 'edited']) {
      expect((await deliver(prEvent({ action }))).skipped).toBe(true);
    }
    expect(buildWorkload).not.toHaveBeenCalled();
  });
});

describe('github webhook — push events keep their behaviour', () => {
  const push = (ref: string) =>
    JSON.stringify({ ref, after: SHA, repository: { full_name: REPO }, pusher: { name: 'p' } });

  it('queues main and cloud-agent branch pushes', async () => {
    expect((await deliver(push('refs/heads/main'), 'push')).queued).toBe(true);
    expect((await deliver(push('refs/heads/claude/x'), 'push')).queued).toBe(true);
    expect(buildWorkload).toHaveBeenCalledTimes(2);
  });

  it('still skips pushes to other branches; their PR events cover them', async () => {
    expect((await deliver(push('refs/heads/cursor/x'), 'push')).skipped).toBe(true);
    expect(buildWorkload).not.toHaveBeenCalled();
  });
});

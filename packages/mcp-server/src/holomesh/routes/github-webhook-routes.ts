/**
 * github-webhook-routes.ts — inbound GitHub webhook handler.
 *
 * POST /webhook/github  - push on main/master, and push on agent branches
 * (claude*, codex*, cursor*, hardware*), runs the quick-profile HoloCI dispatch.
 * pull_request (opened, synchronize, reopened) runs the same dispatch for the PR
 * head commit, but only when the head branch lives in the same repository as the
 * base (head.repo.full_name === base.repo.full_name). A fork PR is skipped, so no
 * outside code is checked out on the fleet. A PR whose head is an agent branch is
 * skipped too: that branch's push already dispatched the same commit.
 * Other events are acknowledged and skipped. The signature is verified first.
 *
 * Required Railway env vars on mcp-server:
 *   GITHUB_WEBHOOK_SECRET  — matches the secret set in GitHub repo Settings → Webhooks
 *   GITHUB_TOKEN           — PAT with repo:status scope (posts pending/pass/fail statuses)
 *   HOLOSCRIPT_API_KEY     — orchestrator key (already provisioned for holo_ci_dispatch)
 *   HOLOMESH_TEAM_ID       — team ID for room notifications
 *
 * Setup:
 *   https://github.com/brianonbased-dev/HoloScript/settings/hooks
 *   URL:           https://mcp-server-production-7879.up.railway.app/webhook/github
 *                  (not mcp-holoscript-production.up.railway.app: that host answers
 *                  "Application not found", so a hook pointed there never arrives.
 *                  mcp.holoscript.net is a historical vanity host and is not the
 *                  configured receiver)
 *   Content-Type:  application/json
 *   Events:        Pushes, and Pull requests (fork PRs are refused in code)
 *   Secret:        value of GITHUB_WEBHOOK_SECRET
 *
 * For Hololand: add a second webhook pointing to the same URL — the repo slug in
 * the push payload is used to select the matching gate catalog automatically.
 */
import type http from 'http';
import { createHmac } from 'node:crypto';
import { json } from '../utils';
import {
  buildWorkload,
  postGithubStatuses,
  submitWorkload,
  pollWorkloadAndReport,
} from '../../holo-ci-tools';
import { teamMessageStore } from '../state';
import { broadcastToRoom } from '../team-room';
import type { TeamMessage } from '../types';
import { isGithubCiPushRef } from './github-webhook-dispatch';

const TEAM_ID = process.env.HOLOMESH_TEAM_ID || '';

function verifyGithubSignature(
  body: string,
  signature: string | undefined,
  repoSecret?: string
): boolean {
  const secret = repoSecret || process.env.GITHUB_WEBHOOK_SECRET || '';
  if (!secret.trim()) {
    // Unconfigured (missing or blank) secret. In production that is a
    // misconfiguration and must fail closed — otherwise anyone can POST a fake
    // push and trigger CI dispatch. Local dev keeps the skip.
    return process.env.NODE_ENV !== 'production';
  }
  if (!signature) return false;
  const expected = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function getWebhookSecret(repo: string): string | undefined {
  try {
    const raw = process.env.HOLOCI_WEBHOOK_SECRETS?.trim();
    if (!raw) return undefined;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const found = map[repo];
    return typeof found === 'string' && found.length > 0 ? found : undefined;
  } catch {
    return undefined;
  }
}

function postToRoom(content: string): void {
  if (!TEAM_ID) return;
  const msg: TeamMessage = {
    id: `github-ci-${Date.now().toString(36)}`,
    teamId: TEAM_ID,
    fromAgentId: 'github-webhook',
    fromAgentName: 'GitHub',
    content,
    messageType: 'text',
    createdAt: new Date().toISOString(),
  };
  const messages = teamMessageStore.get(TEAM_ID) || [];
  messages.push(msg);
  teamMessageStore.set(TEAM_ID, messages.slice(-500));
  broadcastToRoom(TEAM_ID, { type: 'team:message', agent: 'GitHub', data: msg });
}

type PullRequestEvent = {
  action?: string;
  number?: number;
  pull_request?: {
    number?: number;
    title?: string;
    user?: { login?: string };
    head?: { ref?: string; sha?: string; repo?: { full_name?: string; fork?: boolean } | null };
    base?: { ref?: string; repo?: { full_name?: string } };
  };
  repository?: { full_name?: string };
  sender?: { login?: string };
};

/** PR actions that put a new head commit in front of reviewers. */
const PR_DISPATCH_ACTIONS = new Set(['opened', 'synchronize', 'reopened']);

/**
 * Decide a pull_request delivery: the commit to run, or why it is skipped.
 * Same-repo only: head.repo must be present and equal base.repo (and the
 * delivery's repository). A deleted or forked head repo never dispatches.
 */
export function pullRequestDispatchTarget(
  body: PullRequestEvent
): { ok: true; repo: string; sha: string; ref: string; number: number | undefined; actor: string; title: string } | { ok: false; reason: string } {
  const action = String(body.action || '');
  if (!PR_DISPATCH_ACTIONS.has(action)) {
    return { ok: false, reason: `pull_request action "${action}" not handled (only opened, synchronize, reopened)` };
  }
  const pr = body.pull_request || {};
  const headRepo = String(pr.head?.repo?.full_name || '');
  const baseRepo = String(pr.base?.repo?.full_name || '');
  const deliveryRepo = String(body.repository?.full_name || '');
  if (
    !headRepo ||
    !baseRepo ||
    headRepo.toLowerCase() !== baseRepo.toLowerCase() ||
    (deliveryRepo && deliveryRepo.toLowerCase() !== baseRepo.toLowerCase())
  ) {
    return { ok: false, reason: 'pull_request head is not in the base repository (fork or deleted head repo); not dispatched' };
  }
  const ref = String(pr.head?.ref || '');
  if (isGithubCiPushRef(`refs/heads/${ref}`)) {
    return { ok: false, reason: `pull_request head "${ref}" is an agent branch; its push already dispatched this commit` };
  }
  const sha = String(pr.head?.sha || '');
  if (!/^[0-9a-f]{40}$/i.test(sha)) {
    return { ok: false, reason: 'pull_request head sha is missing or malformed' };
  }
  return {
    ok: true,
    repo: baseRepo,
    sha: sha.toLowerCase(),
    ref,
    number: pr.number ?? body.number,
    actor: String(pr.user?.login || body.sender?.login || 'unknown'),
    title: String(pr.title || '').split('\n')[0].slice(0, 72),
  };
}

/**
 * Build, answer GitHub, then post pending, submit, and watch in the background.
 * Shared by push and pull_request so both dispatch exactly the same way.
 */
function queueHoloCi(
  res: http.ServerResponse,
  { repoFull, sha, actor, note, via }: { repoFull: string; sha: string; actor: string; note: string; via: string }
): void {
  let built: ReturnType<typeof buildWorkload>;
  try {
    built = buildWorkload({ repo: repoFull, sha, profile: 'quick' });
  } catch (err) {
    // Repo not in allowlist or malformed sha - ack without dispatching
    json(res, 200, {
      ok: true,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    });
    return;
  }

  // Respond to GitHub immediately - don't block on fleet latency
  json(res, 200, { ok: true, queued: true, sha: sha.slice(0, 8), gates: built.contexts.length });

  setImmediate(async () => {
    const shortSha = sha.slice(0, 8);
    try {
      await postGithubStatuses(repoFull, sha, built.contexts, 'pending', 'HoloCI queued');
      const result = await submitWorkload(built.workload);
      if (result.ok) {
        const msgParts = [`⏳ HoloCI queued — ${repoFull}@${shortSha}`];
        if (actor !== 'unknown') msgParts.push(`${via} by ${actor}`);
        if (note) msgParts.push(`"${note}"`);
        msgParts.push(`(${built.contexts.length} gates · ${result.workloadId})`);
        postToRoom(msgParts.join(' '));
        pollWorkloadAndReport({
          repo: repoFull,
          sha,
          workloadId: result.workloadId!,
          jobIdToGate: result.jobIdToGate ?? {},
          timeoutMs: 10 * 60 * 1000,
        }).catch(() => {
          /* non-fatal */
        });
      } else {
        postToRoom(`❌ HoloCI dispatch failed — ${repoFull}@${shortSha}: ${result.error}`);
        await postGithubStatuses(repoFull, sha, built.contexts, 'error', 'HoloCI dispatch failed');
      }
    } catch {
      // Non-fatal - webhook already responded 200
    }
  });
}

type PushEvent = {
  ref?: string;
  after?: string;
  repository?: { full_name?: string };
  pusher?: { name?: string };
  head_commit?: { message?: string };
};

export async function handleGithubWebhookRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string
): Promise<boolean> {
  if (pathname !== '/webhook/github' || method !== 'POST') return false;

  let rawBody = '';
  try {
    rawBody = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size < 256_000) chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  } catch {
    json(res, 400, { error: 'bad_body' });
    return true;
  }

  const sig = req.headers['x-hub-signature-256'] as string | undefined;
  // Resolve per-repo secret before verifying (HOLOCI_WEBHOOK_SECRETS env JSON map).
  // Pre-parse the repo slug from raw body to look up the secret — safe because we
  // haven't trusted the body yet (we're just picking a key for HMAC selection).
  let earlyRepo = '';
  try {
    const peek = JSON.parse(rawBody) as { repository?: { full_name?: string } };
    earlyRepo = String(peek?.repository?.full_name || '');
  } catch {
    /* use global secret */
  }
  if (!verifyGithubSignature(rawBody, sig, getWebhookSecret(earlyRepo))) {
    json(res, 401, { error: 'invalid_signature' });
    return true;
  }

  const event = req.headers['x-github-event'] as string | undefined;
  if (event === 'pull_request') {
    let prBody: PullRequestEvent;
    try {
      prBody = JSON.parse(rawBody) as PullRequestEvent;
    } catch {
      json(res, 400, { error: 'invalid_json' });
      return true;
    }
    const target = pullRequestDispatchTarget(prBody);
    if (!target.ok) {
      json(res, 200, { ok: true, skipped: true, reason: target.reason });
      return true;
    }
    queueHoloCi(res, {
      repoFull: target.repo,
      sha: target.sha,
      actor: target.actor,
      note: target.number !== undefined ? `PR #${target.number} ${target.title}`.trim() : target.title,
      via: 'pull request',
    });
    return true;
  }
  if (event !== 'push') {
    // ping, create, delete, etc. — ack but don't dispatch
    json(res, 200, { ok: true, skipped: true, reason: `event "${event}" not handled` });
    return true;
  }

  let body: PushEvent;
  try {
    body = JSON.parse(rawBody) as PushEvent;
  } catch {
    json(res, 400, { error: 'invalid_json' });
    return true;
  }

  const ref = String(body.ref || '');
  const sha = String(body.after || '');
  const repoFull = String(body.repository?.full_name || '');
  const pusher = String(body.pusher?.name || 'unknown');
  const commitMsg = (body.head_commit?.message || '').split('\n')[0].slice(0, 72);

  // main/master, plus same-repo agent prefixes. Fork pull requests never reach
  // this branch: non-push events return above. Other repo slugs are refused
  // later by the workload allowlist, so an outside copy is not checked out.
  if (!isGithubCiPushRef(ref)) {
    json(res, 200, {
      ok: true,
      skipped: true,
      reason: `ref "${ref}" is not main/master or an agent branch (claude*/codex*/cursor*/hardware*)`,
    });
    return true;
  }

  // Deleted branch push — sha is all zeros
  if (!sha || /^0+$/.test(sha)) {
    json(res, 200, { ok: true, skipped: true, reason: 'branch deletion' });
    return true;
  }

  // Quick-profile workload - fast static gates on every push
  queueHoloCi(res, { repoFull, sha, actor: pusher, note: commitMsg, via: 'pushed' });
  return true;
}

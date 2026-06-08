/**
 * github-webhook-routes.ts — inbound GitHub webhook handler.
 *
 * POST /webhook/github  — push events on main → quick-profile HoloCI dispatch
 *
 * Required Railway env vars on mcp-server:
 *   GITHUB_WEBHOOK_SECRET  — matches the secret set in GitHub repo Settings → Webhooks
 *   GITHUB_TOKEN           — PAT with repo:status scope (posts pending/pass/fail statuses)
 *   HOLOSCRIPT_API_KEY     — orchestrator key (already provisioned for holo_ci_dispatch)
 *   HOLOMESH_TEAM_ID       — team ID for room notifications
 *
 * Setup:
 *   https://github.com/brianonbased-dev/HoloScript/settings/hooks
 *   URL:           https://mcp-holoscript-production.up.railway.app/webhook/github
 *   Content-Type:  application/json
 *   Events:        Push events (just push — PRs trigger dispatch manually via holo_ci_dispatch)
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

const TEAM_ID = process.env.HOLOMESH_TEAM_ID || '';

function verifyGithubSignature(
  body: string,
  signature: string | undefined,
  repoSecret?: string
): boolean {
  const secret = repoSecret || process.env.GITHUB_WEBHOOK_SECRET || '';
  if (!secret) return true; // dev: skip verification when secret not configured
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

  // Only dispatch for pushes to the default branch
  if (ref !== 'refs/heads/main' && ref !== 'refs/heads/master') {
    json(res, 200, { ok: true, skipped: true, reason: `ref "${ref}" is not main/master` });
    return true;
  }

  // Deleted branch push — sha is all zeros
  if (!sha || /^0+$/.test(sha)) {
    json(res, 200, { ok: true, skipped: true, reason: 'branch deletion' });
    return true;
  }

  // Build quick-profile workload — fast static gates on every push
  let built: ReturnType<typeof buildWorkload>;
  try {
    built = buildWorkload({ repo: repoFull, sha, profile: 'quick' });
  } catch (err) {
    // Repo not in allowlist or malformed sha — ack without dispatching
    json(res, 200, {
      ok: true,
      skipped: true,
      reason: err instanceof Error ? err.message : String(err),
    });
    return true;
  }

  // Respond to GitHub immediately — don't block on fleet latency
  json(res, 200, { ok: true, queued: true, sha: sha.slice(0, 8), gates: built.contexts.length });

  // Post pending statuses → submit to fleet → room notify (all non-blocking)
  setImmediate(async () => {
    const shortSha = sha.slice(0, 8);
    try {
      await postGithubStatuses(repoFull, sha, built.contexts, 'pending', 'HoloCI queued');
      const result = await submitWorkload(built.workload);
      if (result.ok) {
        const msgParts = [`⏳ HoloCI queued — ${repoFull}@${shortSha}`];
        if (pusher !== 'unknown') msgParts.push(`pushed by ${pusher}`);
        if (commitMsg) msgParts.push(`"${commitMsg}"`);
        msgParts.push(`(${built.contexts.length} gates · ${result.workloadId})`);
        postToRoom(msgParts.join(' '));
        // Background: poll until gates complete, then post final statuses.
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
      // Non-fatal — webhook already responded 200
    }
  });

  return true;
}

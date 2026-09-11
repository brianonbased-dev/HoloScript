/**
 * webhook-routes.ts — inbound webhook handlers for external service events.
 *
 * POST /webhook/railway  — All Railway event types → team room message
 *
 * Handles every event Railway can send:
 *   Deployment: Crashed, OOM Killed, Failed, Deployed, Redeployed, Slept,
 *               Resumed, Restarted, Removed, Building, Deploying, Waiting,
 *               Needs Approval, Queued
 *   VolumeAlert: Triggered, Resolved
 *   Monitor:     Triggered, Resolved, Deleted
 *
 * HOW TO CONFIGURE IT, and note the ?token= — it is the whole authentication.
 * Railway does NOT sign webhook payloads (docs.railway.com/observability/webhooks,
 * read 2026-09-11); it recommends putting a secret in the URL instead. So set
 * RAILWAY_WEBHOOK_SECRET in the mcp-server service variables, then in the Railway
 * project's Settings -> Webhooks tab (PROJECT settings, not service) add:
 *
 *   https://mcp.holoscript.net/webhook/railway?token=<RAILWAY_WEBHOOK_SECRET>
 *
 * Append &team=<id> to override HOLOMESH_TEAM_ID per webhook; otherwise set
 * HOLOMESH_TEAM_ID so messages route to the right room.
 *
 * Do not expect an x-railway-signature header. One is accepted if present, but
 * nothing Railway sends carries it.
 */
import type http from 'http';
import { createHmac } from 'node:crypto';
import { json } from '../utils';
import { teamMessageStore } from '../state';
import { broadcastToRoom } from '../team-room';
import type { TeamMessage } from '../types';

const TEAM_ID = process.env.HOLOMESH_TEAM_ID || '';
const WEBHOOK_SECRET = process.env.RAILWAY_WEBHOOK_SECRET || '';

/** Constant-time string compare, so a shared secret cannot be guessed byte by byte. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Accept a Railway webhook, by the mechanism Railway ACTUALLY uses.
 *
 * RAILWAY DOES NOT SIGN WEBHOOK PAYLOADS. Their documentation
 * (docs.railway.com/observability/webhooks, read 2026-09-11) says so outright —
 * "Webhook payloads are not cryptographically signed" — and recommends instead
 * that you "include a secret in the webhook URL you configure". There is no
 * `x-railway-signature` header, and there never was.
 *
 * This file previously verified an HMAC-SHA256 of the body against that header,
 * which no real Railway request carries. That was harmless only because the route
 * was unreachable. When I made it reachable earlier today I kept the signature
 * check, which would have turned "every alert 404s" into "every alert 401s" — the
 * same silence, one status code further on, and I would have reported it fixed.
 * The assumption that a webhook provider signs its payloads was never checked
 * against Railway's own docs until after the fix was written.
 *
 * So the shared secret travels in the URL, as Railway intends: configure
 *     https://mcp.holoscript.net/webhook/railway?token=<RAILWAY_WEBHOOK_SECRET>
 * The HMAC path is kept because it costs nothing and a proxy in front of us may
 * add a signature, but it is no longer the only way in.
 *
 * With no secret configured this refuses everything, regardless of NODE_ENV —
 * see the note on that below.
 */
export function verifyRailwayRequest(
  url: string,
  body: string,
  signature: string | undefined
): boolean {
  if (!WEBHOOK_SECRET) return false;

  // 1. The documented mechanism: a secret in the URL.
  let token = '';
  try {
    const params = new URL(url, 'https://mcp.invalid').searchParams;
    token = params.get('token') || params.get('secret') || '';
  } catch {
    token = '';
  }
  if (token && secretsMatch(token, WEBHOOK_SECRET)) return true;

  // 2. Optional belt-and-braces for anything that DOES sign.
  return verifyRailwaySignature(body, signature);
}

export function verifyRailwaySignature(body: string, signature: string | undefined): boolean {
  if (!WEBHOOK_SECRET) {
    // NO SECRET MEANS NO, AND IT NO LONGER DEPENDS ON NODE_ENV.
    //
    // This used to accept ANY unsigned body when NODE_ENV !== 'production', for
    // local-dev convenience. That was harmless only while the route was
    // unreachable (see the routing fix in http-server.ts, 2026-09-11) — the
    // moment it could be reached, it became an open endpoint that writes into a
    // team room, gated by a variable nobody had verified was set on the deployed
    // box. I could not confirm NODE_ENV there from a read-only session, and a
    // security property that rests on an environment variable you cannot see is
    // not a property at all.
    //
    // So: unconfigured secret → refuse, everywhere. Local testing sets
    // RAILWAY_WEBHOOK_SECRET to any value and signs with it; that is a smaller
    // cost than an unauthenticated writer.
    return false;
  }
  if (!signature) return false;
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++)
    diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

type Sub<T extends string> = T;

// ── Emoji + label tables ─────────────────────────────────────────────────────

const DEPLOYMENT_STATUS: Record<string, { emoji: string; label: string; silent?: boolean }> = {
  CRASHED: { emoji: '💥', label: 'crashed' },
  OOM_KILLED: { emoji: '🧠', label: 'OOM killed' },
  FAILED: { emoji: '❌', label: 'failed' },
  DEPLOYED: { emoji: '✅', label: 'deployed' },
  REDEPLOYED: { emoji: '♻️', label: 'redeployed' },
  SUCCESS: { emoji: '✅', label: 'deployed' },
  SLEPT: { emoji: '😴', label: 'slept' },
  RESUMED: { emoji: '▶️', label: 'resumed' },
  RESTARTED: { emoji: '🔄', label: 'restarted' },
  REMOVED: { emoji: '🗑️', label: 'removed' },
  BUILDING: { emoji: '🔨', label: 'building', silent: true },
  DEPLOYING: { emoji: '🚀', label: 'deploying', silent: true },
  WAITING: { emoji: '⏳', label: 'waiting', silent: true },
  NEEDS_APPROVAL: { emoji: '🔐', label: 'needs approval' },
  QUEUED: { emoji: '📋', label: 'queued', silent: true },
};

// ── Event builders ────────────────────────────────────────────────────────────

function field(obj: unknown, key: string): string {
  return ((obj as Record<string, unknown>)?.[key] as string) || '';
}
function nested(obj: unknown, ...keys: string[]): unknown {
  let cur = obj;
  for (const k of keys) cur = (cur as Record<string, unknown>)?.[k];
  return cur;
}

function buildDeploymentMessage(body: Record<string, unknown>): string | null {
  const raw = (field(body, 'status') || field(nested(body, 'deployment'), 'status')).toUpperCase();
  const entry = DEPLOYMENT_STATUS[raw];
  if (!entry) return null;
  if (entry.silent) return null; // suppress noisy in-progress events

  const svc = field(nested(body, 'service'), 'name') || 'service';
  const env = field(nested(body, 'environment'), 'name');
  const meta = (nested(body, 'deployment', 'meta') as Record<string, string>) || {};
  const sha = (meta.commitHash || meta.commitSha || '').slice(0, 8);
  const msg = (meta.commitMessage || '').split('\n')[0].slice(0, 72);
  const proj = field(nested(body, 'project'), 'name');

  const parts = [`${entry.emoji} Railway ${svc} ${entry.label}`];
  if (env) parts.push(`(${env})`);
  if (sha) parts.push(`@ ${sha}`);
  if (msg) parts.push(`"${msg}"`);
  if (proj && proj !== svc) parts.push(`[${proj}]`);
  return parts.join(' ');
}

function buildVolumeAlertMessage(body: Record<string, unknown>): string | null {
  const status = field(body, 'status').toUpperCase();
  const emoji = status === 'TRIGGERED' ? '⚠️' : status === 'RESOLVED' ? '✅' : '📦';
  const label =
    status === 'TRIGGERED'
      ? 'volume alert triggered'
      : status === 'RESOLVED'
        ? 'volume alert resolved'
        : `volume ${status.toLowerCase()}`;
  const vol = field(nested(body, 'volume'), 'name') || field(body, 'volumeName') || 'volume';
  const proj = field(nested(body, 'project'), 'name');
  const parts = [`${emoji} Railway ${label} — ${vol}`];
  if (proj) parts.push(`[${proj}]`);
  return parts.join(' ');
}

function buildMonitorMessage(body: Record<string, unknown>): string | null {
  const status = field(body, 'status').toUpperCase();
  const emoji =
    status === 'TRIGGERED'
      ? '🚨'
      : status === 'RESOLVED'
        ? '✅'
        : status === 'DELETED'
          ? '🗑️'
          : '📊';
  const label =
    status === 'TRIGGERED'
      ? 'monitor triggered'
      : status === 'RESOLVED'
        ? 'monitor resolved'
        : status === 'DELETED'
          ? 'monitor deleted'
          : `monitor ${status.toLowerCase()}`;
  const name = field(nested(body, 'monitor'), 'name') || field(body, 'monitorName') || 'monitor';
  const proj = field(nested(body, 'project'), 'name');
  const parts = [`${emoji} Railway ${label} — ${name}`];
  if (proj) parts.push(`[${proj}]`);
  return parts.join(' ');
}

function buildEventMessage(body: Record<string, unknown>): string | null {
  const type = field(body, 'type').toUpperCase().replace(/-/g, '_');

  if (type === 'DEPLOYMENT' || type === 'DEPLOY') return buildDeploymentMessage(body);
  if (type === 'VOLUME_ALERT' || type === 'VOLUMEALERT') return buildVolumeAlertMessage(body);
  if (type === 'MONITOR') return buildMonitorMessage(body);

  // Unknown type — post a generic notice so we don't silently drop it.
  return `🔔 Railway event: ${type}`;
}

// ── Route handler ─────────────────────────────────────────────────────────────

export async function handleWebhookRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
  url: string = pathname
): Promise<boolean> {
  if (pathname !== '/webhook/railway' || method !== 'POST') return false;

  // Team ID: prefer ?team= query param so each user can configure their own
  // webhook URL without server-side env vars. Falls back to HOLOMESH_TEAM_ID.
  const teamId = new URL(url, 'http://localhost').searchParams.get('team') || TEAM_ID;

  let rawBody = '';
  try {
    rawBody = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      let size = 0;
      req.on('data', (c: Buffer) => {
        size += c.length;
        if (size < 64_000) chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  } catch {
    json(res, 400, { error: 'bad_body' });
    return true;
  }

  const sig = req.headers['x-railway-signature'] as string | undefined;
  if (!verifyRailwayRequest(url, rawBody, sig)) {
    json(res, 401, { error: 'invalid_signature' });
    return true;
  }

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(rawBody);
  } catch {
    json(res, 400, { error: 'invalid_json' });
    return true;
  }

  const content = buildEventMessage(body);
  if (content && teamId) {
    const msg: TeamMessage = {
      id: `railway-${Date.now().toString(36)}`,
      teamId,
      fromAgentId: 'railway-webhook',
      fromAgentName: 'Railway',
      content,
      messageType: 'text',
      createdAt: new Date().toISOString(),
    };
    const messages = teamMessageStore.get(teamId) || [];
    messages.push(msg);
    teamMessageStore.set(teamId, messages.slice(-500));
    broadcastToRoom(teamId, { type: 'team:message', agent: 'Railway', data: msg });
  }

  json(res, 200, { ok: true });
  return true;
}

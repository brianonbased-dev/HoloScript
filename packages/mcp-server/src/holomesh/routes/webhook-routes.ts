/**
 * webhook-routes.ts — inbound webhook handlers for external service events.
 *
 * Currently wired:
 *   POST /webhook/railway  — Railway deploy status events → team room message
 *
 * Railway sends a JSON payload with an HMAC-SHA256 signature in the
 * X-Railway-Signature header (hex, keyed by RAILWAY_WEBHOOK_SECRET).
 * If the env var is not set, signature validation is skipped (dev mode).
 * Set RAILWAY_WEBHOOK_SECRET in the Railway environment vars and add the
 * webhook in the Railway dashboard pointing to:
 *   https://<mcp-domain>/webhook/railway
 */
import type http from 'http';
import { createHmac } from 'node:crypto';
import { json, parseJsonBody } from '../utils';
import { teamMessageStore } from '../state';
import { broadcastToRoom } from '../team-room';
import type { TeamMessage } from '../types';

const TEAM_ID = process.env.HOLOMESH_TEAM_ID || '';
const WEBHOOK_SECRET = process.env.RAILWAY_WEBHOOK_SECRET || '';

function verifyRailwaySignature(body: string, signature: string | undefined): boolean {
  if (!WEBHOOK_SECRET) return true; // skip if no secret configured
  if (!signature) return false;
  const expected = createHmac('sha256', WEBHOOK_SECRET).update(body).digest('hex');
  // Constant-time comparison to avoid timing attacks
  if (expected.length !== signature.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
  return diff === 0;
}

function deployStatusEmoji(status: string): string {
  switch (status?.toUpperCase()) {
    case 'SUCCESS': return '✅';
    case 'FAILED':  return '❌';
    case 'CRASHED': return '💥';
    case 'REMOVED': return '🗑️';
    default:        return '🔄';
  }
}

function buildDeployMessage(body: Record<string, unknown>): string | null {
  const type = (body.type as string || '').toUpperCase();
  if (type !== 'DEPLOY') return null; // only handle deploy events for now

  const status     = (body.status as string) || ((body.deployment as Record<string, unknown>)?.status as string) || 'UNKNOWN';
  const svcName    = (body.service as Record<string, unknown>)?.name as string || 'unknown-service';
  const envName    = (body.environment as Record<string, unknown>)?.name as string || '';
  const meta       = (body.deployment as Record<string, unknown>)?.meta as Record<string, unknown> || {};
  const commitHash = (meta.commitHash as string || '').slice(0, 8);
  const commitMsg  = (meta.commitMessage as string || '').split('\n')[0].slice(0, 80);
  const projName   = (body.project as Record<string, unknown>)?.name as string || '';

  const emoji = deployStatusEmoji(status);
  const parts = [`${emoji} Railway deploy ${status.toLowerCase()}`];
  if (svcName) parts.push(`— ${svcName}`);
  if (envName) parts.push(`(${envName})`);
  if (commitHash) parts.push(`@ ${commitHash}`);
  if (commitMsg) parts.push(`"${commitMsg}"`);
  if (projName && projName !== svcName) parts.push(`[${projName}]`);
  return parts.join(' ');
}

export async function handleWebhookRoutes(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  method: string,
): Promise<boolean> {

  if (pathname !== '/webhook/railway' || method !== 'POST') return false;

  let rawBody = '';
  try {
    // Parse raw body for signature verification, then re-parse as JSON.
    rawBody = await new Promise<string>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => { if (chunks.reduce((s, b) => s + b.length, 0) < 64_000) chunks.push(c); });
      req.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      req.on('error', reject);
    });
  } catch {
    json(res, 400, { error: 'bad_body' });
    return true;
  }

  const sig = req.headers['x-railway-signature'] as string | undefined;
  if (!verifyRailwaySignature(rawBody, sig)) {
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

  const content = buildDeployMessage(body);
  if (content && TEAM_ID) {
    const msg: TeamMessage = {
      id: `railway-${Date.now().toString(36)}`,
      teamId: TEAM_ID,
      fromAgentId: 'railway-webhook',
      fromAgentName: 'Railway',
      content,
      messageType: 'text',
      createdAt: new Date().toISOString(),
    };
    const messages = teamMessageStore.get(TEAM_ID) || [];
    messages.push(msg);
    teamMessageStore.set(TEAM_ID, messages.slice(-500));
    broadcastToRoom(TEAM_ID, { type: 'team:message', agent: 'Railway', data: msg });
  }

  json(res, 200, { ok: true });
  return true;
}

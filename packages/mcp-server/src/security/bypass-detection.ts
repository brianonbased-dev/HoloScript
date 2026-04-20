/**
 * Heuristic rate-limit bypass / evasion detection (P.009.02).
 *
 * - Many distinct client IPs from the same IPv4 /24 calling the same tool within a short window.
 * - Many distinct bearer tokens from the same direct client IP (rapid key rotation).
 * - Suspicious X-Forwarded-For chains (possible spoofing).
 *
 * Optional env:
 * - BYPASS_DETECTION_ENABLED — set to "false" to disable (default: on).
 * - BYPASS_SUBNET_IP_THRESHOLD — default 10 (unique IPs per /24 per tool per minute).
 * - BYPASS_TOKEN_DIVERSITY_THRESHOLD — default 12 distinct tokens per IP per 5 minutes.
 * - BYPASS_BLOCK_SUBNET_MS — default 3_600_000 (1h).
 * - BYPASS_BLOCK_IP_MS — default 3_600_000 (1h) for token-rotation / XFF abuse.
 * - SLACK_SECURITY_WEBHOOK_URL — incoming webhook for alerts (optional).
 */

import { createHash } from 'crypto';
import type http from 'http';

const TOOL_WINDOW_MS = 60_000;
const TOKEN_WINDOW_MS = 300_000;

function enabled(): boolean {
  return process.env.BYPASS_DETECTION_ENABLED !== 'false';
}

function subnetThreshold(): number {
  const n = parseInt(process.env.BYPASS_SUBNET_IP_THRESHOLD || '10', 10);
  return Number.isFinite(n) && n >= 2 ? n : 10;
}

function tokenThreshold(): number {
  const n = parseInt(process.env.BYPASS_TOKEN_DIVERSITY_THRESHOLD || '12', 10);
  return Number.isFinite(n) && n >= 4 ? n : 12;
}

function subnetBlockMs(): number {
  const n = parseInt(process.env.BYPASS_BLOCK_SUBNET_MS || String(3_600_000), 10);
  return Number.isFinite(n) && n > 0 ? n : 3_600_000;
}

function ipBlockMs(): number {
  const n = parseInt(process.env.BYPASS_BLOCK_IP_MS || String(3_600_000), 10);
  return Number.isFinite(n) && n > 0 ? n : 3_600_000;
}

/** subnet /24 -> unblock at */
const blockedSubnets = new Map<string, number>();
/** direct IP -> unblock at */
const blockedIps = new Map<string, number>();

/** key: `${tool}:${subnet}` -> ip -> last seen ms */
const toolSubnetIps = new Map<string, Map<string, number>>();
/** key: directIp -> tokenHash -> last seen ms */
const ipTokens = new Map<string, Map<string, number>>();

export function ipv4Subnet24(ip: string): string | null {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.\d{1,3}$/);
  if (!m) return null;
  const a = Number(m[1]);
  const b = Number(m[2]);
  const c = Number(m[3]);
  if ([a, b, c].some((x) => x > 255)) return null;
  return `${a}.${b}.${c}.0/24`;
}

function isPrivateIPv4(ip: string): boolean {
  const m = ip.trim().match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  return false;
}

/**
 * Detect implausible XFF chains (spoofing / pen-test noise).
 * `tcpPeer` is the raw remote socket address (optional); compared to claimed client chain.
 */
export function analyzeXForwardedFor(
  xff: string | undefined,
  tcpPeer?: string
): { suspicious: boolean; reason?: string } {
  if (!xff || !xff.trim()) return { suspicious: false };
  const hops = xff
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (hops.length > 6) {
    return { suspicious: true, reason: `xff_hop_count_${hops.length}` };
  }
  const left = hops[0];
  const peer = tcpPeer?.replace(/^::ffff:/, '') || '';
  if (
    peer &&
    left &&
    /^[\d.]+$/.test(left) &&
    isPrivateIPv4(left) &&
    !isPrivateIPv4(peer)
  ) {
    return { suspicious: true, reason: 'xff_private_left_public_peer' };
  }
  const uniq = new Set(hops);
  if (hops.length >= 4 && uniq.size < hops.length - 1) {
    return { suspicious: true, reason: 'xff_duplicate_hops' };
  }
  return { suspicious: false };
}

function tokenFingerprint(raw: string): string {
  return createHash('sha256').update(raw).digest('hex').slice(0, 20);
}

function pruneMap(m: Map<string, number>, cutoff: number): void {
  for (const [k, t] of m) {
    if (t < cutoff) m.delete(k);
  }
}

function nowBlockReason(ip: string): string | undefined {
  const t = blockedIps.get(ip);
  if (t && t > Date.now()) return 'direct_ip_blocked';
  const sub = ipv4Subnet24(ip);
  if (sub) {
    const u = blockedSubnets.get(sub);
    if (u && u > Date.now()) return 'subnet_blocked';
  }
  return undefined;
}

async function slackAlert(text: string): Promise<void> {
  const url = process.env.SLACK_SECURITY_WEBHOOK_URL?.trim();
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: `[HoloScript MCP] ${text}` }),
    });
  } catch {
    /* ignore */
  }
}

export interface BypassCheckInput {
  toolName: string;
  /** Trusted client IP (e.g. first hop from proxy) */
  directIp?: string;
  /** Raw TCP peer (for XFF spoof heuristics) */
  tcpPeerIp?: string;
  rawXForwardedFor?: string;
  bearerToken?: string;
}

export interface BypassCheckResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Apply heuristics for this tool call. When blocked, callers should deny before gates.
 */
export async function checkRateLimitBypass(input: BypassCheckInput): Promise<BypassCheckResult> {
  if (!enabled()) return { allowed: true };

  const ip = input.directIp?.trim();
  if (!ip || ip === 'unknown') return { allowed: true };

  const existing = nowBlockReason(ip);
  if (existing) return { allowed: false, reason: existing };

  const xff = analyzeXForwardedFor(input.rawXForwardedFor, input.tcpPeerIp);
  if (xff.suspicious) {
    const until = Date.now() + ipBlockMs();
    blockedIps.set(ip, until);
    await slackAlert(`XFF anomaly (${xff.reason}) directIp=${ip} tool=${input.toolName}`);
    return { allowed: false, reason: `xff_suspicious:${xff.reason}` };
  }

  const subnet = ipv4Subnet24(ip);
  if (subnet) {
    const key = `${input.toolName}:${subnet}`;
    let m = toolSubnetIps.get(key);
    const t = Date.now();
    if (!m) {
      m = new Map();
      toolSubnetIps.set(key, m);
    }
    m.set(ip, t);
    pruneMap(m, t - TOOL_WINDOW_MS);
    if (m.size > subnetThreshold()) {
      const until = Date.now() + subnetBlockMs();
      blockedSubnets.set(subnet, until);
      await slackAlert(
        `Subnet flood: ${m.size} unique IPs in ${subnet} for tool ${input.toolName} (blocked ${Math.round(subnetBlockMs() / 60000)}m)`
      );
      return { allowed: false, reason: 'subnet_rate_bypass_suspected' };
    }
  }

  if (input.bearerToken && input.bearerToken.length > 8) {
    const fp = tokenFingerprint(input.bearerToken);
    const t = Date.now();
    let tm = ipTokens.get(ip);
    if (!tm) {
      tm = new Map();
      ipTokens.set(ip, tm);
    }
    tm.set(fp, t);
    pruneMap(tm, t - TOKEN_WINDOW_MS);
    if (tm.size > tokenThreshold()) {
      const until = Date.now() + ipBlockMs();
      blockedIps.set(ip, until);
      await slackAlert(
        `Token rotation burst: ${tm.size} distinct tokens from ${ip} in 5m (blocked)`
      );
      return { allowed: false, reason: 'token_rotation_burst' };
    }
  }

  return { allowed: true };
}

/** Extract Bearer token from request without logging it. */
export function readBearerToken(req: http.IncomingMessage): string | undefined {
  const a = req.headers.authorization;
  if (typeof a !== 'string' || !a.startsWith('Bearer ')) return undefined;
  const t = a.slice(7).trim();
  return t || undefined;
}

export function readXForwardedFor(req: http.IncomingMessage): string | undefined {
  const x = req.headers['x-forwarded-for'];
  return typeof x === 'string' ? x : Array.isArray(x) ? x[0] : undefined;
}

/** @internal */
export function resetBypassDetectionForTests(): void {
  blockedSubnets.clear();
  blockedIps.clear();
  toolSubnetIps.clear();
  ipTokens.clear();
}

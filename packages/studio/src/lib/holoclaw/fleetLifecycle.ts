/**
 * HoloClaw fleet lifecycle — register a launched skill as a dispatchable
 * HoloMesh fleet agent and tear it down when the daemon exits.
 *
 * When Brittney (or a direct caller) launches a HoloClaw skill via
 * POST /api/holoclaw/run, the skill runs as a self-driving HoloDaemon process.
 * To make it a *first-class fleet agent* — visible to the fleet view AND a valid
 * target for /api/agents/fleet/dispatch — we:
 *
 *   1. Register it in the HoloMesh fleet registry with skills:[<skill>] so the
 *      dispatcher's capability matcher can route board tasks to it.
 *   2. Open a presence heartbeat session so the dispatcher's presence gate marks
 *      it live (an agent absent from presence is treated offline once presence is
 *      non-empty — see api/agents/fleet/dispatch fetchFleetAgents).
 *
 * On daemon exit we close presence and deregister (auto register + deregister
 * lifecycle), so launched skills never linger as stale seats.
 *
 * All calls are best-effort: a fleet/heartbeat failure must NEVER break the core
 * skill spawn. Every upstream call is wrapped and time-bounded; the helper
 * returns whatever registration state it achieved so the caller can still clean
 * up on exit.
 *
 * Opt out with HOLOCLAW_FLEET_REGISTER=false (e.g. local dev without a fleet).
 */

import crypto from 'crypto';

const HOLOMESH_BASE =
  process.env.HOLOMESH_API_URL || process.env.MCP_SERVER_URL || 'https://mcp.holoscript.net';
const HOLOMESH_KEY = process.env.HOLOMESH_API_KEY || process.env.HOLOMESH_KEY || '';
// Mirror the dispatch route's default so launched agents land on the same team
// the dispatcher works (api/agents/fleet/dispatch DEFAULT_TEAM_ID).
const DEFAULT_TEAM_ID = process.env.HOLOMESH_TEAM_ID || 'team_1777834718247_unr35n';

const CALL_TIMEOUT_MS = 6_000;

export interface FleetRegistration {
  /** Fleet agent id assigned to this launched skill. */
  agentId: string;
  /** Team the agent was registered + heartbeated onto. */
  teamId: string;
  /** Human-readable handle, e.g. holoclaw-research. */
  handle: string;
  /** Whether the presence heartbeat session opened successfully. */
  presence: boolean;
  /** Whether the fleet registry accepted the agent record. */
  registered: boolean;
}

export interface RegisterOptions {
  /** Forwarded session/bearer auth; falls back to the configured HoloMesh key. */
  clientAuth?: string | null;
  /** Team to register onto (defaults to HOLOMESH_TEAM_ID / dispatch default). */
  teamId?: string;
}

export function isFleetRegistrationEnabled(): boolean {
  return process.env.HOLOCLAW_FLEET_REGISTER !== 'false';
}

function headers(clientAuth?: string | null): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (clientAuth) h['Authorization'] = clientAuth;
  else if (HOLOMESH_KEY) h['Authorization'] = `Bearer ${HOLOMESH_KEY}`;
  return h;
}

/**
 * Register a launched skill as a dispatchable fleet agent and open its presence
 * session. Returns the registration handle (for teardown) or null when fleet
 * registration is disabled. Never throws — partial success is reported via the
 * `registered` / `presence` flags.
 */
export async function registerHoloClawFleetAgent(
  skillName: string,
  opts: RegisterOptions = {}
): Promise<FleetRegistration | null> {
  if (!isFleetRegistrationEnabled()) return null;

  const teamId = opts.teamId?.trim() || DEFAULT_TEAM_ID;
  const handle = `holoclaw-${skillName}`;
  const agentId = `holoclaw-${skillName}-${crypto.randomBytes(4).toString('hex')}`;
  const reg: FleetRegistration = { agentId, teamId, handle, presence: false, registered: false };

  // 1) Register in the fleet registry with skills:[skillName] so the dispatcher's
  //    capability matcher can route matching board tasks to this agent.
  try {
    const { publicKey } = crypto.generateKeyPairSync('ed25519');
    const publicKeyHex = publicKey.export({ type: 'spki', format: 'der' }).toString('hex');
    const res = await fetch(`${HOLOMESH_BASE}/api/holomesh/agents/fleet`, {
      method: 'POST',
      headers: headers(opts.clientAuth),
      body: JSON.stringify({
        id: agentId,
        name: handle,
        bio: `HoloClaw skill agent running the "${skillName}" composition.`,
        personalityMode: 'engineer',
        skills: [skillName],
        publicKey: publicKeyHex,
        maxDailySpendCents: 100,
        rateLimitPerMin: 10,
        creatorRevenueSplit: 80,
      }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
    // 404 == upstream fleet endpoint not deployed yet; treat as soft-registered so
    // the dispatcher (which has the same fallback) still enumerates from members.
    reg.registered = res.ok || res.status === 404;
  } catch {
    // non-fatal — presence may still open below
  }

  // 2) Open a presence heartbeat session so the dispatcher's presence gate marks
  //    the agent live.
  try {
    const res = await fetch(
      `${HOLOMESH_BASE}/api/holomesh/team/${encodeURIComponent(teamId)}/heartbeat`,
      {
        method: 'POST',
        headers: headers(opts.clientAuth),
        body: JSON.stringify({ agentId, agentName: handle, role: 'member' }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      }
    );
    reg.presence = res.ok;
  } catch {
    // non-fatal
  }

  return reg;
}

/**
 * Close the presence session and deregister the fleet agent. Best-effort — used
 * from the daemon exit handler and the manual-stop (DELETE) path.
 */
export async function deregisterHoloClawFleetAgent(
  reg: FleetRegistration,
  clientAuth?: string | null,
  reason = 'skill_exit'
): Promise<void> {
  // Close presence first so the agent stops being a live dispatch target.
  try {
    await fetch(`${HOLOMESH_BASE}/api/holomesh/team/${encodeURIComponent(reg.teamId)}/heartbeat`, {
      method: 'DELETE',
      headers: headers(clientAuth),
      body: JSON.stringify({ agentId: reg.agentId, reason }),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    // non-fatal
  }

  // Deregister the fleet record.
  try {
    await fetch(`${HOLOMESH_BASE}/api/holomesh/agents/fleet/${encodeURIComponent(reg.agentId)}`, {
      method: 'DELETE',
      headers: headers(clientAuth),
      signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    });
  } catch {
    // non-fatal
  }
}

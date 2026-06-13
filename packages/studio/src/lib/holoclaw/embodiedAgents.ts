/**
 * Embodied-agent roster derivation for the HoloClaw deck.
 *
 * The run route emits `agent_embodiment` activity events on spawn / state-change
 * / exit (see lib/holoclaw/embodiment.ts buildEmbodimentActivityEntry). The 3D
 * deck renders a visible avatar per live agent. This pure helper turns the
 * newest-first activity feed into the current embodied-agent roster, so the
 * logic is unit-testable independent of React / R3F.
 */

/** A launched, embodied HoloClaw fleet agent rendered as a visible avatar. */
export interface EmbodiedAgent {
  agentId: string;
  handle: string;
  skill: string;
  status: 'spawning' | 'running' | 'idle' | 'error' | 'stopped';
  presence: boolean;
  /** Deterministic hue (0–359) from the skill name; matches the embodiment card. */
  hue: number;
}

/** Minimal shape of an activity entry needed to derive embodied agents. */
export interface ActivityLike {
  metadata?: Record<string, unknown>;
}

const EMBODIED_STATUSES = ['spawning', 'running', 'idle', 'error', 'stopped'] as const;

function isEmbodiedStatus(v: unknown): v is EmbodiedAgent['status'] {
  return typeof v === 'string' && (EMBODIED_STATUSES as readonly string[]).includes(v);
}

/**
 * Derive the live embodied-agent roster from a newest-first activity feed.
 *
 * Reads `agent_embodiment` events, keeps the LATEST state per agentId, and
 * retires stopped agents (their avatars leave the deck).
 *
 * @param entries Activity entries, newest first (entries[0] is the most recent).
 */
export function deriveEmbodiedAgents(entries: ActivityLike[]): EmbodiedAgent[] {
  const byId = new Map<string, EmbodiedAgent>();
  // Iterate oldest → newest so the newest event for an agent wins.
  for (let i = entries.length - 1; i >= 0; i--) {
    const m = entries[i]?.metadata;
    if (!m || m.kind !== 'agent_embodiment' || typeof m.agentId !== 'string') continue;
    byId.set(m.agentId, {
      agentId: m.agentId,
      handle: typeof m.handle === 'string' ? m.handle : m.agentId,
      skill: typeof m.skill === 'string' ? m.skill : '',
      status: isEmbodiedStatus(m.status) ? m.status : 'idle',
      presence: m.presence === true,
      hue: typeof m.hue === 'number' ? m.hue : 0,
    });
  }
  return Array.from(byId.values()).filter((a) => a.status !== 'stopped');
}

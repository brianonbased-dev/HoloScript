/**
 * HoloClaw embodiment — the shared artifact that makes a launched skill a
 * VISIBLE, embodied fleet agent instead of a headless background daemon.
 *
 * Founder directive (2026-06-12): "holoclaw agents should not be headless."
 * The holodaemon child process stays as the execution ENGINE, but every launch
 * must produce an embodiment that the three agent surfaces render:
 *
 *   1. HoloClawTab / HoloClaw3DDeck  — an embodied card/avatar with live status.
 *   2. The visible Brittney session  — the launch returns the card so Brittney
 *      can show the agent it just embodied (not bury it in an outbox).
 *   3. A 3D scene                    — a `.holo` avatar/presence composition
 *      (@avatar_embodiment + @presence) representing the agent in HoloMesh space.
 *
 * All three consume ONE artifact built here: `EmbodiedAgentCard` (which carries
 * the avatar `.holo`). The run route emits it on spawn + on exit, so an agent is
 * never invisible — that is the non-headless guarantee.
 *
 * Pure functions only — no I/O, no framework imports — so the embodiment is
 * unit-testable in isolation and has a near-zero build blast radius.
 */

export interface HoloClawAgentIdentity {
  /** Skill composition name, e.g. "research". */
  skill: string;
  /** Fleet agent id, e.g. holoclaw-research-1a2b3c4d. */
  agentId: string;
  /** Team the agent is registered on. */
  teamId: string;
  /** Human handle, e.g. holoclaw-research. */
  handle: string;
  /** Daemon process id, when known. */
  pid?: number;
  /** ISO spawn timestamp. */
  startedAt?: string;
}

export type EmbodiedStatus = 'spawning' | 'running' | 'idle' | 'error' | 'stopped';

export interface EmbodiedAgentCard {
  agentId: string;
  handle: string;
  skill: string;
  teamId: string;
  status: EmbodiedStatus;
  pid?: number;
  startedAt?: string;
  /** True once a fleet presence heartbeat session is open. */
  presence: boolean;
  /** Outbox channel the deck tails for this agent's live activity. */
  activityChannel: string;
  /** Deterministic hue (0–359) for the agent's avatar in the 3D deck. */
  hue: number;
  /** The `.holo` avatar/presence composition that embodies this agent in a scene. */
  avatarHolo: string;
}

export interface ActivityEntry {
  timestamp: string;
  channel: string;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Deterministic hue (0–359) derived from the skill name, so the same skill
 * always embodies with the same avatar color across the deck, session, and scene.
 */
export function avatarHueForSkill(skill: string): number {
  let h = 0;
  for (let i = 0; i < skill.length; i++) {
    h = (h * 31 + skill.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

/** The outbox channel the deck tails for a skill's live activity. */
export function activityChannelForSkill(skill: string): string {
  return `skill:${skill}`;
}

/**
 * Build the `.holo` avatar/presence composition that embodies the agent in a 3D
 * scene. Uses real avatar traits (@avatar_embodiment, @presence, @networking,
 * @character_voice, @emote — see examples/avatars/avatar-full-template.holo and
 * examples/site.holo). The live generation path should still run this through
 * validate_holoscript via MCP; the template here is built from authenticated
 * trait syntax so it is structurally valid offline.
 */
export function buildAgentAvatarHolo(id: HoloClawAgentIdentity, status: EmbodiedStatus): string {
  const hue = avatarHueForSkill(id.skill);
  const objectName = `HoloClawAgent_${id.skill.replace(/[^a-zA-Z0-9_]/g, '_')}`;
  return `// Embodied HoloClaw fleet agent — generated at launch (non-headless).
composition "HoloClaw — ${id.skill}" {
  metadata {
    title: "HoloClaw Agent: ${id.skill}"
    description: "Embodied HoloClaw fleet agent running the ${id.skill} skill composition."
    version: "1.0"
    tags: ["holoclaw", "agent", "embodied", "${id.skill}"]
  }

  object "${objectName}" {
    @avatar_embodiment(
      first_person: false,
      mirror_visible: true,
      calibration: "automatic"
    )
    @presence(sync: ["status", "activity", "position"])
    @networking(url: "wss://mcp.holoscript.net/socket/presence")
    @character_voice(profile: "agent", emotion: "focused")
    @emote

    geometry: "avatar"
    position: [0, 0, 0]
    scale: [1, 1, 1]

    state {
      agentId: "${id.agentId}"
      skill: "${id.skill}"
      team: "${id.teamId}"
      status: "${status}"
      hue: ${hue}
    }
  }
}
`;
}

/**
 * Build the embodied agent card — the single artifact the deck, the Brittney
 * session, and the 3D scene all render. Carries the avatar `.holo`.
 */
export function buildEmbodiedAgentCard(
  id: HoloClawAgentIdentity,
  status: EmbodiedStatus,
  presence: boolean
): EmbodiedAgentCard {
  return {
    agentId: id.agentId,
    handle: id.handle,
    skill: id.skill,
    teamId: id.teamId,
    status,
    ...(id.pid !== undefined ? { pid: id.pid } : {}),
    ...(id.startedAt ? { startedAt: id.startedAt } : {}),
    presence,
    activityChannel: activityChannelForSkill(id.skill),
    hue: avatarHueForSkill(id.skill),
    avatarHolo: buildAgentAvatarHolo(id, status),
  };
}

/**
 * Build the structured activity entry announcing the embodied spawn / state
 * change. Appended to the outbox so the activity SSE feed (and the deck tailing
 * it) renders the embodied agent immediately — this is what makes the launch
 * non-headless. The avatar `.holo` rides in metadata for the 3D surface.
 */
export function buildEmbodimentActivityEntry(
  card: EmbodiedAgentCard,
  now: string = new Date().toISOString()
): ActivityEntry {
  const glyph = card.status === 'stopped' ? '⬡✕' : '⬡';
  return {
    timestamp: now,
    channel: 'holoclaw:embodiment',
    message: `${glyph} ${card.handle} embodied — ${card.activityChannel} status:${card.status}`,
    metadata: {
      kind: 'agent_embodiment',
      agentId: card.agentId,
      handle: card.handle,
      skill: card.skill,
      teamId: card.teamId,
      status: card.status,
      presence: card.presence,
      hue: card.hue,
      activityChannel: card.activityChannel,
      avatarHolo: card.avatarHolo,
    },
  };
}

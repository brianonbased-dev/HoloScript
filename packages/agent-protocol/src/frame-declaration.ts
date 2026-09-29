/** MCP metadata key carrying an active HoloScript brain frame declaration. */
export const FRAME_DECLARATION_MCP_META_KEY = 'holoscript.dev/frame-declaration' as const;

/**
 * The `allowed_tools` entry that permits every tool — the same mark a frame's
 * `domain` uses for "any domain". Proposal G15 (proposals/Agent_Frame_Tool_Allowlist_v1.md).
 */
export const FRAME_ALLOW_ALL_TOOLS = '*' as const;

/** Sovereign-seat capability and trust tiers. */
export type FrameTier = 0 | 1 | 2 | 3;

/**
 * Transport-safe frame declaration shared by brains, clients, and MCP gates.
 * Runtime enforcement remains in @holoscript/core.
 */
export interface FrameDeclarationContract {
  domain: string;
  horizon: string;
  capability_tier: FrameTier;
  trust_tier: FrameTier;
  /**
   * Tools this agent may call (G15). `["*"]` permits every tool; `[]` permits
   * no tool; any other list permits exactly the tools it names. A brain that
   * omits the field is sent as `["*"]`, so leaving it out still means every tool.
   */
  allowed_tools: string[];
  denied_domains: string[];
}

/** Violation categories emitted by frame boundary enforcement. */
export type FrameViolationTypeContract =
  'tool_not_allowed' | 'domain_denied' | 'horizon_exceeded' | 'tier_exceeded' | 'undeclared_frame';

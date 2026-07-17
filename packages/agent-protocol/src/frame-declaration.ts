/** MCP metadata key carrying an active HoloScript brain frame declaration. */
export const FRAME_DECLARATION_MCP_META_KEY = 'holoscript.dev/frame-declaration' as const;

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
  allowed_tools: string[];
  denied_domains: string[];
}

/** Violation categories emitted by frame boundary enforcement. */
export type FrameViolationTypeContract =
  | 'tool_not_allowed'
  | 'domain_denied'
  | 'horizon_exceeded'
  | 'tier_exceeded'
  | 'undeclared_frame';

/** MCP metadata key carrying an active HoloScript brain frame declaration. */
export const FRAME_DECLARATION_MCP_META_KEY = 'holoscript.dev/frame-declaration' as const;

/**
 * The `allowed_tools` entry that permits every tool — the same mark a frame's
 * `domain` uses for "any domain". Proposal G15 (proposals/Agent_Frame_Tool_Allowlist_v1.md).
 */
export const FRAME_ALLOW_ALL_TOOLS = '*' as const;

/** The keys a frame declaration reads. A reader ignores any other key. */
export const FRAME_DECLARATION_KEYS = [
  'domain',
  'horizon',
  'capability_tier',
  'trust_tier',
  'allowed_tools',
  'denied_domains',
] as const;

/** One of the keys a frame declaration reads. */
export type FrameDeclarationKey = (typeof FRAME_DECLARATION_KEYS)[number];

/**
 * The frame key that `key` looks like when it is not one, or undefined. A key looks like a
 * frame key when, with ASCII case, `_`, `-` and ASCII whitespace ignored, it is at most two
 * edits (a letter added, dropped or changed) from it: `allowedTools`, `allowed_tool`,
 * `allow_tools` and `Allowed-Tools` all look like `allowed_tools`. A frame key itself looks
 * like nothing, and so does a key far from every frame key (`notes`, `tools`).
 *
 * Every frame reader refuses a frame holding such a key (G15 review, 2026-10-05). A reader
 * that ignored it would read the real key as left out, and a left-out key is the widest
 * value: `allowed_tools` left out means every tool, so the typo `allowedTools: []` would
 * turn "no tool" into "every tool". The Rust reader (packages/compiler-wasm/src/ast.rs,
 * `frame_key_lookalike`) applies the same rule; the shared cases in
 * src/__tests__/fixtures/frame-allowlist-cases.json hold all readers to it.
 */
export function frameKeyLookalike(key: string): FrameDeclarationKey | undefined {
  if ((FRAME_DECLARATION_KEYS as readonly string[]).includes(key)) return undefined;
  const written = squashFrameKey(key);
  return FRAME_DECLARATION_KEYS.find((known) => withinTwoEdits(written, squashFrameKey(known)));
}

/** A key written in a frame that looks like a frame key but is not one. */
export interface FrameKeyLookalike {
  /** The key as written, e.g. `allowedTools`. */
  written: string;
  /** The frame key it looks like, e.g. `allowed_tools`. */
  meant: FrameDeclarationKey;
}

/** The sentence a frame reader refuses a frame with, naming the look-alike key. */
export function describeFrameKeyLookalike({ written, meant }: FrameKeyLookalike): string {
  return (
    `@frame_declaration has the key "${written}", which is not a frame key but looks like ` +
    `"${meant}". Read as written, "${meant}" would count as left out, and a left-out ` +
    `"${meant}" is its widest value (for allowed_tools: every tool), so this frame is ` +
    `refused. Write "${meant}", or remove the key.`
  );
}

/**
 * A key lowercased (ASCII only) with `_`, `-` and ASCII whitespace dropped, one entry per
 * code point, so the Rust reader can compute the same thing.
 */
function squashFrameKey(key: string): string[] {
  return Array.from(key.replace(/[A-Z]/g, (c) => c.toLowerCase())).filter(
    (c) => !/^[_\- \t\n\f\r]$/.test(c)
  );
}

/** True when the edit (Levenshtein) distance between `a` and `b` is at most 2. */
function withinTwoEdits(a: string[], b: string[]): boolean {
  if (Math.abs(a.length - b.length) > 2) return false;
  let previous = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)
      );
    }
    previous = current;
  }
  return previous[b.length] <= 2;
}

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
   * MCP tools this agent may call through the MCP server's gate (G15). `["*"]`
   * permits every tool; `[]` permits no tool; any other list permits exactly the
   * tools it names. A brain that omits the field is sent as `["*"]`, so leaving
   * it out still means every tool. The agent's own local tools are not bounded
   * by this list.
   */
  allowed_tools: string[];
  denied_domains: string[];
}

/** Violation categories emitted by frame boundary enforcement. */
export type FrameViolationTypeContract =
  'tool_not_allowed' | 'domain_denied' | 'horizon_exceeded' | 'tier_exceeded' | 'undeclared_frame';

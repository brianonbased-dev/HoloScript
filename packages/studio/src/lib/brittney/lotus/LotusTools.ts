/**
 * Lotus Garden Tools — Brittney's tools for tending the Lotus Flower.
 *
 * Five tools, two semantics:
 *
 *   READ-ONLY (always succeed; no rejection path):
 *     - read_garden_state()         — current bloom state of all 16 petals
 *     - tend_garden()               — re-derive every petal + readiness verdict
 *     - propose_evidence(paper_id)  — what evidence is needed for next bloom
 *
 *   MUTATING (gated by derivePetalBloomState):
 *     - bloom_petal(paper_id, target_state)  — only allowed when target_state
 *                                              equals the derived state from
 *                                              real evidence. Otherwise rejected.
 *     - wilt_petal(paper_id, reason)         — only allowed when derived state
 *                                              IS already 'wilted'. Brittney
 *                                              cannot wilt a healthy petal.
 *
 * The architectural-trust thesis (Paper 26): Brittney CANNOT lie about a
 * petal's bloom state because the state is a pure function of evidence and
 * mutations are gated against the derivation. Every mutation either agrees
 * with reality or is rejected with the rejection visible to both the user
 * (via SSE event) and the model (via tool_result is_error).
 *
 * @see ./derive-bloom-state.ts — pure derivation
 * @see ./evidence-provider.ts — v1 fixture-backed evidence loader
 */

import {
  derivePetalBloomState,
  deriveLotusGenesisReadiness,
  type BloomState,
} from './derive-bloom-state';
import {
  loadPetalEvidence,
  loadAllPetalEvidence,
  getKnownPaperIds,
  getSnapshotMetadata,
} from './evidence-provider';

const VALID_BLOOM_STATES: ReadonlySet<BloomState> = new Set([
  'sealed',
  'budding',
  'blooming',
  'full',
  'wilted',
]);

// ── Tool schemas (OpenAI function-calling format, mirroring BRITTNEY_TOOLS) ──

export const LOTUS_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'read_garden_state',
      description:
        'Read the current bloom state of every petal in the Lotus Flower garden. Returns the derived state for all 16 papers plus the Lotus Genesis readiness verdict. Read-only; always succeeds.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'tend_garden',
      description:
        'Re-derive every petal\'s bloom state from current evidence and return a markdown summary suitable for posting to the user. Includes per-petal state, the Lotus Genesis readiness verdict, and a list of blocking petals if any. Read-only; always succeeds.',
      parameters: {
        type: 'object',
        properties: {},
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'propose_evidence',
      description:
        'For a given paper, return what evidence is missing to advance its petal to the next bloom state. Useful for telling the user which papers need which work next. Read-only; always succeeds.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: {
            type: 'string',
            description: 'The paper identifier (matches @lotus_petal paper_id in garden.holo)',
          },
        },
        required: ['paper_id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'bloom_petal',
      description:
        'Set a petal\'s bloom state. ARCHITECTURALLY GATED: this tool only succeeds if the requested target_state equals the state derivable from real evidence. If you request a target_state that the evidence does not justify, the tool returns is_error and explains what evidence is missing. You cannot lie about a petal\'s bloom; the architecture enforces truth.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: {
            type: 'string',
            description: 'The paper identifier',
          },
          target_state: {
            type: 'string',
            enum: ['sealed', 'budding', 'blooming', 'full', 'wilted'],
            description: 'The bloom state to apply. Must match the derived state from evidence.',
          },
        },
        required: ['paper_id', 'target_state'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'wilt_petal',
      description:
        'Mark a petal as wilted with a reason. ARCHITECTURALLY GATED: this tool only succeeds when the derived state from evidence IS already \'wilted\' (paper retracted or provenance break). You cannot wilt a healthy petal.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: {
            type: 'string',
            description: 'The paper identifier',
          },
          reason: {
            type: 'string',
            description: 'Human-readable reason for the wilt (e.g., "retracted by editor", "anchor lost")',
          },
        },
        required: ['paper_id', 'reason'],
      },
    },
  },
];

export const LOTUS_TOOL_NAMES: ReadonlySet<string> = new Set([
  'read_garden_state',
  'tend_garden',
  'propose_evidence',
  'bloom_petal',
  'wilt_petal',
]);

export function isLotusTool(name: string): boolean {
  return LOTUS_TOOL_NAMES.has(name);
}

// ── Executor ──────────────────────────────────────────────────────────────────

export interface LotusToolResult {
  tool: string;
  success: boolean;
  /** When success: the data the model should see. When !success: the rejection
   *  reason in human-readable form (becomes the tool_result is_error content). */
  data?: unknown;
  error?: string;
  /** When success and the operation was a mutation: the new petal state.
   *  Surfaced via SSE for the client UI. */
  newState?: BloomState;
  /** When the operation was a mutation: the paper that was touched. */
  paperId?: string;
  /** True when the operation was a mutation that was rejected by the
   *  architectural-trust gate (derivePetalBloomState disagreed with target). */
  gateRejected?: boolean;
}

/**
 * Execute a lotus tool by name. Read-only tools always succeed; mutating
 * tools (`bloom_petal`, `wilt_petal`) are gated by `derivePetalBloomState`.
 */
export function executeLotusTool(
  toolName: string,
  args: Record<string, unknown>,
): LotusToolResult {
  try {
    switch (toolName) {
      case 'read_garden_state':
        return executeReadGardenState();
      case 'tend_garden':
        return executeTendGarden();
      case 'propose_evidence':
        return executeProposeEvidence(String(args.paper_id ?? ''));
      case 'bloom_petal':
        return executeBloomPetal(
          String(args.paper_id ?? ''),
          String(args.target_state ?? '') as BloomState,
        );
      case 'wilt_petal':
        return executeWiltPetal(
          String(args.paper_id ?? ''),
          String(args.reason ?? ''),
        );
      default:
        return {
          tool: toolName,
          success: false,
          error: `Unknown lotus tool: ${toolName}`,
        };
    }
  } catch (err) {
    return {
      tool: toolName,
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function executeReadGardenState(): LotusToolResult {
  const allEvidence = loadAllPetalEvidence();
  const states: Record<string, { state: BloomState; reason: string }> = {};
  for (const [paperId, evidence] of allEvidence) {
    const derived = derivePetalBloomState(evidence);
    states[paperId] = { state: derived.state, reason: derived.reason };
  }
  const readiness = deriveLotusGenesisReadiness(allEvidence);
  return {
    tool: 'read_garden_state',
    success: true,
    data: {
      petals: states,
      readiness,
      snapshot: getSnapshotMetadata(),
    },
  };
}

function executeTendGarden(): LotusToolResult {
  const allEvidence = loadAllPetalEvidence();
  const lines: string[] = ['# Lotus Garden — Tending Report', ''];
  const meta = getSnapshotMetadata();
  lines.push(`*Evidence snapshot: ${meta.snapshot_at}*`, '');

  const byState: Record<BloomState, string[]> = {
    sealed: [],
    budding: [],
    blooming: [],
    full: [],
    wilted: [],
  };

  for (const [paperId, evidence] of allEvidence) {
    const derived = derivePetalBloomState(evidence);
    byState[derived.state].push(`${paperId} (${evidence.venue ?? 'no venue'}): ${derived.reason}`);
  }

  for (const state of ['full', 'blooming', 'budding', 'sealed', 'wilted'] as const) {
    if (byState[state].length === 0) continue;
    lines.push(`## ${state} (${byState[state].length})`);
    for (const line of byState[state]) lines.push(`- ${line}`);
    lines.push('');
  }

  const readiness = deriveLotusGenesisReadiness(allEvidence);
  lines.push('## Lotus Genesis Readiness');
  lines.push(`- Ready: **${readiness.ready ? 'YES' : 'NO'}**`);
  lines.push(`- Full petals: ${readiness.fullPetals} / ${readiness.totalPetals}`);
  if (readiness.blockingPetals.length > 0) {
    lines.push(`- Blocking: ${readiness.blockingPetals.length} petal(s) not full`);
  }

  return {
    tool: 'tend_garden',
    success: true,
    data: {
      summary_markdown: lines.join('\n'),
      readiness,
    },
  };
}

function executeProposeEvidence(paperId: string): LotusToolResult {
  if (!paperId) {
    return { tool: 'propose_evidence', success: false, error: 'paper_id is required' };
  }
  const evidence = loadPetalEvidence(paperId);
  if (!evidence) {
    return {
      tool: 'propose_evidence',
      success: false,
      error: `Unknown paper_id "${paperId}". Known IDs: ${Array.from(getKnownPaperIds()).join(', ')}`,
    };
  }
  const derived = derivePetalBloomState(evidence);
  const proposals: string[] = [];
  for (const blocker of derived.blockedBy ?? []) {
    proposals.push(blockerToProposal(blocker, evidence));
  }
  return {
    tool: 'propose_evidence',
    success: true,
    paperId,
    data: {
      currentState: derived.state,
      currentReason: derived.reason,
      blockedBy: derived.blockedBy ?? [],
      proposals: proposals.length > 0
        ? proposals
        : ['Petal is already at full bloom — no further evidence needed.'],
    },
  };
}

function executeBloomPetal(paperId: string, targetState: BloomState): LotusToolResult {
  if (!paperId) {
    return { tool: 'bloom_petal', success: false, error: 'paper_id is required' };
  }
  if (!VALID_BLOOM_STATES.has(targetState)) {
    return {
      tool: 'bloom_petal',
      success: false,
      error: `Invalid target_state "${targetState}". Must be one of: ${Array.from(VALID_BLOOM_STATES).join(', ')}`,
    };
  }
  const evidence = loadPetalEvidence(paperId);
  if (!evidence) {
    return {
      tool: 'bloom_petal',
      success: false,
      error: `Unknown paper_id "${paperId}". Known IDs: ${Array.from(getKnownPaperIds()).join(', ')}`,
    };
  }
  const derived = derivePetalBloomState(evidence);
  if (derived.state !== targetState) {
    return {
      tool: 'bloom_petal',
      success: false,
      paperId,
      gateRejected: true,
      error: `Cannot bloom petal "${paperId}" to "${targetState}" — evidence supports "${derived.state}". Reason: ${derived.reason}. Use propose_evidence to find what's needed for the next transition.`,
    };
  }
  return {
    tool: 'bloom_petal',
    success: true,
    paperId,
    newState: derived.state,
    data: {
      paperId,
      newState: derived.state,
      evidence_summary: derived.reason,
    },
  };
}

function executeWiltPetal(paperId: string, reason: string): LotusToolResult {
  if (!paperId) {
    return { tool: 'wilt_petal', success: false, error: 'paper_id is required' };
  }
  if (!reason) {
    return { tool: 'wilt_petal', success: false, error: 'reason is required for wilt' };
  }
  const evidence = loadPetalEvidence(paperId);
  if (!evidence) {
    return {
      tool: 'wilt_petal',
      success: false,
      error: `Unknown paper_id "${paperId}"`,
    };
  }
  const derived = derivePetalBloomState(evidence);
  if (derived.state !== 'wilted') {
    return {
      tool: 'wilt_petal',
      success: false,
      paperId,
      gateRejected: true,
      error: `Cannot wilt petal "${paperId}" — evidence shows derived state "${derived.state}", not wilted. ${derived.reason}. Wilting requires evidence of retraction or provenance break (anchorMismatch with no surviving anchors).`,
    };
  }
  return {
    tool: 'wilt_petal',
    success: true,
    paperId,
    newState: 'wilted',
    data: {
      paperId,
      newState: 'wilted',
      reason_provided: reason,
      evidence_reason: derived.reason,
    },
  };
}

/**
 * Translate a blocked-by evidence key into a human-readable suggestion of
 * what needs to land for the next bloom transition.
 */
function blockerToProposal(
  blocker: string,
  evidence: { stubCount?: number; benchmarkTodoCount?: number },
): string {
  switch (blocker) {
    case 'hasDraft':
      return 'Write a `.tex` draft for this paper (skeleton → first draft).';
    case 'stubCount':
      return `Resolve ${evidence.stubCount ?? '?'} \\stub{} marker(s) — replace placeholder content with real prose.`;
    case 'benchmarkTodoCount':
      return `Land ${evidence.benchmarkTodoCount ?? '?'} pending benchmark(s) and remove the \\todo{benchmark pending} marker(s).`;
    case 'otsAnchored':
      return 'Run OpenTimestamps anchoring on the current `.tex` file (`scripts/anchor_ots.py` in ai-ecosystem).';
    case 'baseAnchored':
      return 'Run Base L2 anchoring on the current `.tex` file (`scripts/anchor_base.py` in ai-ecosystem).';
    case 'anchorMismatch':
      return 'Re-anchor at submission-bundle time so the receipts match the current canonical hash.';
    case 'retracted':
      return 'Petal is retracted (terminal). Founder must restore it explicitly to leave wilted state.';
    default:
      return `Address evidence blocker: ${blocker}`;
  }
}

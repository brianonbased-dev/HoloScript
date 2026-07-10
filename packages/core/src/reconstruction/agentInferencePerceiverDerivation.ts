/**
 * Agent-inference perceiver derivation — re-derives world facts from the
 * EMITTED agent-inference artifact (the "agent context" perceiver of
 * @cross_perceiver_contract).
 *
 * Input is the multi-file artifact map produced by
 * AgentInferenceCompiler.compile() (filename → contents) and NOTHING else —
 * never the source composition/AST (G.UI-SHIFT.selfpass). World facts are
 * parsed from config.json (the artifact's only structured facts file) plus
 * the agent.ts/agent.py banner for the source-composition claim.
 *
 * Vocabulary limits (honest coverage, not silent defaults): this artifact has
 * NO spatial vocabulary — geometry/position/non-agent scene entities are
 * inexpressible here and recorded as coverage gaps, never as disagreements.
 * Affordances ARE fully nameable (tools[]), so entities carry named `offers`.
 *
 * @package @holoscript/core/reconstruction
 */
import { createHash } from 'node:crypto';
import type { PerceiverDerivation, PerceivedEntity } from './PerceiverConsensusReceipt';

export const AGENT_INFERENCE_PERCEIVER = 'agent-inference' as const;

/**
 * Parse the agent-inference artifact file map into a normalized perceiver
 * derivation. Throws on a missing/JSON-invalid config.json or a malformed
 * agents list — a lenient reader that defaults to "no agents" would let a
 * broken artifact agree about an empty world (the lenient-recogniser failure
 * class), so malformed input fails loud instead of reaching the differ.
 */
export function deriveAgentInferencePerception(
  files: Record<string, string>
): PerceiverDerivation {
  if (files == null || typeof files !== 'object' || typeof files['config.json'] !== 'string') {
    throw new Error(
      'deriveAgentInferencePerception: input is not an agent-inference artifact map (missing config.json)'
    );
  }

  let config: unknown;
  try {
    config = JSON.parse(files['config.json']);
  } catch (e) {
    throw new Error(
      `deriveAgentInferencePerception: config.json is not valid JSON — refusing to derive from a malformed artifact (${(e as Error).message})`
    );
  }
  const agents = (config as { agents?: unknown }).agents;
  if (!Array.isArray(agents)) {
    throw new Error(
      'deriveAgentInferencePerception: config.json has no agents[] — malformed artifact'
    );
  }

  const banner = files['agent.ts'] ?? files['agent.py'] ?? '';
  const sourceName = /^\s*\*\s*(.+?) — Agent Inference Script$/m.exec(banner)?.[1] ?? null;

  const entities: PerceivedEntity[] = agents.map((a) => {
    const agent = a as { name?: unknown; tools?: unknown };
    if (typeof agent.name !== 'string' || agent.name.length === 0) {
      throw new Error(
        'deriveAgentInferencePerception: agent without a name in config.json — malformed artifact'
      );
    }
    const tools = Array.isArray(agent.tools) ? agent.tools.filter((t) => typeof t === 'string') : [];
    return {
      id: agent.name,
      kind: 'agent',
      offerCount: tools.length,
      offers: tools.map((action) => ({ action })),
    };
  });

  // Hash the DELIVERED artifact bytes: every file, sorted by name, with
  // NUL-separated name/content framing so file boundaries cannot be forged.
  const hash = createHash('sha256');
  for (const name of Object.keys(files).sort()) {
    hash.update(name).update('\0').update(files[name]).update('\0');
  }

  return {
    perceiver: AGENT_INFERENCE_PERCEIVER,
    artifactHash: hash.digest('hex'),
    sourceName,
    entities,
    coverageGaps: ['spatial-position', 'geometry', 'non-agent-entities'],
  };
}

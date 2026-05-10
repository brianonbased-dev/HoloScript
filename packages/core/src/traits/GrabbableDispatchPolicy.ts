/**
 * GrabbableDispatchPolicy — @grabbable three-tier proving ground
 *
 * MVP for the NN-primary inversion: every grabbable interaction is
 * routed through DispatchPolicy.  Tier-1 SNN-WebGPU for hand tracking,
 * Tier-2 LLM speculative for gesture refinement, Tier-3 CPU fallback.
 *
 * Source: research/2026-05-09_nn-primary-cpu-backup-holoscript-EVOLVED.md
 */

import {
  DispatchPolicy,
  DispatchPolicyConfig,
  DispatchableOperation,
  DispatchDecision,
} from '../compiler/dispatch/DispatchPolicy';
import type { ProvenanceContext } from '../compiler/traits/ProvenanceSemiring';

export const DEFAULT_GRABBABLE_DISPATCH_CONFIG: DispatchPolicyConfig = {
  tier1BrowserEnabled: true,
  tier1NeuromorphicEnabled: false,
  tier2Enabled: true,
  tier2AlphaThreshold: 0.85,
  alphaWindowSize: 50,
};

/**
 * Create a DispatchPolicy tuned for @grabbable interaction traits.
 */
export function createGrabbableDispatchPolicy(
  overrides?: Partial<DispatchPolicyConfig>
): DispatchPolicy {
  return new DispatchPolicy({
    ...DEFAULT_GRABBABLE_DISPATCH_CONFIG,
    ...overrides,
  });
}

/**
 * Build a DispatchableOperation for a grabbable node.
 */
export function grabbableOperation(
  nodeId: string,
  config?: Record<string, unknown>,
  provenanceContext?: ProvenanceContext
): DispatchableOperation {
  return {
    trait: 'grabbable',
    nodeId,
    config,
    provenanceContext,
  };
}

/**
 * Route a grabbable interaction and return the decision + alpha.
 */
export async function routeGrabbableInteraction(
  nodeId: string,
  policy: DispatchPolicy,
  config?: Record<string, unknown>,
  provenanceContext?: ProvenanceContext
): Promise<DispatchDecision> {
  const op = grabbableOperation(nodeId, config, provenanceContext);
  const decision = await policy.route(op);
  return decision;
}

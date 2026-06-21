import { clamp01, type TrustDefense, type TrustDefenseDecision, type TrustDefenseObservation } from './types';

export interface CrossMeshAnchoringDefenseOptions {
  minAnchorRatio?: number;
  minRoutingDiversity?: number;
}

export class CrossMeshAnchoringDefense implements TrustDefense {
  readonly id = 'cross-mesh-anchoring' as const;
  private readonly minAnchorRatio: number;
  private readonly minRoutingDiversity: number;

  constructor(options: CrossMeshAnchoringDefenseOptions = {}) {
    this.minAnchorRatio = options.minAnchorRatio ?? 0.5;
    this.minRoutingDiversity = options.minRoutingDiversity ?? 0.35;
  }

  evaluate(observation: TrustDefenseObservation): TrustDefenseDecision {
    const peers = Math.max(1, observation.claimedPeerCount ?? 1);
    const anchorRatio = clamp01((observation.crossMeshAnchors ?? 0) / peers);
    const routingDiversity = clamp01(observation.routingDiversity ?? 1);
    const allowed =
      anchorRatio >= this.minAnchorRatio && routingDiversity >= this.minRoutingDiversity;

    return {
      defense: this.id,
      allowed,
      trustMultiplier: allowed ? 1 : Math.min(anchorRatio, routingDiversity),
      confidence: 1 - Math.min(anchorRatio, routingDiversity),
      reason: allowed
        ? 'cross-mesh anchors and route diversity satisfy floor'
        : 'insufficient independent anchors or route diversity',
    };
  }
}

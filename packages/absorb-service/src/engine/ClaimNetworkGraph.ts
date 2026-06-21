/**
 * HoloGraph claim-network operations.
 *
 * The verifiable-claim network is a deterministic HoloGraph: claims, captures,
 * solver contracts, receipts, sources, frames, and regions are nodes; proof,
 * dependency, provenance, and layout relations are edges. These helpers keep
 * HoloNews proof/pricing/router queries exact instead of embedding-ranked.
 */

export type ClaimGraphNodeKind =
  | 'claim'
  | 'holomap_capture'
  | 'source'
  | 'geo_anchor'
  | 'solver_contract'
  | 'cael_receipt'
  | 'frame'
  | 'region';

export type ClaimProofStatus =
  | 'proven'
  | 'perceptual'
  | 'captured'
  | 'unverified'
  | 'claimable'
  | 'refuted';

export type ClaimGraphEdgeKind =
  | 'supports'
  | 'depends-on'
  | 'imports'
  | 'refutes'
  | 'anchored-at'
  | 'discharged-by'
  | 'captured-by'
  | 'sourced-from'
  | 'in-frame'
  | 'located-in'
  | 'fits-claim';

export interface ClaimGraphNode {
  id: string;
  kind: ClaimGraphNodeKind;
  label?: string;
  ownerId?: string;
  proofStatus?: ClaimProofStatus;
  claimKind?: string;
  supportedClaimKinds?: string[];
  evidenceKinds?: string[];
  requiredEvidenceKinds?: string[];
  verified?: boolean;
  claimable?: boolean;
  regionId?: string;
  frameIds?: string[];
  metadata?: Record<string, unknown>;
}

export interface ClaimGraphEdge {
  id: string;
  from: string;
  to: string;
  kind: ClaimGraphEdgeKind;
  metadata?: Record<string, unknown>;
}

export type ClaimGraphEdgeInput = Omit<ClaimGraphEdge, 'id'> & { id?: string };

export interface ClaimGraphPath {
  nodeIds: string[];
  edges: ClaimGraphEdge[];
}

export interface DependencyChainEntry {
  nodeId: string;
  ownerId?: string;
  depth: number;
  via: ClaimGraphEdge;
}

export interface RevenueCascadeLine {
  role: 'creator' | 'platform' | 'dependency';
  recipientId: string;
  recipientNodeId?: string;
  share: number;
  amount?: number;
  depth?: number;
}

export interface RevenueCascade {
  rootClaimId: string;
  split: {
    creatorShare: number;
    platformShare: number;
    dependencyShare: number;
  };
  dependencyChain: DependencyChainEntry[];
  lines: RevenueCascadeLine[];
  allocatedShare: number;
  unallocatedShare: number;
}

export interface RevenueCascadeOptions {
  grossAmount?: number;
  creatorShare?: number;
  platformShare?: number;
  dependencyShare?: number;
  platformRecipientId?: string;
  maxDepth?: number;
}

export interface ProofAdjacencyFrame {
  frameId: string;
  perceptualNodeIds: string[];
}

export interface ProofAdjacencyQuery {
  provenNodeId: string;
  sharesFrameWithPerceptual: boolean;
  frames: ProofAdjacencyFrame[];
}

export interface VerifiedSolverMatch {
  solverNodeId: string;
  claimNodeId: string;
  explicitGraphFit: boolean;
  matchedClaimKind?: string;
  requiredEvidenceKinds: string[];
}

export interface SolverMapResolution {
  claimNodeId: string;
  abstain: boolean;
  matches: VerifiedSolverMatch[];
}

export interface ClaimableGap {
  regionId: string;
  regionLabel?: string;
  claimIds: string[];
  reason: 'claimable_without_discharge';
}

export interface ClaimNetworkGraphSnapshot {
  nodes: ClaimGraphNode[];
  edges: ClaimGraphEdge[];
}

const DEFAULT_CREATOR_SHARE = 0.8;
const DEFAULT_PLATFORM_SHARE = 0.1;
const DEFAULT_DEPENDENCY_SHARE = 0.1;
const DEFAULT_PLATFORM_RECIPIENT = 'platform';
const DEFAULT_MAX_DEPTH = 16;

function amountOf(grossAmount: number | undefined, share: number): number | undefined {
  return grossAmount === undefined ? undefined : grossAmount * share;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function includesAll(haystack: Set<string>, needles: string[]): boolean {
  return needles.every((needle) => haystack.has(needle));
}

function edgeMatches(edge: ClaimGraphEdge, kinds: ReadonlySet<ClaimGraphEdgeKind>): boolean {
  return kinds.has(edge.kind);
}

export class ClaimNetworkGraph {
  private nodes = new Map<string, ClaimGraphNode>();
  private edges: ClaimGraphEdge[] = [];
  private outgoing = new Map<string, ClaimGraphEdge[]>();
  private incoming = new Map<string, ClaimGraphEdge[]>();

  addNode(node: ClaimGraphNode): this {
    if (!node.id.trim()) {
      throw new Error('ClaimGraphNode.id is required');
    }
    this.nodes.set(node.id, { ...node });
    if (!this.outgoing.has(node.id)) this.outgoing.set(node.id, []);
    if (!this.incoming.has(node.id)) this.incoming.set(node.id, []);
    return this;
  }

  addEdge(input: ClaimGraphEdgeInput): this {
    if (!this.nodes.has(input.from)) {
      throw new Error(`ClaimGraphEdge.from node not found: ${input.from}`);
    }
    if (!this.nodes.has(input.to)) {
      throw new Error(`ClaimGraphEdge.to node not found: ${input.to}`);
    }

    const edge: ClaimGraphEdge = {
      id: input.id ?? `${input.from}:${input.kind}:${input.to}:${this.edges.length}`,
      from: input.from,
      to: input.to,
      kind: input.kind,
    };
    if (input.metadata) edge.metadata = input.metadata;

    this.edges.push(edge);
    this.outgoing.get(edge.from)!.push(edge);
    this.incoming.get(edge.to)!.push(edge);
    return this;
  }

  getNode(id: string): ClaimGraphNode | undefined {
    return this.nodes.get(id);
  }

  getNodes(): ClaimGraphNode[] {
    return Array.from(this.nodes.values());
  }

  getEdges(filter: Partial<Pick<ClaimGraphEdge, 'from' | 'to' | 'kind'>> = {}): ClaimGraphEdge[] {
    return this.edges.filter((edge) => {
      if (filter.from && edge.from !== filter.from) return false;
      if (filter.to && edge.to !== filter.to) return false;
      if (filter.kind && edge.kind !== filter.kind) return false;
      return true;
    });
  }

  toJSON(): ClaimNetworkGraphSnapshot {
    return {
      nodes: this.getNodes().map((node) => ({ ...node })),
      edges: this.edges.map((edge) => ({ ...edge })),
    };
  }

  static fromJSON(snapshot: ClaimNetworkGraphSnapshot): ClaimNetworkGraph {
    const graph = new ClaimNetworkGraph();
    for (const node of snapshot.nodes) graph.addNode(node);
    for (const edge of snapshot.edges) graph.addEdge(edge);
    return graph;
  }

  getImportChainRevenueCascade(
    rootClaimId: string,
    options: RevenueCascadeOptions = {}
  ): RevenueCascade {
    const root = this.requireNode(rootClaimId);
    const creatorShare = options.creatorShare ?? DEFAULT_CREATOR_SHARE;
    const platformShare = options.platformShare ?? DEFAULT_PLATFORM_SHARE;
    const dependencyShare = options.dependencyShare ?? DEFAULT_DEPENDENCY_SHARE;
    const platformRecipientId = options.platformRecipientId ?? DEFAULT_PLATFORM_RECIPIENT;
    const dependencyChain = this.getDependencyChain(
      rootClaimId,
      options.maxDepth ?? DEFAULT_MAX_DEPTH
    );
    const dependencyLineShare =
      dependencyChain.length === 0 ? 0 : dependencyShare / dependencyChain.length;

    const lines: RevenueCascadeLine[] = [
      {
        role: 'creator',
        recipientId: root.ownerId ?? root.id,
        recipientNodeId: root.id,
        share: creatorShare,
      },
      {
        role: 'platform',
        recipientId: platformRecipientId,
        share: platformShare,
      },
    ];

    for (const dependency of dependencyChain) {
      lines.push({
        role: 'dependency',
        recipientId: dependency.ownerId ?? dependency.nodeId,
        recipientNodeId: dependency.nodeId,
        share: dependencyLineShare,
        depth: dependency.depth,
      });
    }

    for (const line of lines) {
      const amount = amountOf(options.grossAmount, line.share);
      if (amount !== undefined) line.amount = amount;
    }

    const allocatedShare =
      creatorShare + platformShare + dependencyLineShare * dependencyChain.length;

    return {
      rootClaimId,
      split: { creatorShare, platformShare, dependencyShare },
      dependencyChain,
      lines,
      allocatedShare,
      unallocatedShare: Math.max(0, 1 - allocatedShare),
    };
  }

  getDependencyChain(rootNodeId: string, maxDepth = DEFAULT_MAX_DEPTH): DependencyChainEntry[] {
    this.requireNode(rootNodeId);
    const dependencyKinds = new Set<ClaimGraphEdgeKind>(['depends-on', 'imports']);
    const visited = new Set<string>([rootNodeId]);
    const result: DependencyChainEntry[] = [];
    const queue: Array<{ nodeId: string; depth: number }> = [{ nodeId: rootNodeId, depth: 0 }];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (current.depth >= maxDepth) continue;

      for (const edge of this.outgoing.get(current.nodeId) ?? []) {
        if (!edgeMatches(edge, dependencyKinds)) continue;
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);

        const dependency = this.requireNode(edge.to);
        const entry: DependencyChainEntry = {
          nodeId: dependency.id,
          depth: current.depth + 1,
          via: edge,
        };
        if (dependency.ownerId) entry.ownerId = dependency.ownerId;
        result.push(entry);
        queue.push({ nodeId: dependency.id, depth: current.depth + 1 });
      }
    }

    return result;
  }

  queryProofAdjacency(provenNodeId: string): ProofAdjacencyQuery {
    const proven = this.requireNode(provenNodeId);
    if (proven.proofStatus !== 'proven') {
      return { provenNodeId, sharesFrameWithPerceptual: false, frames: [] };
    }

    const frames: ProofAdjacencyFrame[] = [];
    for (const frameId of this.getFrameIdsForNode(provenNodeId)) {
      const perceptualNodeIds = this.getNodesInFrame(frameId)
        .filter((node) => node.id !== provenNodeId && node.proofStatus === 'perceptual')
        .map((node) => node.id)
        .sort();
      if (perceptualNodeIds.length > 0) {
        frames.push({ frameId, perceptualNodeIds });
      }
    }

    frames.sort((a, b) => a.frameId.localeCompare(b.frameId));
    return {
      provenNodeId,
      sharesFrameWithPerceptual: frames.length > 0,
      frames,
    };
  }

  findProofAdjacencyViolations(): ProofAdjacencyQuery[] {
    return this.getNodes()
      .filter((node) => node.proofStatus === 'proven')
      .map((node) => this.queryProofAdjacency(node.id))
      .filter((result) => result.sharesFrameWithPerceptual);
  }

  findProvenancePath(claimNodeId: string): ClaimGraphPath | null {
    const start = this.requireNode(claimNodeId);
    if (start.kind !== 'claim') {
      throw new Error(`Provenance path must start at a claim node: ${claimNodeId}`);
    }

    const allowed = new Set<ClaimGraphEdgeKind>(['captured-by', 'sourced-from']);
    return this.shortestPath(claimNodeId, (node) => node.kind === 'source', allowed);
  }

  resolveVerifiedSolversForClaim(claimNodeId: string): SolverMapResolution {
    const claim = this.requireNode(claimNodeId);
    if (claim.kind !== 'claim') {
      throw new Error(`Solver-map resolution must start at a claim node: ${claimNodeId}`);
    }

    const claimEvidence = new Set(claim.evidenceKinds ?? []);
    const matches: VerifiedSolverMatch[] = [];

    for (const solver of this.getNodes()) {
      if (solver.kind !== 'solver_contract' || solver.verified !== true) continue;

      const explicitGraphFit = this.hasFitEdge(claim.id, solver.id);
      const supported = solver.supportedClaimKinds ?? [];
      const requiredEvidenceKinds = solver.requiredEvidenceKinds ?? [];
      const claimKindMatches = claim.claimKind !== undefined && supported.includes(claim.claimKind);
      const evidenceMatches = includesAll(claimEvidence, requiredEvidenceKinds);

      if (!explicitGraphFit && (!claimKindMatches || !evidenceMatches)) continue;

      const match: VerifiedSolverMatch = {
        solverNodeId: solver.id,
        claimNodeId: claim.id,
        explicitGraphFit,
        requiredEvidenceKinds,
      };
      if (claimKindMatches && claim.claimKind) match.matchedClaimKind = claim.claimKind;
      matches.push(match);
    }

    matches.sort((a, b) => a.solverNodeId.localeCompare(b.solverNodeId));
    return {
      claimNodeId,
      abstain: matches.length === 0,
      matches,
    };
  }

  findClaimableUnprovenRegions(): ClaimableGap[] {
    const claimsByRegion = new Map<string, string[]>();

    for (const node of this.getNodes()) {
      if (!this.isClaimableButUnproven(node)) continue;
      const regionIds = this.getRegionIdsForNode(node.id);
      for (const regionId of regionIds.length > 0 ? regionIds : ['unscoped']) {
        const list = claimsByRegion.get(regionId) ?? [];
        list.push(node.id);
        claimsByRegion.set(regionId, list);
      }
    }

    return Array.from(claimsByRegion.entries())
      .map(([regionId, claimIds]) => {
        const region = this.nodes.get(regionId);
        const gap: ClaimableGap = {
          regionId,
          claimIds: uniqueStrings(claimIds),
          reason: 'claimable_without_discharge',
        };
        if (region?.label) gap.regionLabel = region.label;
        return gap;
      })
      .sort(
        (a, b) => b.claimIds.length - a.claimIds.length || a.regionId.localeCompare(b.regionId)
      );
  }

  private requireNode(id: string): ClaimGraphNode {
    const node = this.nodes.get(id);
    if (!node) throw new Error(`ClaimGraphNode not found: ${id}`);
    return node;
  }

  private shortestPath(
    startId: string,
    isTarget: (node: ClaimGraphNode) => boolean,
    allowedEdgeKinds: ReadonlySet<ClaimGraphEdgeKind>
  ): ClaimGraphPath | null {
    const visited = new Set<string>([startId]);
    const queue: ClaimGraphPath[] = [{ nodeIds: [startId], edges: [] }];

    while (queue.length > 0) {
      const path = queue.shift()!;
      const nodeId = path.nodeIds[path.nodeIds.length - 1]!;
      const node = this.requireNode(nodeId);
      if (nodeId !== startId && isTarget(node)) return path;

      for (const edge of this.outgoing.get(nodeId) ?? []) {
        if (!edgeMatches(edge, allowedEdgeKinds)) continue;
        if (visited.has(edge.to)) continue;
        visited.add(edge.to);
        queue.push({
          nodeIds: [...path.nodeIds, edge.to],
          edges: [...path.edges, edge],
        });
      }
    }

    return null;
  }

  private hasFitEdge(claimId: string, solverId: string): boolean {
    return this.edges.some((edge) => {
      if (edge.kind !== 'fits-claim' && edge.kind !== 'supports') return false;
      const forward = edge.from === solverId && edge.to === claimId;
      const backward = edge.from === claimId && edge.to === solverId;
      return forward || backward;
    });
  }

  private getFrameIdsForNode(nodeId: string): string[] {
    const node = this.requireNode(nodeId);
    const frameIds = new Set(node.frameIds ?? []);

    for (const edge of [
      ...(this.outgoing.get(nodeId) ?? []),
      ...(this.incoming.get(nodeId) ?? []),
    ]) {
      if (edge.kind !== 'in-frame') continue;
      const otherId = edge.from === nodeId ? edge.to : edge.from;
      if (this.nodes.get(otherId)?.kind === 'frame') frameIds.add(otherId);
    }

    return Array.from(frameIds).sort();
  }

  private getNodesInFrame(frameId: string): ClaimGraphNode[] {
    const frame = this.requireNode(frameId);
    if (frame.kind !== 'frame') return [];

    const nodeIds = new Set<string>();
    for (const edge of [
      ...(this.outgoing.get(frameId) ?? []),
      ...(this.incoming.get(frameId) ?? []),
    ]) {
      if (edge.kind !== 'in-frame') continue;
      nodeIds.add(edge.from === frameId ? edge.to : edge.from);
    }

    for (const node of this.nodes.values()) {
      if (node.frameIds?.includes(frameId)) nodeIds.add(node.id);
    }

    return Array.from(nodeIds)
      .map((id) => this.nodes.get(id))
      .filter((node): node is ClaimGraphNode => Boolean(node));
  }

  private getRegionIdsForNode(nodeId: string): string[] {
    const node = this.requireNode(nodeId);
    const regionIds = new Set<string>();
    if (node.regionId) regionIds.add(node.regionId);

    for (const edge of [
      ...(this.outgoing.get(nodeId) ?? []),
      ...(this.incoming.get(nodeId) ?? []),
    ]) {
      if (edge.kind !== 'located-in') continue;
      const otherId = edge.from === nodeId ? edge.to : edge.from;
      if (this.nodes.get(otherId)?.kind === 'region') regionIds.add(otherId);
    }

    return Array.from(regionIds).sort();
  }

  private isClaimableButUnproven(node: ClaimGraphNode): boolean {
    if (node.kind !== 'claim') return false;
    const claimable = node.claimable === true || node.proofStatus === 'claimable';
    if (!claimable || node.proofStatus === 'proven') return false;

    const hasReceipt = (this.outgoing.get(node.id) ?? []).some((edge) => {
      if (edge.kind !== 'discharged-by') return false;
      return this.nodes.get(edge.to)?.kind === 'cael_receipt';
    });

    return !hasReceipt;
  }
}

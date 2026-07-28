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
  | 'labeled'
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

export type VerifiedClaimProofSurface = 'verify_cael_trace' | 'simulation_contract';

export interface ClaimDischargeReceipt {
  id?: string;
  surface: VerifiedClaimProofSurface;
  traceId?: string;
  traceHash?: string;
  verifyUrl?: string;
  contractId?: string;
  metadata?: Record<string, unknown>;
}

export interface ClaimProverInput {
  claim: ClaimGraphNode;
  solver: ClaimGraphNode;
  match: VerifiedSolverMatch;
  budgetMs: number;
  signal: AbortSignal;
}

export interface ClaimProverDischarge {
  discharged: boolean;
  receipt?: ClaimDischargeReceipt;
  reason?: string;
}

export type ClaimProver = (
  input: ClaimProverInput
) => ClaimProverDischarge | Promise<ClaimProverDischarge>;

export type ClaimRouterStatus = 'proven' | 'labeled';

export type ClaimRouterReason =
  | 'discharged'
  | 'no_solver_maps'
  | 'prover_timeout'
  | 'prover_rejected'
  | 'prover_failed';

export interface ClaimRouterAttempt {
  solverNodeId: string;
  explicitGraphFit: boolean;
  status: ClaimRouterStatus;
  reason: ClaimRouterReason;
  elapsedMs: number;
  receipt?: ClaimDischargeReceipt;
  error?: string;
}

export interface ClaimRouterOptions {
  prover: ClaimProver;
  budgetMs?: number;
  mutateGraph?: boolean;
}

export interface ClaimRouterResult {
  claimNodeId: string;
  status: ClaimRouterStatus;
  abstain: boolean;
  reason: ClaimRouterReason;
  solverMap: SolverMapResolution;
  attempts: ClaimRouterAttempt[];
  receiptNodeId?: string;
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
const DEFAULT_PROVER_BUDGET_MS = 5_000;

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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDischargedReceipt(
  receipt: ClaimDischargeReceipt | undefined
): receipt is ClaimDischargeReceipt {
  if (!receipt) return false;
  if (receipt.surface !== 'verify_cael_trace' && receipt.surface !== 'simulation_contract') {
    return false;
  }
  return Boolean(receipt.traceId || receipt.traceHash || receipt.verifyUrl || receipt.contractId);
}

async function runWithinBudget<T>(
  work: Promise<T>,
  budgetMs: number,
  controller: AbortController
): Promise<
  { timedOut: false; value: T; elapsedMs: number } | { timedOut: true; elapsedMs: number }
> {
  const started = Date.now();
  let timeout: ReturnType<typeof setTimeout> | undefined;

  const timed = new Promise<{ timedOut: true; elapsedMs: number }>((resolve) => {
    timeout = setTimeout(
      () => {
        controller.abort();
        resolve({ timedOut: true, elapsedMs: Date.now() - started });
      },
      Math.max(0, budgetMs)
    );
  });

  try {
    const value = await Promise.race([
      work.then((resolved) => ({
        timedOut: false as const,
        value: resolved,
        elapsedMs: Date.now() - started,
      })),
      timed,
    ]);
    return value;
  } finally {
    if (timeout) clearTimeout(timeout);
  }
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

  async routeClaimThroughProver(
    claimNodeId: string,
    options: ClaimRouterOptions
  ): Promise<ClaimRouterResult> {
    const claim = this.requireNode(claimNodeId);
    if (claim.kind !== 'claim') {
      throw new Error(`Claim prover router must start at a claim node: ${claimNodeId}`);
    }
    const budgetMs = options.budgetMs ?? DEFAULT_PROVER_BUDGET_MS;
    const mutateGraph = options.mutateGraph !== false;
    const solverMap = this.resolveVerifiedSolversForClaim(claimNodeId);

    if (solverMap.abstain) {
      if (mutateGraph) this.setClaimProofStatus(claimNodeId, 'labeled');
      return {
        claimNodeId,
        status: 'labeled',
        abstain: true,
        reason: 'no_solver_maps',
        solverMap,
        attempts: [],
      };
    }

    const attempts: ClaimRouterAttempt[] = [];
    for (const match of solverMap.matches) {
      const solver = this.requireNode(match.solverNodeId);
      const controller = new AbortController();
      let discharge: ClaimProverDischarge;
      let elapsedMs = 0;

      try {
        const result = await runWithinBudget(
          Promise.resolve(
            options.prover({
              claim: { ...claim },
              solver: { ...solver },
              match,
              budgetMs,
              signal: controller.signal,
            })
          ),
          budgetMs,
          controller
        );
        elapsedMs = result.elapsedMs;

        if (result.timedOut) {
          attempts.push({
            solverNodeId: match.solverNodeId,
            explicitGraphFit: match.explicitGraphFit,
            status: 'labeled',
            reason: 'prover_timeout',
            elapsedMs,
          });
          continue;
        }

        discharge = result.value;
      } catch (error) {
        attempts.push({
          solverNodeId: match.solverNodeId,
          explicitGraphFit: match.explicitGraphFit,
          status: 'labeled',
          reason: 'prover_failed',
          elapsedMs,
          error: errorMessage(error),
        });
        continue;
      }

      if (!discharge.discharged || !isDischargedReceipt(discharge.receipt)) {
        attempts.push({
          solverNodeId: match.solverNodeId,
          explicitGraphFit: match.explicitGraphFit,
          status: 'labeled',
          reason: 'prover_rejected',
          elapsedMs,
          ...(discharge.receipt ? { receipt: discharge.receipt } : {}),
          ...(discharge.reason ? { error: discharge.reason } : {}),
        });
        continue;
      }

      const receiptNodeId = this.recordDischargedReceipt(claimNodeId, match, discharge.receipt, {
        mutateGraph,
      });
      attempts.push({
        solverNodeId: match.solverNodeId,
        explicitGraphFit: match.explicitGraphFit,
        status: 'proven',
        reason: 'discharged',
        elapsedMs,
        receipt: discharge.receipt,
      });
      return {
        claimNodeId,
        status: 'proven',
        abstain: false,
        reason: 'discharged',
        solverMap,
        attempts,
        receiptNodeId,
      };
    }

    if (mutateGraph) this.setClaimProofStatus(claimNodeId, 'labeled');
    const reason = attempts.some((attempt) => attempt.reason === 'prover_timeout')
      ? 'prover_timeout'
      : attempts.some((attempt) => attempt.reason === 'prover_failed')
        ? 'prover_failed'
        : 'prover_rejected';

    return {
      claimNodeId,
      status: 'labeled',
      abstain: true,
      reason,
      solverMap,
      attempts,
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

  private setClaimProofStatus(claimNodeId: string, proofStatus: ClaimProofStatus): void {
    const claim = this.requireNode(claimNodeId);
    this.nodes.set(claimNodeId, { ...claim, proofStatus });
  }

  private recordDischargedReceipt(
    claimNodeId: string,
    match: VerifiedSolverMatch,
    receipt: ClaimDischargeReceipt,
    options: { mutateGraph: boolean }
  ): string {
    const receiptNodeId =
      receipt.id ??
      `receipt:${claimNodeId.replace(/[^a-zA-Z0-9:_-]/g, '_')}:${match.solverNodeId.replace(
        /[^a-zA-Z0-9:_-]/g,
        '_'
      )}`;

    if (!options.mutateGraph) return receiptNodeId;

    this.setClaimProofStatus(claimNodeId, 'proven');
    this.addNode({
      id: receiptNodeId,
      kind: 'cael_receipt',
      verified: true,
      metadata: {
        ...receipt.metadata,
        proofSurface: receipt.surface,
        traceId: receipt.traceId,
        traceHash: receipt.traceHash,
        verifyUrl: receipt.verifyUrl,
        contractId: receipt.contractId,
        solverNodeId: match.solverNodeId,
        claimNodeId,
      },
    });
    this.addEdge({
      from: claimNodeId,
      to: receiptNodeId,
      kind: 'discharged-by',
      metadata: {
        solverNodeId: match.solverNodeId,
        proofSurface: receipt.surface,
        traceId: receipt.traceId,
        traceHash: receipt.traceHash,
        verifyUrl: receipt.verifyUrl,
        contractId: receipt.contractId,
      },
    });
    return receiptNodeId;
  }
}

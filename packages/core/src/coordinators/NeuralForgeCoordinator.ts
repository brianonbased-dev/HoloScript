/**
 * NeuralForgeCoordinator — fifth consumer-bus closing Pattern E for the
 * neural_forge trait.
 *
 * /stub-audit found that NeuralForgeTrait emits 5 events with zero downstream
 * listeners outside tests (task_1777423899630_nsna). The trait's
 * synthesis-lifecycle vocabulary — connect, request, absorb, timeout, evolve —
 * is stateful (pending requests, shard accumulation, weight drift), making it
 * a strong candidate for a coordinator that tracks per-node state so
 * downstream consumers (Studio NPC panels, Brittney synthesis routing, Quest 3
 * cognition overlays) can subscribe to aggregated state instead of
 * re-correlating raw event firings.
 *
 * **Events tracked** (from NeuralForgeTrait.ts emit audit):
 *   - neural_forge_connected   — trait initialized on a node
 *   - neural_synthesis_request — external synthesis requested (mode='external')
 *   - neural_synthesis_timeout — watchdog: no absorb_shard within timeout
 *   - neural_shard_created     — a new shard was created (mock or fallback)
 *   - neural_cognition_evolved — personality weights changed after absorption
 *
 * **Downstream consumers** (this bus exists so they can be built):
 *   - Studio NPC cognition panel (real-time weight radar chart + shard history)
 *   - Brittney synthesis routing (wire neural_synthesis_request → LLM backend)
 *   - Quest 3 cognition overlay (weight visualization via embodied presence)
 *   - Logging/metrics dashboards (synthesis success rate, timeout frequency)
 *
 * **Contract** (same shape as the 4 existing coordinators):
 * Constructor takes a duck-typed `EventSource` ({ on(event, handler) }).
 * Subscribes once to the full neural-forge event vocabulary at construction,
 * tracks per-node state, and exposes subscribe()/getState()/getStats()/reset()
 * for downstream consumers. Bus discipline: a thrown listener never crashes
 * other listeners (mirrors AssetLoadCoordinator pattern).
 */

/** Duck-typed event source — TraitContextFactory matches this shape. */
export interface NeuralForgeEventSource {
  on(event: string, handler: (payload: unknown) => void): void;
}

/** Per-node neural state tracked by the coordinator. */
export type NeuralNodeStatus = 'connected' | 'idle' | 'synthesizing' | 'timeout_fallback';

export interface NeuralNodeState {
  /** Node ID from the trait's node.id. */
  nodeId: string;
  /** Current status of the neural forge on this node. */
  status: NeuralNodeStatus;
  /** Number of shards absorbed. */
  shardCount: number;
  /** Last known personality weights (openness, conscientiousness, etc.). */
  weights: Record<string, number>;
  /** Timestamp of last synthesis (ms epoch). */
  lastSynthesisAt: number | null;
  /** Whether an external synthesis request is in-flight. */
  pendingExternalSynthesis: boolean;
  /** When the pending request was emitted (ms epoch), null when idle. */
  pendingSince: number | null;
  /** Number of experience log entries at last observation. */
  experienceLogLength: number;
  /** Timestamp of last state change (ms epoch). */
  updatedAt: number;
}

export interface NeuralForgeStats {
  /** Total nodes tracked. */
  total: number;
  /** Nodes with an active external synthesis request in-flight. */
  synthesizing: number;
  /** Nodes in timeout-fallback state. */
  timeoutFallback: number;
  /** Total shards across all nodes. */
  totalShards: number;
  /** Whether any node has fired neural_forge_connected (any ready). */
  anyConnected: boolean;
}

export type NeuralForgeListener = (state: NeuralNodeState) => void;

/**
 * The full neural-forge event vocabulary the coordinator subscribes to.
 * NeuralForgeTrait.ts is the single emitter — listed explicitly so future
 * agents know which trait events feed this bus.
 */
const NEURAL_FORGE_EVENTS = [
  'neural_forge_connected',
  'neural_synthesis_request',
  'neural_synthesis_timeout',
  'neural_shard_created',
  'neural_cognition_evolved',
] as const;

export class NeuralForgeCoordinator {
  private nodes = new Map<string, NeuralNodeState>();
  private listeners = new Set<NeuralForgeListener>();
  /** Tracks which nodes have fired neural_forge_connected. */
  private connectedNodes = new Set<string>();

  constructor(source: NeuralForgeEventSource) {
    for (const event of NEURAL_FORGE_EVENTS) {
      source.on(event, (payload: unknown) => this.handleEvent(event, payload));
    }
  }

  // ---- Event ingestion ---------------------------------------------------

  private handleEvent(event: string, payload: unknown): void {
    if (!payload || typeof payload !== 'object') return;
    const p = payload as Record<string, unknown>;

    // Resolve node ID — the trait emits { node } where node.id is the key.
    const nodeObj = p.node as Record<string, unknown> | undefined;
    const nodeId = (nodeObj?.id as string) ?? (p.nodeId as string) ?? (p.sourceId as string);
    if (!nodeId || typeof nodeId !== 'string') return;

    const observedAt = Date.now();

    switch (event) {
      case 'neural_forge_connected': {
        this.connectedNodes.add(nodeId);
        const existing = this.nodes.get(nodeId);
        const next: NeuralNodeState = {
          nodeId,
          status: existing?.status ?? 'connected',
          shardCount: existing?.shardCount ?? 0,
          weights: existing?.weights ?? {},
          lastSynthesisAt: existing?.lastSynthesisAt ?? null,
          pendingExternalSynthesis: existing?.pendingExternalSynthesis ?? false,
          pendingSince: existing?.pendingSince ?? null,
          experienceLogLength: existing?.experienceLogLength ?? 0,
          updatedAt: observedAt,
        };
        this.nodes.set(nodeId, next);
        this.notifyListeners(next);
        break;
      }

      case 'neural_synthesis_request': {
        const mode = p.mode as string | undefined;
        const experiences = p.experiences as unknown[] | undefined;
        const weights = p.currentWeights as Record<string, number> | undefined;
        const existing = this.nodes.get(nodeId);

        const next: NeuralNodeState = {
          nodeId,
          status: mode === 'external' ? 'synthesizing' : (existing?.status ?? 'idle'),
          shardCount: existing?.shardCount ?? 0,
          weights: weights ?? existing?.weights ?? {},
          lastSynthesisAt: existing?.lastSynthesisAt ?? null,
          pendingExternalSynthesis: mode === 'external',
          pendingSince: mode === 'external' ? observedAt : null,
          experienceLogLength: Array.isArray(experiences) ? experiences.length : (existing?.experienceLogLength ?? 0),
          updatedAt: observedAt,
        };
        this.nodes.set(nodeId, next);
        this.notifyListeners(next);
        break;
      }

      case 'neural_synthesis_timeout': {
        const experienceCount = p.experienceCount as number | undefined;
        const existing = this.nodes.get(nodeId);

        const next: NeuralNodeState = {
          nodeId,
          status: 'timeout_fallback',
          shardCount: existing?.shardCount ?? 0,
          weights: existing?.weights ?? {},
          lastSynthesisAt: existing?.lastSynthesisAt ?? null,
          pendingExternalSynthesis: false,
          pendingSince: null,
          experienceLogLength: experienceCount ?? (existing?.experienceLogLength ?? 0),
          updatedAt: observedAt,
        };
        this.nodes.set(nodeId, next);
        this.notifyListeners(next);
        break;
      }

      case 'neural_shard_created': {
        const shard = p.shard as Record<string, unknown> | undefined;
        const existing = this.nodes.get(nodeId);

        const next: NeuralNodeState = {
          nodeId,
          status: existing?.pendingExternalSynthesis ? 'synthesizing' : (existing?.status ?? 'idle'),
          shardCount: (existing?.shardCount ?? 0) + 1,
          weights: existing?.weights ?? {},
          lastSynthesisAt: observedAt,
          pendingExternalSynthesis: existing?.pendingExternalSynthesis ?? false,
          pendingSince: existing?.pendingSince ?? null,
          experienceLogLength: existing?.experienceLogLength ?? 0,
          updatedAt: observedAt,
        };
        this.nodes.set(nodeId, next);
        this.notifyListeners(next);
        break;
      }

      case 'neural_cognition_evolved': {
        const weights = p.currentWeights as Record<string, number> | undefined;
        const existing = this.nodes.get(nodeId);
        if (!existing) {
          // Cognition evolved before connected — create a synthetic entry.
          const next: NeuralNodeState = {
            nodeId,
            status: 'idle',
            shardCount: 0,
            weights: weights ?? {},
            lastSynthesisAt: null,
            pendingExternalSynthesis: false,
            pendingSince: null,
            experienceLogLength: 0,
            updatedAt: observedAt,
          };
          this.nodes.set(nodeId, next);
          this.notifyListeners(next);
        } else {
          existing.weights = weights ?? existing.weights;
          existing.updatedAt = observedAt;
          this.notifyListeners(existing);
        }
        break;
      }
    }
  }

  private notifyListeners(state: NeuralNodeState): void {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch (_) {
        // Bus discipline: one listener throwing must not crash other listeners
        // (matches AssetLoadCoordinator / StudioBus pattern).
      }
    }
  }

  // ---- Public API --------------------------------------------------------

  /** Subscribe to all neural-node state changes. Returns an unsubscribe function. */
  subscribe(listener: NeuralForgeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Get the state of a specific node (undefined if never seen). */
  getNodeState(nodeId: string): NeuralNodeState | undefined {
    return this.nodes.get(nodeId);
  }

  /** Get all tracked node states (snapshot — safe to iterate). */
  getAllStates(): NeuralNodeState[] {
    return Array.from(this.nodes.values());
  }

  /** Whether a specific node has fired neural_forge_connected. */
  isConnected(nodeId: string): boolean {
    return this.connectedNodes.has(nodeId);
  }

  /** Aggregate stats across all tracked nodes. */
  getStats(): NeuralForgeStats {
    const all = Array.from(this.nodes.values());
    return {
      total: all.length,
      synthesizing: all.filter((s) => s.status === 'synthesizing').length,
      timeoutFallback: all.filter((s) => s.status === 'timeout_fallback').length,
      totalShards: all.reduce((sum, s) => sum + s.shardCount, 0),
      anyConnected: this.connectedNodes.size > 0,
    };
  }

  /** Clear all tracked state — typically called on scene change. */
  reset(): void {
    this.nodes.clear();
    this.connectedNodes.clear();
  }

  /** Number of distinct event types this coordinator subscribes to (diagnostic). */
  get subscribedEventCount(): number {
    return NEURAL_FORGE_EVENTS.length;
  }
}
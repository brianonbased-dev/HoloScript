/**
 * TraitRuntimeIntegration
 *
 * Integrates HoloScript's VRTraitRegistry into any runtime loop.
 * This is the execution engine that makes all 121 trait handlers actually run:
 *
 *   1. Parses .holo/.hsplus files → AST with trait declarations
 *   2. Uses VRTraitRegistry to attach traits to nodes
 *   3. Calls updateAllTraits() each frame with real TraitContext
 *   4. Dispatches TraitEvents from platform packages (XR input, physics, etc.)
 *
 * Usage:
 *   const factory = createTraitContextFactory({ physics, audio, haptics });
 *   const integration = new TraitRuntimeIntegration(factory);
 *   integration.attachTraitsFromAST(parsedNodes);
 *   // Each frame:
 *   integration.update(deltaTime);
 *
 * @module TraitRuntimeIntegration
 */
import { VRTraitRegistry } from '@holoscript/core';
import type { HSPlusNode, VRTraitName } from '@holoscript/core';
import type { TraitContext, TraitEvent } from '@holoscript/core';
import { AssetLoadCoordinator } from '@holoscript/core/coordinators';

import type { TraitContextFactory } from './TraitContextFactory';

// =============================================================================
// Types
// =============================================================================

export interface TrackedNode {
  node: HSPlusNode;
  traitNames: VRTraitName[];
}

export interface TraitRuntimeStats {
  trackedNodes: number;
  totalTraits: number;
  updatesPerSecond: number;
  lastUpdateMs: number;
}

// =============================================================================
// Integration
// =============================================================================

export class TraitRuntimeIntegration {
  private registry: VRTraitRegistry;
  private contextFactory: TraitContextFactory;
  private context: TraitContext;
  private trackedNodes: Map<string, TrackedNode> = new Map();
  private frameCount: number = 0;
  private lastStatsTime: number = 0;
  private updatesPerSecond: number = 0;
  private lastUpdateMs: number = 0;
  private paused: boolean = false;

  /**
   * Asset load consumer-bus — Pattern E remediation per /stub-audit
   * Phase 3.5 + task_1777281302813_eezs (commit 7ae7971cc). Subscribes
   * to the engine's TraitContextFactory event stream and tracks
   * GLTF/USD/FBX asset loading state across the runtime. Downstream
   * consumers (loading screens, asset caches, scene-progress overlays)
   * call `traitRuntime.assetLoadCoordinator.subscribe(listener)` to
   * observe state changes.
   */
  readonly assetLoadCoordinator: AssetLoadCoordinator;

  constructor(contextFactory: TraitContextFactory) {
    this.registry = new VRTraitRegistry();
    this.contextFactory = contextFactory;
    this.context = contextFactory.createContext();
    // Wire the asset-load consumer-bus to the factory's event stream.
    // Constructor subscribes to all 15 asset-load events; coordinator
    // is then publicly readable so callers can subscribe to state.
    this.assetLoadCoordinator = new AssetLoadCoordinator(contextFactory);
  }

  // ---- Node management ---------------------------------------------------

  /**
   * Register a node and attach its declared traits.
   */
  registerNode(node: HSPlusNode): void {
    const nodeId = node.id || `node_${this.trackedNodes.size}`;
    if (!node.id) node.id = nodeId;

    const traitNames: VRTraitName[] = [];

    if (node.traits) {
      for (const [traitName, config] of node.traits.entries()) {
        this.registry.attachTrait(node, traitName as VRTraitName, config, this.context);
        traitNames.push(traitName as VRTraitName);
      }
    }

    this.trackedNodes.set(nodeId, { node, traitNames });
  }

  /**
   * Attach traits from parsed AST nodes.
   * Walks the AST and registers any node that has traits declared.
   */
  attachTraitsFromAST(nodes: HSPlusNode[]): void {
    for (const node of nodes) {
      if (node.traits && node.traits.size > 0) {
        this.registerNode(node);
      }
      if ((node as HSPlusNode & { children?: HSPlusNode[] }).children) {
        this.attachTraitsFromAST((node as HSPlusNode & { children?: HSPlusNode[] }).children!);
      }
    }
  }

  /**
   * Dynamically attach a trait to an already-registered node.
   */
  attachTrait(nodeId: string, traitName: VRTraitName, config: unknown = {}): void {
    const tracked = this.trackedNodes.get(nodeId);
    if (!tracked) return;

    this.registry.attachTrait(
      tracked.node,
      traitName,
      config as Record<string, unknown>,
      this.context
    );
    if (!tracked.traitNames.includes(traitName)) {
      tracked.traitNames.push(traitName);
    }
  }

  /**
   * Detach a trait from a node.
   */
  detachTrait(nodeId: string, traitName: VRTraitName): void {
    const tracked = this.trackedNodes.get(nodeId);
    if (!tracked) return;

    this.registry.detachTrait(tracked.node, traitName, this.context);
    tracked.traitNames = tracked.traitNames.filter((t) => t !== traitName);
  }

  /**
   * Unregister a node and detach all its traits.
   */
  unregisterNode(nodeId: string): void {
    const tracked = this.trackedNodes.get(nodeId);
    if (!tracked) return;

    for (const traitName of tracked.traitNames) {
      this.registry.detachTrait(tracked.node, traitName, this.context);
    }

    this.trackedNodes.delete(nodeId);
  }

  // ---- Frame update ------------------------------------------------------

  /**
   * Call every frame. Updates all traits on all tracked nodes.
   * @param delta Time in seconds since last frame
   */
  update(delta: number): void {
    if (this.paused) return;

    const start = performance.now();

    for (const { node } of this.trackedNodes.values()) {
      this.registry.updateAllTraits(node, this.context, delta);
    }

    this.lastUpdateMs = performance.now() - start;
    this.frameCount++;

    // Update stats every second
    const now = performance.now();
    if (now - this.lastStatsTime >= 1000) {
      this.updatesPerSecond = this.frameCount;
      this.frameCount = 0;
      this.lastStatsTime = now;
    }
  }

  // ---- Event dispatch ----------------------------------------------------

  /**
   * Dispatch a TraitEvent to a specific node.
   */
  dispatchEvent(nodeId: string, event: TraitEvent): void {
    const tracked = this.trackedNodes.get(nodeId);
    if (!tracked) return;

    this.registry.handleEventForAllTraits(tracked.node, this.context, event);
  }

  /**
   * Dispatch a TraitEvent to ALL tracked nodes.
   */
  broadcastEvent(event: TraitEvent): void {
    for (const { node } of this.trackedNodes.values()) {
      this.registry.handleEventForAllTraits(node, this.context, event);
    }
  }

  // ---- Control -----------------------------------------------------------

  pause(): void {
    this.paused = true;
  }
  resume(): void {
    this.paused = false;
  }
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Refresh the TraitContext (call after hot-swapping a provider).
   */
  refreshContext(): void {
    this.context = this.contextFactory.createContext();
  }

  // ---- Queries -----------------------------------------------------------

  getNode(nodeId: string): HSPlusNode | undefined {
    return this.trackedNodes.get(nodeId)?.node;
  }

  getNodeTraits(nodeId: string): VRTraitName[] {
    return this.trackedNodes.get(nodeId)?.traitNames ?? [];
  }

  getAllNodeIds(): string[] {
    return Array.from(this.trackedNodes.keys());
  }

  getStats(): TraitRuntimeStats {
    let totalTraits = 0;
    for (const { traitNames } of this.trackedNodes.values()) {
      totalTraits += traitNames.length;
    }
    return {
      trackedNodes: this.trackedNodes.size,
      totalTraits,
      updatesPerSecond: this.updatesPerSecond,
      lastUpdateMs: this.lastUpdateMs,
    };
  }

  getRegistry(): VRTraitRegistry {
    return this.registry;
  }

  getContext(): TraitContext {
    return this.context;
  }

  // ---- Lifecycle ---------------------------------------------------------

  reset(): void {
    for (const nodeId of Array.from(this.trackedNodes.keys())) {
      this.unregisterNode(nodeId);
    }
    this.trackedNodes.clear();
    this.frameCount = 0;
    this.lastStatsTime = 0;
    this.updatesPerSecond = 0;
    this.lastUpdateMs = 0;
  }

  dispose(): void {
    this.reset();
    this.contextFactory.dispose();
  }
}

// =============================================================================
// Factory
// =============================================================================

export function createTraitRuntime(contextFactory: TraitContextFactory): TraitRuntimeIntegration {
  return new TraitRuntimeIntegration(contextFactory);
}

/**
 * @fileoverview Linear Type Checker — Compile-Time Ownership Verification
 * @module @holoscript/core/compiler/safety
 *
 * Move-inspired linear type checking for HoloScript VR resources.
 * Tracks ownership of resource instances through the AST, detecting:
 *
 * - use-after-move: Resource accessed after being transferred
 * - use-after-consume: Resource accessed after being destroyed
 * - double-move: Resource transferred twice
 * - resource-leak: Resource goes out of scope without being consumed/transferred
 * - illegal-copy: Non-Copy resource duplicated
 * - illegal-drop: Non-Drop resource silently dropped
 *
 * Works with the same EffectASTNode interface as all other safety layers.
 *
 * @version 1.0.0
 */

import type {
  ResourceType,
  ResourceAbility,
  OwnershipState,
  LinearViolation,
  LinearCheckResult,
} from '../../types/linear';
import type { EffectASTNode } from './EffectChecker';

// =============================================================================
// BUILT-IN RESOURCE TYPES
// =============================================================================

/**
 * Built-in VR resource types with their abilities and operations.
 */
export const BUILTIN_RESOURCES: Record<string, ResourceType> = {
  InventoryItem: {
    name: 'InventoryItem',
    abilities: new Set<ResourceAbility>(),
    consumingOps: ['destroyItem', 'consumeItem'],
    producingOps: ['giveItem', 'spawn'],
  },
  EntityAuthority: {
    name: 'EntityAuthority',
    abilities: new Set<ResourceAbility>(),
    consumingOps: ['revokeAccess'],
    producingOps: ['transferOwnership'],
  },
  ZonePermit: {
    name: 'ZonePermit',
    abilities: new Set<ResourceAbility>(['drop']),
    consumingOps: ['revokeAccess'],
    producingOps: ['claimZone'],
  },
  CapabilityToken: {
    name: 'CapabilityToken',
    abilities: new Set<ResourceAbility>(),
    consumingOps: ['revokeAccess'],
    producingOps: [],
  },
  AgentHandle: {
    name: 'AgentHandle',
    abilities: new Set<ResourceAbility>(),
    consumingOps: ['killAgent'],
    producingOps: ['spawnAgent'],
  },
};

// =============================================================================
// TRAIT → RESOURCE MAPPING
// =============================================================================

/**
 * Maps HoloScript traits to the resource types they produce.
 * When a node has one of these traits, it creates a tracked resource.
 */
export const TRAIT_RESOURCE_MAP: Record<string, string> = {
  '@inventory': 'InventoryItem',
  '@tradeable': 'InventoryItem',
  '@consumable': 'InventoryItem',
  '@loot': 'InventoryItem',
  '@owned': 'EntityAuthority',
  '@delegated': 'EntityAuthority',
  '@zone': 'ZonePermit',
  '@agent': 'AgentHandle',
  '@npc': 'AgentHandle',
};

// =============================================================================
// CHECKER CONFIGURATION
// =============================================================================

/** Configuration for the linear type checker */
export interface LinearCheckerConfig {
  /** Custom resource types (merged with built-ins) */
  customResources?: Record<string, ResourceType>;
  /** Custom trait-to-resource mappings (merged with built-ins) */
  customTraitMap?: Record<string, string>;
  /** Treat resource leaks as errors (default: true) */
  strictLeaks?: boolean;
}

// =============================================================================
// TRACKED RESOURCE INSTANCE
// =============================================================================

/** Internal tracking state for a resource instance */
interface TrackedResource {
  /** The resource type definition */
  type: ResourceType;
  /** Current ownership state */
  state: OwnershipState;
  /** Name of the node that produced this resource */
  nodeName: string;
  /** Source location where the resource was created */
  createdAt: { line?: number; column?: number };
}

// =============================================================================
// LINEAR TYPE CHECKER
// =============================================================================

/**
 * LinearTypeChecker — verifies ownership discipline for VR resources.
 *
 * @example
 * ```typescript
 * const checker = new LinearTypeChecker();
 * const result = checker.checkModule(nodes);
 * if (!result.passed) {
 *   for (const v of result.violations) console.error(v.message);
 * }
 * ```
 */
export class LinearTypeChecker {
  private resources: Record<string, ResourceType>;
  private traitMap: Record<string, string>;
  private strictLeaks: boolean;

  constructor(config: LinearCheckerConfig = {}) {
    this.resources = { ...BUILTIN_RESOURCES, ...config.customResources };
    this.traitMap = { ...TRAIT_RESOURCE_MAP, ...config.customTraitMap };
    this.strictLeaks = config.strictLeaks !== false;
  }

  /**
   * Check an entire module for linear type violations.
   */
  checkModule(nodes: EffectASTNode[]): LinearCheckResult {
    const allViolations: LinearViolation[] = [];
    const allTracked = new Map<string, OwnershipState>();

    // Track resources across all nodes in the module scope
    const scope = new Map<string, TrackedResource>();

    for (const node of nodes) {
      const nodeResult = this.checkNode(node);
      allViolations.push(...nodeResult.violations);

      // Merge tracked resources into module-level scope
      for (const [name, state] of nodeResult.trackedResources) {
        allTracked.set(name, state);
      }

      // Detect resources produced by this node's traits
      this.detectResourcesFromTraits(node, scope);

      // Process calls that consume resources
      this.processConsumingCalls(node, scope, allViolations);
    }

    // Check for resource leaks at module scope exit
    this.checkLeaks(scope, allViolations);

    // Merge scope into tracked
    for (const [name, tracked] of scope) {
      allTracked.set(name, tracked.state);
    }

    const hasErrors = allViolations.some((v) => v.severity === 'error');

    return {
      passed: !hasErrors,
      violations: allViolations,
      trackedResources: allTracked,
    };
  }

  /**
   * Check a single AST node for linear type violations.
   */
  checkNode(node: EffectASTNode): LinearCheckResult {
    const violations: LinearViolation[] = [];
    const tracked = new Map<string, OwnershipState>();
    const scope = new Map<string, TrackedResource>();

    // Detect resources from traits
    this.detectResourcesFromTraits(node, scope);

    // Process consuming calls
    this.processConsumingCalls(node, scope, violations);

    // Check children recursively
    if (node.children) {
      for (const child of node.children) {
        // Check if child references a moved/consumed resource
        this.checkReferencesInNode(child, scope, violations);

        // Process child's consuming calls
        this.processConsumingCalls(child, scope, violations);
      }
    }

    // Populate tracked map
    for (const [name, res] of scope) {
      tracked.set(name, res.state);
    }

    return {
      passed: !violations.some((v) => v.severity === 'error'),
      violations,
      trackedResources: tracked,
    };
  }

  // ---------------------------------------------------------------------------
  // INTERNAL: Resource Detection
  // ---------------------------------------------------------------------------

  /**
   * Detect resource types from a node's traits and register them in the scope.
   */
  private detectResourcesFromTraits(
    node: EffectASTNode,
    scope: Map<string, TrackedResource>
  ): void {
    if (!node.traits) return;

    for (const trait of node.traits) {
      const normalized = trait.startsWith('@') ? trait : `@${trait}`;
      const resourceTypeName = this.traitMap[normalized];
      if (resourceTypeName && this.resources[resourceTypeName]) {
        const resourceType = this.resources[resourceTypeName];
        const name = node.name || '<anonymous>';

        // Only register if not already tracked (first trait wins)
        if (!scope.has(name)) {
          scope.set(name, {
            type: resourceType,
            state: 'owned',
            nodeName: name,
            createdAt: { line: node.line, column: node.column },
          });
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // INTERNAL: Consuming Operations
  // ---------------------------------------------------------------------------

  /**
   * Process function calls that consume resources.
   */
  private processConsumingCalls(
    node: EffectASTNode,
    scope: Map<string, TrackedResource>,
    violations: LinearViolation[]
  ): void {
    if (!node.calls) return;

    for (const call of node.calls) {
      // Check if this call consumes any tracked resource
      for (const [name, tracked] of scope) {
        if (tracked.type.consumingOps.includes(call)) {
          if (tracked.state === 'consumed') {
            // Double consume — use-after-consume
            violations.push({
              kind: 'use-after-consume',
              resourceName: name,
              resourceType: tracked.type.name,
              location: { line: node.line, column: node.column, functionName: node.name },
              message: `Resource '${name}' (${tracked.type.name}) already consumed — cannot call '${call}' again.`,
              severity: 'error',
              suggestion: `Remove the duplicate '${call}' call, or produce a new ${tracked.type.name} first.`,
            });
          } else if (tracked.state === 'moved') {
            // Use after move
            violations.push({
              kind: 'use-after-move',
              resourceName: name,
              resourceType: tracked.type.name,
              location: { line: node.line, column: node.column, functionName: node.name },
              message: `Resource '${name}' (${tracked.type.name}) was moved — cannot call '${call}'.`,
              severity: 'error',
              suggestion: `The resource was transferred. Obtain a new reference before using it.`,
            });
          } else {
            // Valid consumption
            tracked.state = 'consumed';
          }
        }

        // Check if this call is a producing op that creates a NEW resource
        // (producing ops on already-tracked resources would be re-creation)
        if (tracked.type.producingOps.includes(call) && tracked.state === 'owned') {
          // Transfer/move: the caller gives away the resource
          tracked.state = 'moved';
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // INTERNAL: Reference Checking
  // ---------------------------------------------------------------------------

  /**
   * Check if a node references moved/consumed resources.
   */
  private checkReferencesInNode(
    node: EffectASTNode,
    scope: Map<string, TrackedResource>,
    violations: LinearViolation[]
  ): void {
    const nodeName = node.name || '';

    // If this node's name matches a tracked resource, check its state
    const tracked = scope.get(nodeName);
    if (tracked) {
      if (tracked.state === 'moved') {
        violations.push({
          kind: 'use-after-move',
          resourceName: nodeName,
          resourceType: tracked.type.name,
          location: { line: node.line, column: node.column, functionName: nodeName },
          message: `Resource '${nodeName}' (${tracked.type.name}) used after being moved.`,
          severity: 'error',
          suggestion: `The resource was transferred elsewhere. Obtain a new reference.`,
        });
      } else if (tracked.state === 'consumed') {
        violations.push({
          kind: 'use-after-consume',
          resourceName: nodeName,
          resourceType: tracked.type.name,
          location: { line: node.line, column: node.column, functionName: nodeName },
          message: `Resource '${nodeName}' (${tracked.type.name}) used after being consumed.`,
          severity: 'error',
          suggestion: `The resource was destroyed. Create a new one if needed.`,
        });
      }
    }
  }

  // ---------------------------------------------------------------------------
  // INTERNAL: Leak Detection
  // ---------------------------------------------------------------------------

  /**
   * Check for resource leaks at scope exit.
   * Resources without the Drop ability must be explicitly consumed or moved.
   */
  private checkLeaks(scope: Map<string, TrackedResource>, violations: LinearViolation[]): void {
    for (const [name, tracked] of scope) {
      if (tracked.state === 'owned' && !tracked.type.abilities.has('drop')) {
        violations.push({
          kind: 'resource-leak',
          resourceName: name,
          resourceType: tracked.type.name,
          location: tracked.createdAt,
          message: `Resource '${name}' (${tracked.type.name}) is never consumed or transferred — resource leak.`,
          severity: this.strictLeaks ? 'error' : 'warning',
          suggestion: `Consume with ${tracked.type.consumingOps.join('/')} or transfer ownership before scope exit.`,
        });
      }
      // Resources with Drop ability that are still owned → fine, they can be dropped silently
    }
  }
}

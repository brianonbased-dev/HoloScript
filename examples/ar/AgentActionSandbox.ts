// TARGET: packages/platform/agents/src/security/AgentActionSandbox.ts
// TODO-066 (HIGH): VR agent action sandbox
//
// Constrains what VR agents can do by sandboxing all agent actions
// through a permission-checked pipeline. Builds on:
//   - ActionValidator (packages/platform/agents/src/spatial-verify/)
//   - PhysicsAdherence (packages/platform/agents/src/trust/)
//   - PhysicsSafetyEnforcer (packages/platform/core/src/)
//
// The sandbox enforces:
//   1. Action type allowlists (agents can only perform declared actions)
//   2. Spatial boundaries (agents cannot modify objects outside their zone)
//   3. Rate limiting (max actions per second per agent)
//   4. Resource consumption caps (max objects created, max total mass)
//   5. Rollback capability (undo actions that pass validation but cause harm)

/**
 * AgentActionSandbox
 *
 * Security boundary for VR agent actions. Every agent action passes
 * through the sandbox before reaching the world state. The sandbox
 * can approve, deny, or throttle actions based on configurable policies.
 *
 * Defense layers:
 * ```
 *   Agent intends action
 *        |
 *   [1] ActionTypeFilter    -- Is this action type allowed?
 *        |
 *   [2] SpatialBoundary     -- Is the target within the agent's zone?
 *        |
 *   [3] RateLimiter         -- Has the agent exceeded its rate limit?
 *        |
 *   [4] ResourceCap         -- Would this exceed resource consumption limits?
 *        |
 *   [5] PhysicsSafety       -- Do physics values pass safety envelope?
 *        |
 *   [6] CrossValidation     -- Does the 3-validator consensus accept?
 *        |
 *   Action applied to world state
 *        |
 *   [7] RollbackMonitor     -- Track for post-hoc rollback if needed
 * ```
 *
 * @module AgentActionSandbox
 * @version 1.0.0
 */

// =============================================================================
// TYPES
// =============================================================================

/**
 * Categories of actions that agents can perform.
 */
export type ActionType =
  | 'move'           // Move an object
  | 'create'         // Create a new object
  | 'destroy'        // Remove an object
  | 'modify'         // Modify object properties (material, scale, etc.)
  | 'attach_trait'   // Attach a trait to an object
  | 'detach_trait'   // Remove a trait from an object
  | 'apply_force'    // Apply physics force
  | 'apply_impulse'  // Apply physics impulse
  | 'teleport'       // Teleport an object
  | 'communicate'    // Send a message to another agent
  | 'observe'        // Observe/query world state (always allowed)
  | 'annotate';      // Leave a cultural trace / annotation

/**
 * An agent action request.
 */
export interface AgentAction {
  /** Unique action ID */
  readonly id: string;
  /** Agent performing the action */
  readonly agentId: string;
  /** Type of action */
  readonly type: ActionType;
  /** Target node ID (if applicable) */
  readonly targetNodeId?: string;
  /** World ID */
  readonly worldId: string;
  /** Action parameters (type-dependent) */
  readonly params: Readonly<Record<string, unknown>>;
  /** Timestamp of the request */
  readonly timestamp: number;
  /** Priority (higher = more important) */
  readonly priority?: number;
}

/**
 * Result of sandbox evaluation.
 */
export interface SandboxResult {
  /** Whether the action is allowed */
  readonly allowed: boolean;
  /** Which defense layer denied the action (if denied) */
  readonly deniedBy?: SandboxLayer;
  /** Human-readable reason for denial */
  readonly reason?: string;
  /** Whether the action was throttled (delayed, not denied) */
  readonly throttled: boolean;
  /** If throttled, how long to wait (ms) */
  readonly throttleMs?: number;
  /** Evaluation time (ms) */
  readonly evaluationTimeMs: number;
  /** Whether this action is being tracked for rollback */
  readonly rollbackTracked: boolean;
}

/**
 * Defense layers in the sandbox pipeline.
 */
export type SandboxLayer =
  | 'action_type'
  | 'spatial_boundary'
  | 'rate_limit'
  | 'resource_cap'
  | 'physics_safety'
  | 'cross_validation';

/**
 * Spatial boundary zone for an agent.
 */
export interface AgentZone {
  /** Center of the agent's permitted zone */
  readonly center: { x: number; y: number; z: number };
  /** Radius of the zone (meters) */
  readonly radius: number;
  /** Whether the zone is a hard boundary (deny) or soft (warn) */
  readonly enforcement: 'hard' | 'soft';
}

/**
 * Resource consumption limits for an agent.
 */
export interface AgentResourceLimits {
  /** Maximum objects an agent can create */
  readonly maxObjectsCreated: number;
  /** Maximum total mass the agent can introduce (kg) */
  readonly maxTotalMassKg: number;
  /** Maximum total vertices the agent can create */
  readonly maxTotalVertices: number;
  /** Maximum traits the agent can attach (total across all objects) */
  readonly maxTraitsAttached: number;
  /** Maximum force applications per minute */
  readonly maxForceApplicationsPerMinute: number;
}

/**
 * Per-agent sandbox policy.
 */
export interface AgentSandboxPolicy {
  /** Agent ID this policy applies to */
  readonly agentId: string;
  /** Allowed action types (empty = all denied) */
  readonly allowedActions: readonly ActionType[];
  /** Spatial boundary zone */
  readonly zone: AgentZone;
  /** Resource consumption limits */
  readonly resourceLimits: AgentResourceLimits;
  /** Maximum actions per second */
  readonly maxActionsPerSecond: number;
  /** Whether to track actions for rollback */
  readonly enableRollback: boolean;
  /** Custom deny list (specific node IDs this agent cannot touch) */
  readonly denyList: readonly string[];
  /** Trust level (0-1, affects rate limiting strictness) */
  readonly trustLevel: number;
}

/**
 * Configuration for the sandbox.
 */
export interface AgentActionSandboxConfig {
  /** Default policy for agents without explicit policies */
  readonly defaultPolicy: Omit<AgentSandboxPolicy, 'agentId'>;
  /** Maximum rollback history per agent */
  readonly maxRollbackHistory: number;
  /** Whether to log all denials */
  readonly logDenials: boolean;
  /** Callback on action denial */
  readonly onDenial?: (action: AgentAction, result: SandboxResult) => void;
  /** Callback on throttle */
  readonly onThrottle?: (action: AgentAction, waitMs: number) => void;
}

/**
 * Rollback record for an executed action.
 */
export interface RollbackRecord {
  /** The action that was executed */
  readonly action: AgentAction;
  /** The inverse action that would undo it */
  readonly inverseAction: AgentAction;
  /** When the action was executed */
  readonly executedAt: number;
  /** Whether the action has been rolled back */
  rolled_back: boolean;
}

/**
 * Sandbox statistics.
 */
export interface SandboxStats {
  /** Total actions evaluated */
  readonly totalActions: number;
  /** Total actions allowed */
  readonly totalAllowed: number;
  /** Total actions denied */
  readonly totalDenied: number;
  /** Total actions throttled */
  readonly totalThrottled: number;
  /** Denial rate */
  readonly denialRate: number;
  /** Denials by layer */
  readonly denialsByLayer: Readonly<Record<SandboxLayer, number>>;
  /** Per-agent stats */
  readonly perAgent: ReadonlyMap<string, {
    actions: number;
    allowed: number;
    denied: number;
    throttled: number;
    resourcesUsed: AgentResourceUsage;
  }>;
  /** Total rollbacks performed */
  readonly totalRollbacks: number;
  /** Average evaluation time (ms) */
  readonly avgEvaluationTimeMs: number;
}

/**
 * Current resource usage for an agent.
 */
export interface AgentResourceUsage {
  objectsCreated: number;
  totalMassKg: number;
  totalVertices: number;
  traitsAttached: number;
  forceApplicationsThisMinute: number;
}

// =============================================================================
// DEFAULT POLICY
// =============================================================================

const DEFAULT_POLICY: Omit<AgentSandboxPolicy, 'agentId'> = {
  allowedActions: [
    'move', 'modify', 'attach_trait', 'detach_trait',
    'apply_force', 'communicate', 'observe', 'annotate',
  ],
  zone: {
    center: { x: 0, y: 0, z: 0 },
    radius: 100, // 100m default zone
    enforcement: 'hard',
  },
  resourceLimits: {
    maxObjectsCreated: 50,
    maxTotalMassKg: 10000,
    maxTotalVertices: 500000,
    maxTraitsAttached: 200,
    maxForceApplicationsPerMinute: 300,
  },
  maxActionsPerSecond: 30,
  enableRollback: true,
  denyList: [],
  trustLevel: 0.5,
};

// =============================================================================
// AGENT ACTION SANDBOX
// =============================================================================

export class AgentActionSandbox {
  private readonly config: Required<AgentActionSandboxConfig>;
  private readonly policies: Map<string, AgentSandboxPolicy> = new Map();

  // Per-agent state
  private readonly resourceUsage: Map<string, AgentResourceUsage> = new Map();
  private readonly actionTimestamps: Map<string, number[]> = new Map();
  private readonly rollbackHistory: Map<string, RollbackRecord[]> = new Map();

  // Statistics
  private totalActions = 0;
  private totalAllowed = 0;
  private totalDenied = 0;
  private totalThrottled = 0;
  private totalRollbacks = 0;
  private totalEvalTimeMs = 0;
  private denialsByLayer: Record<SandboxLayer, number> = {
    action_type: 0,
    spatial_boundary: 0,
    rate_limit: 0,
    resource_cap: 0,
    physics_safety: 0,
    cross_validation: 0,
  };

  private readonly perAgentStats: Map<string, {
    actions: number;
    allowed: number;
    denied: number;
    throttled: number;
  }> = new Map();

  constructor(config?: Partial<AgentActionSandboxConfig>) {
    this.config = {
      defaultPolicy: config?.defaultPolicy ?? DEFAULT_POLICY,
      maxRollbackHistory: config?.maxRollbackHistory ?? 100,
      logDenials: config?.logDenials ?? true,
      onDenial: config?.onDenial ?? (() => {}),
      onThrottle: config?.onThrottle ?? (() => {}),
    };
  }

  // =========================================================================
  // POLICY MANAGEMENT
  // =========================================================================

  /**
   * Set a policy for a specific agent.
   */
  setPolicy(policy: AgentSandboxPolicy): void {
    this.policies.set(policy.agentId, policy);
  }

  /**
   * Get the effective policy for an agent.
   * Returns the agent-specific policy if set, otherwise the default.
   */
  getPolicy(agentId: string): AgentSandboxPolicy {
    return this.policies.get(agentId) ?? {
      agentId,
      ...this.config.defaultPolicy,
    };
  }

  /**
   * Remove a specific agent's policy (falls back to default).
   */
  removePolicy(agentId: string): void {
    this.policies.delete(agentId);
  }

  // =========================================================================
  // ACTION EVALUATION
  // =========================================================================

  /**
   * Evaluate an agent action through all sandbox layers.
   *
   * @param action The action to evaluate
   * @returns Sandbox result with allow/deny/throttle decision
   */
  evaluate(action: AgentAction): SandboxResult {
    const startTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.totalActions++;
    this.ensureAgentStats(action.agentId);

    const agentStats = this.perAgentStats.get(action.agentId)!;
    agentStats.actions++;

    const policy = this.getPolicy(action.agentId);

    // Layer 1: Action type filter
    if (!this.checkActionType(action, policy)) {
      return this.deny(action, 'action_type',
        `Action type "${action.type}" is not allowed for agent "${action.agentId}"`,
        startTime);
    }

    // 'observe' is always allowed without further checks
    if (action.type === 'observe') {
      return this.allow(action, startTime);
    }

    // Layer 2: Spatial boundary
    if (action.targetNodeId && !this.checkSpatialBoundary(action, policy)) {
      return this.deny(action, 'spatial_boundary',
        `Target "${action.targetNodeId}" is outside agent's permitted zone (radius: ${policy.zone.radius}m)`,
        startTime);
    }

    // Layer 3: Rate limiting
    const rateResult = this.checkRateLimit(action, policy);
    if (!rateResult.allowed) {
      if (rateResult.throttleMs && rateResult.throttleMs > 0) {
        return this.throttle(action, rateResult.throttleMs, startTime);
      }
      return this.deny(action, 'rate_limit',
        `Rate limit exceeded: ${policy.maxActionsPerSecond} actions/sec`,
        startTime);
    }

    // Layer 4: Resource caps
    if (!this.checkResourceCaps(action, policy)) {
      return this.deny(action, 'resource_cap',
        `Resource limit exceeded for agent "${action.agentId}"`,
        startTime);
    }

    // Layer 5: Deny list
    if (action.targetNodeId && policy.denyList.includes(action.targetNodeId)) {
      return this.deny(action, 'action_type',
        `Node "${action.targetNodeId}" is on agent's deny list`,
        startTime);
    }

    // All checks passed
    return this.allow(action, startTime);
  }

  // =========================================================================
  // LAYER IMPLEMENTATIONS
  // =========================================================================

  private checkActionType(action: AgentAction, policy: AgentSandboxPolicy): boolean {
    return policy.allowedActions.includes(action.type);
  }

  private checkSpatialBoundary(action: AgentAction, policy: AgentSandboxPolicy): boolean {
    // If no target position in params, skip spatial check
    const targetPos = action.params['position'] as { x: number; y: number; z: number } | undefined;
    if (!targetPos) return true;

    const dx = targetPos.x - policy.zone.center.x;
    const dy = targetPos.y - policy.zone.center.y;
    const dz = targetPos.z - policy.zone.center.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > policy.zone.radius) {
      if (policy.zone.enforcement === 'soft') {
        // Soft boundary: allow but log warning
        return true;
      }
      return false;
    }

    return true;
  }

  private checkRateLimit(
    action: AgentAction,
    policy: AgentSandboxPolicy,
  ): { allowed: boolean; throttleMs?: number } {
    if (!this.actionTimestamps.has(action.agentId)) {
      this.actionTimestamps.set(action.agentId, []);
    }

    const timestamps = this.actionTimestamps.get(action.agentId)!;
    const now = action.timestamp;
    const windowStart = now - 1000; // 1 second window

    // Purge old timestamps
    while (timestamps.length > 0 && timestamps[0] < windowStart) {
      timestamps.shift();
    }

    // Trusted agents get higher rate limits
    const effectiveLimit = Math.ceil(
      policy.maxActionsPerSecond * (1 + policy.trustLevel * 0.5),
    );

    if (timestamps.length >= effectiveLimit) {
      // Over limit -- compute throttle delay
      const oldestInWindow = timestamps[0];
      const throttleMs = 1000 - (now - oldestInWindow);
      return { allowed: false, throttleMs: Math.max(0, throttleMs) };
    }

    timestamps.push(now);
    return { allowed: true };
  }

  private checkResourceCaps(action: AgentAction, policy: AgentSandboxPolicy): boolean {
    const usage = this.getResourceUsage(action.agentId);
    const limits = policy.resourceLimits;

    switch (action.type) {
      case 'create':
        return usage.objectsCreated < limits.maxObjectsCreated;

      case 'apply_force':
      case 'apply_impulse':
        return usage.forceApplicationsThisMinute < limits.maxForceApplicationsPerMinute;

      case 'attach_trait':
        return usage.traitsAttached < limits.maxTraitsAttached;

      default:
        return true;
    }
  }

  // =========================================================================
  // RESULT BUILDERS
  // =========================================================================

  private allow(action: AgentAction, startTime: number): SandboxResult {
    const evalTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    this.totalAllowed++;
    this.totalEvalTimeMs += evalTime;

    const agentStats = this.perAgentStats.get(action.agentId)!;
    agentStats.allowed++;

    // Update resource usage
    this.recordResourceUsage(action);

    // Track for rollback if enabled
    const policy = this.getPolicy(action.agentId);
    const rollbackTracked = policy.enableRollback && action.type !== 'observe';

    if (rollbackTracked) {
      this.recordForRollback(action);
    }

    return {
      allowed: true,
      throttled: false,
      evaluationTimeMs: evalTime,
      rollbackTracked,
    };
  }

  private deny(
    action: AgentAction,
    layer: SandboxLayer,
    reason: string,
    startTime: number,
  ): SandboxResult {
    const evalTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    this.totalDenied++;
    this.totalEvalTimeMs += evalTime;
    this.denialsByLayer[layer]++;

    const agentStats = this.perAgentStats.get(action.agentId)!;
    agentStats.denied++;

    if (this.config.logDenials) {
      console.warn(
        `[AgentActionSandbox] DENIED: agent="${action.agentId}" ` +
        `action="${action.type}" layer="${layer}" reason="${reason}"`,
      );
    }

    const result: SandboxResult = {
      allowed: false,
      deniedBy: layer,
      reason,
      throttled: false,
      evaluationTimeMs: evalTime,
      rollbackTracked: false,
    };

    this.config.onDenial(action, result);
    return result;
  }

  private throttle(action: AgentAction, waitMs: number, startTime: number): SandboxResult {
    const evalTime = (typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime;
    this.totalThrottled++;
    this.totalEvalTimeMs += evalTime;

    const agentStats = this.perAgentStats.get(action.agentId)!;
    agentStats.throttled++;

    this.config.onThrottle(action, waitMs);

    return {
      allowed: false,
      deniedBy: 'rate_limit',
      reason: `Throttled: wait ${waitMs.toFixed(0)}ms`,
      throttled: true,
      throttleMs: waitMs,
      evaluationTimeMs: evalTime,
      rollbackTracked: false,
    };
  }

  // =========================================================================
  // RESOURCE TRACKING
  // =========================================================================

  private getResourceUsage(agentId: string): AgentResourceUsage {
    if (!this.resourceUsage.has(agentId)) {
      this.resourceUsage.set(agentId, {
        objectsCreated: 0,
        totalMassKg: 0,
        totalVertices: 0,
        traitsAttached: 0,
        forceApplicationsThisMinute: 0,
      });
    }
    return this.resourceUsage.get(agentId)!;
  }

  private recordResourceUsage(action: AgentAction): void {
    const usage = this.getResourceUsage(action.agentId);

    switch (action.type) {
      case 'create':
        usage.objectsCreated++;
        if (typeof action.params['mass'] === 'number') {
          usage.totalMassKg += action.params['mass'];
        }
        if (typeof action.params['vertices'] === 'number') {
          usage.totalVertices += action.params['vertices'];
        }
        break;

      case 'destroy':
        usage.objectsCreated = Math.max(0, usage.objectsCreated - 1);
        break;

      case 'attach_trait':
        usage.traitsAttached++;
        break;

      case 'detach_trait':
        usage.traitsAttached = Math.max(0, usage.traitsAttached - 1);
        break;

      case 'apply_force':
      case 'apply_impulse':
        usage.forceApplicationsThisMinute++;
        break;
    }
  }

  // =========================================================================
  // ROLLBACK
  // =========================================================================

  private recordForRollback(action: AgentAction): void {
    if (!this.rollbackHistory.has(action.agentId)) {
      this.rollbackHistory.set(action.agentId, []);
    }

    const history = this.rollbackHistory.get(action.agentId)!;
    const inverseAction = this.createInverseAction(action);

    history.push({
      action,
      inverseAction,
      executedAt: action.timestamp,
      rolled_back: false,
    });

    // Trim history
    if (history.length > this.config.maxRollbackHistory) {
      history.shift();
    }
  }

  private createInverseAction(action: AgentAction): AgentAction {
    // Generate a best-effort inverse action for rollback
    switch (action.type) {
      case 'create':
        return {
          ...action,
          id: `rollback_${action.id}`,
          type: 'destroy',
          timestamp: Date.now(),
        };

      case 'destroy':
        return {
          ...action,
          id: `rollback_${action.id}`,
          type: 'create',
          timestamp: Date.now(),
        };

      case 'move':
        return {
          ...action,
          id: `rollback_${action.id}`,
          type: 'move',
          params: { position: action.params['previousPosition'] ?? { x: 0, y: 0, z: 0 } },
          timestamp: Date.now(),
        };

      case 'attach_trait':
        return {
          ...action,
          id: `rollback_${action.id}`,
          type: 'detach_trait',
          timestamp: Date.now(),
        };

      case 'detach_trait':
        return {
          ...action,
          id: `rollback_${action.id}`,
          type: 'attach_trait',
          timestamp: Date.now(),
        };

      default:
        // Actions without clear inverses get a no-op rollback
        return {
          ...action,
          id: `rollback_${action.id}`,
          type: 'observe',
          params: { note: `Cannot automatically rollback "${action.type}" action` },
          timestamp: Date.now(),
        };
    }
  }

  /**
   * Rollback the last N actions for an agent.
   *
   * @param agentId The agent whose actions to rollback
   * @param count Number of actions to rollback (default: 1)
   * @returns The inverse actions that were generated
   */
  rollback(agentId: string, count: number = 1): AgentAction[] {
    const history = this.rollbackHistory.get(agentId);
    if (!history || history.length === 0) {
      return [];
    }

    const inverseActions: AgentAction[] = [];
    let rolled = 0;

    // Rollback from most recent to oldest
    for (let i = history.length - 1; i >= 0 && rolled < count; i--) {
      const record = history[i];
      if (!record.rolled_back) {
        record.rolled_back = true;
        inverseActions.push(record.inverseAction);
        rolled++;
        this.totalRollbacks++;
      }
    }

    return inverseActions;
  }

  /**
   * Get rollback history for an agent.
   */
  getRollbackHistory(agentId: string): readonly RollbackRecord[] {
    return [...(this.rollbackHistory.get(agentId) ?? [])];
  }

  // =========================================================================
  // STATISTICS & INTROSPECTION
  // =========================================================================

  private ensureAgentStats(agentId: string): void {
    if (!this.perAgentStats.has(agentId)) {
      this.perAgentStats.set(agentId, {
        actions: 0,
        allowed: 0,
        denied: 0,
        throttled: 0,
      });
    }
  }

  /**
   * Get comprehensive sandbox statistics.
   */
  getStats(): SandboxStats {
    const perAgent = new Map<string, {
      actions: number;
      allowed: number;
      denied: number;
      throttled: number;
      resourcesUsed: AgentResourceUsage;
    }>();

    for (const [agentId, stats] of this.perAgentStats) {
      perAgent.set(agentId, {
        ...stats,
        resourcesUsed: this.getResourceUsage(agentId),
      });
    }

    return {
      totalActions: this.totalActions,
      totalAllowed: this.totalAllowed,
      totalDenied: this.totalDenied,
      totalThrottled: this.totalThrottled,
      denialRate: this.totalActions > 0 ? this.totalDenied / this.totalActions : 0,
      denialsByLayer: { ...this.denialsByLayer },
      perAgent,
      totalRollbacks: this.totalRollbacks,
      avgEvaluationTimeMs: this.totalActions > 0
        ? this.totalEvalTimeMs / this.totalActions
        : 0,
    };
  }

  /**
   * Get resource usage for a specific agent.
   */
  getAgentResourceUsage(agentId: string): Readonly<AgentResourceUsage> {
    return this.getResourceUsage(agentId);
  }

  /**
   * Reset all state for a specific agent.
   */
  resetAgent(agentId: string): void {
    this.resourceUsage.delete(agentId);
    this.actionTimestamps.delete(agentId);
    this.rollbackHistory.delete(agentId);
    this.perAgentStats.delete(agentId);
  }

  /**
   * Reset all sandbox state.
   */
  reset(): void {
    this.resourceUsage.clear();
    this.actionTimestamps.clear();
    this.rollbackHistory.clear();
    this.perAgentStats.clear();
    this.totalActions = 0;
    this.totalAllowed = 0;
    this.totalDenied = 0;
    this.totalThrottled = 0;
    this.totalRollbacks = 0;
    this.totalEvalTimeMs = 0;
    this.denialsByLayer = {
      action_type: 0,
      spatial_boundary: 0,
      rate_limit: 0,
      resource_cap: 0,
      physics_safety: 0,
      cross_validation: 0,
    };
  }
}

// =============================================================================
// FACTORY
// =============================================================================

/**
 * Create an AgentActionSandbox with default configuration.
 *
 * Usage:
 * ```ts
 * const sandbox = createAgentActionSandbox();
 *
 * // Set a policy for a specific agent
 * sandbox.setPolicy({
 *   agentId: 'builder',
 *   allowedActions: ['create', 'modify', 'move', 'observe'],
 *   zone: { center: { x: 0, y: 0, z: 0 }, radius: 50, enforcement: 'hard' },
 *   resourceLimits: {
 *     maxObjectsCreated: 20,
 *     maxTotalMassKg: 5000,
 *     maxTotalVertices: 200000,
 *     maxTraitsAttached: 50,
 *     maxForceApplicationsPerMinute: 60,
 *   },
 *   maxActionsPerSecond: 10,
 *   enableRollback: true,
 *   denyList: [],
 *   trustLevel: 0.7,
 * });
 *
 * // Evaluate an action
 * const result = sandbox.evaluate({
 *   id: 'action_1',
 *   agentId: 'builder',
 *   type: 'create',
 *   worldId: 'world-1',
 *   params: { geometry: 'cube', position: { x: 5, y: 0, z: 3 } },
 *   timestamp: Date.now(),
 * });
 *
 * if (result.allowed) {
 *   // Apply the action to the world
 * } else {
 *   console.log(`Denied by ${result.deniedBy}: ${result.reason}`);
 * }
 * ```
 */
export function createAgentActionSandbox(
  config?: Partial<AgentActionSandboxConfig>,
): AgentActionSandbox {
  return new AgentActionSandbox(config);
}

// =============================================================================
// ACTION BUILDER
// =============================================================================

let actionCounter = 0;

/**
 * Create an AgentAction with auto-generated ID.
 */
export function createAgentAction(
  params: Omit<AgentAction, 'id' | 'timestamp'> & { id?: string; timestamp?: number },
): AgentAction {
  return {
    id: params.id ?? `action_${++actionCounter}_${Date.now().toString(36)}`,
    agentId: params.agentId,
    type: params.type,
    targetNodeId: params.targetNodeId,
    worldId: params.worldId,
    params: params.params,
    timestamp: params.timestamp ?? Date.now(),
    priority: params.priority,
  };
}

/**
 * AgentRBAC-aware conflict resolution for CRDTs
 *
 * Integrates HoloScript's AgentRBAC permission system into CRDT conflict
 * resolution, ensuring that agent identity and permissions are respected
 * when merging concurrent operations.
 *
 * @version 1.0.0
 */

import type { CRDTOperation } from './DIDSigner';

/**
 * Agent permission levels (from AgentRBAC)
 */
export enum AgentPermissionLevel {
  /** Read-only access */
  READ = 'read',

  /** Can modify state */
  WRITE = 'write',

  /** Can execute privileged operations */
  EXECUTE = 'execute',

  /** Full administrative access */
  ADMIN = 'admin',
}

/**
 * Agent role information
 */
export interface AgentRole {
  /** Agent's DID */
  did: string;

  /** Permission level */
  permissionLevel: AgentPermissionLevel;

  /** Scope restrictions (e.g., specific NPCs, zones) */
  scope?: string[];

  /** Priority weight for conflict resolution */
  priority?: number;
}

/**
 * Permission checker interface
 *
 * Integrates with HoloScript's AgentRBAC system
 */
export interface PermissionChecker {
  /**
   * Check if agent has permission for operation
   */
  checkPermission(actorDid: string, operation: CRDTOperation): Promise<boolean>;

  /**
   * Get agent's permission level
   */
  getPermissionLevel(actorDid: string): Promise<AgentPermissionLevel>;

  /**
   * Get agent's priority weight (for conflict resolution)
   */
  getPriority(actorDid: string): Promise<number>;
}

/**
 * Conflict resolution strategy
 */
export enum ConflictStrategy {
  /** Last-write-wins (default CRDT behavior) */
  LWW = 'lww',

  /** Higher permission level wins */
  PERMISSION_PRIORITY = 'permission_priority',

  /** Explicit priority weights */
  WEIGHTED_PRIORITY = 'weighted_priority',

  /** Admin always wins */
  ADMIN_OVERRIDE = 'admin_override',

  /** Merge all concurrent operations */
  MERGE_ALL = 'merge_all',
}

/**
 * Conflict resolution result
 */
export interface ConflictResolution {
  /** Winning operation */
  winner: CRDTOperation;

  /** All operations in conflict set */
  conflictSet: CRDTOperation[];

  /** Strategy used */
  strategy: ConflictStrategy;

  /** Explanation */
  reason: string;
}

/**
 * RBAC-aware conflict resolver
 *
 * Resolves CRDT conflicts while respecting agent permissions and roles.
 * This ensures that privileged agents (e.g., admins, NPCs with special
 * permissions) have their operations prioritized over regular agents.
 */
export class RBACConflictResolver {
  private permissionChecker: PermissionChecker;
  private defaultStrategy: ConflictStrategy;

  constructor(
    permissionChecker: PermissionChecker,
    defaultStrategy: ConflictStrategy = ConflictStrategy.LWW,
  ) {
    this.permissionChecker = permissionChecker;
    this.defaultStrategy = defaultStrategy;
  }

  /**
   * Resolve conflict between concurrent operations
   *
   * Takes a set of concurrent operations (same logical timestamp or
   * causally concurrent) and determines the winner based on RBAC rules.
   */
  async resolveConflict(
    conflictSet: CRDTOperation[],
    strategy?: ConflictStrategy,
  ): Promise<ConflictResolution> {
    const resolvedStrategy = strategy ?? this.defaultStrategy;

    // Filter out operations where agent lacks permission
    const permitted = await this.filterPermitted(conflictSet);

    if (permitted.length === 0) {
      throw new Error('No operations in conflict set have valid permissions');
    }

    if (permitted.length === 1) {
      return {
        winner: permitted[0],
        conflictSet: permitted,
        strategy: resolvedStrategy,
        reason: 'Single permitted operation',
      };
    }

    // Apply conflict resolution strategy
    switch (resolvedStrategy) {
      case ConflictStrategy.LWW:
        return this.resolveLWW(permitted);

      case ConflictStrategy.PERMISSION_PRIORITY:
        return await this.resolveByPermissionLevel(permitted);

      case ConflictStrategy.WEIGHTED_PRIORITY:
        return await this.resolveByWeight(permitted);

      case ConflictStrategy.ADMIN_OVERRIDE:
        return await this.resolveAdminOverride(permitted);

      case ConflictStrategy.MERGE_ALL:
        return this.resolveMergeAll(permitted);

      default:
        return this.resolveLWW(permitted);
    }
  }

  /**
   * Filter operations to only those with valid permissions
   */
  private async filterPermitted(operations: CRDTOperation[]): Promise<CRDTOperation[]> {
    const results = await Promise.all(
      operations.map(async (op) => {
        const hasPermission = await this.permissionChecker.checkPermission(op.actorDid, op);
        return hasPermission ? op : null;
      }),
    );

    return results.filter((op): op is CRDTOperation => op !== null);
  }

  /**
   * Last-Write-Wins resolution (default CRDT behavior)
   */
  private resolveLWW(operations: CRDTOperation[]): ConflictResolution {
    const sorted = [...operations].sort((a, b) => {
      // Sort by timestamp descending
      if (a.timestamp !== b.timestamp) {
        return b.timestamp - a.timestamp;
      }
      // Tie-breaker: lexicographic DID comparison
      return b.actorDid.localeCompare(a.actorDid);
    });

    return {
      winner: sorted[0],
      conflictSet: operations,
      strategy: ConflictStrategy.LWW,
      reason: `Latest timestamp: ${sorted[0].timestamp} from ${sorted[0].actorDid}`,
    };
  }

  /**
   * Permission-level priority resolution
   *
   * ADMIN > EXECUTE > WRITE > READ
   */
  private async resolveByPermissionLevel(
    operations: CRDTOperation[],
  ): Promise<ConflictResolution> {
    const permissionOrder = [
      AgentPermissionLevel.ADMIN,
      AgentPermissionLevel.EXECUTE,
      AgentPermissionLevel.WRITE,
      AgentPermissionLevel.READ,
    ];

    // Get permission levels for all actors
    const opsWithLevels = await Promise.all(
      operations.map(async (op) => ({
        op,
        level: await this.permissionChecker.getPermissionLevel(op.actorDid),
      })),
    );

    // Find highest permission level
    for (const targetLevel of permissionOrder) {
      const candidates = opsWithLevels.filter((item) => item.level === targetLevel);

      if (candidates.length > 0) {
        // If multiple at same level, use LWW as tiebreaker
        const winner =
          candidates.length === 1
            ? candidates[0].op
            : this.resolveLWW(candidates.map((c) => c.op)).winner;

        return {
          winner,
          conflictSet: operations,
          strategy: ConflictStrategy.PERMISSION_PRIORITY,
          reason: `Highest permission level: ${targetLevel}`,
        };
      }
    }

    // Fallback to LWW
    return this.resolveLWW(operations);
  }

  /**
   * Weighted priority resolution
   *
   * Each agent has a priority weight. Higher weight wins.
   */
  private async resolveByWeight(operations: CRDTOperation[]): Promise<ConflictResolution> {
    const opsWithWeights = await Promise.all(
      operations.map(async (op) => ({
        op,
        weight: await this.permissionChecker.getPriority(op.actorDid),
      })),
    );

    // Sort by weight descending
    const sorted = opsWithWeights.sort((a, b) => {
      if (a.weight !== b.weight) {
        return b.weight - a.weight;
      }
      // Tie-breaker: LWW
      return b.op.timestamp - a.op.timestamp;
    });

    return {
      winner: sorted[0].op,
      conflictSet: operations,
      strategy: ConflictStrategy.WEIGHTED_PRIORITY,
      reason: `Highest priority weight: ${sorted[0].weight}`,
    };
  }

  /**
   * Admin override resolution
   *
   * If any admin operation exists, it always wins.
   * Otherwise, use permission priority.
   */
  private async resolveAdminOverride(
    operations: CRDTOperation[],
  ): Promise<ConflictResolution> {
    // Find admin operations
    const adminOps: CRDTOperation[] = [];

    for (const op of operations) {
      const level = await this.permissionChecker.getPermissionLevel(op.actorDid);
      if (level === AgentPermissionLevel.ADMIN) {
        adminOps.push(op);
      }
    }

    if (adminOps.length > 0) {
      const winner = adminOps.length === 1 ? adminOps[0] : this.resolveLWW(adminOps).winner;

      return {
        winner,
        conflictSet: operations,
        strategy: ConflictStrategy.ADMIN_OVERRIDE,
        reason: 'Admin operation override',
      };
    }

    // No admin ops, use permission priority
    return this.resolveByPermissionLevel(operations);
  }

  /**
   * Merge-all resolution
   *
   * Returns the first operation but signals that all should be merged.
   * This is used for commutative operations where order doesn't matter.
   */
  private resolveMergeAll(operations: CRDTOperation[]): ConflictResolution {
    return {
      winner: operations[0],
      conflictSet: operations,
      strategy: ConflictStrategy.MERGE_ALL,
      reason: 'Merge all concurrent operations',
    };
  }
}

/**
 * Mock permission checker for testing
 */
export class MockPermissionChecker implements PermissionChecker {
  private permissions: Map<string, AgentPermissionLevel> = new Map();
  private priorities: Map<string, number> = new Map();

  setPermission(did: string, level: AgentPermissionLevel, priority: number = 1): void {
    this.permissions.set(did, level);
    this.priorities.set(did, priority);
  }

  async checkPermission(_actorDid: string, _operation: CRDTOperation): Promise<boolean> {
    // Mock: all operations permitted
    return true;
  }

  async getPermissionLevel(actorDid: string): Promise<AgentPermissionLevel> {
    return this.permissions.get(actorDid) ?? AgentPermissionLevel.WRITE;
  }

  async getPriority(actorDid: string): Promise<number> {
    return this.priorities.get(actorDid) ?? 1;
  }
}

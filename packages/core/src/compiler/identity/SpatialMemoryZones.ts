/**
 * HoloScript Spatial Memory Permission Zones
 *
 * Enforces compile-time restrictions on which agents can read/write
 * spatial memory in specific geographic or logical zones.
 *
 * Integrates with the existing AgentRBAC/AgentTokenIssuer infrastructure:
 * - Verifies agent identity via JWT tokens
 * - Maps agent roles to zone-level spatial permissions
 * - Supports agent-specific overrides for fine-grained control
 * - Logs every access check to a GDPR-compliant audit trail
 *
 * Zone types:
 * - Geospatial: Defined by latitude/longitude/altitude bounding boxes
 * - Local: Defined by X/Y/Z coordinate bounding boxes (e.g., room-scale)
 * - Named: Logical zone names resolved at runtime (e.g., "lobby", "arena")
 *
 * @module @holoscript/core/compiler/identity/SpatialMemoryZones
 * @version 1.0.0
 */

import type { AgentRole, IntentTokenPayload } from './AgentIdentity';
import type { AgentTokenIssuer } from './AgentTokenIssuer';
import { getTokenIssuer } from './AgentTokenIssuer';

// ---------------------------------------------------------------------------
// Spatial Zone Bounds
// ---------------------------------------------------------------------------

/**
 * Geospatial bounding box defined by latitude, longitude, and optional altitude.
 */
export interface GeospatialBounds {
  type: 'geospatial';
  minLat: number;
  maxLat: number;
  minLon: number;
  maxLon: number;
  minAlt?: number;
  maxAlt?: number;
}

/**
 * Local coordinate bounding box (room-scale, world-space, etc.).
 */
export interface LocalBounds {
  type: 'local';
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

/**
 * Named (logical) zone. The actual boundaries are resolved at runtime
 * by the hosting platform. At compile time, only the name is checked.
 */
export interface NamedBounds {
  type: 'named';
  // Logical zone name (resolved at runtime)
}

/**
 * Union type for all supported zone boundary definitions.
 */
export type ZoneBounds = GeospatialBounds | LocalBounds | NamedBounds;

// ---------------------------------------------------------------------------
// Zone Classification
// ---------------------------------------------------------------------------

/**
 * Zone classification affects default permission behaviour:
 *
 * - `public`     All agents have SPATIAL_READ by default
 * - `private`    Only agents with explicit grants can access
 * - `restricted` Only the zone admin role can write; others read-only
 * - `sensitive`  No default permissions; GDPR audit always fires
 */
export type ZoneClassification = 'public' | 'private' | 'restricted' | 'sensitive';

// ---------------------------------------------------------------------------
// SpatialZone
// ---------------------------------------------------------------------------

/**
 * A named zone with optional spatial boundaries and a classification label.
 */
export interface SpatialZone {
  /** Unique zone identifier */
  id: string;

  /** Human-readable zone name */
  name: string;

  /**
   * Optional spatial bounds. When omitted, the zone is purely logical
   * (equivalent to `type: 'named'`).
   */
  bounds?: ZoneBounds;

  /**
   * Zone classification determines the default permission posture.
   */
  classification: ZoneClassification;
}

// ---------------------------------------------------------------------------
// SpatialPermission
// ---------------------------------------------------------------------------

/**
 * Permissions applicable to spatial memory operations within a zone.
 */
export enum SpatialPermission {
  /** Read traces, anchors, and spatial data in a zone */
  SPATIAL_READ = 'spatial:read',

  /** Write (create/update) traces, anchors, and spatial data in a zone */
  SPATIAL_WRITE = 'spatial:write',

  /** Remove traces, anchors, and spatial data from a zone */
  SPATIAL_DELETE = 'spatial:delete',

  /** Manage zone configuration, policies, and memberships */
  SPATIAL_ADMIN = 'spatial:admin',
}

// ---------------------------------------------------------------------------
// SpatialZonePolicy
// ---------------------------------------------------------------------------

/**
 * Maps agent roles and individual agents to spatial permissions for a
 * specific zone. The enforcer resolves permissions in order:
 *
 * 1. Agent-specific overrides (highest priority)
 * 2. Role-based permissions
 * 3. Default permissions (lowest priority)
 */
export interface SpatialZonePolicy {
  /** The zone this policy applies to */
  zoneId: string;

  /** Role-based permission grants (`AgentRole` string -> permissions) */
  rolePermissions: Record<string, SpatialPermission[]>;

  /** Per-agent permission overrides (`agentId` -> permissions) */
  agentOverrides: Record<string, SpatialPermission[]>;

  /** Fallback permissions for agents that match neither role nor override */
  defaultPermissions: SpatialPermission[];
}

// ---------------------------------------------------------------------------
// Spatial Position (for point-in-zone checks)
// ---------------------------------------------------------------------------

/**
 * A 3D position that can be checked against zone bounds.
 */
export interface SpatialPosition {
  /** Latitude (for geospatial) or X (for local) */
  x: number;
  /** Longitude (for geospatial) or Y (for local) */
  y: number;
  /** Altitude (for geospatial) or Z (for local) */
  z: number;
}

// ---------------------------------------------------------------------------
// GDPR Audit Trail
// ---------------------------------------------------------------------------

/**
 * Every spatial zone access check is recorded in a GDPR-compliant
 * audit log entry. The audit trail supports data-subject access requests
 * and right-to-erasure workflows.
 */
export interface SpatialAccessAuditEntry {
  /** Unix epoch milliseconds when the check was performed */
  timestamp: number;

  /** Identifier of the agent that attempted the access */
  agentId: string;

  /** Role of the agent (extracted from token) */
  agentRole: string;

  /** Zone that was accessed (or attempted) */
  zoneId: string;

  /** The spatial operation that was attempted */
  operation: SpatialPermission;

  /** Whether access was granted */
  allowed: boolean;

  /** Human-readable reason for the decision */
  reason: string;
}

// ---------------------------------------------------------------------------
// Zone Access Decision
// ---------------------------------------------------------------------------

/**
 * Result of a spatial zone access check.
 */
export interface SpatialAccessDecision {
  /** Whether the operation was allowed */
  allowed: boolean;

  /** Human-readable reason for the decision */
  reason: string;

  /** The agent's role (if the token was valid) */
  agentRole?: string;

  /** The agent's subject identifier (if the token was valid) */
  agentId?: string;
}

// ---------------------------------------------------------------------------
// SpatialZoneEnforcer
// ---------------------------------------------------------------------------

/**
 * Configuration for the SpatialZoneEnforcer.
 */
export interface SpatialZoneEnforcerConfig {
  /** Token issuer for JWT verification (default: global singleton) */
  tokenIssuer?: AgentTokenIssuer;

  /** Maximum audit log entries to retain in memory (default: 10000) */
  maxAuditEntries?: number;
}

/**
 * Compile-time enforcer for spatial memory zone permissions.
 *
 * The enforcer:
 * 1. Verifies the agent's JWT token via `AgentTokenIssuer`
 * 2. Resolves the agent's role and ID from the token claims
 * 3. Looks up the zone policy for the requested zone
 * 4. Resolves permissions (agent override > role > default > classification fallback)
 * 5. Checks if the required `SpatialPermission` is granted
 * 6. Records a GDPR audit entry for every check
 */
export class SpatialZoneEnforcer {
  private tokenIssuer: AgentTokenIssuer;
  private zones: Map<string, SpatialZone> = new Map();
  private policies: Map<string, SpatialZonePolicy> = new Map();
  private auditLog: SpatialAccessAuditEntry[] = [];
  private maxAuditEntries: number;

  constructor(config: SpatialZoneEnforcerConfig = {}) {
    this.tokenIssuer = config.tokenIssuer ?? getTokenIssuer();
    this.maxAuditEntries = config.maxAuditEntries ?? 10_000;
  }

  // -----------------------------------------------------------------------
  // Zone Management
  // -----------------------------------------------------------------------

  /**
   * Register a spatial zone.
   */
  registerZone(zone: SpatialZone): void {
    this.zones.set(zone.id, zone);
  }

  /**
   * Get a registered zone by ID.
   */
  getZone(zoneId: string): SpatialZone | undefined {
    return this.zones.get(zoneId);
  }

  /**
   * Remove a registered zone and its policy.
   */
  removeZone(zoneId: string): boolean {
    this.policies.delete(zoneId);
    return this.zones.delete(zoneId);
  }

  /**
   * Get all registered zone IDs.
   */
  getRegisteredZoneIds(): string[] {
    return Array.from(this.zones.keys());
  }

  // -----------------------------------------------------------------------
  // Policy Management
  // -----------------------------------------------------------------------

  /**
   * Set the access policy for a zone.
   */
  setPolicy(policy: SpatialZonePolicy): void {
    if (!this.zones.has(policy.zoneId)) {
      throw new Error(
        `Cannot set policy for unregistered zone: ${policy.zoneId}`
      );
    }
    this.policies.set(policy.zoneId, policy);
  }

  /**
   * Get the policy for a zone.
   */
  getPolicy(zoneId: string): SpatialZonePolicy | undefined {
    return this.policies.get(zoneId);
  }

  // -----------------------------------------------------------------------
  // Access Checks
  // -----------------------------------------------------------------------

  /**
   * Check if an agent (identified by JWT token) can perform a spatial
   * operation in a given zone.
   *
   * @param agentToken  JWT token issued by `AgentTokenIssuer`
   * @param zoneId      Target zone identifier
   * @param operation   The spatial permission required
   * @returns           Access decision with reason
   */
  checkZoneAccess(
    agentToken: string,
    zoneId: string,
    operation: SpatialPermission,
  ): SpatialAccessDecision {
    // Step 1: Verify token
    const verificationResult = this.tokenIssuer.verifyToken(agentToken);
    if (!verificationResult.valid || !verificationResult.payload) {
      const decision: SpatialAccessDecision = {
        allowed: false,
        reason: `Token verification failed: ${verificationResult.error ?? 'unknown error'}`,
      };
      this.recordAudit('unknown', 'unknown', zoneId, operation, false, decision.reason);
      return decision;
    }

    const payload = verificationResult.payload;
    const agentId = payload.sub;
    const agentRole = payload.agent_role;

    // Step 2: Check zone exists
    const zone = this.zones.get(zoneId);
    if (!zone) {
      const decision: SpatialAccessDecision = {
        allowed: false,
        reason: `Zone not found: ${zoneId}`,
        agentRole,
        agentId,
      };
      this.recordAudit(agentId, agentRole, zoneId, operation, false, decision.reason);
      return decision;
    }

    // Step 3: Resolve permissions
    const grantedPermissions = this.resolvePermissions(agentId, agentRole, zoneId, zone);

    // Step 4: Check if required permission is granted
    const allowed = grantedPermissions.includes(operation);
    const reason = allowed
      ? `Access granted: agent ${agentId} has ${operation} in zone ${zoneId}`
      : `Access denied: agent ${agentId} lacks ${operation} in zone ${zoneId}`;

    const decision: SpatialAccessDecision = {
      allowed,
      reason,
      agentRole,
      agentId,
    };

    // Step 5: Audit
    this.recordAudit(agentId, agentRole, zoneId, operation, allowed, reason);

    return decision;
  }

  /**
   * Get all zone IDs that an agent can access (for at least one operation).
   *
   * @param agentToken  JWT token
   * @returns           Array of accessible zone IDs
   */
  getAccessibleZones(agentToken: string): string[] {
    const verificationResult = this.tokenIssuer.verifyToken(agentToken);
    if (!verificationResult.valid || !verificationResult.payload) {
      return [];
    }

    const payload = verificationResult.payload;
    const agentId = payload.sub;
    const agentRole = payload.agent_role;

    const accessibleZones: string[] = [];

    for (const [zoneId, zone] of this.zones) {
      const permissions = this.resolvePermissions(agentId, agentRole, zoneId, zone);
      if (permissions.length > 0) {
        accessibleZones.push(zoneId);
      }
    }

    return accessibleZones;
  }

  /**
   * Validate whether an agent can perform a spatial operation at a
   * specific 3D position. The position is checked against all registered
   * zones to find the enclosing zone(s), then permissions are evaluated.
   *
   * @param agentToken  JWT token
   * @param position    3D position to check
   * @param operation   Required spatial permission
   * @returns           Access decision (aggregated across matching zones)
   */
  validateSpatialOperation(
    agentToken: string,
    position: SpatialPosition,
    operation: SpatialPermission,
  ): SpatialAccessDecision {
    // Step 1: Verify token
    const verificationResult = this.tokenIssuer.verifyToken(agentToken);
    if (!verificationResult.valid || !verificationResult.payload) {
      const decision: SpatialAccessDecision = {
        allowed: false,
        reason: `Token verification failed: ${verificationResult.error ?? 'unknown error'}`,
      };
      this.recordAudit('unknown', 'unknown', '*position*', operation, false, decision.reason);
      return decision;
    }

    const payload = verificationResult.payload;
    const agentId = payload.sub;
    const agentRole = payload.agent_role;

    // Step 2: Find all zones that contain the position
    const containingZones = this.findZonesContainingPosition(position);

    if (containingZones.length === 0) {
      const decision: SpatialAccessDecision = {
        allowed: false,
        reason: `No registered zone contains position (${position.x}, ${position.y}, ${position.z})`,
        agentRole,
        agentId,
      };
      this.recordAudit(agentId, agentRole, '*no-zone*', operation, false, decision.reason);
      return decision;
    }

    // Step 3: Check each containing zone. Access is granted if ANY
    // containing zone grants the operation.
    for (const zone of containingZones) {
      const permissions = this.resolvePermissions(agentId, agentRole, zone.id, zone);
      if (permissions.includes(operation)) {
        const decision: SpatialAccessDecision = {
          allowed: true,
          reason: `Access granted via zone ${zone.id} at position (${position.x}, ${position.y}, ${position.z})`,
          agentRole,
          agentId,
        };
        this.recordAudit(agentId, agentRole, zone.id, operation, true, decision.reason);
        return decision;
      }
    }

    // None of the containing zones granted access
    const zoneIds = containingZones.map((z) => z.id).join(', ');
    const decision: SpatialAccessDecision = {
      allowed: false,
      reason: `Access denied in all containing zones [${zoneIds}] at position (${position.x}, ${position.y}, ${position.z})`,
      agentRole,
      agentId,
    };
    this.recordAudit(agentId, agentRole, containingZones[0].id, operation, false, decision.reason);
    return decision;
  }

  // -----------------------------------------------------------------------
  // Audit Trail
  // -----------------------------------------------------------------------

  /**
   * Get the full GDPR audit trail.
   */
  getAuditLog(): readonly SpatialAccessAuditEntry[] {
    return this.auditLog;
  }

  /**
   * Get audit entries for a specific agent (GDPR data subject access).
   */
  getAuditEntriesForAgent(agentId: string): SpatialAccessAuditEntry[] {
    return this.auditLog.filter((entry) => entry.agentId === agentId);
  }

  /**
   * Get audit entries for a specific zone.
   */
  getAuditEntriesForZone(zoneId: string): SpatialAccessAuditEntry[] {
    return this.auditLog.filter((entry) => entry.zoneId === zoneId);
  }

  /**
   * Clear audit entries for a specific agent (GDPR right-to-erasure).
   *
   * @returns Number of entries removed
   */
  eraseAuditEntriesForAgent(agentId: string): number {
    const before = this.auditLog.length;
    this.auditLog = this.auditLog.filter((entry) => entry.agentId !== agentId);
    return before - this.auditLog.length;
  }

  /**
   * Clear all audit entries.
   */
  clearAuditLog(): void {
    this.auditLog = [];
  }

  // -----------------------------------------------------------------------
  // Internal Helpers
  // -----------------------------------------------------------------------

  /**
   * Resolve the effective spatial permissions for an agent in a zone.
   *
   * Resolution order:
   * 1. Agent-specific overrides (highest priority)
   * 2. Role-based permissions from policy
   * 3. Policy default permissions
   * 4. Classification-based fallback (if no policy exists)
   */
  private resolvePermissions(
    agentId: string,
    agentRole: string,
    zoneId: string,
    zone: SpatialZone,
  ): SpatialPermission[] {
    const policy = this.policies.get(zoneId);

    if (policy) {
      // Agent-specific override takes highest priority
      if (policy.agentOverrides[agentId]) {
        return policy.agentOverrides[agentId];
      }

      // Role-based permissions
      if (policy.rolePermissions[agentRole]) {
        return policy.rolePermissions[agentRole];
      }

      // Policy defaults
      return policy.defaultPermissions;
    }

    // No policy defined: fall back to classification-based defaults
    return this.getClassificationDefaults(zone.classification);
  }

  /**
   * Get default permissions based on zone classification.
   */
  private getClassificationDefaults(classification: ZoneClassification): SpatialPermission[] {
    switch (classification) {
      case 'public':
        return [SpatialPermission.SPATIAL_READ];
      case 'restricted':
        return [SpatialPermission.SPATIAL_READ];
      case 'private':
        return [];
      case 'sensitive':
        return [];
      default:
        return [];
    }
  }

  /**
   * Find all zones whose bounds contain the given position.
   *
   * Named zones (no explicit bounds) are NOT included in positional
   * lookups because their bounds are resolved at runtime.
   */
  private findZonesContainingPosition(position: SpatialPosition): SpatialZone[] {
    const result: SpatialZone[] = [];

    for (const zone of this.zones.values()) {
      if (!zone.bounds) continue;

      if (this.isPositionInBounds(position, zone.bounds)) {
        result.push(zone);
      }
    }

    return result;
  }

  /**
   * Check if a 3D position is within the given bounds.
   *
   * For geospatial bounds: x=lat, y=lon, z=alt
   * For local bounds: x=X, y=Y, z=Z
   * Named bounds always return false (resolved at runtime).
   */
  private isPositionInBounds(position: SpatialPosition, bounds: ZoneBounds): boolean {
    switch (bounds.type) {
      case 'geospatial': {
        const inLat = position.x >= bounds.minLat && position.x <= bounds.maxLat;
        const inLon = position.y >= bounds.minLon && position.y <= bounds.maxLon;
        let inAlt = true;
        if (bounds.minAlt !== undefined && bounds.maxAlt !== undefined) {
          inAlt = position.z >= bounds.minAlt && position.z <= bounds.maxAlt;
        }
        return inLat && inLon && inAlt;
      }

      case 'local': {
        return (
          position.x >= bounds.minX &&
          position.x <= bounds.maxX &&
          position.y >= bounds.minY &&
          position.y <= bounds.maxY &&
          position.z >= bounds.minZ &&
          position.z <= bounds.maxZ
        );
      }

      case 'named':
        // Named zones have no compile-time bounds
        return false;

      default:
        return false;
    }
  }

  /**
   * Record a GDPR audit entry.
   */
  private recordAudit(
    agentId: string,
    agentRole: string,
    zoneId: string,
    operation: SpatialPermission,
    allowed: boolean,
    reason: string,
  ): void {
    const entry: SpatialAccessAuditEntry = {
      timestamp: Date.now(),
      agentId,
      agentRole,
      zoneId,
      operation,
      allowed,
      reason,
    };

    this.auditLog.push(entry);

    // Evict oldest entries if we exceed the cap
    if (this.auditLog.length > this.maxAuditEntries) {
      this.auditLog = this.auditLog.slice(-this.maxAuditEntries);
    }
  }
}

// ---------------------------------------------------------------------------
// Factory Functions
// ---------------------------------------------------------------------------

/**
 * Create a new `SpatialZone` with the given parameters.
 */
export function createSpatialZone(
  id: string,
  name: string,
  classification: ZoneClassification,
  bounds?: ZoneBounds,
): SpatialZone {
  return { id, name, bounds, classification };
}

/**
 * Create a geospatial zone from WGS 84 bounding box coordinates.
 */
export function createGeospatialZone(
  id: string,
  name: string,
  classification: ZoneClassification,
  minLat: number,
  maxLat: number,
  minLon: number,
  maxLon: number,
  minAlt?: number,
  maxAlt?: number,
): SpatialZone {
  return {
    id,
    name,
    classification,
    bounds: {
      type: 'geospatial',
      minLat,
      maxLat,
      minLon,
      maxLon,
      minAlt,
      maxAlt,
    },
  };
}

/**
 * Create a local-coordinate zone (room-scale, world-space, etc.).
 */
export function createLocalZone(
  id: string,
  name: string,
  classification: ZoneClassification,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
): SpatialZone {
  return {
    id,
    name,
    classification,
    bounds: {
      type: 'local',
      minX,
      maxX,
      minY,
      maxY,
      minZ,
      maxZ,
    },
  };
}

/**
 * Create a named (logical) zone with no compile-time bounds.
 */
export function createNamedZone(
  id: string,
  name: string,
  classification: ZoneClassification,
): SpatialZone {
  return {
    id,
    name,
    classification,
    bounds: { type: 'named' },
  };
}

/**
 * Create a `SpatialZonePolicy` for a given zone.
 */
export function createZonePolicy(
  zoneId: string,
  rolePermissions: Record<string, SpatialPermission[]> = {},
  agentOverrides: Record<string, SpatialPermission[]> = {},
  defaultPermissions: SpatialPermission[] = [],
): SpatialZonePolicy {
  return {
    zoneId,
    rolePermissions,
    agentOverrides,
    defaultPermissions,
  };
}

/**
 * Create and return a new `SpatialZoneEnforcer` instance.
 */
export function createSpatialZoneEnforcer(
  config?: SpatialZoneEnforcerConfig,
): SpatialZoneEnforcer {
  return new SpatialZoneEnforcer(config);
}

// ---------------------------------------------------------------------------
// Global Singleton
// ---------------------------------------------------------------------------

let globalSpatialZoneEnforcer: SpatialZoneEnforcer | null = null;

/**
 * Get or create the global `SpatialZoneEnforcer` singleton.
 */
export function getSpatialZoneEnforcer(
  config?: SpatialZoneEnforcerConfig,
): SpatialZoneEnforcer {
  if (!globalSpatialZoneEnforcer) {
    globalSpatialZoneEnforcer = new SpatialZoneEnforcer(config);
  }
  return globalSpatialZoneEnforcer;
}

/**
 * Reset the global `SpatialZoneEnforcer` singleton (for testing).
 */
export function resetSpatialZoneEnforcer(): void {
  globalSpatialZoneEnforcer = null;
}

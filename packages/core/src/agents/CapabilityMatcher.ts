/**
 * @holoscript/core - Capability Matcher
 *
 * Matches capability queries against agent manifests.
 * Part of HoloScript v3.1 Agentic Choreography.
 */

import type {
  AgentManifest,
  AgentCapability,
  CapabilityType,
  CapabilityDomain,
  LatencyProfile,
  TrustLevel,
  SpatialScope,
  Vector3,
  LATENCY_THRESHOLDS as _LATENCY_THRESHOLDS,
} from './AgentManifest';

// ============================================================================
// CAPABILITY QUERY
// ============================================================================

/**
 * Query for finding agents with specific capabilities
 */
export interface CapabilityQuery {
  /** Required capability type(s) */
  type?: CapabilityType | CapabilityType[] | string | string[];
  /** Required domain(s) */
  domain?: CapabilityDomain | CapabilityDomain[] | string | string[];
  /** Maximum acceptable latency */
  maxLatency?: LatencyProfile;
  /** Minimum required trust level */
  minTrust?: TrustLevel;
  /** Spatial requirements */
  spatial?: SpatialQuery;
  /** Required tags */
  tags?: string[];
  /** Custom filters */
  filters?: Record<string, unknown>;
  /** Maximum results to return */
  limit?: number;
  /** Whether to include offline agents */
  includeOffline?: boolean;
  /** Sort order */
  sortBy?: 'latency' | 'trust' | 'priority' | 'name';
  /** Sort direction */
  sortOrder?: 'asc' | 'desc';
}

/**
 * Spatial query for location-aware discovery
 */
export interface SpatialQuery {
  /** Point that must be within agent's scope */
  point?: Vector3;
  /** Scene/world filter */
  scene?: string;
  /** Node IDs to check */
  nodes?: string[];
  /** Minimum overlap with bounding box */
  overlaps?: { min: Vector3; max: Vector3 };
  /** Require global scope */
  requireGlobal?: boolean;
}

// ============================================================================
// MATCH RESULT
// ============================================================================

/**
 * Individual capability match result
 */
export interface CapabilityMatch {
  /** The matched capability */
  capability: AgentCapability;
  /** Match score (0-1) */
  score: number;
  /** Which query criteria matched */
  matchedCriteria: string[];
}

/**
 * Agent match result with scoring
 */
export interface AgentMatch {
  /** The matched agent manifest */
  manifest: AgentManifest;
  /** Overall match score (0-1) */
  score: number;
  /** Individual capability matches */
  capabilities: CapabilityMatch[];
  /** Why this agent matched */
  reasons: string[];
}

// ============================================================================
// TRUST LEVEL ORDERING
// ============================================================================

const TRUST_LEVELS: TrustLevel[] = ['local', 'verified', 'known', 'external', 'untrusted'];

function getTrustScore(level: TrustLevel): number {
  const index = TRUST_LEVELS.indexOf(level);
  return index >= 0 ? (TRUST_LEVELS.length - index) / TRUST_LEVELS.length : 0;
}

function meetsMinTrust(agentTrust: TrustLevel, minTrust: TrustLevel): boolean {
  return TRUST_LEVELS.indexOf(agentTrust) <= TRUST_LEVELS.indexOf(minTrust);
}

// ============================================================================
// LATENCY SCORING
// ============================================================================

const LATENCY_ORDER: LatencyProfile[] = ['instant', 'fast', 'medium', 'slow', 'background'];

function getLatencyScore(profile: LatencyProfile): number {
  const index = LATENCY_ORDER.indexOf(profile);
  return index >= 0 ? (LATENCY_ORDER.length - index) / LATENCY_ORDER.length : 0;
}

function meetsMaxLatency(
  capLatency: LatencyProfile | undefined,
  maxLatency: LatencyProfile
): boolean {
  if (!capLatency) return true; // Unknown latency is allowed
  return LATENCY_ORDER.indexOf(capLatency) <= LATENCY_ORDER.indexOf(maxLatency);
}

// ============================================================================
// SPATIAL MATCHING
// ============================================================================

function pointInBounds(point: Vector3, min: Vector3, max: Vector3): boolean {
  return (
    point.x >= min.x &&
    point.x <= max.x &&
    point.y >= min.y &&
    point.y <= max.y &&
    point.z >= min.z &&
    point.z <= max.z
  );
}

function boundsOverlap(
  a: { min: Vector3; max: Vector3 },
  b: { min: Vector3; max: Vector3 }
): boolean {
  return (
    a.min.x <= b.max.x &&
    a.max.x >= b.min.x &&
    a.min.y <= b.max.y &&
    a.max.y >= b.min.y &&
    a.min.z <= b.max.z &&
    a.max.z >= b.min.z
  );
}

function matchesSpatialQuery(scope: SpatialScope | undefined, query: SpatialQuery): boolean {
  // Global scope matches everything
  if (scope?.global) return true;

  // If no scope defined and query has requirements, only match if requireGlobal
  if (!scope) return query.requireGlobal !== true;

  // Check point containment
  if (query.point && scope.bounds) {
    if (!pointInBounds(query.point, scope.bounds.min, scope.bounds.max)) {
      return false;
    }
  }

  // Check radius containment
  if (query.point && scope.radius) {
    const dx = query.point.x - scope.radius.center.x;
    const dy = query.point.y - scope.radius.center.y;
    const dz = query.point.z - scope.radius.center.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
    if (distance > scope.radius.distance) return false;
  }

  // Check scene match
  if (query.scene && scope.scene && scope.scene !== query.scene) {
    return false;
  }

  // Check node overlap
  if (query.nodes && scope.nodes) {
    const hasOverlap = query.nodes.some((n) => scope.nodes!.includes(n));
    if (!hasOverlap) return false;
  }

  // Check bounding box overlap
  if (query.overlaps && scope.bounds) {
    if (!boundsOverlap(scope.bounds, query.overlaps)) {
      return false;
    }
  }

  return true;
}

// ============================================================================
// CAPABILITY MATCHER
// ============================================================================

/**
 * Matches capability queries against agent manifests
 */
export class CapabilityMatcher {
  /**
   * Check if a capability matches the query
   */
  matchCapability(capability: AgentCapability, query: CapabilityQuery): CapabilityMatch | null {
    const matchedCriteria: string[] = [];
    let score = 0;
    let criteriaCount = 0;

    // Type matching
    if (query.type) {
      criteriaCount++;
      const types = Array.isArray(query.type) ? query.type : [query.type];
      if (types.includes(capability.type as CapabilityType)) {
        matchedCriteria.push('type');
        score += 1;
      } else {
        return null; // Type is a hard requirement
      }
    }

    // Domain matching
    if (query.domain) {
      criteriaCount++;
      const domains = Array.isArray(query.domain) ? query.domain : [query.domain];
      if (domains.includes(capability.domain as CapabilityDomain)) {
        matchedCriteria.push('domain');
        score += 1;
      } else {
        return null; // Domain is a hard requirement
      }
    }

    // Latency matching
    if (query.maxLatency && capability.latency) {
      criteriaCount++;
      if (meetsMaxLatency(capability.latency, query.maxLatency)) {
        matchedCriteria.push('latency');
        score += getLatencyScore(capability.latency);
      } else {
        return null; // Latency is a hard requirement
      }
    }

    // Availability check
    if (capability.available === false) {
      return null;
    }

    // If no criteria matched and we had criteria, this is not a match
    if (criteriaCount > 0 && matchedCriteria.length === 0) {
      return null;
    }

    // Normalize score
    const normalizedScore = criteriaCount > 0 ? score / criteriaCount : 1;

    // Add priority bonus
    const priorityBonus = (capability.priority || 0) / 100;

    return {
      capability,
      score: Math.min(normalizedScore + priorityBonus, 1),
      matchedCriteria,
    };
  }

  /**
   * Check if an agent matches the query
   */
  matchAgent(manifest: AgentManifest, query: CapabilityQuery): AgentMatch | null {
    const reasons: string[] = [];

    // Offline check
    if (!query.includeOffline && manifest.status === 'offline') {
      return null;
    }

    // Trust level check
    if (query.minTrust && !meetsMinTrust(manifest.trustLevel, query.minTrust)) {
      return null;
    }

    // Spatial check
    if (query.spatial && !matchesSpatialQuery(manifest.spatialScope, query.spatial)) {
      return null;
    }

    // Tag check
    if (query.tags && query.tags.length > 0) {
      const agentTags = manifest.tags || [];
      const hasAllTags = query.tags.every((t) => agentTags.includes(t));
      if (!hasAllTags) {
        return null;
      }
      reasons.push('tags matched');
    }

    // Match capabilities
    const capabilityMatches: CapabilityMatch[] = [];
    for (const capability of manifest.capabilities) {
      const match = this.matchCapability(capability, query);
      if (match) {
        capabilityMatches.push(match);
      }
    }

    if (capabilityMatches.length === 0) {
      return null;
    }

    // Calculate overall score
    const avgCapabilityScore =
      capabilityMatches.reduce((sum, m) => sum + m.score, 0) / capabilityMatches.length;
    const trustScore = getTrustScore(manifest.trustLevel);

    // Weight scoring: capabilities 70%, trust 30%
    const overallScore = avgCapabilityScore * 0.7 + trustScore * 0.3;

    reasons.push(`${capabilityMatches.length} capability match(es)`);
    reasons.push(`trust: ${manifest.trustLevel}`);
    if (manifest.status === 'online') {
      reasons.push('online');
    }

    return {
      manifest,
      score: overallScore,
      capabilities: capabilityMatches,
      reasons,
    };
  }

  /**
   * Find all matching agents from a list
   */
  findMatches(manifests: AgentManifest[], query: CapabilityQuery): AgentMatch[] {
    const matches: AgentMatch[] = [];

    for (const manifest of manifests) {
      const match = this.matchAgent(manifest, query);
      if (match) {
        matches.push(match);
      }
    }

    // Sort results
    this.sortMatches(matches, query.sortBy || 'score', query.sortOrder || 'desc');

    // Apply limit
    if (query.limit && query.limit > 0) {
      return matches.slice(0, query.limit);
    }

    return matches;
  }

  /**
   * Find the best matching agent
   */
  findBest(manifests: AgentManifest[], query: CapabilityQuery): AgentMatch | null {
    const matches = this.findMatches(manifests, { ...query, limit: 1 });
    return matches.length > 0 ? matches[0] : null;
  }

  /**
   * Sort matches by criteria
   */
  private sortMatches(
    matches: AgentMatch[],
    sortBy: 'latency' | 'trust' | 'priority' | 'name' | 'score',
    sortOrder: 'asc' | 'desc'
  ): void {
    const multiplier = sortOrder === 'asc' ? 1 : -1;

    matches.sort((a, b) => {
      switch (sortBy) {
        case 'latency': {
          // Get fastest latency from capabilities
          const aLatency = this.getFastestLatency(a.capabilities);
          const bLatency = this.getFastestLatency(b.capabilities);
          return multiplier * (LATENCY_ORDER.indexOf(aLatency) - LATENCY_ORDER.indexOf(bLatency));
        }
        case 'trust':
          return (
            multiplier *
            (TRUST_LEVELS.indexOf(a.manifest.trustLevel) -
              TRUST_LEVELS.indexOf(b.manifest.trustLevel))
          );
        case 'priority': {
          const aPriority = this.getHighestPriority(a.capabilities);
          const bPriority = this.getHighestPriority(b.capabilities);
          return multiplier * (bPriority - aPriority);
        }
        case 'name':
          return multiplier * a.manifest.name.localeCompare(b.manifest.name);
        case 'score':
        default:
          return multiplier * (a.score - b.score);
      }
    });
  }

  private getFastestLatency(capabilities: CapabilityMatch[]): LatencyProfile {
    let fastest: LatencyProfile = 'background';
    for (const cap of capabilities) {
      if (cap.capability.latency) {
        const idx = LATENCY_ORDER.indexOf(cap.capability.latency);
        if (idx < LATENCY_ORDER.indexOf(fastest)) {
          fastest = cap.capability.latency;
        }
      }
    }
    return fastest;
  }

  private getHighestPriority(capabilities: CapabilityMatch[]): number {
    return Math.max(...capabilities.map((c) => c.capability.priority || 0));
  }
}

/**
 * Default matcher instance
 */
export const defaultMatcher = new CapabilityMatcher();

/**
 * Convenience function to find matching agents
 */
export function findAgents(manifests: AgentManifest[], query: CapabilityQuery): AgentMatch[] {
  return defaultMatcher.findMatches(manifests, query);
}

/**
 * Convenience function to find the best agent
 */
export function findBestAgent(
  manifests: AgentManifest[],
  query: CapabilityQuery
): AgentMatch | null {
  return defaultMatcher.findBest(manifests, query);
}

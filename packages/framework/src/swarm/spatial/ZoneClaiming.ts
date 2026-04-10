/**
 * ZoneClaiming - Territory awareness for swarm agents
 * HoloScript v3.2 - Autonomous Agent Swarms
 *
 * Manages spatial zones that agents can claim, contest, and defend
 */

import { Vector3 } from './Vector3';

/**
 * Zone state
 */
export type ZoneState = 'unclaimed' | 'contested' | 'claimed' | 'defended';

/**
 * Zone claim
 */
export interface IZoneClaim {
  agentId: string;
  swarmId?: string;
  claimedAt: number;
  strength: number; // 0-1
  lastReinforced: number;
}

/**
 * Zone definition
 */
export interface IZone {
  id: string;
  center: Vector3;
  radius: number;
  state: ZoneState;
  claims: IZoneClaim[];
  owner: string | null;
  ownerSwarm: string | null;
  value: number;
  metadata: Record<string, unknown>;
}

/**
 * Zone event
 */
export interface IZoneEvent {
  type: 'claimed' | 'contested' | 'captured' | 'defended' | 'abandoned';
  zoneId: string;
  agentId?: string;
  swarmId?: string;
  previousOwner?: string;
  timestamp: number;
  details?: Record<string, unknown>;
}

/**
 * Zone claiming configuration
 */
export interface IZoneClaimingConfig {
  /** Minimum strength to claim a zone */
  claimThreshold: number;
  /** Strength required to capture contested zone */
  captureThreshold: number;
  /** Decay rate per second for claim strength */
  strengthDecayRate: number;
  /** Reinforcement rate per second when in zone */
  reinforceRate: number;
  /** Bonus for having swarm members in zone */
  swarmBonus: number;
  /** Defense bonus for owner */
  defenseBonus: number;
}

type EventHandler = (event: IZoneEvent) => void;

/**
 * ZoneClaiming - Manages territory control mechanics
 */
export class ZoneClaiming {
  private zones: Map<string, IZone> = new Map();
  private agentZones: Map<string, Set<string>> = new Map();
  private config: IZoneClaimingConfig;
  private eventHandlers: Set<EventHandler> = new Set();

  constructor(config?: Partial<IZoneClaimingConfig>) {
    this.config = {
      claimThreshold: 0.3,
      captureThreshold: 0.7,
      strengthDecayRate: 0.05,
      reinforceRate: 0.1,
      swarmBonus: 0.2,
      defenseBonus: 0.15,
      ...config,
    };
  }

  /**
   * Create a new zone
   */
  createZone(
    id: string,
    center: Vector3,
    radius: number,
    options: { value?: number; metadata?: Record<string, unknown> } = {}
  ): IZone {
    const zone: IZone = {
      id,
      center: center.clone(),
      radius,
      state: 'unclaimed',
      claims: [],
      owner: null,
      ownerSwarm: null,
      value: options.value ?? 1,
      metadata: options.metadata ?? {},
    };

    this.zones.set(id, zone);
    return zone;
  }

  /**
   * Remove a zone
   */
  removeZone(zoneId: string): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;

    // Clean up agent references
    for (const claim of zone.claims) {
      const agentZoneSet = this.agentZones.get(claim.agentId);
      if (agentZoneSet) {
        agentZoneSet.delete(zoneId);
      }
    }

    return this.zones.delete(zoneId);
  }

  /**
   * Get a zone by ID
   */
  getZone(zoneId: string): IZone | undefined {
    return this.zones.get(zoneId);
  }

  /**
   * Get all zones
   */
  getAllZones(): IZone[] {
    return [...this.zones.values()];
  }

  /**
   * Find zones containing a position
   */
  findZonesAt(position: Vector3): IZone[] {
    return this.getAllZones().filter((zone) => position.distanceTo(zone.center) <= zone.radius);
  }

  /**
   * Check if an agent is in a zone
   */
  isAgentInZone(agentId: string, zoneId: string, agentPosition: Vector3): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;
    return agentPosition.distanceTo(zone.center) <= zone.radius;
  }

  /**
   * Add or reinforce an agent's claim to a zone
   */
  claimZone(
    agentId: string,
    zoneId: string,
    options: { swarmId?: string; strength?: number } = {}
  ): IZoneClaim | null {
    const zone = this.zones.get(zoneId);
    if (!zone) return null;

    const now = Date.now();
    const baseStrength = options.strength ?? this.config.reinforceRate;

    // Check for existing claim
    let claim = zone.claims.find((c) => c.agentId === agentId);

    if (claim) {
      // Reinforce existing claim
      claim.strength = Math.min(1, claim.strength + baseStrength);
      claim.lastReinforced = now;
    } else {
      // Create new claim
      claim = {
        agentId,
        swarmId: options.swarmId,
        claimedAt: now,
        strength: baseStrength,
        lastReinforced: now,
      };
      zone.claims.push(claim);

      // Track agent's zones
      if (!this.agentZones.has(agentId)) {
        this.agentZones.set(agentId, new Set());
      }
      this.agentZones.get(agentId)!.add(zoneId);
    }

    // Update zone state
    this.updateZoneState(zone);

    return claim;
  }

  /**
   * Release an agent's claim to a zone
   */
  releaseClaim(agentId: string, zoneId: string): boolean {
    const zone = this.zones.get(zoneId);
    if (!zone) return false;

    const claimIndex = zone.claims.findIndex((c) => c.agentId === agentId);
    if (claimIndex === -1) return false;

    zone.claims.splice(claimIndex, 1);

    // Update agent tracking
    const agentZoneSet = this.agentZones.get(agentId);
    if (agentZoneSet) {
      agentZoneSet.delete(zoneId);
    }

    // Check if zone should be abandoned
    if (zone.owner === agentId) {
      const previousOwner = zone.owner;
      zone.owner = null;
      zone.ownerSwarm = null;
      this.emit({
        type: 'abandoned',
        zoneId,
        agentId,
        previousOwner,
        timestamp: Date.now(),
      });
    }

    this.updateZoneState(zone);
    return true;
  }

  /**
   * Update zone state based on claims
   */
  private updateZoneState(zone: IZone): void {
    if (zone.claims.length === 0) {
      const previousOwner = zone.owner;
      zone.state = 'unclaimed';
      zone.owner = null;
      zone.ownerSwarm = null;
      if (previousOwner) {
        this.emit({
          type: 'abandoned',
          zoneId: zone.id,
          previousOwner,
          timestamp: Date.now(),
        });
      }
      return;
    }

    // Calculate total strengths by swarm/agent
    const strengthsByEntity = new Map<string, number>();
    for (const claim of zone.claims) {
      const entityKey = claim.swarmId ?? claim.agentId;
      const current = strengthsByEntity.get(entityKey) ?? 0;
      strengthsByEntity.set(entityKey, current + claim.strength);
    }

    // Apply swarm bonus
    for (const claim of zone.claims) {
      if (claim.swarmId) {
        const swarmClaims = zone.claims.filter((c) => c.swarmId === claim.swarmId);
        if (swarmClaims.length > 1) {
          const bonus = this.config.swarmBonus * (swarmClaims.length - 1);
          const current = strengthsByEntity.get(claim.swarmId)!;
          strengthsByEntity.set(claim.swarmId, current + bonus);
        }
      }
    }

    // Find highest strength entity
    let highestEntity: string | null = null;
    let highestStrength = 0;
    let secondStrength = 0;

    for (const [entity, strength] of strengthsByEntity) {
      if (strength > highestStrength) {
        secondStrength = highestStrength;
        highestStrength = strength;
        highestEntity = entity;
      } else if (strength > secondStrength) {
        secondStrength = strength;
      }
    }

    // Apply defense bonus to current owner
    if (zone.owner) {
      const ownerKey = zone.ownerSwarm ?? zone.owner;
      const ownerStrength = strengthsByEntity.get(ownerKey);
      if (ownerStrength) {
        strengthsByEntity.set(ownerKey, ownerStrength + this.config.defenseBonus);
      }
    }

    // Determine zone state
    const previousOwner = zone.owner;
    const previousState = zone.state;

    if (highestStrength < this.config.claimThreshold) {
      // Not enough strength to claim
      zone.state = zone.owner ? 'defended' : 'unclaimed';
    } else if (secondStrength >= highestStrength * 0.5) {
      // Contested - second place is within 50% of first
      zone.state = 'contested';
    } else if (highestStrength >= this.config.captureThreshold || zone.owner === null) {
      // Strong enough to claim/capture
      if (zone.owner !== highestEntity) {
        // New owner
        zone.owner = highestEntity;
        zone.ownerSwarm =
          zone.claims.find((c) => (c.swarmId ?? c.agentId) === highestEntity)?.swarmId ?? null;
        zone.state = 'claimed';

        this.emit({
          type: previousOwner ? 'captured' : 'claimed',
          zoneId: zone.id,
          agentId: highestEntity!,
          swarmId: zone.ownerSwarm ?? undefined,
          previousOwner: previousOwner ?? undefined,
          timestamp: Date.now(),
        });
      } else {
        zone.state = 'defended';
        if (previousState === 'contested') {
          this.emit({
            type: 'defended',
            zoneId: zone.id,
            agentId: zone.owner!,
            swarmId: zone.ownerSwarm ?? undefined,
            timestamp: Date.now(),
          });
        }
      }
    } else {
      zone.state = zone.owner ? 'defended' : 'unclaimed';
    }
  }

  /**
   * Apply decay to all claims
   */
  applyDecay(deltaTimeSeconds: number): void {
    const decay = this.config.strengthDecayRate * deltaTimeSeconds;

    for (const zone of this.zones.values()) {
      const claimsToRemove: number[] = [];

      for (let i = 0; i < zone.claims.length; i++) {
        zone.claims[i].strength -= decay;
        if (zone.claims[i].strength <= 0) {
          claimsToRemove.push(i);
        }
      }

      // Remove expired claims
      for (let i = claimsToRemove.length - 1; i >= 0; i--) {
        const claim = zone.claims[claimsToRemove[i]];
        const agentZoneSet = this.agentZones.get(claim.agentId);
        if (agentZoneSet) {
          agentZoneSet.delete(zone.id);
        }
        zone.claims.splice(claimsToRemove[i], 1);
      }

      if (claimsToRemove.length > 0) {
        this.updateZoneState(zone);
      }
    }
  }

  /**
   * Get zones owned by an agent/swarm
   */
  getOwnedZones(ownerId: string): IZone[] {
    return this.getAllZones().filter((z) => z.owner === ownerId || z.ownerSwarm === ownerId);
  }

  /**
   * Get zones an agent has claims in
   */
  getAgentClaims(agentId: string): IZone[] {
    const zoneIds = this.agentZones.get(agentId);
    if (!zoneIds) return [];

    return [...zoneIds].map((id) => this.zones.get(id)).filter((z): z is IZone => z !== undefined);
  }

  /**
   * Get claim strength of an agent in a zone
   */
  getClaimStrength(agentId: string, zoneId: string): number {
    const zone = this.zones.get(zoneId);
    if (!zone) return 0;

    const claim = zone.claims.find((c) => c.agentId === agentId);
    return claim?.strength ?? 0;
  }

  /**
   * Get total swarm strength in a zone
   */
  getSwarmStrength(swarmId: string, zoneId: string): number {
    const zone = this.zones.get(zoneId);
    if (!zone) return 0;

    return zone.claims.filter((c) => c.swarmId === swarmId).reduce((sum, c) => sum + c.strength, 0);
  }

  /**
   * Get contested zones
   */
  getContestedZones(): IZone[] {
    return this.getAllZones().filter((z) => z.state === 'contested');
  }

  /**
   * Get unclaimed zones
   */
  getUnclaimedZones(): IZone[] {
    return this.getAllZones().filter((z) => z.state === 'unclaimed');
  }

  /**
   * Get zones by state
   */
  getZonesByState(state: ZoneState): IZone[] {
    return this.getAllZones().filter((z) => z.state === state);
  }

  /**
   * Calculate total value of owned zones
   */
  getTotalValue(ownerId: string): number {
    return this.getOwnedZones(ownerId).reduce((sum, z) => sum + z.value, 0);
  }

  /**
   * Subscribe to zone events
   */
  onEvent(handler: EventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  /**
   * Emit an event
   */
  private emit(event: IZoneEvent): void {
    for (const handler of this.eventHandlers) {
      handler(event);
    }
  }

  /**
   * Get zone statistics
   */
  getStatistics(): {
    total: number;
    unclaimed: number;
    contested: number;
    claimed: number;
    defended: number;
    totalValue: number;
    claimedValue: number;
  } {
    const zones = this.getAllZones();
    return {
      total: zones.length,
      unclaimed: zones.filter((z) => z.state === 'unclaimed').length,
      contested: zones.filter((z) => z.state === 'contested').length,
      claimed: zones.filter((z) => z.state === 'claimed').length,
      defended: zones.filter((z) => z.state === 'defended').length,
      totalValue: zones.reduce((sum, z) => sum + z.value, 0),
      claimedValue: zones.filter((z) => z.owner).reduce((sum, z) => sum + z.value, 0),
    };
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<IZoneClaimingConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Get current configuration
   */
  getConfig(): IZoneClaimingConfig {
    return { ...this.config };
  }
}

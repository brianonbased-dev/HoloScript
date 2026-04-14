import type { Vector3 } from '@holoscript/core';
/**
 * TriggerZone.ts
 *
 * Trigger zones: enter/stay/exit callbacks, shape overlap tests,
 * zone stacking, and entity tracking.
 *
 * @module physics
 */

// =============================================================================
// TYPES
// =============================================================================

export type TriggerEvent = 'enter' | 'stay' | 'exit';
export type TriggerCallback = (entityId: string, zoneId: string, event: TriggerEvent) => void;

export interface TriggerShape {
  type: 'box' | 'sphere';
  position: [number, number, number];
  // Box: halfExtents, Sphere: radius
  halfExtents?: Vector3;
  radius?: number;
}

export interface TriggerZoneConfig {
  id: string;
  shape: TriggerShape;
  enabled: boolean;
  tags: string[];
}

// =============================================================================
// TRIGGER ZONE SYSTEM
// =============================================================================

export class TriggerZoneSystem {
  private zones: Map<string, TriggerZoneConfig> = new Map();
  private callbacks: Map<string, TriggerCallback[]> = new Map();
  // Per zone: set of entity IDs currently inside
  private occupants: Map<string, Set<string>> = new Map();

  // ---------------------------------------------------------------------------
  // Zone Management
  // ---------------------------------------------------------------------------

  addZone(config: TriggerZoneConfig): void {
    this.zones.set(config.id, config);
    this.occupants.set(config.id, new Set());
  }

  removeZone(id: string): void {
    this.zones.delete(id);
    this.occupants.delete(id);
    this.callbacks.delete(id);
  }

  enableZone(id: string, enabled: boolean): void {
    const z = this.zones.get(id);
    if (z) z.enabled = enabled;
  }

  // ---------------------------------------------------------------------------
  // Callbacks
  // ---------------------------------------------------------------------------

  onTrigger(zoneId: string, callback: TriggerCallback): void {
    if (!this.callbacks.has(zoneId)) this.callbacks.set(zoneId, []);
    this.callbacks.get(zoneId)!.push(callback);
  }

  private fire(zoneId: string, entityId: string, event: TriggerEvent): void {
    const cbs = this.callbacks.get(zoneId);
    if (cbs) for (const cb of cbs) cb(entityId, zoneId, event);
  }

  // ---------------------------------------------------------------------------
  // Update (test entities against zones)
  // ---------------------------------------------------------------------------

  update(
    entities: Array<{ id: string; position: [number, number, number]; radius?: number }>
  ): void {
    for (const [zoneId, zone] of this.zones) {
      if (!zone.enabled) continue;
      const current = this.occupants.get(zoneId)!;
      const nowInside = new Set<string>();

      for (const entity of entities) {
        if (this.overlaps(zone.shape, entity.position, entity.radius ?? 0)) {
          nowInside.add(entity.id);
          if (current.has(entity.id)) {
            this.fire(zoneId, entity.id, 'stay');
          } else {
            this.fire(zoneId, entity.id, 'enter');
          }
        }
      }

      // Exit detection
      for (const prevId of current) {
        if (!nowInside.has(prevId)) {
          this.fire(zoneId, prevId, 'exit');
        }
      }

      this.occupants.set(zoneId, nowInside);
    }
  }

  // ---------------------------------------------------------------------------
  // Overlap Tests
  // ---------------------------------------------------------------------------

  private overlaps(
    shape: TriggerShape,
    pos: [number, number, number],
    entityRadius: number
  ): boolean {
    if (shape.type === 'sphere' && shape.radius !== undefined) {
      const dx = pos[0] - shape.position[0],
        dy = pos[1] - shape.position[1],
        dz = pos[2] - shape.position[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return dist <= shape.radius + entityRadius;
    }

    if (shape.type === 'box' && shape.halfExtents) {
      const he = shape.halfExtents;
      const dx = Math.abs(pos[0] - shape.position[0]),
        dy = Math.abs(pos[1] - shape.position[1]),
        dz = Math.abs(pos[2] - shape.position[2]);
      return dx <= he[0] + entityRadius && dy <= he[1] + entityRadius && dz <= he[2] + entityRadius;
    }

    return false;
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  isInside(entityId: string, zoneId: string): boolean {
    return this.occupants.get(zoneId)?.has(entityId) ?? false;
  }

  getOccupants(zoneId: string): string[] {
    const occ = this.occupants.get(zoneId);
    return occ ? [...occ] : [];
  }

  getZonesForEntity(entityId: string): string[] {
    const zones: string[] = [];
    for (const [zoneId, occ] of this.occupants) {
      if (occ.has(entityId)) zones.push(zoneId);
    }
    return zones;
  }

  getZoneCount(): number {
    return this.zones.size;
  }
}

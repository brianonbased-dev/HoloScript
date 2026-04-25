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
  position: [number, number, number] | Vector3;
  // Box: halfExtents, Sphere: radius
  halfExtents?: [number, number, number] | Vector3;
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
    const sx = this.getComponent(shape.position, 0);
    const sy = this.getComponent(shape.position, 1);
    const sz = this.getComponent(shape.position, 2);

    if (shape.type === 'sphere' && shape.radius !== undefined) {
      const dx = pos[0] - sx,
        dy = pos[1] - sy,
        dz = pos[2] - sz;
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      return dist <= shape.radius + entityRadius;
    }

    if (shape.type === 'box' && shape.halfExtents) {
      const hx = this.getComponent(shape.halfExtents, 0);
      const hy = this.getComponent(shape.halfExtents, 1);
      const hz = this.getComponent(shape.halfExtents, 2);
      const dx = Math.abs(pos[0] - sx),
        dy = Math.abs(pos[1] - sy),
        dz = Math.abs(pos[2] - sz);
      return dx <= hx + entityRadius && dy <= hy + entityRadius && dz <= hz + entityRadius;
    }

    return false;
  }

  private getComponent(v: [number, number, number] | Vector3, i: 0 | 1 | 2): number {
    if (Array.isArray(v)) return v[i];
    if (i === 0) return (v as { x: number }).x;
    if (i === 1) return (v as { y: number }).y;
    return (v as { z: number }).z;
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

/**
 * HitboxSystem.ts
 *
 * Hitbox/hurtbox management: active frame windows,
 * hit registration with deduplication, and knockback vectors.
 *
 * @module combat
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Hitbox {
  id: string;
  ownerId: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
  damage: number;
  knockbackX: number;
  knockbackY: number;
  activeStart: number; // Frame
  activeEnd: number; // Frame
  group: string; // Dedup group (only hit once per activation)
}

export interface Hurtbox {
  id: string;
  entityId: string;
  x: number;
  y: number;
  z: number;
  width: number;
  height: number;
  depth: number;
}

export interface HitEvent {
  hitboxId: string;
  hurtboxId: string;
  attackerId: string;
  defenderId: string;
  damage: number;
  knockbackX: number;
  knockbackY: number;
}

// =============================================================================
// HITBOX SYSTEM
// =============================================================================

export class HitboxSystem {
  private hitboxes: Map<string, Hitbox> = new Map();
  private hurtboxes: Map<string, Hurtbox> = new Map();
  private currentFrame = 0;
  private hitLog: Set<string> = new Set(); // "hitboxGroup:hurtboxEntity" dedup
  private events: HitEvent[] = [];

  // ---------------------------------------------------------------------------
  // Registration
  // ---------------------------------------------------------------------------

  addHitbox(hb: Hitbox): void {
    this.hitboxes.set(hb.id, hb);
  }
  addHurtbox(hb: Hurtbox): void {
    this.hurtboxes.set(hb.id, hb);
  }
  removeHitbox(id: string): void {
    this.hitboxes.delete(id);
  }
  removeHurtbox(id: string): void {
    this.hurtboxes.delete(id);
  }

  // ---------------------------------------------------------------------------
  // Frame Update
  // ---------------------------------------------------------------------------

  update(frame: number): HitEvent[] {
    this.currentFrame = frame;
    this.events = [];

    for (const hitbox of this.hitboxes.values()) {
      // Check active frames
      if (frame < hitbox.activeStart || frame > hitbox.activeEnd) continue;

      for (const hurtbox of this.hurtboxes.values()) {
        // Skip self-hit
        if (hitbox.ownerId === hurtbox.entityId) continue;

        // Dedup check
        const key = `${hitbox.group}:${hurtbox.entityId}`;
        if (this.hitLog.has(key)) continue;

        // AABB overlap test
        if (this.overlaps(hitbox, hurtbox)) {
          this.hitLog.add(key);
          this.events.push({
            hitboxId: hitbox.id,
            hurtboxId: hurtbox.id,
            attackerId: hitbox.ownerId,
            defenderId: hurtbox.entityId,
            damage: hitbox.damage,
            knockbackX: hitbox.knockbackX,
            knockbackY: hitbox.knockbackY,
          });
        }
      }
    }

    return [...this.events];
  }

  // ---------------------------------------------------------------------------
  // Collision Test
  // ---------------------------------------------------------------------------

  private overlaps(hb: Hitbox, hr: Hurtbox): boolean {
    return (
      hb.x < hr.x + hr.width &&
      hb.x + hb.width > hr.x &&
      hb.y < hr.y + hr.height &&
      hb.y + hb.height > hr.y &&
      hb.z < hr.z + hr.depth &&
      hb.z + hb.depth > hr.z
    );
  }

  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  clearHitLog(): void {
    this.hitLog.clear();
  }
  getHitCount(): number {
    return this.hitLog.size;
  }
  getLastEvents(): HitEvent[] {
    return [...this.events];
  }
}

/**
 * HitboxSystem — frame-based hitbox/hurtbox collision with
 * deduplication by group, active frame windows, knockback.
 */

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
  activeStart: number;
  activeEnd: number;
  group: string;
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
  attackerId: string;
  defenderId: string;
  hitboxId: string;
  hurtboxId: string;
  damage: number;
  knockbackX: number;
  knockbackY: number;
}

function boxesOverlap(h: Hitbox, hr: Hurtbox): boolean {
  const hMinX = h.x - h.width / 2;
  const hMaxX = h.x + h.width / 2;
  const hMinY = h.y - h.height / 2;
  const hMaxY = h.y + h.height / 2;
  const hMinZ = h.z - h.depth / 2;
  const hMaxZ = h.z + h.depth / 2;

  const hrMinX = hr.x - hr.width / 2;
  const hrMaxX = hr.x + hr.width / 2;
  const hrMinY = hr.y - hr.height / 2;
  const hrMaxY = hr.y + hr.height / 2;
  const hrMinZ = hr.z - hr.depth / 2;
  const hrMaxZ = hr.z + hr.depth / 2;

  return (
    hMinX < hrMaxX &&
    hMaxX > hrMinX &&
    hMinY < hrMaxY &&
    hMaxY > hrMinY &&
    hMinZ < hrMaxZ &&
    hMaxZ > hrMinZ
  );
}

export class HitboxSystem {
  private hitboxes: Map<string, Hitbox> = new Map();
  private hurtboxes: Map<string, Hurtbox> = new Map();
  private hitLog: Set<string> = new Set(); // group:entityId dedup keys
  private hitCount = 0;
  private lastEvents: HitEvent[] = [];

  addHitbox(hb: Hitbox): void {
    this.hitboxes.set(hb.id, { ...hb });
  }

  addHurtbox(hr: Hurtbox): void {
    this.hurtboxes.set(hr.id, { ...hr });
  }

  removeHitbox(id: string): void {
    this.hitboxes.delete(id);
  }

  removeHurtbox(id: string): void {
    this.hurtboxes.delete(id);
  }

  update(frame: number): HitEvent[] {
    const events: HitEvent[] = [];

    for (const hb of this.hitboxes.values()) {
      if (frame < hb.activeStart || frame > hb.activeEnd) continue;

      for (const hr of this.hurtboxes.values()) {
        if (hb.ownerId === hr.entityId) continue;

        const dedupKey = `${hb.group}:${hr.entityId}`;
        if (this.hitLog.has(dedupKey)) continue;

        if (boxesOverlap(hb, hr)) {
          this.hitLog.add(dedupKey);
          this.hitCount++;
          const event: HitEvent = {
            attackerId: hb.ownerId,
            defenderId: hr.entityId,
            hitboxId: hb.id,
            hurtboxId: hr.id,
            damage: hb.damage,
            knockbackX: hb.knockbackX,
            knockbackY: hb.knockbackY,
          };
          events.push(event);
        }
      }
    }

    this.lastEvents = events;
    return events;
  }

  clearHitLog(): void {
    this.hitLog.clear();
    this.hitCount = 0;
  }

  getHitCount(): number {
    return this.hitCount;
  }

  getLastEvents(): HitEvent[] {
    return [...this.lastEvents];
  }
}

/**
 * DecalSystem.ts
 *
 * Projected decals: texture projection, sorting, atlas UV,
 * lifetime fade, object pooling, and layer filtering.
 *
 * @module rendering
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DecalDef {
  id: string;
  textureId: string;
  atlasRegion?: { u: number; v: number; w: number; h: number };
  size: { x: number; y: number; z: number };
  position: [number, number, number];
  rotation: { x: number; y: number; z: number; w: number };
  normal: { x: number; y: number; z: number };
  color: { r: number; g: number; b: number; a: number };
  layer: number;
  sortOrder: number;
  lifetime: number; // seconds, 0 = infinite
  fadeInDuration: number;
  fadeOutDuration: number;
  active: boolean;
  // Runtime state
  age: number;
  opacity: number;
}

// =============================================================================
// DECAL SYSTEM
// =============================================================================

let _decalId = 0;

export class DecalSystem {
  private decals: Map<string, DecalDef> = new Map();
  private pool: DecalDef[] = [];
  private maxDecals = 500;
  private layerMask = 0xffffffff;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setMaxDecals(max: number): void {
    this.maxDecals = Math.max(1, max);
  }
  getMaxDecals(): number {
    return this.maxDecals;
  }
  setLayerMask(mask: number): void {
    this.layerMask = mask;
  }

  // ---------------------------------------------------------------------------
  // Spawning
  // ---------------------------------------------------------------------------

  spawn(
    config: Partial<DecalDef> & {
      textureId: string;
      position: DecalDef['position'];
      normal: DecalDef['normal'];
    }
  ): DecalDef {
    // Recycle from pool or create new
    let decal = this.pool.pop();
    if (!decal) {
      decal = {
        id: `decal_${_decalId++}`,
        textureId: '',
        atlasRegion: undefined,
        size: { x: 1, y: 1, z: 1 },
        position: [0, 0, 0],
        rotation: { x: 0, y: 0, z: 0, w: 1 },
        normal: { x: 0, y: 1, z: 0 },
        color: { r: 1, g: 1, b: 1, a: 1 },
        layer: 1,
        sortOrder: 0,
        lifetime: 0,
        fadeInDuration: 0.1,
        fadeOutDuration: 0.5,
        active: true,
        age: 0,
        opacity: 0,
      };
    }

    // Apply config
    Object.assign(decal, config);
    decal.active = true;
    decal.age = 0;
    decal.opacity = 0;

    // Enforce limit
    if (this.decals.size >= this.maxDecals) {
      // Remove oldest
      const oldest = this.getOldest();
      if (oldest) this.remove(oldest.id);
    }

    this.decals.set(decal.id, decal);
    return decal;
  }

  remove(id: string): void {
    const decal = this.decals.get(id);
    if (decal) {
      decal.active = false;
      this.decals.delete(id);
      this.pool.push(decal);
    }
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number): void {
    const toRemove: string[] = [];

    for (const decal of this.decals.values()) {
      if (!decal.active) continue;

      decal.age += dt;

      // Fade in
      if (decal.age < decal.fadeInDuration) {
        decal.opacity = decal.age / decal.fadeInDuration;
      }
      // Active
      else if (decal.lifetime <= 0 || decal.age < decal.lifetime - decal.fadeOutDuration) {
        decal.opacity = 1;
      }
      // Fade out
      else if (decal.lifetime > 0) {
        const fadeStart = decal.lifetime - decal.fadeOutDuration;
        decal.opacity = Math.max(0, 1 - (decal.age - fadeStart) / decal.fadeOutDuration);
      }

      // Expired?
      if (decal.lifetime > 0 && decal.age >= decal.lifetime) {
        toRemove.push(decal.id);
      }
    }

    for (const id of toRemove) this.remove(id);
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getDecal(id: string): DecalDef | undefined {
    return this.decals.get(id);
  }
  getActiveCount(): number {
    return this.decals.size;
  }
  getPoolSize(): number {
    return this.pool.length;
  }

  getVisible(frustumTest?: (pos: DecalDef['position']) => boolean): DecalDef[] {
    const result: DecalDef[] = [];
    for (const d of this.decals.values()) {
      if (!d.active || d.opacity <= 0) continue;
      if ((d.layer & this.layerMask) === 0) continue;
      if (frustumTest && !frustumTest(d.position)) continue;
      result.push(d);
    }
    return result.sort((a, b) => a.sortOrder - b.sortOrder);
  }

  private getOldest(): DecalDef | null {
    let oldest: DecalDef | null = null;
    for (const d of this.decals.values()) {
      if (!oldest || d.age > oldest.age) oldest = d;
    }
    return oldest;
  }

  clear(): void {
    for (const d of this.decals.values()) this.pool.push(d);
    this.decals.clear();
  }
}

/**
 * FoliageSystem.ts
 *
 * Instance-based foliage: scattering, density maps,
 * wind sway animation, LOD, and culling.
 *
 * @module environment
 */

// =============================================================================
// TYPES
// =============================================================================

export interface FoliageType {
  id: string;
  meshId: string;
  density: number; // instances per unit area
  minScale: number;
  maxScale: number;
  alignToNormal: boolean;
  windResponse: number; // 0-1, how much wind affects it
  castsShadow: boolean;
  lodDistances: number[];
}

export interface FoliageInstance {
  typeId: string;
  position: [number, number, number];
  scale: number;
  rotation: number; // Y-axis rotation in radians
  windPhase: number; // offset to prevent uniform sway
  lodLevel: number;
  visible: boolean;
}

export interface FoliagePatch {
  id: string;
  bounds: { x: number; z: number; w: number; h: number }; // XZ rect
  instances: FoliageInstance[];
  density: number;
}

// =============================================================================
// FOLIAGE SYSTEM
// =============================================================================

export class FoliageSystem {
  private types: Map<string, FoliageType> = new Map();
  private patches: Map<string, FoliagePatch> = new Map();
  private windDir = { x: 1, z: 0 };
  private windStrength = 0.5;
  private time = 0;

  // ---------------------------------------------------------------------------
  // Types
  // ---------------------------------------------------------------------------

  registerType(type: FoliageType): void {
    this.types.set(type.id, type);
  }
  getType(id: string): FoliageType | undefined {
    return this.types.get(id);
  }
  getTypeCount(): number {
    return this.types.size;
  }

  // ---------------------------------------------------------------------------
  // Wind
  // ---------------------------------------------------------------------------

  setWind(dirX: number, dirZ: number, strength: number): void {
    const len = Math.sqrt(dirX * dirX + dirZ * dirZ) || 1;
    this.windDir = { x: dirX / len, z: dirZ / len };
    this.windStrength = Math.max(0, Math.min(1, strength));
  }

  getWind(): { dirX: number; dirZ: number; strength: number } {
    return { dirX: this.windDir.x, dirZ: this.windDir.z, strength: this.windStrength };
  }

  // ---------------------------------------------------------------------------
  // Scattering
  // ---------------------------------------------------------------------------

  scatter(
    patchId: string,
    typeId: string,
    bounds: FoliagePatch['bounds'],
    count: number,
    seed = 42
  ): FoliagePatch {
    const type = this.types.get(typeId);
    if (!type) throw new Error(`Unknown foliage type: ${typeId}`);

    const instances: FoliageInstance[] = [];
    let rng = seed;
    const nextRand = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };

    for (let i = 0; i < count; i++) {
      const x = bounds.x + nextRand() * bounds.w;
      const z = bounds.z + nextRand() * bounds.h;
      const scale = type.minScale + nextRand() * (type.maxScale - type.minScale);

      instances.push({
        typeId,
        position: { x, y: 0, z },
        scale,
        rotation: nextRand() * Math.PI * 2,
        windPhase: nextRand() * Math.PI * 2,
        lodLevel: 0,
        visible: true,
      });
    }

    const patch: FoliagePatch = {
      id: patchId,
      bounds,
      instances,
      density: count / (bounds.w * bounds.h),
    };
    this.patches.set(patchId, patch);
    return patch;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  update(dt: number, cameraPos: { x: number; z: number }): void {
    this.time += dt;

    for (const patch of this.patches.values()) {
      for (const inst of patch.instances) {
        const type = this.types.get(inst.typeId);
        if (!type) continue;

        // LOD
        const dx = inst.position.x - cameraPos.x;
        const dz = inst.position.z - cameraPos.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        inst.lodLevel = 0;
        inst.visible = true;
        for (let l = 0; l < type.lodDistances.length; l++) {
          if (dist > type.lodDistances[l]) inst.lodLevel = l + 1;
        }
        if (inst.lodLevel > type.lodDistances.length) inst.visible = false;
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Wind sway (queried per instance for rendering)
  // ---------------------------------------------------------------------------

  getWindOffset(inst: FoliageInstance): { x: number; z: number } {
    const type = this.types.get(inst.typeId);
    const response = type?.windResponse ?? 0;
    const sway = Math.sin(this.time * 2 + inst.windPhase) * this.windStrength * response;
    return { x: this.windDir.x * sway, z: this.windDir.z * sway };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getPatch(id: string): FoliagePatch | undefined {
    return this.patches.get(id);
  }
  getPatchCount(): number {
    return this.patches.size;
  }

  getVisibleCount(): number {
    let count = 0;
    for (const p of this.patches.values()) {
      for (const i of p.instances) if (i.visible) count++;
    }
    return count;
  }

  getTotalInstanceCount(): number {
    let count = 0;
    for (const p of this.patches.values()) count += p.instances.length;
    return count;
  }

  removePatch(id: string): boolean {
    return this.patches.delete(id);
  }
}

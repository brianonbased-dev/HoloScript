/**
 * SkeletalBlender.ts
 *
 * Multi-clip animation blending: layer weights,
 * additive/override modes, crossfade, and pose mixing.
 *
 * @module animation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface AnimPose {
  boneId: string;
  tx: number;
  ty: number;
  tz: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface AnimLayer {
  id: string;
  poses: AnimPose[];
  weight: number; // 0-1
  mode: 'override' | 'additive';
  mask?: Set<string>; // Bone IDs this layer affects (null = all)
}

// =============================================================================
// SKELETAL BLENDER
// =============================================================================

export class SkeletalBlender {
  private layers: AnimLayer[] = [];
  private blendedPoses: Map<string, AnimPose> = new Map();

  // ---------------------------------------------------------------------------
  // Layer Management
  // ---------------------------------------------------------------------------

  addLayer(layer: AnimLayer): void {
    this.layers.push(layer);
  }

  removeLayer(id: string): void {
    this.layers = this.layers.filter((l) => l.id !== id);
  }

  setLayerWeight(id: string, weight: number): void {
    const layer = this.layers.find((l) => l.id === id);
    if (layer) layer.weight = Math.max(0, Math.min(1, weight));
  }

  getLayerWeight(id: string): number {
    return this.layers.find((l) => l.id === id)?.weight ?? 0;
  }

  // ---------------------------------------------------------------------------
  // Blending
  // ---------------------------------------------------------------------------

  blend(): Map<string, AnimPose> {
    this.blendedPoses.clear();

    for (const layer of this.layers) {
      if (layer.weight <= 0) continue;

      for (const pose of layer.poses) {
        // Check mask
        if (layer.mask && !layer.mask.has(pose.boneId)) continue;

        const existing = this.blendedPoses.get(pose.boneId);

        if (!existing || layer.mode === 'override') {
          // Override: lerp between existing (or identity) and this pose
          const base = existing ?? {
            boneId: pose.boneId,
            tx: 0,
            ty: 0,
            tz: 0,
            sx: 1,
            sy: 1,
            sz: 1,
          };
          this.blendedPoses.set(pose.boneId, this.lerpPose(base, pose, layer.weight));
        } else {
          // Additive: add weighted delta on top
          this.blendedPoses.set(pose.boneId, {
            boneId: pose.boneId,
            tx: existing.tx + pose.tx * layer.weight,
            ty: existing.ty + pose.ty * layer.weight,
            tz: existing.tz + pose.tz * layer.weight,
            sx: existing.sx * (1 + (pose.sx - 1) * layer.weight),
            sy: existing.sy * (1 + (pose.sy - 1) * layer.weight),
            sz: existing.sz * (1 + (pose.sz - 1) * layer.weight),
          });
        }
      }
    }

    return new Map(this.blendedPoses);
  }

  // ---------------------------------------------------------------------------
  // Crossfade
  // ---------------------------------------------------------------------------

  crossfade(fromId: string, toId: string, t: number): void {
    this.setLayerWeight(fromId, 1 - t);
    this.setLayerWeight(toId, t);
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  private lerpPose(a: AnimPose, b: AnimPose, t: number): AnimPose {
    return {
      boneId: a.boneId,
      tx: a.tx + (b.tx - a.tx) * t,
      ty: a.ty + (b.ty - a.ty) * t,
      tz: a.tz + (b.tz - a.tz) * t,
      sx: a.sx + (b.sx - a.sx) * t,
      sy: a.sy + (b.sy - a.sy) * t,
      sz: a.sz + (b.sz - a.sz) * t,
    };
  }

  getLayerCount(): number {
    return this.layers.length;
  }
  getBlendedPose(boneId: string): AnimPose | undefined {
    return this.blendedPoses.get(boneId);
  }
}


/**
 * BoneSystem.ts
 *
 * Skeletal bone hierarchy: bind pose, joint transforms,
 * world-space chain computation, and pose application.
 *
 * @module animation
 */

// =============================================================================
// TYPES
// =============================================================================

/** Local tuple for bone world positions — keeps BoneSystem independent of @holoscript/core object-style Vector3. */
type Vec3 = [number, number, number];

export interface BoneTransform {
  tx: number;
  ty: number;
  tz: number; // Translation
  rx: number;
  ry: number;
  rz: number;
  rw: number; // Quaternion rotation
  sx: number;
  sy: number;
  sz: number; // Scale
}

export interface Bone {
  id: string;
  name: string;
  parentId: string | null;
  local: BoneTransform;
  world: BoneTransform;
  bindInverse: BoneTransform;
  childIds: string[];
}

// =============================================================================
// BONE SYSTEM
// =============================================================================

export class BoneSystem {
  private bones: Map<string, Bone> = new Map();
  private roots: string[] = [];
  private dirty = true;

  // ---------------------------------------------------------------------------
  // Bone Management
  // ---------------------------------------------------------------------------

  addBone(id: string, name: string, parentId: string | null, local?: Partial<BoneTransform>): void {
    const defaultTransform = (): BoneTransform => ({
      tx: 0,
      ty: 0,
      tz: 0,
      rx: 0,
      ry: 0,
      rz: 0,
      rw: 1,
      sx: 1,
      sy: 1,
      sz: 1,
    });
    const bone: Bone = {
      id,
      name,
      parentId,
      local: { ...defaultTransform(), ...local },
      world: defaultTransform(),
      bindInverse: defaultTransform(),
      childIds: [],
    };

    this.bones.set(id, bone);

    if (parentId) {
      const parent = this.bones.get(parentId);
      if (parent) parent.childIds.push(id);
    } else {
      this.roots.push(id);
    }

    this.dirty = true;
  }

  getBone(id: string): Bone | undefined {
    return this.bones.get(id);
  }
  getBoneCount(): number {
    return this.bones.size;
  }
  getRoots(): string[] {
    return [...this.roots];
  }

  // ---------------------------------------------------------------------------
  // Pose Application
  // ---------------------------------------------------------------------------

  setLocalTransform(id: string, transform: Partial<BoneTransform>): void {
    const bone = this.bones.get(id);
    if (!bone) return;
    Object.assign(bone.local, transform);
    this.dirty = true;
  }

  /**
   * Apply a batch of local transforms and update the hierarchy as one
   * transaction. A validation/composition failure restores both local and
   * world state so callers never observe a half-applied pose.
   */
  applyLocalTransforms(transforms: ReadonlyMap<string, Partial<BoneTransform>>): void {
    for (const id of transforms.keys()) {
      if (!this.bones.has(id)) {
        throw new Error(`Cannot apply local transform to missing bone "${id}"`);
      }
    }

    // Establish a coherent rollback baseline before mutating any local state.
    this.updateWorldTransforms();
    const localBefore = new Map<string, BoneTransform>();
    const worldBefore = new Map<string, BoneTransform>();
    for (const [id, bone] of this.bones) {
      worldBefore.set(id, { ...bone.world });
      if (transforms.has(id)) localBefore.set(id, { ...bone.local });
    }

    try {
      for (const [id, transform] of transforms) {
        Object.assign(this.bones.get(id)!.local, transform);
      }
      this.dirty = true;
      this.updateWorldTransforms();
    } catch (error) {
      for (const [id, local] of localBefore) {
        Object.assign(this.bones.get(id)!.local, local);
      }
      for (const [id, world] of worldBefore) {
        this.bones.get(id)!.world = world;
      }
      this.dirty = false;
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // World-Space Update
  // ---------------------------------------------------------------------------

  updateWorldTransforms(): void {
    if (!this.dirty) return;
    for (const rootId of this.roots) this.updateBoneChain(rootId);
    this.dirty = false;
  }

  private updateBoneChain(id: string): void {
    const bone = this.bones.get(id);
    if (!bone) return;

    if (bone.parentId) {
      const parent = this.bones.get(bone.parentId)!;
      bone.world = this.combineTransforms(parent.world, bone.local);
    } else {
      bone.world = this.normalizeTransformRotation(bone.local);
    }

    for (const childId of bone.childIds) this.updateBoneChain(childId);
  }

  // ---------------------------------------------------------------------------
  // Bind Pose
  // ---------------------------------------------------------------------------

  captureBindPose(): void {
    this.updateWorldTransforms();
    for (const bone of this.bones.values()) {
      bone.bindInverse = this.invertTransform(bone.world);
    }
  }

  getSkinningMatrix(id: string): BoneTransform | null {
    const bone = this.bones.get(id);
    if (!bone) return null;
    this.updateWorldTransforms();
    return this.combineTransforms(bone.world, bone.bindInverse);
  }

  // ---------------------------------------------------------------------------
  // Transform Math (compact TRS; no shear representation)
  // ---------------------------------------------------------------------------

  private combineTransforms(parent: BoneTransform, child: BoneTransform): BoneTransform {
    const parentRotation = this.normalizeQuaternion(parent);
    const childRotation = this.normalizeQuaternion(child);
    const [rx, ry, rz, rw] = this.multiplyQuaternions(parentRotation, childRotation);
    const [ctx, cty, ctz] = this.rotateVector(parentRotation, [
      child.tx * parent.sx,
      child.ty * parent.sy,
      child.tz * parent.sz,
    ]);

    return {
      tx: parent.tx + ctx,
      ty: parent.ty + cty,
      tz: parent.tz + ctz,
      rx,
      ry,
      rz,
      rw,
      sx: parent.sx * child.sx,
      sy: parent.sy * child.sy,
      sz: parent.sz * child.sz,
    };
  }

  private invertTransform(t: BoneTransform): BoneTransform {
    const isx = t.sx !== 0 ? 1 / t.sx : 0;
    const isy = t.sy !== 0 ? 1 / t.sy : 0;
    const isz = t.sz !== 0 ? 1 / t.sz : 0;
    const [qx, qy, qz, qw] = this.normalizeQuaternion(t);
    const inverseRotation: [number, number, number, number] = [-qx, -qy, -qz, qw];
    const [itx, ity, itz] = this.rotateVector(inverseRotation, [-t.tx, -t.ty, -t.tz]);
    return {
      tx: itx * isx,
      ty: ity * isy,
      tz: itz * isz,
      rx: inverseRotation[0],
      ry: inverseRotation[1],
      rz: inverseRotation[2],
      rw: inverseRotation[3],
      sx: isx,
      sy: isy,
      sz: isz,
    };
  }

  private normalizeTransformRotation(transform: BoneTransform): BoneTransform {
    const [rx, ry, rz, rw] = this.normalizeQuaternion(transform);
    return { ...transform, rx, ry, rz, rw };
  }

  private normalizeQuaternion(
    transform: Pick<BoneTransform, 'rx' | 'ry' | 'rz' | 'rw'>
  ): [number, number, number, number] {
    const norm = Math.hypot(transform.rx, transform.ry, transform.rz, transform.rw);
    if (!Number.isFinite(norm) || norm === 0) {
      throw new RangeError('Bone rotation must be a finite non-zero quaternion');
    }
    return [transform.rx / norm, transform.ry / norm, transform.rz / norm, transform.rw / norm];
  }

  private multiplyQuaternions(
    parent: readonly [number, number, number, number],
    child: readonly [number, number, number, number]
  ): [number, number, number, number] {
    const [px, py, pz, pw] = parent;
    const [cx, cy, cz, cw] = child;
    const rx = pw * cx + px * cw + py * cz - pz * cy;
    const ry = pw * cy - px * cz + py * cw + pz * cx;
    const rz = pw * cz + px * cy - py * cx + pz * cw;
    const rw = pw * cw - px * cx - py * cy - pz * cz;
    const norm = Math.hypot(rx, ry, rz, rw);
    if (!Number.isFinite(norm) || norm === 0) {
      throw new RangeError('Composed bone rotation must be a finite non-zero quaternion');
    }
    return [rx / norm, ry / norm, rz / norm, rw / norm];
  }

  private rotateVector(
    quaternion: readonly [number, number, number, number],
    vector: readonly [number, number, number]
  ): [number, number, number] {
    const [qx, qy, qz, qw] = quaternion;
    const [vx, vy, vz] = vector;
    const tx = 2 * (qy * vz - qz * vy);
    const ty = 2 * (qz * vx - qx * vz);
    const tz = 2 * (qx * vy - qy * vx);
    return [
      vx + qw * tx + (qy * tz - qz * ty),
      vy + qw * ty + (qz * tx - qx * tz),
      vz + qw * tz + (qx * ty - qy * tx),
    ];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getWorldPosition(id: string): Vec3 | null {
    const bone = this.bones.get(id);
    if (!bone) return null;
    this.updateWorldTransforms();
    return [bone.world.tx, bone.world.ty, bone.world.tz];
  }

  getChain(leafId: string): string[] {
    const chain: string[] = [];
    let current = leafId;
    while (current) {
      chain.unshift(current);
      current = this.bones.get(current)?.parentId ?? '';
    }
    return chain;
  }
}

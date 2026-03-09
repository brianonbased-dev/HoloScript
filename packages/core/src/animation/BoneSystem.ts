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
      bone.world = { ...bone.local };
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
  // Transform Math (simplified)
  // ---------------------------------------------------------------------------

  private combineTransforms(parent: BoneTransform, child: BoneTransform): BoneTransform {
    return {
      tx: parent.tx + child.tx * parent.sx,
      ty: parent.ty + child.ty * parent.sy,
      tz: parent.tz + child.tz * parent.sz,
      rx: child.rx,
      ry: child.ry,
      rz: child.rz,
      rw: child.rw, // Simplified — no quat multiply
      sx: parent.sx * child.sx,
      sy: parent.sy * child.sy,
      sz: parent.sz * child.sz,
    };
  }

  private invertTransform(t: BoneTransform): BoneTransform {
    const isx = t.sx !== 0 ? 1 / t.sx : 0;
    const isy = t.sy !== 0 ? 1 / t.sy : 0;
    const isz = t.sz !== 0 ? 1 / t.sz : 0;
    return {
      tx: -t.tx * isx,
      ty: -t.ty * isy,
      tz: -t.tz * isz,
      rx: -t.rx,
      ry: -t.ry,
      rz: -t.rz,
      rw: t.rw, // Conjugate
      sx: isx,
      sy: isy,
      sz: isz,
    };
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getWorldPosition(id: string): { x: number; y: number; z: number } | null {
    const bone = this.bones.get(id);
    if (!bone) return null;
    this.updateWorldTransforms();
    return { x: bone.world.tx, y: bone.world.ty, z: bone.world.tz };
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

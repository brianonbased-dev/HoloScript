/**
 * SceneNode.ts
 *
 * Scene graph node: hierarchical transform, parent/child,
 * local+world matrices, dirty flags, tag/layer assignment.
 *
 * @module scene
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Transform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number }; // Euler angles
  scale: { x: number; y: number; z: number };
}

export type Matrix4 = Float64Array; // 16-element column-major

// =============================================================================
// SCENE NODE
// =============================================================================

export class SceneNode {
  public readonly id: string;
  public name: string;
  public tags: Set<string> = new Set();
  public layer = 0;
  public visible = true;

  private local: Transform;
  private worldMatrix: Matrix4;
  private dirty = true;

  private parent: SceneNode | null = null;
  private children: SceneNode[] = [];

  constructor(id: string, name = '') {
    this.id = id;
    this.name = name || id;
    this.local = {
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
    };
    this.worldMatrix = new Float64Array(16);
    this.setIdentity(this.worldMatrix);
  }

  // ---------------------------------------------------------------------------
  // Transform
  // ---------------------------------------------------------------------------

  setPosition(x: number, y: number, z: number): void {
    this.local.position = { x, y, z };
    this.markDirty();
  }
  setRotation(x: number, y: number, z: number): void {
    this.local.rotation = { x, y, z };
    this.markDirty();
  }
  setScale(x: number, y: number, z: number): void {
    this.local.scale = { x, y, z };
    this.markDirty();
  }

  getLocalTransform(): Transform {
    return {
      ...this.local,
      position: { ...this.local.position },
      rotation: { ...this.local.rotation },
      scale: { ...this.local.scale },
    };
  }

  getWorldPosition(): { x: number; y: number; z: number } {
    this.updateWorldMatrix();
    return { x: this.worldMatrix[12], y: this.worldMatrix[13], z: this.worldMatrix[14] };
  }

  getWorldMatrix(): Matrix4 {
    this.updateWorldMatrix();
    return new Float64Array(this.worldMatrix);
  }

  // ---------------------------------------------------------------------------
  // Hierarchy
  // ---------------------------------------------------------------------------

  addChild(child: SceneNode): void {
    if (child.parent) child.parent.removeChild(child);
    child.parent = this;
    this.children.push(child);
    child.markDirty();
  }

  removeChild(child: SceneNode): void {
    const idx = this.children.indexOf(child);
    if (idx >= 0) {
      this.children.splice(idx, 1);
      child.parent = null;
      child.markDirty();
    }
  }

  getParent(): SceneNode | null {
    return this.parent;
  }
  getChildren(): SceneNode[] {
    return [...this.children];
  }
  getChildCount(): number {
    return this.children.length;
  }

  // Depth-first traversal
  traverse(callback: (node: SceneNode, depth: number) => void, depth = 0): void {
    callback(this, depth);
    for (const child of this.children) child.traverse(callback, depth + 1);
  }

  // ---------------------------------------------------------------------------
  // Dirty Propagation & World Matrix
  // ---------------------------------------------------------------------------

  private markDirty(): void {
    this.dirty = true;
    for (const child of this.children) child.markDirty();
  }

  updateWorldMatrix(): void {
    if (!this.dirty) return;

    const localMat = this.computeLocalMatrix();

    if (this.parent) {
      this.parent.updateWorldMatrix();
      this.multiply(this.parent.worldMatrix, localMat, this.worldMatrix);
    } else {
      this.worldMatrix.set(localMat);
    }

    this.dirty = false;
  }

  private computeLocalMatrix(): Matrix4 {
    const m = new Float64Array(16);

    const { position: p, rotation: r, scale: s } = this.local;

    // Euler angles → rotation matrix (intrinsic YXZ order)
    const cx = Math.cos(r.x),
      sx = Math.sin(r.x);
    const cy = Math.cos(r.y),
      sy = Math.sin(r.y);
    const cz = Math.cos(r.z),
      sz = Math.sin(r.z);

    // Column-major TRS: M = T * Ry * Rx * Rz * S
    m[0] = (cy * cz + sy * sx * sz) * s.x;
    m[1] = cx * sz;
    m[2] = (-sy * cz + cy * sx * sz) * s.x;
    m[3] = 0;

    m[4] = (cy * -sz + sy * sx * cz) * s.y;
    m[5] = cx * cz;
    m[6] = (sy * sz + cy * sx * cz) * s.y;
    m[7] = 0;

    m[8] = sy * cx * s.z;
    m[9] = -sx;
    m[10] = cy * cx * s.z;
    m[11] = 0;

    m[12] = p.x;
    m[13] = p.y;
    m[14] = p.z;
    m[15] = 1;

    return m;
  }

  // ---------------------------------------------------------------------------
  // Matrix Math Helpers
  // ---------------------------------------------------------------------------

  private setIdentity(m: Matrix4): void {
    m.fill(0);
    m[0] = 1;
    m[5] = 1;
    m[10] = 1;
    m[15] = 1;
  }

  private multiply(a: Matrix4, b: Matrix4, out: Matrix4): void {
    for (let col = 0; col < 4; col++) {
      for (let row = 0; row < 4; row++) {
        out[col * 4 + row] =
          a[row] * b[col * 4] +
          a[4 + row] * b[col * 4 + 1] +
          a[8 + row] * b[col * 4 + 2] +
          a[12 + row] * b[col * 4 + 3];
      }
    }
  }

  isDirty(): boolean {
    return this.dirty;
  }
}

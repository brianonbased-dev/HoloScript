/**
 * In-memory ECS used by Studio inspector / multiplayer / physics preview hooks.
 * Bitmask component model (not the generic string-component engine World).
 */

export interface DemoTransform {
  x: number;
  y: number;
  z: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
  sy: number;
  sz: number;
}

export interface DemoVelocity {
  vx: number;
  vy: number;
  vz: number;
  angularX: number;
  angularY: number;
  angularZ: number;
}

export interface DemoCollider {
  type?: string;
  radius?: number;
  halfExtentX?: number;
  halfExtentY?: number;
  halfExtentZ?: number;
  isTrigger?: boolean;
  [key: string]: unknown;
}

export interface DemoRenderable {
  meshId: string;
  materialId: string;
  visible: boolean;
  lodLevel: number;
}

export interface DemoAgent {
  state: string;
  targetX: number;
  targetY: number;
  targetZ: number;
  speed: number;
  traitMask: number;
}

export interface DemoSystemStats {
  entityCount: number;
  systemCount: number;
  lastFrameMs: number;
  avgFrameMs: number;
  peakFrameMs: number;
  totalFrames: number;
}

interface EntityRecord {
  mask: number;
  transform?: DemoTransform;
  velocity?: DemoVelocity;
  collider?: DemoCollider;
  renderable?: DemoRenderable;
  agent?: DemoAgent;
}

/** Entities must have all bits in `mask` set on their component mask. */
export class InspectorDemoWorld {
  private nextId = 1;
  private readonly entities = new Map<number, EntityRecord>();
  private frameCount = 0;
  private lastTickMs = 16;

  createEntity(): number {
    const id = this.nextId++;
    this.entities.set(id, { mask: 0 });
    return id;
  }

  destroyEntity(id: number): void {
    this.entities.delete(id);
  }

  /** Match if `(record.mask & mask) === mask` (all requested components present). */
  query(mask: number): number[] {
    const out: number[] = [];
    for (const [id, rec] of this.entities) {
      if ((rec.mask & mask) === mask) out.push(id);
    }
    return out;
  }

  getMask(id: number): number {
    return this.entities.get(id)?.mask ?? 0;
  }

  getTransform(id: number): DemoTransform | undefined {
    return this.entities.get(id)?.transform;
  }

  getVelocity(id: number): DemoVelocity | undefined {
    return this.entities.get(id)?.velocity;
  }

  getCollider(id: number): DemoCollider | undefined {
    return this.entities.get(id)?.collider;
  }

  getRenderable(id: number): DemoRenderable | undefined {
    return this.entities.get(id)?.renderable;
  }

  getAgent(id: number): DemoAgent | undefined {
    return this.entities.get(id)?.agent;
  }

  addTransform(id: number, data: DemoTransform): void {
    const rec = this.entities.get(id);
    if (!rec) return;
    rec.mask |= 0b00001;
    rec.transform = { ...data };
  }

  addVelocity(id: number, data: DemoVelocity): void {
    const rec = this.entities.get(id);
    if (!rec) return;
    rec.mask |= 0b00010;
    rec.velocity = { ...data };
  }

  addCollider(id: number, data: DemoCollider): void {
    const rec = this.entities.get(id);
    if (!rec) return;
    rec.mask |= 0b00100;
    rec.collider = { ...data };
  }

  addRenderable(id: number, data: DemoRenderable): void {
    const rec = this.entities.get(id);
    if (!rec) return;
    rec.mask |= 0b01000;
    rec.renderable = { ...data };
  }

  addAgent(id: number, data: DemoAgent): void {
    const rec = this.entities.get(id);
    if (!rec) return;
    rec.mask |= 0b10000;
    rec.agent = { ...data };
  }

  getStats(): DemoSystemStats {
    const n = this.entities.size;
    return {
      entityCount: n,
      systemCount: 5,
      lastFrameMs: this.lastTickMs,
      avgFrameMs: this.lastTickMs,
      peakFrameMs: this.lastTickMs,
      totalFrames: this.frameCount,
    };
  }

  tick(dt: number): void {
    this.frameCount++;
    this.lastTickMs = Math.round(dt * 1000);
  }
}

/**
 * SpatialEntity — A scene object with resolved world-space bounds.
 *
 * Used as the subject of spatial assertions in HoloTest.
 * Create with SpatialEntity.at() or SpatialEntity.fromBounds() for quick test setup.
 */

import { BoundingBox, Vec3 } from './BoundingBox';

export interface SpatialEntityOptions {
  /** Bottom-center position in world space. */
  position?: Vec3;
  /** Width × Height × Depth in meters. */
  size?: Vec3;
  /** Explicit AABB (overrides position + size). */
  bounds?: BoundingBox;
  tags?: string[];
}

export class SpatialEntity {
  readonly id: string;
  bounds: BoundingBox;
  tags: string[];

  private constructor(id: string, bounds: BoundingBox, tags: string[]) {
    this.id = id;
    this.bounds = bounds;
    this.tags = tags;
  }

  // ── Factories ─────────────────────────────────────────────────────────────

  /**
   * Create an entity placed at a bottom-center position with explicit dimensions.
   *
   * @example
   * const crate = SpatialEntity.at('nft_crate', { position: [0, 0, 0], size: [1, 1, 1] })
   */
  static at(
    id: string,
    opts: { position: [number, number, number]; size: [number, number, number]; tags?: string[] }
  ): SpatialEntity {
    const pos: Vec3 = { x: opts.position[0], y: opts.position[1], z: opts.position[2] };
    const sz: Vec3 = { x: opts.size[0], y: opts.size[1], z: opts.size[2] };
    return new SpatialEntity(
      id,
      BoundingBox.fromBottomCenter(pos, sz),
      opts.tags ?? []
    );
  }

  /**
   * Create with an explicit BoundingBox.
   */
  static fromBounds(id: string, bounds: BoundingBox, tags?: string[]): SpatialEntity {
    return new SpatialEntity(id, bounds, tags ?? []);
  }

  /**
   * Create from min/max corners directly.
   */
  static fromMinMax(
    id: string,
    min: [number, number, number],
    max: [number, number, number],
    tags?: string[]
  ): SpatialEntity {
    return new SpatialEntity(
      id,
      BoundingBox.fromMinMax(
        { x: min[0], y: min[1], z: min[2] },
        { x: max[0], y: max[1], z: max[2] }
      ),
      tags ?? []
    );
  }

  // ── Accessors ─────────────────────────────────────────────────────────────

  /** Bottom-center position (the position property used in HoloScript). */
  get position(): Vec3 {
    const c = this.bounds.center();
    const s = this.bounds.size();
    return { x: c.x, y: c.y - s.y / 2, z: c.z };
  }

  /** Move the entity to a new bottom-center position. Returns `this` for chaining. */
  moveTo(pos: Vec3): this {
    const sz = this.bounds.size();
    this.bounds = BoundingBox.fromBottomCenter(pos, sz);
    return this;
  }

  /** Translate by delta. Returns `this` for chaining. */
  translate(delta: Vec3): this {
    this.bounds = this.bounds.translate(delta);
    return this;
  }

  // ── Spatial helpers ───────────────────────────────────────────────────────

  intersects(other: SpatialEntity | BoundingBox): boolean {
    const b = other instanceof SpatialEntity ? other.bounds : other;
    return this.bounds.intersects(b);
  }

  getIntersectionVolume(other: SpatialEntity | BoundingBox): number {
    const b = other instanceof SpatialEntity ? other.bounds : other;
    return this.bounds.intersectionVolume(b);
  }

  isWithinVolume(container: BoundingBox): boolean {
    return (
      container.contains(this.bounds.min) &&
      container.contains(this.bounds.max)
    );
  }

  toString(): string {
    return `SpatialEntity(${this.id} @ ${this.bounds})`;
  }
}

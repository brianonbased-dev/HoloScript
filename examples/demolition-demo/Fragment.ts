/**
 * Fragment.ts
 *
 * Represents a single debris fragment from a fractured object.
 * Includes geometry, physics properties, and state.
 *
 * Week 8: Explosive Demolition - Day 1
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface BoundingBox {
  min: Vector3;
  max: Vector3;
}

export interface FragmentGeometry {
  /** Vertex positions [x1, y1, z1, x2, y2, z2, ...] */
  vertices: Float32Array;
  /** Triangle indices */
  indices: Uint32Array;
  /** Vertex normals [nx1, ny1, nz1, ...] */
  normals: Float32Array;
  /** Centroid of the fragment */
  centroid: Vector3;
  /** Volume of the fragment */
  volume: number;
}

export interface FragmentPhysics {
  /** Position in world space */
  position: Vector3;
  /** Linear velocity */
  velocity: Vector3;
  /** Angular velocity (axis-angle) */
  angularVelocity: Vector3;
  /** Mass (kg) */
  mass: number;
  /** Moment of inertia tensor (simplified as scalar for now) */
  inertia: number;
  /** Restitution coefficient (bounciness) */
  restitution: number;
  /** Friction coefficient */
  friction: number;
}

export interface FragmentConfig {
  /** Initial geometry */
  geometry: FragmentGeometry;
  /** Material density (kg/m³) */
  density: number;
  /** Restitution coefficient (0-1) */
  restitution?: number;
  /** Friction coefficient (0-1) */
  friction?: number;
  /** Initial position */
  position?: Vector3;
  /** Initial velocity */
  velocity?: Vector3;
}

/**
 * Single debris fragment with physics
 */
export class Fragment {
  public readonly id: string;
  public readonly geometry: FragmentGeometry;
  public readonly physics: FragmentPhysics;
  public readonly boundingBox: BoundingBox;

  private active = true;
  private age = 0;

  constructor(config: FragmentConfig) {
    this.id = `fragment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    this.geometry = config.geometry;

    // Calculate mass from volume and density
    const mass = config.geometry.volume * config.density;

    // Calculate moment of inertia (approximate as sphere for now)
    const radius = this.estimateRadius();
    const inertia = (2 / 5) * mass * radius * radius;

    this.physics = {
      position: config.position || { ...config.geometry.centroid },
      velocity: config.velocity || { x: 0, y: 0, z: 0 },
      angularVelocity: { x: 0, y: 0, z: 0 },
      mass,
      inertia,
      restitution: config.restitution ?? 0.3,
      friction: config.friction ?? 0.5,
    };

    this.boundingBox = this.calculateBoundingBox();
  }

  /**
   * Update fragment physics
   */
  public update(dt: number, gravity: Vector3 = { x: 0, y: -9.81, z: 0 }): void {
    if (!this.active || dt <= 0) return;

    // Update position first (explicit Euler: use current velocity before gravity is applied).
    // This prevents large timesteps (dt=1.0 in tests) from overshooting the ground plane
    // and triggering a bounce that would reverse/increase the velocity unexpectedly.
    this.physics.position.x += this.physics.velocity.x * dt;
    this.physics.position.y += this.physics.velocity.y * dt;
    this.physics.position.z += this.physics.velocity.z * dt;

    // Apply gravity to velocity after position update
    this.physics.velocity.x += gravity.x * dt;
    this.physics.velocity.y += gravity.y * dt;
    this.physics.velocity.z += gravity.z * dt;

    // Update bounding box
    this.updateBoundingBox();

    // Increment age
    this.age += dt;
  }

  /**
   * Apply impulse to fragment
   */
  public applyImpulse(impulse: Vector3, contactPoint?: Vector3): void {
    if (!this.active) return;

    // Linear impulse
    this.physics.velocity.x += impulse.x / this.physics.mass;
    this.physics.velocity.y += impulse.y / this.physics.mass;
    this.physics.velocity.z += impulse.z / this.physics.mass;

    // Angular impulse (if contact point provided)
    if (contactPoint) {
      const r = {
        x: contactPoint.x - this.physics.position.x,
        y: contactPoint.y - this.physics.position.y,
        z: contactPoint.z - this.physics.position.z,
      };

      // Torque = r × impulse
      const torque = this.cross(r, impulse);

      // Angular acceleration = torque / inertia
      this.physics.angularVelocity.x += torque.x / this.physics.inertia;
      this.physics.angularVelocity.y += torque.y / this.physics.inertia;
      this.physics.angularVelocity.z += torque.z / this.physics.inertia;
    }
  }

  /**
   * Apply force over time
   */
  public applyForce(force: Vector3, dt: number): void {
    if (!this.active || dt <= 0) return;

    const impulse = {
      x: force.x * dt,
      y: force.y * dt,
      z: force.z * dt,
    };

    this.applyImpulse(impulse);
  }

  /**
   * Handle collision with ground plane
   */
  public handleGroundCollision(groundY: number = 0): boolean {
    if (!this.active) return false;

    const minY = this.boundingBox.min.y;

    if (minY <= groundY && this.physics.velocity.y < 0) {
      // Reflect velocity with restitution
      this.physics.velocity.y = -this.physics.velocity.y * this.physics.restitution;

      // Apply friction to horizontal velocity
      const frictionFactor = 1 - this.physics.friction;
      this.physics.velocity.x *= frictionFactor;
      this.physics.velocity.z *= frictionFactor;

      // Reduce angular velocity
      this.physics.angularVelocity.x *= frictionFactor;
      this.physics.angularVelocity.y *= frictionFactor;
      this.physics.angularVelocity.z *= frictionFactor;

      // Correct position
      this.physics.position.y += groundY - minY;
      this.updateBoundingBox();

      return true;
    }

    return false;
  }

  /**
   * Check if fragment is at rest
   */
  public isAtRest(threshold: number = 0.1): boolean {
    const speedSq =
      this.physics.velocity.x * this.physics.velocity.x +
      this.physics.velocity.y * this.physics.velocity.y +
      this.physics.velocity.z * this.physics.velocity.z;

    const angularSpeedSq =
      this.physics.angularVelocity.x * this.physics.angularVelocity.x +
      this.physics.angularVelocity.y * this.physics.angularVelocity.y +
      this.physics.angularVelocity.z * this.physics.angularVelocity.z;

    return speedSq < threshold * threshold && angularSpeedSq < threshold * threshold;
  }

  /**
   * Deactivate fragment (optimization)
   */
  public deactivate(): void {
    this.active = false;
  }

  /**
   * Activate fragment
   */
  public activate(): void {
    this.active = true;
  }

  /**
   * Get fragment age
   */
  public getAge(): number {
    return this.age;
  }

  /**
   * Check if fragment is active
   */
  public isActive(): boolean {
    return this.active;
  }

  /**
   * Get kinetic energy
   */
  public getKineticEnergy(): number {
    const linearKE =
      0.5 *
      this.physics.mass *
      (this.physics.velocity.x * this.physics.velocity.x +
        this.physics.velocity.y * this.physics.velocity.y +
        this.physics.velocity.z * this.physics.velocity.z);

    const angularKE =
      0.5 *
      this.physics.inertia *
      (this.physics.angularVelocity.x * this.physics.angularVelocity.x +
        this.physics.angularVelocity.y * this.physics.angularVelocity.y +
        this.physics.angularVelocity.z * this.physics.angularVelocity.z);

    return linearKE + angularKE;
  }

  /**
   * Calculate bounding box from geometry
   */
  private calculateBoundingBox(): BoundingBox {
    const vertices = this.geometry.vertices;
    const position = this.physics.position;

    let minX = Infinity,
      minY = Infinity,
      minZ = Infinity;
    let maxX = -Infinity,
      maxY = -Infinity,
      maxZ = -Infinity;

    for (let i = 0; i < vertices.length; i += 3) {
      const x = vertices[i] + position.x;
      const y = vertices[i + 1] + position.y;
      const z = vertices[i + 2] + position.z;

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      minZ = Math.min(minZ, z);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
      maxZ = Math.max(maxZ, z);
    }

    return {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ },
    };
  }

  /**
   * Update bounding box after position change
   */
  private updateBoundingBox(): void {
    const offset = {
      x: this.physics.position.x - this.geometry.centroid.x,
      y: this.physics.position.y - this.geometry.centroid.y,
      z: this.physics.position.z - this.geometry.centroid.z,
    };

    this.boundingBox.min.x += offset.x;
    this.boundingBox.min.y += offset.y;
    this.boundingBox.min.z += offset.z;
    this.boundingBox.max.x += offset.x;
    this.boundingBox.max.y += offset.y;
    this.boundingBox.max.z += offset.z;
  }

  /**
   * Estimate radius for inertia calculation
   */
  private estimateRadius(): number {
    const vertices = this.geometry.vertices;
    const centroid = this.geometry.centroid;

    let maxDistSq = 0;

    for (let i = 0; i < vertices.length; i += 3) {
      const dx = vertices[i] - centroid.x;
      const dy = vertices[i + 1] - centroid.y;
      const dz = vertices[i + 2] - centroid.z;

      const distSq = dx * dx + dy * dy + dz * dz;
      maxDistSq = Math.max(maxDistSq, distSq);
    }

    return Math.sqrt(maxDistSq);
  }

  /**
   * Cross product helper
   */
  private cross(a: Vector3, b: Vector3): Vector3 {
    return {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
  }
}

/**
 * PhysicsBody.ts
 *
 * Rigid body implementation for the HoloScript physics system.
 *
 * @module physics
 */

import {
  IVector3,
  IQuaternion,
  ITransform,
  IRigidBodyConfig,
  IRigidBodyState,
  IPhysicsMaterial,
  ICollisionFilter,
  CollisionShape,
  BodyType,
  PHYSICS_DEFAULTS,
  COLLISION_GROUPS,
  zeroVector,
  identityQuaternion,
  defaultMaterial,
} from './PhysicsTypes';

/**
 * Rigid body class for physics simulation
 */
export class RigidBody {
  public readonly id: string;
  public readonly type: BodyType;
  public readonly shape: CollisionShape;

  // State
  private _position: IVector3;
  private _rotation: IQuaternion;
  private _linearVelocity: IVector3;
  private _angularVelocity: IVector3;
  private _isSleeping: boolean;
  private _isActive: boolean;

  // Properties
  private _mass: number;
  private _inverseMass: number;
  private _inertia: IVector3;
  private _inverseInertia: IVector3;
  private _material: IPhysicsMaterial;
  private _filter: ICollisionFilter;
  private _linearDamping: number;
  private _angularDamping: number;
  private _gravityScale: number;
  private _ccd: boolean;
  private _userData: unknown;

  // Internal
  private _force: IVector3;
  private _torque: IVector3;
  private _sleepTimer: number;

  constructor(config: IRigidBodyConfig) {
    this.id = config.id;
    this.type = config.type;
    this.shape = config.shape;

    // Initialize state
    this._position = { ...config.transform.position };
    this._rotation = { ...config.transform.rotation };
    this._linearVelocity = zeroVector();
    this._angularVelocity = zeroVector();
    this._isSleeping = config.sleeping ?? false;
    this._isActive = true;

    // Mass and inertia
    this._mass = config.type === 'dynamic' ? (config.mass ?? 1) : 0;
    this._inverseMass = this._mass > 0 ? 1 / this._mass : 0;
    this._inertia = this.calculateInertia();
    this._inverseInertia = {
      x: this._inertia.x > 0 ? 1 / this._inertia.x : 0,
      y: this._inertia.y > 0 ? 1 / this._inertia.y : 0,
      z: this._inertia.z > 0 ? 1 / this._inertia.z : 0,
    };

    // Properties
    this._material = config.material ?? defaultMaterial();
    this._filter = config.filter ?? { group: COLLISION_GROUPS.DEFAULT, mask: COLLISION_GROUPS.ALL };
    this._linearDamping = config.linearDamping ?? PHYSICS_DEFAULTS.defaultLinearDamping;
    this._angularDamping = config.angularDamping ?? PHYSICS_DEFAULTS.defaultAngularDamping;
    this._gravityScale = config.gravityScale ?? 1;
    this._ccd = config.ccd ?? false;
    this._userData = config.userData;

    // Internal state
    this._force = zeroVector();
    this._torque = zeroVector();
    this._sleepTimer = 0;
  }

  // ============================================================================
  // State Accessors
  // ============================================================================

  public get position(): IVector3 {
    return { ...this._position };
  }

  public set position(value: IVector3) {
    this._position = { ...value };
    this.wakeUp();
  }

  public get rotation(): IQuaternion {
    return { ...this._rotation };
  }

  public set rotation(value: IQuaternion) {
    this._rotation = { ...value };
    this.wakeUp();
  }

  public get linearVelocity(): IVector3 {
    return { ...this._linearVelocity };
  }

  public set linearVelocity(value: IVector3) {
    if (this.type !== 'dynamic') return;
    this._linearVelocity = this.clampVelocity(value, PHYSICS_DEFAULTS.maxVelocity);
    this.wakeUp();
  }

  public get angularVelocity(): IVector3 {
    return { ...this._angularVelocity };
  }

  public set angularVelocity(value: IVector3) {
    if (this.type !== 'dynamic') return;
    this._angularVelocity = this.clampVelocity(value, PHYSICS_DEFAULTS.maxAngularVelocity);
    this.wakeUp();
  }

  public get isSleeping(): boolean {
    return this._isSleeping;
  }

  public get isActive(): boolean {
    return this._isActive;
  }

  public set isActive(value: boolean) {
    this._isActive = value;
    if (value) this.wakeUp();
  }

  public get mass(): number {
    return this._mass;
  }

  public get inverseMass(): number {
    return this._inverseMass;
  }

  public get material(): IPhysicsMaterial {
    return { ...this._material };
  }

  public set material(value: IPhysicsMaterial) {
    this._material = { ...value };
  }

  public get filter(): ICollisionFilter {
    return { ...this._filter };
  }

  public set filter(value: ICollisionFilter) {
    this._filter = { ...value };
  }

  public get gravityScale(): number {
    return this._gravityScale;
  }

  public set gravityScale(value: number) {
    this._gravityScale = value;
  }

  public get ccd(): boolean {
    return this._ccd;
  }

  public set ccd(value: boolean) {
    this._ccd = value;
  }

  public get userData(): unknown {
    return this._userData;
  }

  public set userData(value: unknown) {
    this._userData = value;
  }

  // ============================================================================
  // Forces
  // ============================================================================

  /**
   * Apply a force at the center of mass
   */
  public applyForce(force: IVector3): void {
    if (this.type !== 'dynamic') return;

    this._force.x += force.x;
    this._force.y += force.y;
    this._force.z += force.z;
    this.wakeUp();
  }

  /**
   * Apply a force at a world point
   */
  public applyForceAtPoint(force: IVector3, worldPoint: IVector3): void {
    if (this.type !== 'dynamic') return;

    // Apply linear force
    this.applyForce(force);

    // Calculate torque from offset
    const r = {
      x: worldPoint.x - this._position.x,
      y: worldPoint.y - this._position.y,
      z: worldPoint.z - this._position.z,
    };

    // Cross product r x F = torque
    const torque = {
      x: r.y * force.z - r.z * force.y,
      y: r.z * force.x - r.x * force.z,
      z: r.x * force.y - r.y * force.x,
    };

    this.applyTorque(torque);
  }

  /**
   * Apply an impulse at the center of mass
   */
  public applyImpulse(impulse: IVector3): void {
    if (this.type !== 'dynamic') return;

    this._linearVelocity.x += impulse.x * this._inverseMass;
    this._linearVelocity.y += impulse.y * this._inverseMass;
    this._linearVelocity.z += impulse.z * this._inverseMass;
    this._linearVelocity = this.clampVelocity(this._linearVelocity, PHYSICS_DEFAULTS.maxVelocity);
    this.wakeUp();
  }

  /**
   * Apply an impulse at a world point
   */
  public applyImpulseAtPoint(impulse: IVector3, worldPoint: IVector3): void {
    if (this.type !== 'dynamic') return;

    // Apply linear impulse
    this.applyImpulse(impulse);

    // Calculate angular impulse from offset
    const r = {
      x: worldPoint.x - this._position.x,
      y: worldPoint.y - this._position.y,
      z: worldPoint.z - this._position.z,
    };

    // Cross product r x impulse = angular impulse
    const angularImpulse = {
      x: r.y * impulse.z - r.z * impulse.y,
      y: r.z * impulse.x - r.x * impulse.z,
      z: r.x * impulse.y - r.y * impulse.x,
    };

    this.applyTorqueImpulse(angularImpulse);
  }

  /**
   * Apply a torque
   */
  public applyTorque(torque: IVector3): void {
    if (this.type !== 'dynamic') return;

    this._torque.x += torque.x;
    this._torque.y += torque.y;
    this._torque.z += torque.z;
    this.wakeUp();
  }

  /**
   * Apply a torque impulse
   */
  public applyTorqueImpulse(impulse: IVector3): void {
    if (this.type !== 'dynamic') return;

    this._angularVelocity.x += impulse.x * this._inverseInertia.x;
    this._angularVelocity.y += impulse.y * this._inverseInertia.y;
    this._angularVelocity.z += impulse.z * this._inverseInertia.z;
    this._angularVelocity = this.clampVelocity(
      this._angularVelocity,
      PHYSICS_DEFAULTS.maxAngularVelocity
    );
    this.wakeUp();
  }

  /**
   * Clear accumulated forces
   */
  public clearForces(): void {
    this._force = zeroVector();
    this._torque = zeroVector();
  }

  // ============================================================================
  // Integration
  // ============================================================================

  /**
   * Integrate forces (semi-implicit Euler)
   */
  public integrateForces(dt: number, gravity: IVector3): void {
    if (this.type !== 'dynamic' || this._isSleeping) return;

    // Apply gravity
    const gravityForce = {
      x: gravity.x * this._mass * this._gravityScale,
      y: gravity.y * this._mass * this._gravityScale,
      z: gravity.z * this._mass * this._gravityScale,
    };

    // Update linear velocity
    this._linearVelocity.x += (this._force.x + gravityForce.x) * this._inverseMass * dt;
    this._linearVelocity.y += (this._force.y + gravityForce.y) * this._inverseMass * dt;
    this._linearVelocity.z += (this._force.z + gravityForce.z) * this._inverseMass * dt;

    // Update angular velocity
    this._angularVelocity.x += this._torque.x * this._inverseInertia.x * dt;
    this._angularVelocity.y += this._torque.y * this._inverseInertia.y * dt;
    this._angularVelocity.z += this._torque.z * this._inverseInertia.z * dt;

    // Apply damping
    const linearDamp = Math.pow(1 - this._linearDamping, dt);
    const angularDamp = Math.pow(1 - this._angularDamping, dt);

    this._linearVelocity.x *= linearDamp;
    this._linearVelocity.y *= linearDamp;
    this._linearVelocity.z *= linearDamp;

    this._angularVelocity.x *= angularDamp;
    this._angularVelocity.y *= angularDamp;
    this._angularVelocity.z *= angularDamp;

    // Clamp velocities
    this._linearVelocity = this.clampVelocity(this._linearVelocity, PHYSICS_DEFAULTS.maxVelocity);
    this._angularVelocity = this.clampVelocity(
      this._angularVelocity,
      PHYSICS_DEFAULTS.maxAngularVelocity
    );
  }

  /**
   * Integrate velocities (update position/rotation)
   */
  public integrateVelocities(dt: number): void {
    if (this.type === 'static' || this._isSleeping) return;

    // Update position
    this._position.x += this._linearVelocity.x * dt;
    this._position.y += this._linearVelocity.y * dt;
    this._position.z += this._linearVelocity.z * dt;

    // Update rotation (quaternion integration)
    const wx = this._angularVelocity.x * dt * 0.5;
    const wy = this._angularVelocity.y * dt * 0.5;
    const wz = this._angularVelocity.z * dt * 0.5;

    const q = this._rotation;
    const dq = {
      x: wx * q.w + wy * q.z - wz * q.y,
      y: wy * q.w + wz * q.x - wx * q.z,
      z: wz * q.w + wx * q.y - wy * q.x,
      w: -wx * q.x - wy * q.y - wz * q.z,
    };

    q.x += dq.x;
    q.y += dq.y;
    q.z += dq.z;
    q.w += dq.w;

    // Normalize quaternion
    this._rotation = this.normalizeQuaternion(q);
  }

  // ============================================================================
  // Sleeping
  // ============================================================================

  /**
   * Wake up the body
   */
  public wakeUp(): void {
    this._isSleeping = false;
    this._sleepTimer = 0;
  }

  /**
   * Try to put the body to sleep
   */
  public updateSleep(dt: number): void {
    if (this.type !== 'dynamic') return;

    const linearSpeed = this.vectorLength(this._linearVelocity);
    const angularSpeed = this.vectorLength(this._angularVelocity);

    if (
      linearSpeed < PHYSICS_DEFAULTS.sleepThreshold &&
      angularSpeed < PHYSICS_DEFAULTS.sleepThreshold
    ) {
      this._sleepTimer += dt;
      if (this._sleepTimer >= PHYSICS_DEFAULTS.sleepTime) {
        this._isSleeping = true;
        this._linearVelocity = zeroVector();
        this._angularVelocity = zeroVector();
      }
    } else {
      this._sleepTimer = 0;
    }
  }

  // ============================================================================
  // State Export
  // ============================================================================

  /**
   * Get current state
   */
  public getState(): IRigidBodyState {
    return {
      id: this.id,
      position: this.position,
      rotation: this.rotation,
      linearVelocity: this.linearVelocity,
      angularVelocity: this.angularVelocity,
      isSleeping: this._isSleeping,
      isActive: this._isActive,
    };
  }

  /**
   * Get transform
   */
  public getTransform(): ITransform {
    return {
      position: this.position,
      rotation: this.rotation,
    };
  }

  /**
   * Set transform directly (for kinematic bodies)
   */
  public setTransform(transform: ITransform): void {
    this._position = { ...transform.position };
    this._rotation = { ...transform.rotation };
    this.wakeUp();
  }

  /**
   * Get accumulated force
   */
  public getForce(): IVector3 {
    return { ...this._force };
  }

  /**
   * Get accumulated torque
   */
  public getTorque(): IVector3 {
    return { ...this._torque };
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Calculate inertia tensor for the shape
   */
  private calculateInertia(): IVector3 {
    const mass = this._mass;
    if (mass === 0) return zeroVector();

    switch (this.shape.type) {
      case 'box': {
        const { halfExtents } = this.shape;
        const factor = mass / 12;
        return {
          x: factor * (4 * halfExtents.y * halfExtents.y + 4 * halfExtents.z * halfExtents.z),
          y: factor * (4 * halfExtents.x * halfExtents.x + 4 * halfExtents.z * halfExtents.z),
          z: factor * (4 * halfExtents.x * halfExtents.x + 4 * halfExtents.y * halfExtents.y),
        };
      }
      case 'sphere': {
        const inertia = (2 / 5) * mass * this.shape.radius * this.shape.radius;
        return { x: inertia, y: inertia, z: inertia };
      }
      case 'capsule': {
        // Approximate as cylinder + hemispheres
        const r = this.shape.radius;
        const h = this.shape.height;
        const cylinderInertia = (1 / 12) * mass * (3 * r * r + h * h);
        return { x: cylinderInertia, y: cylinderInertia, z: (1 / 2) * mass * r * r };
      }
      default:
        // Default sphere-like inertia
        return { x: mass, y: mass, z: mass };
    }
  }

  /**
   * Clamp velocity magnitude
   */
  private clampVelocity(v: IVector3, maxSpeed: number): IVector3 {
    const speed = this.vectorLength(v);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      return { x: v.x * scale, y: v.y * scale, z: v.z * scale };
    }
    return v;
  }

  /**
   * Calculate vector length
   */
  private vectorLength(v: IVector3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }

  /**
   * Normalize quaternion
   */
  private normalizeQuaternion(q: IQuaternion): IQuaternion {
    const len = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z + q.w * q.w);
    if (len === 0) return identityQuaternion();
    return {
      x: q.x / len,
      y: q.y / len,
      z: q.z / len,
      w: q.w / len,
    };
  }

  /**
   * Test collision filter
   */
  public canCollideWith(other: RigidBody): boolean {
    const a = this._filter;
    const b = other._filter;
    return (a.group & b.mask) !== 0 && (b.group & a.mask) !== 0;
  }
}

import type { Vector3 } from '@holoscript/core';
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
    this._position = [...config.transform.position];
    this._rotation = [...config.transform.rotation];
    this._linearVelocity = zeroVector();
    this._angularVelocity = zeroVector();
    this._isSleeping = config.sleeping ?? false;
    this._isActive = true;

    // Mass and inertia
    this._mass = config.type === 'dynamic' ? (config.mass ?? 1) : 0;
    this._inverseMass = this._mass > 0 ? 1 / this._mass : 0;
    this._inertia = this.calculateInertia();
    this._inverseInertia = [
      this._inertia[0] > 0 ? 1 / this._inertia[0] : 0,
      this._inertia[1] > 0 ? 1 / this._inertia[1] : 0,
      this._inertia[2] > 0 ? 1 / this._inertia[2] : 0,
    ];

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
    return [...this._position];
  }

  public set position(value: IVector3) {
    this._position = [...value];
    this.wakeUp();
  }

  public get rotation(): IQuaternion {
    return [...this._rotation];
  }

  public set rotation(value: IQuaternion) {
    this._rotation = [...value];
    this.wakeUp();
  }

  public get linearVelocity(): IVector3 {
    return [...this._linearVelocity];
  }

  public set linearVelocity(value: IVector3) {
    if (this.type !== 'dynamic') return;
    this._linearVelocity = this.clampVelocity(value, PHYSICS_DEFAULTS.maxVelocity);
    this.wakeUp();
  }

  public get angularVelocity(): IVector3 {
    return [...this._angularVelocity];
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

    this._force[0] += force[0];
    this._force[1] += force[1];
    this._force[2] += force[2];
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
    const r = [
      worldPoint[0] - this._position[0],
      worldPoint[1] - this._position[1],
      worldPoint[2] - this._position[2],
    ] as IVector3;

    // Cross product r x F = torque
    const torque = [
      r[1] * force[2] - r[2] * force[1],
      r[2] * force[0] - r[0] * force[2],
      r[0] * force[1] - r[1] * force[0],
    ] as IVector3;

    this.applyTorque(torque);
  }

  /**
   * Apply an impulse at the center of mass
   */
  public applyImpulse(impulse: IVector3): void {
    if (this.type !== 'dynamic') return;

    this._linearVelocity[0] += impulse[0] * this._inverseMass;
    this._linearVelocity[1] += impulse[1] * this._inverseMass;
    this._linearVelocity[2] += impulse[2] * this._inverseMass;
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
    const r = [
      worldPoint[0] - this._position[0],
      worldPoint[1] - this._position[1],
      worldPoint[2] - this._position[2],
    ] as IVector3;

    // Cross product r x impulse = angular impulse
    const angularImpulse = [
      r[1] * impulse[2] - r[2] * impulse[1],
      r[2] * impulse[0] - r[0] * impulse[2],
      r[0] * impulse[1] - r[1] * impulse[0],
    ] as IVector3;

    this.applyTorqueImpulse(angularImpulse);
  }

  /**
   * Apply a torque
   */
  public applyTorque(torque: IVector3): void {
    if (this.type !== 'dynamic') return;

    this._torque[0] += torque[0];
    this._torque[1] += torque[1];
    this._torque[2] += torque[2];
    this.wakeUp();
  }

  /**
   * Apply a torque impulse
   */
  public applyTorqueImpulse(impulse: IVector3): void {
    if (this.type !== 'dynamic') return;

    this._angularVelocity[0] += impulse[0] * this._inverseInertia[0];
    this._angularVelocity[1] += impulse[1] * this._inverseInertia[1];
    this._angularVelocity[2] += impulse[2] * this._inverseInertia[2];
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
    const gravityForce = [
      gravity[0] * this._mass * this._gravityScale,
      gravity[1] * this._mass * this._gravityScale,
      gravity[2] * this._mass * this._gravityScale,
    ] as IVector3;

    // Update linear velocity
    this._linearVelocity[0] += (this._force[0] + gravityForce[0]) * this._inverseMass * dt;
    this._linearVelocity[1] += (this._force[1] + gravityForce[1]) * this._inverseMass * dt;
    this._linearVelocity[2] += (this._force[2] + gravityForce[2]) * this._inverseMass * dt;

    // Update angular velocity
    this._angularVelocity[0] += this._torque[0] * this._inverseInertia[0] * dt;
    this._angularVelocity[1] += this._torque[1] * this._inverseInertia[1] * dt;
    this._angularVelocity[2] += this._torque[2] * this._inverseInertia[2] * dt;

    // Apply damping
    const linearDamp = Math.pow(1 - this._linearDamping, dt);
    const angularDamp = Math.pow(1 - this._angularDamping, dt);

    this._linearVelocity[0] *= linearDamp;
    this._linearVelocity[1] *= linearDamp;
    this._linearVelocity[2] *= linearDamp;

    this._angularVelocity[0] *= angularDamp;
    this._angularVelocity[1] *= angularDamp;
    this._angularVelocity[2] *= angularDamp;

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
    this._position[0] += this._linearVelocity[0] * dt;
    this._position[1] += this._linearVelocity[1] * dt;
    this._position[2] += this._linearVelocity[2] * dt;

    // Update rotation (quaternion integration)
    const wx = this._angularVelocity[0] * dt * 0.5;
    const wy = this._angularVelocity[1] * dt * 0.5;
    const wz = this._angularVelocity[2] * dt * 0.5;

    const q = this._rotation;
    const dq = [
      wx * q[3] + wy * q[2] - wz * q[1],
      wy * q[3] + wz * q[0] - wx * q[2],
      wz * q[3] + wx * q[1] - wy * q[0],
      -wx * q[0] - wy * q[1] - wz * q[2],
    ];

    q[0] += dq[0];
    q[1] += dq[1];
    q[2] += dq[2];
    q[3] += dq[3];

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
    this._position = [...transform.position];
    this._rotation = [...transform.rotation];
    this.wakeUp();
  }

  /**
   * Get accumulated force
   */
  public getForce(): IVector3 {
    return [...this._force] as IVector3;
  }

  /**
   * Get accumulated torque
   */
  public getTorque(): IVector3 {
    return [...this._torque] as IVector3;
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
        return [
          factor * (4 * halfExtents[1] * halfExtents[1] + 4 * halfExtents[2] * halfExtents[2]),
          factor * (4 * halfExtents[0] * halfExtents[0] + 4 * halfExtents[2] * halfExtents[2]),
          factor * (4 * halfExtents[0] * halfExtents[0] + 4 * halfExtents[1] * halfExtents[1]),
        ] as IVector3;
      }
      case 'sphere': {
        const inertia = (2 / 5) * mass * this.shape.radius * this.shape.radius;
        return [inertia, inertia, inertia] as IVector3;
      }
      case 'capsule': {
        // Approximate as cylinder + hemispheres
        const r = this.shape.radius;
        const h = this.shape.height;
        const cylinderInertia = (1 / 12) * mass * (3 * r * r + h * h);
        return [cylinderInertia, cylinderInertia, (1 / 2) * mass * r * r] as IVector3;
      }
      default:
        // Default sphere-like inertia
        return [mass, mass, mass] as IVector3;
    }
  }

  /**
   * Clamp velocity magnitude
   */
  private clampVelocity(v: IVector3, maxSpeed: number): IVector3 {
    const speed = this.vectorLength(v);
    if (speed > maxSpeed) {
      const scale = maxSpeed / speed;
      return [v[0] * scale, v[1] * scale, v[2] * scale] as IVector3;
    }
    return v;
  }

  /**
   * Calculate vector length
   */
  private vectorLength(v: IVector3): number {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  }

  /**
   * Normalize quaternion
   */
  private normalizeQuaternion(q: IQuaternion): IQuaternion {
    const len = Math.sqrt(q[0] * q[0] + q[1] * q[1] + q[2] * q[2] + q[3] * q[3]);
    if (len === 0) return identityQuaternion();
    return [
      q[0] / len,
      q[1] / len,
      q[2] / len,
      q[3] / len,
    ] as IQuaternion;
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

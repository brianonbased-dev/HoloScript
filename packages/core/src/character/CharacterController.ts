/**
 * CharacterController — position, rotation, movement, ground detection, gravity.
 * Self-contained. No external dependencies.
 */

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface CharacterControllerOptions {
  position?: Vector3;
  rotation?: Vector3;
  height?: number;
  radius?: number;
  gravity?: number;
  jumpForce?: number;
  groundLevel?: number;
}

export class CharacterController {
  private _position: Vector3;
  private _rotation: Vector3;
  private _velocity: Vector3;
  private _height: number;
  private _radius: number;
  private _gravity: number;
  private _jumpForce: number;
  private _groundLevel: number;
  private _isGrounded: boolean;
  private _isCrouching: boolean;

  constructor(options: CharacterControllerOptions = {}) {
    this._position = { x: 0, y: 0, z: 0, ...options.position };
    this._rotation = { x: 0, y: 0, z: 0, ...options.rotation };
    this._velocity = { x: 0, y: 0, z: 0 };
    this._height = options.height ?? 1.8;
    this._radius = options.radius ?? 0.3;
    this._gravity = options.gravity ?? -9.81;
    this._jumpForce = options.jumpForce ?? 5.0;
    this._groundLevel = options.groundLevel ?? 0;
    this._isGrounded = this._position.y <= this._groundLevel;
    this._isCrouching = false;
  }

  get position(): Readonly<Vector3> {
    return { ...this._position };
  }

  get rotation(): Readonly<Vector3> {
    return { ...this._rotation };
  }

  get velocity(): Readonly<Vector3> {
    return { ...this._velocity };
  }

  get height(): number {
    return this._isCrouching ? this._height * 0.5 : this._height;
  }

  get radius(): number {
    return this._radius;
  }

  get isGrounded(): boolean {
    return this._isGrounded;
  }

  get isCrouching(): boolean {
    return this._isCrouching;
  }

  /** Move forward along the character's facing direction (Y rotation). */
  moveForward(distance: number): void {
    const rad = this._rotation.y * (Math.PI / 180);
    this._position.x += Math.sin(rad) * distance;
    this._position.z += Math.cos(rad) * distance;
  }

  /** Strafe right relative to the character's facing direction. */
  moveRight(distance: number): void {
    const rad = this._rotation.y * (Math.PI / 180);
    this._position.x += Math.cos(rad) * distance;
    this._position.z -= Math.sin(rad) * distance;
  }

  /** Jump if grounded. Applies upward velocity equal to jumpForce. */
  jump(): boolean {
    if (!this._isGrounded) return false;
    this._velocity.y = this._jumpForce;
    this._isGrounded = false;
    return true;
  }

  /** Toggle crouch state. Only allowed when grounded. */
  crouch(active: boolean): void {
    if (!this._isGrounded) return;
    this._isCrouching = active;
  }

  /** Rotate the character (degrees). */
  rotate(yaw: number, pitch?: number): void {
    this._rotation.y += yaw;
    if (pitch !== undefined) {
      this._rotation.x = Math.max(-90, Math.min(90, this._rotation.x + pitch));
    }
  }

  /** Set absolute position. */
  setPosition(pos: Vector3): void {
    this._position = { ...pos };
    this._isGrounded = this._position.y <= this._groundLevel;
  }

  /**
   * Advance physics by deltaTime seconds.
   * Applies gravity, integrates velocity, performs ground detection.
   */
  update(deltaTime: number): void {
    if (deltaTime <= 0) return;

    // Apply gravity when airborne
    if (!this._isGrounded) {
      this._velocity.y += this._gravity * deltaTime;
    }

    // Integrate position
    this._position.x += this._velocity.x * deltaTime;
    this._position.y += this._velocity.y * deltaTime;
    this._position.z += this._velocity.z * deltaTime;

    // Ground detection
    if (this._position.y <= this._groundLevel) {
      this._position.y = this._groundLevel;
      this._velocity.y = 0;
      this._isGrounded = true;
    } else {
      this._isGrounded = false;
    }

    // Horizontal drag (simple deceleration)
    this._velocity.x *= 0.9;
    this._velocity.z *= 0.9;
  }
}

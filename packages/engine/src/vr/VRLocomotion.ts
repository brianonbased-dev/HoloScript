import type { Vector3 } from '@holoscript/core';
/**
 * VRLocomotion — Teleport, snap-turn, smooth locomotion, boundary fade
 *
 * @version 1.0.0
 */

export type LocomotionMode = 'teleport' | 'smooth' | 'snap-turn';

export interface TeleportTarget {
  x: number;
  y: number;
  z: number;
  valid: boolean;
  normal: Vector3;
}

export interface LocomotionConfig {
  mode: LocomotionMode;
  moveSpeed: number;
  snapAngle: number;
  teleportRange: number;
  boundaryFadeDistance: number;
  comfortVignette: boolean;
}

export class VRLocomotion {
  private config: LocomotionConfig;
  private position: [number, number, number] = [0, 0, 0 ];
  private rotation: number = 0; // yaw in degrees
  private teleportHistory: TeleportTarget[] = [];
  private boundaryDistance: number = Infinity;

  constructor(config?: Partial<LocomotionConfig>) {
    this.config = {
      mode: config?.mode ?? 'teleport',
      moveSpeed: config?.moveSpeed ?? 2,
      snapAngle: config?.snapAngle ?? 45,
      teleportRange: config?.teleportRange ?? 10,
      boundaryFadeDistance: config?.boundaryFadeDistance ?? 0.5,
      comfortVignette: config?.comfortVignette ?? true,
    };
  }

  /**
   * Teleport to a target position
   */
  teleport(target: TeleportTarget): boolean {
    if (!target.valid) return false;
    const dist = Math.sqrt((target.x - this.position[0]) ** 2 + (target.z - this.position[2]) ** 2);
    if (dist > this.config.teleportRange) return false;

    this.position = [target.x, target.y, target.z];
    this.teleportHistory.push(target);
    return true;
  }

  /**
   * Smooth move
   */
  move(dx: number, dz: number, deltaTime: number): void {
    const speed = this.config.moveSpeed * deltaTime;
    // Rotate movement by current yaw
    const rad = (this.rotation * Math.PI) / 180;
    this.position[0] += (dx * Math.cos(rad) - dz * Math.sin(rad)) * speed;
    this.position[2] += (dx * Math.sin(rad) + dz * Math.cos(rad)) * speed;
  }

  /**
   * Snap turn
   */
  snapTurn(direction: 'left' | 'right'): void {
    this.rotation += direction === 'right' ? this.config.snapAngle : -this.config.snapAngle;
    this.rotation = ((this.rotation % 360) + 360) % 360;
  }

  /**
   * Update boundary distance
   */
  updateBoundary(distance: number): void {
    this.boundaryDistance = distance;
  }

  /**
   * Get boundary fade factor (0 = fully faded, 1 = clear)
   */
  getBoundaryFade(): number {
    if (this.boundaryDistance >= this.config.boundaryFadeDistance) return 1;
    return Math.max(0, this.boundaryDistance / this.config.boundaryFadeDistance);
  }

  /**
   * Should show comfort vignette
   */
  shouldShowVignette(): boolean {
    return this.config.comfortVignette && this.config.mode === 'smooth';
  }

  getPosition(): { x: number; y: number; z: number } {
    return { x: this.position[0], y: this.position[1], z: this.position[2] };
  }
  getRotation(): number {
    return this.rotation;
  }
  getConfig(): LocomotionConfig {
    return { ...this.config };
  }
  setMode(mode: LocomotionMode): void {
    this.config.mode = mode;
  }
  getTeleportHistory(): TeleportTarget[] {
    return [...this.teleportHistory];
  }
}

/**
 * CameraConstraints.ts
 *
 * Camera constraints: bounds clamping, dead zones,
 * soft limits, follow smoothing, and look-ahead.
 *
 * @module camera
 */

// =============================================================================
// TYPES
// =============================================================================

export interface Bounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export interface DeadZone {
  width: number;
  height: number; // Size of dead zone centered on target
}

export interface SoftLimit {
  distance: number;
  stiffness: number; // 0-1: how strongly the camera pulls back
}

// =============================================================================
// CAMERA CONSTRAINTS
// =============================================================================

export class CameraConstraints {
  private bounds: Bounds | null = null;
  private deadZone: DeadZone | null = null;
  private softLimit: SoftLimit | null = null;
  private smoothing = 0.1; // Lerp factor (0 = no movement, 1 = instant)
  private lookAheadDistance = 0;
  private currentX = 0;
  private currentY = 0;

  // ---------------------------------------------------------------------------
  // Configuration
  // ---------------------------------------------------------------------------

  setBounds(bounds: Bounds): void {
    this.bounds = bounds;
  }
  setDeadZone(dz: DeadZone): void {
    this.deadZone = dz;
  }
  setSoftLimit(sl: SoftLimit): void {
    this.softLimit = sl;
  }
  setSmoothing(factor: number): void {
    this.smoothing = Math.max(0, Math.min(1, factor));
  }
  setLookAhead(distance: number): void {
    this.lookAheadDistance = distance;
  }

  // ---------------------------------------------------------------------------
  // Update
  // ---------------------------------------------------------------------------

  follow(targetX: number, targetY: number, velocityX = 0, velocityY = 0): { x: number; y: number } {
    let desiredX = targetX;
    let desiredY = targetY;

    // Look-ahead
    if (this.lookAheadDistance > 0) {
      const speed = Math.sqrt(velocityX * velocityX + velocityY * velocityY) || 1;
      desiredX += (velocityX / speed) * this.lookAheadDistance;
      desiredY += (velocityY / speed) * this.lookAheadDistance;
    }

    // Dead zone: don't move if target is within dead zone
    if (this.deadZone) {
      const dx = desiredX - this.currentX;
      const dy = desiredY - this.currentY;
      const halfW = this.deadZone.width / 2;
      const halfH = this.deadZone.height / 2;

      if (Math.abs(dx) < halfW) desiredX = this.currentX;
      else desiredX = this.currentX + (dx > 0 ? dx - halfW : dx + halfW);

      if (Math.abs(dy) < halfH) desiredY = this.currentY;
      else desiredY = this.currentY + (dy > 0 ? dy - halfH : dy + halfH);
    }

    // Smoothing (lerp)
    this.currentX += (desiredX - this.currentX) * this.smoothing;
    this.currentY += (desiredY - this.currentY) * this.smoothing;

    // Soft limits
    if (this.softLimit && this.bounds) {
      this.applySoftLimit();
    }

    // Hard bounds
    if (this.bounds) {
      this.currentX = Math.max(this.bounds.minX, Math.min(this.bounds.maxX, this.currentX));
      this.currentY = Math.max(this.bounds.minY, Math.min(this.bounds.maxY, this.currentY));
    }

    return { x: this.currentX, y: this.currentY };
  }

  // ---------------------------------------------------------------------------
  // Soft Limits
  // ---------------------------------------------------------------------------
  private applySoftLimit(): void {
    if (!this.softLimit || !this.bounds) return;
    const sl = this.softLimit;

    // Push back from edges
    if (this.currentX < this.bounds.minX + sl.distance) {
      const over = this.bounds.minX + sl.distance - this.currentX;
      this.currentX += over * sl.stiffness;
    }
    if (this.currentX > this.bounds.maxX - sl.distance) {
      const over = this.currentX - (this.bounds.maxX - sl.distance);
      this.currentX -= over * sl.stiffness;
    }
    if (this.currentY < this.bounds.minY + sl.distance) {
      const over = this.bounds.minY + sl.distance - this.currentY;
      this.currentY += over * sl.stiffness;
    }
    if (this.currentY > this.bounds.maxY - sl.distance) {
      const over = this.currentY - (this.bounds.maxY - sl.distance);
      this.currentY -= over * sl.stiffness;
    }
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getPosition(): { x: number; y: number } {
    return { x: this.currentX, y: this.currentY };
  }
  setPosition(x: number, y: number): void {
    this.currentX = x;
    this.currentY = y;
  }
}

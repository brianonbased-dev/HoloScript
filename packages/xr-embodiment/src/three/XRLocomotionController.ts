import * as THREE from 'three';
import { readThumbsticks } from './readThumbsticks';

export interface XRLocomotionConfig {
  /** Smooth-move speed in metres / second (default 2.0). */
  speed?: number;
  /** Smooth-turn rate in radians / second (default 2.2 ≈ 126°/s). Used only when snapTurn=false. */
  turnRate?: number;
  /** Max per-frame delta in ms, clamped to avoid jumps after a stall (default 50). */
  dtClampMs?: number;
  /**
   * Right-stick turn style (F.118). `true` (default) = comfort snap-turn: one
   * discrete rotation per stick push. `false` = continuous smooth turn at
   * `turnRate`. Snap is the VR-comfort default; smooth is opt-in.
   */
  snapTurn?: boolean;
  /** Snap-turn increment in degrees (default 30). Ignored when snapTurn=false. */
  snapTurnDeg?: number;
  /**
   * Forward dash distance, in metres, for a teleport (default 3). Teleport fires
   * on the right primary button (A/X); a dash is the comfort form (no vection).
   */
  teleportDistance?: number;
}

/**
 * XRLocomotionController — USER locomotion for raw three.js WebXR.
 *
 * Drives smooth gaze-relative movement, smooth turn, and teleport through ONE
 * WebXR *offset reference space* pipeline (`baseRef.getOffsetReferenceSpace`).
 * This is the three.js-correct, floor-locked locomotion path — moving a camera
 * "dolly" does NOT work, because three.js writes the XR camera pose in world
 * space every frame. Extracted from studio ImmersiveViewer so every VR scene
 * gets identical locomotion instead of re-hardcoding it.
 *
 * Frame usage (raw three.js): `controller.update(now)` inside setAnimationLoop,
 * or the explicit form `controller.move(...); controller.turn(...); controller.applyFrame()`.
 */
export class XRLocomotionController {
  private readonly renderer: THREE.WebGLRenderer;
  private speed: number;
  private turnRate: number;
  private readonly dtClamp: number;
  private snapTurn: boolean;
  private snapTurnRad: number;
  private teleportDistance: number;

  private readonly player = new THREE.Vector3(0, 0, 0);
  private yaw = 0; // accumulated turn (radians)
  private baseRefSpace: XRReferenceSpace | null = null;
  private lastNow = 0;
  // Edge gates so one stick push = one snap-turn, one button press = one teleport.
  private snapArmed = true;
  private teleportArmed = true;

  private readonly fwdVec = new THREE.Vector3();
  private readonly rightVec = new THREE.Vector3();
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private readonly turnQuat = new THREE.Quaternion();
  private readonly rotPos = new THREE.Vector3();

  private readonly onSessionStart = (): void => {
    this.baseRefSpace = (this.renderer.xr.getReferenceSpace() as XRReferenceSpace | null) ?? null;
    this.player.set(0, 0, 0);
    this.yaw = 0;
    this.lastNow = 0;
    this.snapArmed = true;
    this.teleportArmed = true;
  };

  constructor(opts: { renderer: THREE.WebGLRenderer } & XRLocomotionConfig) {
    this.renderer = opts.renderer;
    this.speed = opts.speed ?? 2.0;
    this.turnRate = opts.turnRate ?? 2.2;
    this.dtClamp = (opts.dtClampMs ?? 50) / 1000;
    this.snapTurn = opts.snapTurn ?? true;
    this.snapTurnRad = ((opts.snapTurnDeg ?? 30) * Math.PI) / 180;
    this.teleportDistance = opts.teleportDistance ?? 3;
    this.renderer.xr.addEventListener('sessionstart', this.onSessionStart);
  }

  /** Seconds since the previous frame, clamped. */
  frameDelta(now: number): number {
    const dt = this.lastNow ? Math.min((now - this.lastNow) / 1000, this.dtClamp) : 0.016;
    this.lastNow = now;
    return dt;
  }

  /** Smooth gaze-relative glide. forward>0 = where you look; strafe>0 = right. */
  move(forward: number, strafe: number, dt: number): void {
    if (forward === 0 && strafe === 0) return;
    const cam = this.renderer.xr.getCamera();
    this.fwdVec.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.fwdVec.y = 0;
    this.fwdVec.normalize();
    this.rightVec.set(1, 0, 0).applyQuaternion(cam.quaternion);
    this.rightVec.y = 0;
    this.rightVec.normalize();
    this.player.addScaledVector(this.fwdVec, forward * this.speed * dt);
    this.player.addScaledVector(this.rightVec, strafe * this.speed * dt);
  }

  /**
   * Right-stick turn. amount in [-1,1] (push right = turn right). In snap mode
   * (default) each push past the threshold applies one discrete `snapTurnDeg`
   * rotation and disarms until the stick re-centres (one push = one snap); in
   * smooth mode it rotates continuously at `turnRate`. dt is used only by smooth.
   */
  turn(amount: number, dt: number): void {
    if (!this.snapTurn) {
      if (amount !== 0) this.yaw -= amount * this.turnRate * dt;
      return;
    }
    // Snap mode: fire once on a fresh push, re-arm when the stick re-centres.
    if (Math.abs(amount) < 0.3) {
      this.snapArmed = true;
      return;
    }
    if (this.snapArmed && Math.abs(amount) >= 0.6) {
      this.yaw -= Math.sign(amount) * this.snapTurnRad;
      this.snapArmed = false;
    }
  }

  /** Jump the player rig to a floor position (teleport). */
  teleport(x: number, z: number): void {
    this.player.set(x, this.player.y, z);
  }

  /**
   * Teleport (instant dash) `dist` metres along the current gaze direction,
   * floor-locked. The comfort form of teleport — no continuous vection. Falls
   * back to `teleportDistance` when no distance is given.
   */
  teleportForward(dist = this.teleportDistance): void {
    const cam = this.renderer.xr.getCamera();
    this.fwdVec.set(0, 0, -1).applyQuaternion(cam.quaternion);
    this.fwdVec.y = 0;
    if (this.fwdVec.lengthSq() < 1e-6) return;
    this.fwdVec.normalize();
    this.player.addScaledVector(this.fwdVec, dist);
  }

  /**
   * Recompute and apply the offset reference space from the current rig pose.
   * offset = R(-yaw)·T(-player) => XRRigidTransform(pos = -R(-yaw)*player, quat = R(-yaw)).
   * Call once per XR frame, after move()/turn().
   */
  applyFrame(): void {
    if (!this.baseRefSpace || !this.renderer.xr.getSession()) return;
    this.turnQuat.setFromAxisAngle(this.yAxis, -this.yaw);
    this.rotPos.copy(this.player).applyQuaternion(this.turnQuat).multiplyScalar(-1);
    const offset = new XRRigidTransform(
      { x: this.rotPos.x, y: 0, z: this.rotPos.z, w: 1 },
      { x: this.turnQuat.x, y: this.turnQuat.y, z: this.turnQuat.z, w: this.turnQuat.w }
    );
    this.renderer.xr.setReferenceSpace(this.baseRefSpace.getOffsetReferenceSpace(offset));
  }

  /**
   * Convenience: read sticks (left=move, right=turn) + the teleport button and
   * apply for this frame. F.118: left stick smooth-glide, right stick snap-turn,
   * right primary button (A/X) teleports forward.
   */
  update(now: number): void {
    const session = this.renderer.xr.getSession();
    if (!session || !this.baseRefSpace) return;
    const dt = this.frameDelta(now);
    const sticks = readThumbsticks(session);
    // Stick pushed up reports a negative Y, which means "forward".
    this.move(-sticks.left.y, sticks.left.x, dt);
    this.turn(sticks.right.x, dt);
    // Teleport on the rising edge of the right primary button (one press = one jump).
    if (sticks.rightPrimary) {
      if (this.teleportArmed) {
        this.teleportForward();
        this.teleportArmed = false;
      }
    } else {
      this.teleportArmed = true;
    }
    this.applyFrame();
  }

  getPosition(): THREE.Vector3 {
    return this.player.clone();
  }
  getYaw(): number {
    return this.yaw;
  }
  setSpeed(metresPerSecond: number): void {
    this.speed = metresPerSecond;
  }
  setTurnRate(radiansPerSecond: number): void {
    this.turnRate = radiansPerSecond;
  }

  /** Detach the session listener. Call when tearing down the renderer. */
  dispose(): void {
    this.renderer.xr.removeEventListener('sessionstart', this.onSessionStart);
  }
}

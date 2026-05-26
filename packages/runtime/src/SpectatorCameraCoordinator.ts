/**
 * @holoscript/runtime - SpectatorCameraCoordinator
 *
 * Consumes `spectator_update_follow` emitted by SpectatorTrait
 * (packages/core/src/traits/SpectatorTrait.ts) and drives a follow-camera rig.
 * Closes the missing listener side (Pattern E: emit-without-listener) — before
 * this, a spectator in follow mode emitted a follow request every tick but no
 * camera rig moved.
 *
 * The trait emits only { node, targetId }; the target's world position is
 * resolved from a position registry fed by the scene graph
 * (setTargetPosition). On each follow event the spectator camera eases toward
 * `targetPosition + offset` and looks at the target.
 *
 * Mirrors SessionPresenceCoordinator / AmbisonicDecoderCoordinator /
 * SpatialVoiceCoordinator.
 */

import type { EventBus } from './events.js';

export type Vec3 = [number, number, number];

export type NodeRef = string | { id?: string; [k: string]: unknown };

export interface SpectatorFollowEvent {
  node: NodeRef;
  targetId: string;
}

export interface CameraTransform {
  /** Camera world position. */
  position: Vec3;
  /** World point the camera is aimed at (the followed target). */
  lookAt: Vec3;
}

export interface SpectatorCameraRecord {
  nodeId: string;
  targetId: string;
  transform: CameraTransform;
  /** True once a target position has been resolved and applied. */
  tracking: boolean;
  updateCount: number;
  updatedAt: number;
}

export type CameraHandler = (record: SpectatorCameraRecord) => void;

export interface SpectatorCameraCoordinatorOptions {
  bus: EventBus;
  /**
   * World-space offset from the target to the camera (e.g. behind + above).
   * Default [0, 2, -6].
   */
  followOffset?: Vec3;
  /**
   * Easing factor in (0, 1]: 1 snaps to the desired pose each tick, smaller
   * values trail the target smoothly. Default 1.
   */
  smoothing?: number;
  onCameraUpdated?: CameraHandler;
}

function resolveNodeId(node: NodeRef): string {
  if (typeof node === 'string') return node;
  if (node && typeof node.id === 'string') return node.id;
  return String(node);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export class SpectatorCameraCoordinator {
  private readonly bus: EventBus;
  private readonly followOffset: Vec3;
  private readonly smoothing: number;

  private cameras = new Map<string, SpectatorCameraRecord>();
  private targetPositions = new Map<string, Vec3>();
  private handlers = new Set<CameraHandler>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: SpectatorCameraCoordinatorOptions) {
    this.bus = options.bus;
    this.followOffset = options.followOffset ?? [0, 2, -6];
    const s = options.smoothing ?? 1;
    this.smoothing = s <= 0 ? 1 : s > 1 ? 1 : s;
    if (options.onCameraUpdated) this.handlers.add(options.onCameraUpdated);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.unsubscribers.push(
      this.bus.on<SpectatorFollowEvent>('spectator_update_follow', (e) =>
        this.onFollow(e)
      )
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  /** Feed a target's world position (called by scene-graph sync). */
  setTargetPosition(targetId: string, pos: Vec3): void {
    this.targetPositions.set(targetId, [pos[0], pos[1], pos[2]]);
  }

  private onFollow(e: SpectatorFollowEvent): void {
    const nodeId = resolveNodeId(e.node);
    const targetPos = this.targetPositions.get(e.targetId);
    let record = this.cameras.get(nodeId);
    if (!record) {
      // Start at a neutral pose so smoothing has somewhere to ease from.
      record = {
        nodeId,
        targetId: e.targetId,
        transform: { position: [0, 0, 0], lookAt: [0, 0, 0] },
        tracking: false,
        updateCount: 0,
        updatedAt: Date.now(),
      };
      this.cameras.set(nodeId, record);
    }
    record.targetId = e.targetId;
    record.updateCount += 1;
    record.updatedAt = Date.now();

    if (!targetPos) {
      // Target position not yet known — keep last transform, not tracking.
      this.handlers.forEach((h) => h(record!));
      return;
    }

    const desired: Vec3 = [
      targetPos[0] + this.followOffset[0],
      targetPos[1] + this.followOffset[1],
      targetPos[2] + this.followOffset[2],
    ];
    const cur = record.transform.position;
    record.transform = {
      position: [
        lerp(cur[0], desired[0], this.smoothing),
        lerp(cur[1], desired[1], this.smoothing),
        lerp(cur[2], desired[2], this.smoothing),
      ],
      lookAt: [targetPos[0], targetPos[1], targetPos[2]],
    };
    record.tracking = true;
    this.handlers.forEach((h) => h(record!));
  }

  getCamera(nodeId: string): SpectatorCameraRecord | undefined {
    return this.cameras.get(nodeId);
  }

  getCameraTransform(nodeId: string): CameraTransform | undefined {
    return this.cameras.get(nodeId)?.transform;
  }

  count(): number {
    return this.cameras.size;
  }

  onCameraUpdated(handler: CameraHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export function createSpectatorCameraCoordinator(
  options: SpectatorCameraCoordinatorOptions
): SpectatorCameraCoordinator {
  const coordinator = new SpectatorCameraCoordinator(options);
  coordinator.start();
  return coordinator;
}

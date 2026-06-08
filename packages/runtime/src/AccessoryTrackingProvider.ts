/**
 * @holoscript/runtime - AccessoryTrackingProvider
 *
 * Consumes `accessory_request_pose` emitted by SpatialAccessoryTrait
 * (packages/core/src/traits/SpatialAccessoryTrait.ts) and resolves a device
 * pose for the requested tracking mode, writing it back via
 * `accessory_pose_update`. Closes the missing listener side (Pattern E:
 * emit-without-listener) — before this, a connected accessory requested its
 * pose every tick but nothing ever resolved it, so controller/tracker pose
 * never updated.
 *
 * The provider projects a raw 6-DOF reading according to the tracking mode
 * (rotation_only / position_only / full_6dof / optical / hybrid) and emits the
 * resolved pose back to the trait, which updates node pose state.
 */

import type { EventBus } from './events.js';

export type Vec3 = [number, number, number];
export type Quat = [number, number, number, number];

export type NodeRef = string | { id?: string; [k: string]: unknown };
export type TrackingMode = 'full_6dof' | 'rotation_only' | 'position_only' | 'optical' | 'hybrid';

export interface Pose {
  position: Vec3;
  rotation: Quat;
}

export interface AccessoryRequestPoseEvent {
  node: NodeRef;
  trackingMode: TrackingMode;
}

/** Raw tracker reading provider — supplies an un-projected 6-DOF pose. */
export type RawPoseSource = (nodeId: string, trackingMode: TrackingMode) => Pose;

export interface ResolvedPoseRecord {
  nodeId: string;
  trackingMode: TrackingMode;
  pose: Pose;
  requestCount: number;
  resolvedAt: number;
}

export type PoseHandler = (record: ResolvedPoseRecord) => void;

export interface AccessoryTrackingProviderOptions {
  bus: EventBus;
  /** Supplies the raw 6-DOF reading. Default: identity pose. */
  rawPoseSource?: RawPoseSource;
  onResolved?: PoseHandler;
}

const IDENTITY_POSE: Pose = { position: [0, 0, 0], rotation: [0, 0, 0, 1] };

function resolveNodeId(node: NodeRef): string {
  if (typeof node === 'string') return node;
  if (node && typeof node.id === 'string') return node.id;
  return String(node);
}

/** Project a raw 6-DOF reading down to what a given tracking mode provides. */
export function projectPoseForMode(raw: Pose, mode: TrackingMode): Pose {
  switch (mode) {
    case 'rotation_only':
      return { position: [0, 0, 0], rotation: [...raw.rotation] as Quat };
    case 'position_only':
      return { position: [...raw.position] as Vec3, rotation: [0, 0, 0, 1] };
    case 'full_6dof':
    case 'optical':
    case 'hybrid':
    default:
      return {
        position: [...raw.position] as Vec3,
        rotation: [...raw.rotation] as Quat,
      };
  }
}

export class AccessoryTrackingProvider {
  private readonly bus: EventBus;
  private rawPoseSource: RawPoseSource;
  private resolved = new Map<string, ResolvedPoseRecord>();
  private handlers = new Set<PoseHandler>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: AccessoryTrackingProviderOptions) {
    this.bus = options.bus;
    this.rawPoseSource =
      options.rawPoseSource ??
      (() => ({
        position: [...IDENTITY_POSE.position] as Vec3,
        rotation: [...IDENTITY_POSE.rotation] as Quat,
      }));
    if (options.onResolved) this.handlers.add(options.onResolved);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.unsubscribers.push(
      this.bus.on<AccessoryRequestPoseEvent>('accessory_request_pose', (e) => this.onRequest(e))
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  /** Swap the raw tracker source (e.g. wire a real OpenXR/optical feed). */
  setRawPoseSource(source: RawPoseSource): void {
    this.rawPoseSource = source;
  }

  private onRequest(e: AccessoryRequestPoseEvent): void {
    const nodeId = resolveNodeId(e.node);
    const raw = this.rawPoseSource(nodeId, e.trackingMode);
    const pose = projectPoseForMode(raw, e.trackingMode);

    const prev = this.resolved.get(nodeId);
    const record: ResolvedPoseRecord = {
      nodeId,
      trackingMode: e.trackingMode,
      pose,
      requestCount: (prev?.requestCount ?? 0) + 1,
      resolvedAt: Date.now(),
    };
    this.resolved.set(nodeId, record);

    // Write the resolved pose back to the trait, which updates node pose state.
    this.bus.emit('accessory_pose_update', { node: e.node, pose });
    this.handlers.forEach((h) => h(record));
  }

  // --- query API -----------------------------------------------------------

  getResolvedPose(nodeId: string): Pose | undefined {
    return this.resolved.get(nodeId)?.pose;
  }
  getRecord(nodeId: string): ResolvedPoseRecord | undefined {
    return this.resolved.get(nodeId);
  }
  requestCount(nodeId: string): number {
    return this.resolved.get(nodeId)?.requestCount ?? 0;
  }

  onResolved(handler: PoseHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }
}

export function createAccessoryTrackingProvider(
  options: AccessoryTrackingProviderOptions
): AccessoryTrackingProvider {
  const provider = new AccessoryTrackingProvider(options);
  provider.start();
  return provider;
}

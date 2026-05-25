import type { Vector3 } from '../traits/TraitTypes';

/** Duck-typed event source - TraitContextFactory matches this shape. */
export interface ObjectTrackingEventSource {
  on(event: string, handler: (payload: unknown) => void): void;
}

export type ObjectTrackingStatus = 'initialized' | 'tracking' | 'lost' | 'recovering' | 'removed';

export interface ObjectTrackingState {
  nodeId: string;
  target?: string;
  anchorId: string | null;
  status: ObjectTrackingStatus;
  position: Vector3 | null;
  rotation: Vector3 | null;
  confidence: number;
  recoveryAttempts: number;
  source?: string;
  timestampMs: number | null;
  updatedAt: number;
}

export interface ObjectTrackingStats {
  total: number;
  tracking: number;
  lost: number;
  recovering: number;
  removed: number;
}

export type ObjectTrackingListener = (state: ObjectTrackingState) => void;

const OBJECT_TRACKING_EVENTS = [
  'tracking:init',
  'tracking:updated',
  'tracking:lost',
  'tracking:recovery_attempt',
  'tracking:anchor_removed',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readVector3(value: unknown): Vector3 | undefined {
  if (!Array.isArray(value) || value.length !== 3 || !value.every((n) => Number.isFinite(n))) {
    return undefined;
  }
  return [...value] as Vector3;
}

function clampConfidence(value: unknown, fallback: number): number {
  const confidence = readNumber(value);
  if (confidence === undefined) return fallback;
  return Math.max(0, Math.min(1, confidence));
}

export class ObjectTrackingCoordinator {
  private targets = new Map<string, ObjectTrackingState>();
  private listeners = new Set<ObjectTrackingListener>();

  constructor(source: ObjectTrackingEventSource) {
    for (const event of OBJECT_TRACKING_EVENTS) {
      source.on(event, (payload: unknown) => this.handleEvent(event, payload));
    }
  }

  private handleEvent(event: string, payload: unknown): void {
    if (!isRecord(payload)) return;

    const key = this.resolveKey(payload);
    if (!key) return;

    const observedAt = Date.now();
    const existing = this.targets.get(key);
    const next: ObjectTrackingState = existing
      ? { ...existing, updatedAt: observedAt }
      : {
          nodeId: key,
          anchorId: null,
          status: 'initialized',
          position: null,
          rotation: null,
          confidence: 0,
          recoveryAttempts: 0,
          timestampMs: null,
          updatedAt: observedAt,
        };

    next.target = readString(payload.target) ?? next.target;
    next.anchorId = readString(payload.anchorId) ?? next.anchorId;

    if (event === 'tracking:init') {
      next.status = 'initialized';
    } else if (event === 'tracking:updated') {
      next.status = 'tracking';
      next.position = readVector3(payload.position) ?? next.position;
      next.rotation = readVector3(payload.rotation) ?? next.rotation;
      next.confidence = clampConfidence(payload.confidence, next.confidence);
      next.source = readString(payload.source) ?? next.source;
      next.timestampMs = readNumber(payload.timestampMs) ?? next.timestampMs;
    } else if (event === 'tracking:lost') {
      next.status = 'lost';
      next.confidence = 0;
    } else if (event === 'tracking:recovery_attempt') {
      next.status = 'recovering';
      next.recoveryAttempts = readNumber(payload.attempt) ?? next.recoveryAttempts + 1;
    } else if (event === 'tracking:anchor_removed') {
      next.status = 'removed';
    }

    this.targets.set(key, next);
    this.notifyListeners(next);
  }

  private resolveKey(payload: Record<string, unknown>): string | undefined {
    const nodeId = readString(payload.nodeId);
    if (nodeId) return nodeId;

    const anchorId = readString(payload.anchorId);
    if (anchorId) return `anchor:${anchorId}`;

    const target = readString(payload.target);
    return target ? `target:${target}` : undefined;
  }

  private notifyListeners(state: ObjectTrackingState): void {
    for (const listener of this.listeners) {
      try {
        listener(state);
      } catch {
        // Keep bus fan-out resilient: one bad consumer cannot hide tracking state.
      }
    }
  }

  subscribe(listener: ObjectTrackingListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  getTrackingState(nodeId: string): ObjectTrackingState | undefined {
    return this.targets.get(nodeId);
  }

  getAllStates(): ObjectTrackingState[] {
    return Array.from(this.targets.values());
  }

  getStats(): ObjectTrackingStats {
    const states = this.getAllStates();
    return {
      total: states.length,
      tracking: states.filter((s) => s.status === 'tracking').length,
      lost: states.filter((s) => s.status === 'lost').length,
      recovering: states.filter((s) => s.status === 'recovering').length,
      removed: states.filter((s) => s.status === 'removed').length,
    };
  }

  reset(): void {
    this.targets.clear();
  }

  get subscribedEventCount(): number {
    return OBJECT_TRACKING_EVENTS.length;
  }
}

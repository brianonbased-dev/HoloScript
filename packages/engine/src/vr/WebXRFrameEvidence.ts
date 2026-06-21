import type { Vec3, XRFrameData, XRGeospatialAnchorState, XRHitTestResult } from './WebXRSystem';

export interface WebXRHitTestSourceLike {
  cancel?(): void;
}

export type WebXRSpaceLike = object;

export interface WebXRPoseLike {
  transform?: {
    position?: unknown;
    orientation?: unknown;
  };
}

export interface WebXRHitTestResultLike {
  getPose?(baseSpace: WebXRSpaceLike): WebXRPoseLike | null | undefined;
  [key: string]: unknown;
}

export interface WebXRAnchorLike {
  anchorSpace?: WebXRSpaceLike;
  space?: WebXRSpaceLike;
  [key: string]: unknown;
}

export interface WebXRFrameLike {
  getHitTestResults?(source: WebXRHitTestSourceLike): WebXRHitTestResultLike[];
  getPose?(space: WebXRSpaceLike, baseSpace: WebXRSpaceLike): WebXRPoseLike | null | undefined;
  trackedAnchors?: Iterable<WebXRAnchorLike>;
}

export type WebXRFrameEvidence = Required<Pick<XRFrameData, 'hitTests' | 'geospatialAnchors'>>;

export interface CollectWebXRFrameEvidenceOptions {
  time: number;
  frame: WebXRFrameLike;
  referenceSpace: WebXRSpaceLike | null | undefined;
  hitTestSource?: WebXRHitTestSourceLike | null;
}

export function collectWebXRFrameEvidence({
  time,
  frame,
  referenceSpace,
  hitTestSource,
}: CollectWebXRFrameEvidenceOptions): WebXRFrameEvidence {
  if (!referenceSpace) {
    return { hitTests: [], geospatialAnchors: [] };
  }

  const hitTests =
    hitTestSource && typeof frame.getHitTestResults === 'function'
      ? frame
          .getHitTestResults(hitTestSource)
          .map((result, index) => hitTestResultToFrameData(result, referenceSpace, time, index))
          .filter(isPresent)
      : [];

  const geospatialAnchors = collectTrackedAnchors(frame, referenceSpace, time);

  return { hitTests, geospatialAnchors };
}

function hitTestResultToFrameData(
  result: WebXRHitTestResultLike,
  referenceSpace: WebXRSpaceLike,
  time: number,
  index: number
): XRHitTestResult | null {
  const pose = result.getPose?.(referenceSpace);
  const position = vec3FromPose(pose);
  if (!position) return null;

  const rotation = rotationFromPose(pose);
  const record = asRecord(result);
  const anchorId = anchorIdFromValue(record?.anchor);
  const confidence = numberFromRecord(record, ['confidence', 'trackingConfidence']) ?? 1;

  return {
    id: stringFromRecord(record, ['id', 'resultId']) ?? `webxr-hit-${Math.round(time)}-${index}`,
    anchorId,
    position,
    rotation,
    confidence,
    source: 'webxr-hit-test',
  };
}

function collectTrackedAnchors(
  frame: WebXRFrameLike,
  referenceSpace: WebXRSpaceLike,
  time: number
): XRGeospatialAnchorState[] {
  if (!frame.trackedAnchors) return [];

  const anchors: XRGeospatialAnchorState[] = [];
  let index = 0;
  for (const anchor of frame.trackedAnchors) {
    const record = asRecord(anchor);
    const anchorSpace = (record?.anchorSpace ?? record?.space) as WebXRSpaceLike | undefined;
    const pose =
      anchorSpace && typeof frame.getPose === 'function'
        ? frame.getPose(anchorSpace, referenceSpace)
        : null;

    const position = vec3FromPose(pose) ?? [0, 0, 0];
    const rotation = rotationFromPose(pose);
    const confidence = pose
      ? (numberFromRecord(record, ['confidence', 'trackingConfidence']) ?? 1)
      : 0;
    const geoPose = asRecord(record?.geoPose) ?? asRecord(record?.geospatialPose);

    const state: XRGeospatialAnchorState = {
      anchorId:
        anchorIdFromValue(anchor) ??
        stringFromRecord(record, ['anchorId', 'id', 'uuid']) ??
        `webxr-anchor-${index}`,
      position,
      rotation,
      confidence,
      resolvedAt: time,
    };

    const lat =
      numberFromRecord(record, ['lat', 'latitude']) ??
      numberFromRecord(geoPose, ['lat', 'latitude']);
    const lng =
      numberFromRecord(record, ['lng', 'lon', 'longitude']) ??
      numberFromRecord(geoPose, ['lng', 'lon', 'longitude']);
    const alt =
      numberFromRecord(record, ['alt', 'altitude']) ??
      numberFromRecord(geoPose, ['alt', 'altitude']);

    if (lat !== undefined) state.lat = lat;
    if (lng !== undefined) state.lng = lng;
    if (alt !== undefined) state.alt = alt;

    anchors.push(state);
    index++;
  }

  return anchors;
}

function vec3FromPose(pose: WebXRPoseLike | null | undefined): Vec3 | null {
  const transform = asRecord(pose?.transform);
  return vec3FromValue(transform?.position);
}

function rotationFromPose(pose: WebXRPoseLike | null | undefined): Vec3 | undefined {
  const transform = asRecord(pose?.transform);
  const orientation = transform?.orientation;
  if (!orientation) return undefined;

  const x = indexedOrRecordNumber(orientation, 'x', 0);
  const y = indexedOrRecordNumber(orientation, 'y', 1);
  const z = indexedOrRecordNumber(orientation, 'z', 2);
  const w = indexedOrRecordNumber(orientation, 'w', 3);

  if (x === undefined || y === undefined || z === undefined) return undefined;
  if (w === undefined) return [x, y, z];

  return quaternionToEuler([x, y, z, w]);
}

function vec3FromValue(value: unknown): Vec3 | null {
  const x = indexedOrRecordNumber(value, 'x', 0);
  const y = indexedOrRecordNumber(value, 'y', 1);
  const z = indexedOrRecordNumber(value, 'z', 2);

  if (x === undefined || y === undefined || z === undefined) return null;
  return [x, y, z];
}

function indexedOrRecordNumber(value: unknown, key: string, index: number): number | undefined {
  if (value == null) return undefined;

  const indexed = value as { readonly [index: number]: unknown };
  const indexedValue = indexed[index];
  if (typeof indexedValue === 'number' && Number.isFinite(indexedValue)) {
    return indexedValue;
  }

  const record = asRecord(value);
  const recordValue = record?.[key];
  if (typeof recordValue === 'number' && Number.isFinite(recordValue)) {
    return recordValue;
  }

  return undefined;
}

function quaternionToEuler(q: [number, number, number, number]): Vec3 {
  const [x, y, z, w] = q;
  const t0 = 2.0 * (w * y - z * x);
  const ry = Math.asin(Math.max(-1, Math.min(1, t0)));
  const t1 = 2.0 * (w * x + y * z);
  const t2 = 1.0 - 2.0 * (x * x + y * y);
  const rx = Math.atan2(t1, t2);
  const t3 = 2.0 * (w * z + x * y);
  const t4 = 1.0 - 2.0 * (y * y + z * z);
  const rz = Math.atan2(t3, t4);
  return [rx, ry, rz];
}

function anchorIdFromValue(value: unknown): string | undefined {
  const record = asRecord(value);
  return stringFromRecord(record, ['anchorId', 'id', 'uuid']);
}

function stringFromRecord(
  record: Record<string, unknown> | null | undefined,
  keys: string[]
): string | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.length > 0) return value;
  }
  return undefined;
}

function numberFromRecord(
  record: Record<string, unknown> | null | undefined,
  keys: string[]
): number | undefined {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return undefined;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : null;
}

function isPresent<T>(value: T | null | undefined): value is T {
  return value != null;
}

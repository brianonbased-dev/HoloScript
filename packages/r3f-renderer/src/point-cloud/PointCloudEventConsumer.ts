export type PointCloudFormat = 'ply' | 'las' | 'laz' | 'xyz' | 'pcd' | 'e57' | string;
export type PointCloudColorMode = 'rgb' | 'intensity' | 'height' | 'classification' | 'normal' | string;

export const POINT_CLOUD_TRAIT_EVENTS = [
  'point_cloud_load',
  'point_cloud_destroy',
  'point_cloud_set_lod',
  'point_cloud_update_size',
  'point_cloud_update_color',
  'point_cloud_apply_filter',
  'point_cloud_ray_pick',
  'point_cloud_reset_filter',
] as const;

export type PointCloudTraitEvent = (typeof POINT_CLOUD_TRAIT_EVENTS)[number];

export interface PointCloudEventBus {
  on<T = unknown>(event: string, callback: (payload: T) => void): () => void;
  emit<T = unknown>(event: string, payload: T): void;
}

export interface PointCloudBounds {
  min: [number, number, number];
  max: [number, number, number];
}

export interface ParsedPointCloud {
  source: string;
  format: PointCloudFormat;
  positions: Float32Array;
  colors: Float32Array;
  pointCount: number;
  boundingBox: PointCloudBounds;
}

export interface PointCloudOctreeNode {
  bounds: PointCloudBounds;
  depth: number;
  pointIndices: number[];
  children: PointCloudOctreeNode[];
}

export interface PointCloudOctreeHandle {
  id: string;
  nodeId: string;
  source: string;
  format: PointCloudFormat;
  pointCount: number;
  visiblePoints: number;
  boundingBox: PointCloudBounds;
  memoryUsage: number;
  positions: Float32Array;
  colors: Float32Array;
  root: PointCloudOctreeNode;
  lodLevel: number;
  pointSize: number;
  colorMode: PointCloudColorMode;
  filter?: PointCloudFilter;
}

export interface PointCloudFilter {
  classification?: number[];
  heightRange?: [number, number];
}

export interface PointCloudLoadPayload {
  node: unknown;
  source: string;
  format?: PointCloudFormat;
  maxPoints?: number;
  chunkSize?: number;
  buildLod?: boolean;
  lodLevels?: number;
  colorMode?: PointCloudColorMode;
  pointSize?: number;
}

export interface PointCloudConsumerOptions {
  bus: PointCloudEventBus;
  loadText?: (source: string) => Promise<string>;
  maxDepth?: number;
  maxPointsPerLeaf?: number;
}

const DEFAULT_MAX_DEPTH = 6;
const DEFAULT_MAX_POINTS_PER_LEAF = 2048;

export class PointCloudEventConsumer {
  private readonly bus: PointCloudEventBus;
  private readonly loadText: (source: string) => Promise<string>;
  private readonly maxDepth: number;
  private readonly maxPointsPerLeaf: number;
  private readonly handles = new Map<string, PointCloudOctreeHandle>();
  private unsubscribers: Array<() => void> = [];
  private started = false;

  constructor(options: PointCloudConsumerOptions) {
    this.bus = options.bus;
    this.loadText = options.loadText ?? defaultLoadText;
    this.maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH;
    this.maxPointsPerLeaf = options.maxPointsPerLeaf ?? DEFAULT_MAX_POINTS_PER_LEAF;
  }

  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribers = [
      this.bus.on<PointCloudLoadPayload>('point_cloud_load', (payload) => {
        void this.handleLoad(payload);
      }),
      this.bus.on<{ node: unknown }>('point_cloud_destroy', (payload) => {
        this.handles.delete(nodeIdFor(payload.node));
      }),
      this.bus.on<{ node: unknown; level?: number }>('point_cloud_set_lod', (payload) => {
        const handle = this.handles.get(nodeIdFor(payload.node));
        if (handle) handle.lodLevel = Math.max(0, Math.floor(payload.level ?? 0));
      }),
      this.bus.on<{ node: unknown; size?: number }>('point_cloud_update_size', (payload) => {
        const handle = this.handles.get(nodeIdFor(payload.node));
        if (handle && Number.isFinite(payload.size)) handle.pointSize = Number(payload.size);
      }),
      this.bus.on<{ node: unknown; mode?: PointCloudColorMode }>('point_cloud_update_color', (payload) => {
        const handle = this.handles.get(nodeIdFor(payload.node));
        if (handle && payload.mode) handle.colorMode = payload.mode;
      }),
      this.bus.on<{ node: unknown; classification?: number[]; heightRange?: [number, number] }>(
        'point_cloud_apply_filter',
        (payload) => this.applyFilter(payload.node, payload)
      ),
      this.bus.on<{ node: unknown }>('point_cloud_reset_filter', (payload) => {
        const handle = this.handles.get(nodeIdFor(payload.node));
        if (!handle) return;
        delete handle.filter;
        handle.visiblePoints = handle.pointCount;
        this.bus.emit('point_cloud_visibility_update', {
          node: payload.node,
          visibleCount: handle.visiblePoints,
        });
      }),
      this.bus.on<{
        node: unknown;
        callbackId?: string;
        origin?: [number, number, number];
        direction?: [number, number, number];
      }>('point_cloud_ray_pick', (payload) => this.pickPoint(payload)),
    ];
  }

  stop(): void {
    for (const unsubscribe of this.unsubscribers) unsubscribe();
    this.unsubscribers = [];
    this.started = false;
  }

  getHandle(node: unknown): PointCloudOctreeHandle | undefined {
    return this.handles.get(nodeIdFor(node));
  }

  getAllHandles(): PointCloudOctreeHandle[] {
    return Array.from(this.handles.values());
  }

  clear(): void {
    this.handles.clear();
  }

  private async handleLoad(payload: PointCloudLoadPayload): Promise<void> {
    const nodeId = nodeIdFor(payload.node);
    if (!payload.source) {
      this.bus.emit('point_cloud_load_error', {
        node: payload.node,
        source: payload.source,
        error: 'Point cloud source is required.',
      });
      return;
    }

    try {
      this.bus.emit('point_cloud_load_progress', {
        node: payload.node,
        loadedPoints: 0,
        totalPoints: payload.maxPoints ?? 0,
        progress: 0,
      });

      const format = normalizeFormat(payload.format ?? inferFormatFromSource(payload.source));
      const text = await this.loadText(payload.source);
      const parsed = parsePointCloudText(text, {
        source: payload.source,
        format,
        maxPoints: payload.maxPoints,
      });
      const handle = buildPointCloudOctree(parsed, {
        nodeId,
        maxDepth: payload.buildLod === false ? 0 : Math.max(0, payload.lodLevels ?? this.maxDepth),
        maxPointsPerLeaf: this.maxPointsPerLeaf,
        pointSize: payload.pointSize ?? 1,
        colorMode: payload.colorMode ?? 'rgb',
      });

      this.handles.set(nodeId, handle);
      this.bus.emit('point_cloud_load_progress', {
        node: payload.node,
        loadedPoints: parsed.pointCount,
        totalPoints: parsed.pointCount,
        progress: 1,
      });
      this.bus.emit('point_cloud_loaded', {
        node: payload.node,
        pointCount: handle.pointCount,
        boundingBox: handle.boundingBox,
        memoryUsage: handle.memoryUsage,
        octree: handle,
      });
      this.bus.emit('point_cloud_visibility_update', {
        node: payload.node,
        visibleCount: handle.visiblePoints,
      });
    } catch (error) {
      this.bus.emit('point_cloud_load_error', {
        node: payload.node,
        source: payload.source,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private applyFilter(node: unknown, filter: PointCloudFilter): void {
    const handle = this.handles.get(nodeIdFor(node));
    if (!handle) return;
    handle.filter = {
      classification: filter.classification,
      heightRange: filter.heightRange,
    };
    handle.visiblePoints = countVisiblePoints(handle, handle.filter);
    this.bus.emit('point_cloud_visibility_update', {
      node,
      visibleCount: handle.visiblePoints,
    });
  }

  private pickPoint(payload: {
    node: unknown;
    callbackId?: string;
    origin?: [number, number, number];
    direction?: [number, number, number];
  }): void {
    const handle = this.handles.get(nodeIdFor(payload.node));
    const point = handle && payload.origin && payload.direction
      ? pickNearestPointOnRay(handle, payload.origin, normalizeVector(payload.direction))
      : null;

    this.bus.emit('point_cloud_pick_result', {
      node: payload.node,
      callbackId: payload.callbackId,
      point,
    });
  }
}

export function createPointCloudEventConsumer(
  options: PointCloudConsumerOptions
): PointCloudEventConsumer {
  const consumer = new PointCloudEventConsumer(options);
  consumer.start();
  return consumer;
}

export function createWindowPointCloudEventConsumer(
  options: Omit<PointCloudConsumerOptions, 'bus'> & { target?: Window }
): PointCloudEventConsumer {
  const target = options.target ?? globalThis.window;
  const bus: PointCloudEventBus = {
    on(event, callback) {
      if (!target) return () => {};
      const handler = (evt: Event) => callback((evt as CustomEvent).detail);
      target.addEventListener(`holoscript:${event}`, handler);
      return () => target.removeEventListener(`holoscript:${event}`, handler);
    },
    emit(event, payload) {
      target?.dispatchEvent(new CustomEvent(`holoscript:${event}`, { detail: payload }));
    },
  };
  return createPointCloudEventConsumer({ ...options, bus });
}

export function parsePointCloudText(
  text: string,
  options: { source: string; format: PointCloudFormat; maxPoints?: number }
): ParsedPointCloud {
  const format = normalizeFormat(options.format);
  if (format === 'las' || format === 'laz' || format === 'e57') {
    throw new Error(`Point cloud format "${format}" needs a binary loader adapter.`);
  }

  const rows = extractAsciiPointRows(text, format);
  const maxPoints = options.maxPoints === undefined
    ? Number.POSITIVE_INFINITY
    : Math.max(0, Math.floor(options.maxPoints));
  const positions: number[] = [];
  const colors: number[] = [];

  for (const row of rows) {
    if (positions.length / 3 >= maxPoints) break;
    const point = parseAsciiPoint(row);
    if (!point) continue;
    positions.push(point.position[0], point.position[1], point.position[2]);
    colors.push(point.color[0], point.color[1], point.color[2]);
  }

  const pointCount = positions.length / 3;
  const parsed: ParsedPointCloud = {
    source: options.source,
    format,
    positions: new Float32Array(positions),
    colors: new Float32Array(colors),
    pointCount,
    boundingBox: computeBounds(new Float32Array(positions), pointCount),
  };
  return parsed;
}

export function buildPointCloudOctree(
  cloud: ParsedPointCloud,
  options: {
    nodeId: string;
    maxDepth?: number;
    maxPointsPerLeaf?: number;
    pointSize?: number;
    colorMode?: PointCloudColorMode;
  }
): PointCloudOctreeHandle {
  const pointIndices = Array.from({ length: cloud.pointCount }, (_, index) => index);
  const root = buildOctreeNode(
    cloud.positions,
    pointIndices,
    cloud.boundingBox,
    0,
    options.maxDepth ?? DEFAULT_MAX_DEPTH,
    options.maxPointsPerLeaf ?? DEFAULT_MAX_POINTS_PER_LEAF
  );

  return {
    id: `point-cloud:${options.nodeId}:${cloud.source}`,
    nodeId: options.nodeId,
    source: cloud.source,
    format: cloud.format,
    pointCount: cloud.pointCount,
    visiblePoints: cloud.pointCount,
    boundingBox: cloud.boundingBox,
    memoryUsage: cloud.positions.byteLength + cloud.colors.byteLength,
    positions: cloud.positions,
    colors: cloud.colors,
    root,
    lodLevel: 0,
    pointSize: options.pointSize ?? 1,
    colorMode: options.colorMode ?? 'rgb',
  };
}

async function defaultLoadText(source: string): Promise<string> {
  if (source.startsWith('data:text/plain;base64,')) {
    return globalThis.atob(source.slice('data:text/plain;base64,'.length));
  }
  if (typeof fetch !== 'function') {
    throw new Error('No fetch implementation is available for point cloud loading.');
  }
  const response = await fetch(source);
  if (!response.ok) {
    throw new Error(`Failed to load point cloud "${source}": HTTP ${response.status}`);
  }
  return response.text();
}

function extractAsciiPointRows(text: string, format: string): string[] {
  const lines = text.split(/\r?\n/);
  if (format === 'ply') {
    const start = lines.findIndex((line) => line.trim().toLowerCase() === 'end_header');
    if (start < 0) throw new Error('ASCII PLY point cloud is missing end_header.');
    return lines.slice(start + 1);
  }
  if (format === 'pcd') {
    const start = lines.findIndex((line) => line.trim().toLowerCase().startsWith('data ascii'));
    if (start < 0) throw new Error('PCD point cloud must use DATA ascii.');
    return lines.slice(start + 1);
  }
  return lines;
}

function parseAsciiPoint(row: string):
  | { position: [number, number, number]; color: [number, number, number] }
  | null {
  const trimmed = row.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;
  const parts = trimmed.split(/[,\s]+/).map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((value) => !Number.isFinite(value))) {
    return null;
  }

  const rawColor = parts.length >= 6 ? parts.slice(3, 6) : [255, 255, 255];
  const color = rawColor.map((value) => {
    if (!Number.isFinite(value)) return 1;
    return value > 1 ? clamp01(value / 255) : clamp01(value);
  }) as [number, number, number];

  return {
    position: [parts[0], parts[1], parts[2]],
    color,
  };
}

function buildOctreeNode(
  positions: Float32Array,
  indices: number[],
  bounds: PointCloudBounds,
  depth: number,
  maxDepth: number,
  maxPointsPerLeaf: number
): PointCloudOctreeNode {
  if (depth >= maxDepth || indices.length <= maxPointsPerLeaf) {
    return { bounds, depth, pointIndices: indices, children: [] };
  }

  const center = midpoint(bounds);
  const buckets: number[][] = Array.from({ length: 8 }, () => []);
  for (const index of indices) {
    const offset = index * 3;
    const bucket =
      (positions[offset] >= center[0] ? 1 : 0) |
      (positions[offset + 1] >= center[1] ? 2 : 0) |
      (positions[offset + 2] >= center[2] ? 4 : 0);
    buckets[bucket].push(index);
  }

  const children = buckets
    .filter((bucket) => bucket.length > 0)
    .map((bucket) =>
      buildOctreeNode(
        positions,
        bucket,
        computeBoundsForIndices(positions, bucket),
        depth + 1,
        maxDepth,
        maxPointsPerLeaf
      )
    );

  return { bounds, depth, pointIndices: indices, children };
}

function computeBounds(positions: Float32Array, pointCount: number): PointCloudBounds {
  if (pointCount < 1) return { min: [0, 0, 0], max: [0, 0, 0] };
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pointCount; i += 1) {
    const offset = i * 3;
    for (let axis = 0; axis < 3; axis += 1) {
      const value = positions[offset + axis];
      if (value < min[axis]) min[axis] = value;
      if (value > max[axis]) max[axis] = value;
    }
  }
  return { min, max };
}

function computeBoundsForIndices(positions: Float32Array, indices: number[]): PointCloudBounds {
  const subset = new Float32Array(indices.length * 3);
  indices.forEach((index, i) => {
    const source = index * 3;
    const target = i * 3;
    subset[target] = positions[source];
    subset[target + 1] = positions[source + 1];
    subset[target + 2] = positions[source + 2];
  });
  return computeBounds(subset, indices.length);
}

function countVisiblePoints(handle: PointCloudOctreeHandle, filter: PointCloudFilter): number {
  if (!filter.heightRange) return handle.pointCount;
  const [minHeight, maxHeight] = filter.heightRange;
  let visible = 0;
  for (let i = 0; i < handle.pointCount; i += 1) {
    const z = handle.positions[i * 3 + 2];
    if (z >= minHeight && z <= maxHeight) visible += 1;
  }
  return visible;
}

function pickNearestPointOnRay(
  handle: PointCloudOctreeHandle,
  origin: [number, number, number],
  direction: [number, number, number]
): { index: number; position: [number, number, number]; distance: number } | null {
  let bestIndex = -1;
  let bestDistance = Infinity;
  for (let i = 0; i < handle.pointCount; i += 1) {
    const offset = i * 3;
    const point: [number, number, number] = [
      handle.positions[offset],
      handle.positions[offset + 1],
      handle.positions[offset + 2],
    ];
    const distance = distancePointToRay(point, origin, direction);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = i;
    }
  }
  if (bestIndex < 0) return null;
  const offset = bestIndex * 3;
  return {
    index: bestIndex,
    position: [
      handle.positions[offset],
      handle.positions[offset + 1],
      handle.positions[offset + 2],
    ],
    distance: bestDistance,
  };
}

function distancePointToRay(
  point: [number, number, number],
  origin: [number, number, number],
  direction: [number, number, number]
): number {
  const px = point[0] - origin[0];
  const py = point[1] - origin[1];
  const pz = point[2] - origin[2];
  const t = Math.max(0, px * direction[0] + py * direction[1] + pz * direction[2]);
  const cx = origin[0] + direction[0] * t;
  const cy = origin[1] + direction[1] * t;
  const cz = origin[2] + direction[2] * t;
  return Math.hypot(point[0] - cx, point[1] - cy, point[2] - cz);
}

function nodeIdFor(node: unknown): string {
  if (typeof node === 'string') return node;
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>;
    if (typeof record.id === 'string') return record.id;
    if (typeof record.name === 'string') return record.name;
  }
  return 'unknown-node';
}

function normalizeFormat(format: PointCloudFormat): string {
  return String(format || 'xyz').toLowerCase();
}

function inferFormatFromSource(source: string): PointCloudFormat {
  const clean = source.split(/[?#]/)[0]?.toLowerCase() ?? '';
  const ext = clean.slice(clean.lastIndexOf('.') + 1);
  return ext || 'xyz';
}

function midpoint(bounds: PointCloudBounds): [number, number, number] {
  return [
    (bounds.min[0] + bounds.max[0]) / 2,
    (bounds.min[1] + bounds.max[1]) / 2,
    (bounds.min[2] + bounds.max[2]) / 2,
  ];
}

function normalizeVector(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length === 0) return [0, 0, -1];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

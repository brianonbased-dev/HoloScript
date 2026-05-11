/**
 * WalkableNavmeshBuilder
 *
 * Pure deterministic navmesh derivation for `@walkable` real-estate tours.
 * It consumes an already-decoded point cloud, detects horizontal floor planes
 * and vertical wall planes, then emits a static collision mesh plus a
 * reachability graph suitable for Cannon-ES Trimesh bodies and pathfinding.
 *
 * This is intentionally one-shot compile-time geometry processing. Live SLAM,
 * pose tracking, and movable obstacles are upstream/downstream concerns.
 */

export type WalkableAxis = 'x' | 'y' | 'z';
export type WalkableVec3 = [number, number, number];
export type WalkablePointCloudFormat = 'points' | 'xyz' | 'e57';
export type WalkableSurfaceKind = 'floor' | 'wall';
export type WalkableEdgeKind = 'floor' | 'stair';

export interface WalkablePoint {
  position: WalkableVec3;
  /**
   * Optional surface normal. When supplied, positive up-axis normals are
   * treated as floors and near-horizontal normals are treated as walls.
   */
  normal?: WalkableVec3;
}

export type WalkablePointInput = WalkableVec3 | WalkablePoint;

export interface WalkablePointCloudInput {
  format?: WalkablePointCloudFormat;
  points?: WalkablePointInput[];
  /** Text XYZ rows: x y z, optionally followed by nx ny nz. */
  text?: string;
  /** Unit conversion for point coordinates. Default: meters. */
  units?: 'm' | 'cm' | 'mm';
  source_uri?: string;
}

export interface WalkableNavmeshOptions {
  /** Up axis in the capture coordinate frame. Default: y. */
  up_axis?: WalkableAxis;
  /** Horizontal grid size for floor-cell extraction. Default: 0.5m. */
  cell_size_m?: number;
  /** Plane/height tolerance for floor clustering. Default: 0.08m. */
  plane_tolerance_m?: number;
  /** Minimum points required for a floor height cluster. Default: 3. */
  min_plane_points?: number;
  /** Maximum adjacent height delta that is treated as a stair step. */
  max_step_height_m?: number;
  /** Emitted wall height when converting wall edges to collision quads. */
  wall_height_m?: number;
  /** Minimum up-normal component for a point to be treated as a floor. */
  normal_floor_threshold?: number;
}

export interface WalkablePlane {
  id: string;
  kind: 'floor' | 'wall' | 'ceiling';
  axis: WalkableAxis;
  value: number;
  point_count: number;
}

export interface WalkableSurface {
  id: string;
  kind: WalkableSurfaceKind;
  vertex_indices: number[];
}

export interface WalkableCollisionMesh {
  vertices: WalkableVec3[];
  triangles: [number, number, number][];
  indices: number[];
  surfaces: WalkableSurface[];
  physics: {
    engine: 'cannon-es';
    body_type: 'static-trimesh';
  };
}

export interface WalkableGraphNode {
  id: string;
  center: WalkableVec3;
  level: number;
  height: number;
  cell: [number, number];
}

export interface WalkableGraphEdge {
  from: string;
  to: string;
  kind: WalkableEdgeKind;
  cost: number;
}

export interface WalkableReachabilityGraph {
  nodes: WalkableGraphNode[];
  edges: WalkableGraphEdge[];
}

export interface WalkableNavmesh {
  collision_mesh: WalkableCollisionMesh;
  reachability_graph: WalkableReachabilityGraph;
  planes: WalkablePlane[];
  diagnostics: {
    point_count: number;
    floor_cell_count: number;
    wall_edge_count: number;
    stair_edge_count: number;
    holes_detected: WalkableVec3[];
    options: Required<WalkableNavmeshOptions>;
  };
}

interface FloorLevel {
  index: number;
  height: number;
  points: WalkablePoint[];
}

interface CellRecord {
  key: string;
  level: number;
  height: number;
  a: number;
  b: number;
}

interface BlockedEdge {
  level: number;
  axis: 0 | 1;
  boundary: number;
  other: number;
}

const DEFAULT_OPTIONS: Required<WalkableNavmeshOptions> = {
  up_axis: 'y',
  cell_size_m: 0.5,
  plane_tolerance_m: 0.08,
  min_plane_points: 3,
  max_step_height_m: 0.28,
  wall_height_m: 2.4,
  normal_floor_threshold: 0.85,
};

const AXIS_INDEX: Record<WalkableAxis, number> = { x: 0, y: 1, z: 2 };

export function deriveWalkableNavmesh(
  input: WalkablePointCloudInput | WalkablePointInput[],
  options: WalkableNavmeshOptions = {}
): WalkableNavmesh {
  const opts = resolveOptions(options);
  const points = normalizePointCloud(input);
  const axes = axesFor(opts.up_axis);
  const floorLevels = detectFloorLevels(points, opts, axes);
  const wallPoints = points.filter((p) => isWallPoint(p, opts, axes.up));
  const ceilingPlanes = detectCeilings(points, opts, axes.up);
  const cells = buildFloorCells(floorLevels, opts, axes);
  const blockedEdges = buildBlockedEdges(wallPoints, floorLevels, opts, axes);
  const graph = buildReachabilityGraph(cells, blockedEdges, opts, axes);
  const collisionMesh = buildCollisionMesh(cells, blockedEdges, opts, axes);
  const holes = detectHoles(cells, opts, axes);

  const floorPlanes: WalkablePlane[] = floorLevels.map((level) => ({
    id: `floor:${level.index}`,
    kind: 'floor',
    axis: opts.up_axis,
    value: round(level.height),
    point_count: level.points.length,
  }));

  const wallPlanes: WalkablePlane[] = summarizeWallPlanes(wallPoints, opts, axes);

  return {
    collision_mesh: collisionMesh,
    reachability_graph: graph,
    planes: [...floorPlanes, ...wallPlanes, ...ceilingPlanes],
    diagnostics: {
      point_count: points.length,
      floor_cell_count: cells.size,
      wall_edge_count: blockedEdges.size,
      stair_edge_count: graph.edges.filter((e) => e.kind === 'stair').length,
      holes_detected: holes,
      options: opts,
    },
  };
}

export function normalizePointCloud(
  input: WalkablePointCloudInput | WalkablePointInput[]
): WalkablePoint[] {
  const source: WalkablePointCloudInput = Array.isArray(input) ? { format: 'points', points: input } : input;
  const scale = source.units === 'cm' ? 0.01 : source.units === 'mm' ? 0.001 : 1;
  const points: WalkablePoint[] = [];

  for (const point of source.points ?? []) {
    points.push(normalizePoint(point, scale));
  }

  if (source.text) {
    for (const line of source.text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/[\s,]+/).map(Number);
      if (parts.length < 3 || parts.some((n) => !Number.isFinite(n))) {
        throw new Error(`WalkableNavmeshBuilder: invalid XYZ row '${line}'`);
      }
      const position: WalkableVec3 = [parts[0] * scale, parts[1] * scale, parts[2] * scale];
      const normal =
        parts.length >= 6
          ? normalizeNormal([parts[3], parts[4], parts[5]])
          : undefined;
      points.push(normal ? { position, normal } : { position });
    }
  }

  if (source.format === 'e57' && points.length === 0) {
    throw new Error(
      'WalkableNavmeshBuilder: E57 input must be decoded to points before navmesh derivation'
    );
  }
  if (points.length === 0) {
    throw new Error('WalkableNavmeshBuilder: point cloud is empty');
  }
  return points;
}

export function findWalkableNodeAt(
  navmesh: WalkableNavmesh,
  position: WalkableVec3
): WalkableGraphNode | null {
  const opts = navmesh.diagnostics.options;
  const axes = axesFor(opts.up_axis);
  const cell = toCell(position, opts.cell_size_m, axes);
  const height = position[axes.up];
  const candidates = navmesh.reachability_graph.nodes.filter(
    (node) =>
      node.cell[0] === cell[0] &&
      node.cell[1] === cell[1] &&
      Math.abs(node.height - height) <= opts.plane_tolerance_m
  );
  return candidates[0] ?? null;
}

export function isWalkableAt(navmesh: WalkableNavmesh, position: WalkableVec3): boolean {
  return findWalkableNodeAt(navmesh, position) != null;
}

export function findReachablePath(
  navmesh: WalkableNavmesh,
  start: WalkableVec3,
  end: WalkableVec3
): WalkableVec3[] | null {
  const startNode = findWalkableNodeAt(navmesh, start);
  const endNode = findWalkableNodeAt(navmesh, end);
  if (!startNode || !endNode) return null;
  if (startNode.id === endNode.id) return [startNode.center];

  const adjacency = new Map<string, string[]>();
  for (const edge of navmesh.reachability_graph.edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from)!.push(edge.to);
  }

  const queue = [startNode.id];
  const parent = new Map<string, string | null>([[startNode.id, null]]);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const next of adjacency.get(current) ?? []) {
      if (parent.has(next)) continue;
      parent.set(next, current);
      if (next === endNode.id) {
        return reconstructPath(navmesh, parent, endNode.id);
      }
      queue.push(next);
    }
  }

  return null;
}

function resolveOptions(options: WalkableNavmeshOptions): Required<WalkableNavmeshOptions> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  if (!Number.isFinite(opts.cell_size_m) || opts.cell_size_m <= 0) {
    throw new Error('WalkableNavmeshBuilder: cell_size_m must be positive');
  }
  if (!Number.isFinite(opts.plane_tolerance_m) || opts.plane_tolerance_m <= 0) {
    throw new Error('WalkableNavmeshBuilder: plane_tolerance_m must be positive');
  }
  if (!Number.isInteger(opts.min_plane_points) || opts.min_plane_points < 1) {
    throw new Error('WalkableNavmeshBuilder: min_plane_points must be a positive integer');
  }
  if (!Number.isFinite(opts.max_step_height_m) || opts.max_step_height_m < 0) {
    throw new Error('WalkableNavmeshBuilder: max_step_height_m must be non-negative');
  }
  if (!Number.isFinite(opts.wall_height_m) || opts.wall_height_m <= 0) {
    throw new Error('WalkableNavmeshBuilder: wall_height_m must be positive');
  }
  if (opts.normal_floor_threshold <= 0 || opts.normal_floor_threshold > 1) {
    throw new Error('WalkableNavmeshBuilder: normal_floor_threshold must be in (0, 1]');
  }
  return opts;
}

function normalizePoint(point: WalkablePointInput, scale: number): WalkablePoint {
  if (Array.isArray(point)) {
    assertVec3(point, 'position');
    return { position: [point[0] * scale, point[1] * scale, point[2] * scale] };
  }
  assertVec3(point.position, 'position');
  return {
    position: [point.position[0] * scale, point.position[1] * scale, point.position[2] * scale],
    normal: point.normal ? normalizeNormal(point.normal) : undefined,
  };
}

function normalizeNormal(normal: WalkableVec3): WalkableVec3 {
  assertVec3(normal, 'normal');
  const len = Math.hypot(normal[0], normal[1], normal[2]);
  if (len === 0) throw new Error('WalkableNavmeshBuilder: normal cannot be zero-length');
  return [normal[0] / len, normal[1] / len, normal[2] / len];
}

function assertVec3(value: unknown, label: string): asserts value is WalkableVec3 {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value.some((v) => typeof v !== 'number' || !Number.isFinite(v))
  ) {
    throw new Error(`WalkableNavmeshBuilder: ${label} must be a finite [x,y,z] tuple`);
  }
}

function axesFor(upAxis: WalkableAxis): { up: number; horizontal: [number, number] } {
  const up = AXIS_INDEX[upAxis];
  const horizontal = ([0, 1, 2].filter((idx) => idx !== up) as [number, number]);
  return { up, horizontal };
}

function detectFloorLevels(
  points: WalkablePoint[],
  opts: Required<WalkableNavmeshOptions>,
  axes: { up: number; horizontal: [number, number] }
): FloorLevel[] {
  const floorPoints = points.filter((p) => isFloorPoint(p, opts, axes.up));
  const candidates = floorPoints.length > 0 ? floorPoints : inferHorizontalPoints(points, opts, axes.up);
  const sorted = [...candidates].sort((a, b) => a.position[axes.up] - b.position[axes.up]);
  const clusters: WalkablePoint[][] = [];

  for (const point of sorted) {
    const last = clusters[clusters.length - 1];
    if (!last) {
      clusters.push([point]);
      continue;
    }
    const mean = average(last.map((p) => p.position[axes.up]));
    if (Math.abs(point.position[axes.up] - mean) <= opts.plane_tolerance_m) {
      last.push(point);
    } else {
      clusters.push([point]);
    }
  }

  const levels = clusters
    .filter((cluster) => cluster.length >= opts.min_plane_points)
    .map((cluster, index) => ({
      index,
      height: average(cluster.map((p) => p.position[axes.up])),
      points: cluster,
    }));

  if (levels.length === 0) {
    throw new Error('WalkableNavmeshBuilder: no floor plane detected');
  }

  return levels;
}

function isFloorPoint(
  point: WalkablePoint,
  opts: Required<WalkableNavmeshOptions>,
  up: number
): boolean {
  return point.normal ? point.normal[up] >= opts.normal_floor_threshold : false;
}

function isWallPoint(
  point: WalkablePoint,
  opts: Required<WalkableNavmeshOptions>,
  up: number
): boolean {
  return point.normal ? Math.abs(point.normal[up]) < opts.normal_floor_threshold : false;
}

function inferHorizontalPoints(
  points: WalkablePoint[],
  opts: Required<WalkableNavmeshOptions>,
  up: number
): WalkablePoint[] {
  const groups = new Map<number, WalkablePoint[]>();
  for (const point of points) {
    if (point.normal && Math.abs(point.normal[up]) < opts.normal_floor_threshold) continue;
    const bucket = Math.round(point.position[up] / opts.plane_tolerance_m);
    if (!groups.has(bucket)) groups.set(bucket, []);
    groups.get(bucket)!.push(point);
  }
  return [...groups.values()]
    .filter((group) => group.length >= opts.min_plane_points)
    .flat();
}

function detectCeilings(
  points: WalkablePoint[],
  opts: Required<WalkableNavmeshOptions>,
  up: number
): WalkablePlane[] {
  const ceilingPoints = points.filter(
    (p) => p.normal && p.normal[up] <= -opts.normal_floor_threshold
  );
  if (ceilingPoints.length < opts.min_plane_points) return [];
  return [
    {
      id: 'ceiling:0',
      kind: 'ceiling',
      axis: axisName(up),
      value: round(average(ceilingPoints.map((p) => p.position[up]))),
      point_count: ceilingPoints.length,
    },
  ];
}

function buildFloorCells(
  levels: FloorLevel[],
  opts: Required<WalkableNavmeshOptions>,
  axes: { up: number; horizontal: [number, number] }
): Map<string, CellRecord> {
  const cells = new Map<string, CellRecord>();
  for (const level of levels) {
    for (const point of level.points) {
      const [a, b] = toCell(point.position, opts.cell_size_m, axes);
      const key = cellKey(level.index, a, b);
      if (!cells.has(key)) {
        cells.set(key, { key, level: level.index, height: level.height, a, b });
      }
    }
  }
  return cells;
}

function buildBlockedEdges(
  wallPoints: WalkablePoint[],
  levels: FloorLevel[],
  opts: Required<WalkableNavmeshOptions>,
  axes: { up: number; horizontal: [number, number] }
): Map<string, BlockedEdge> {
  const blocked = new Map<string, BlockedEdge>();
  for (const point of wallPoints) {
    const normal = point.normal!;
    const dominant = Math.abs(normal[axes.horizontal[0]]) >= Math.abs(normal[axes.horizontal[1]]) ? 0 : 1;
    const wallCoord = point.position[axes.horizontal[dominant]];
    const otherCoord = point.position[axes.horizontal[dominant === 0 ? 1 : 0]];
    const boundary = Math.round(wallCoord / opts.cell_size_m);
    const other = Math.floor(otherCoord / opts.cell_size_m);
    for (const level of levels) {
      const upValue = point.position[axes.up];
      if (upValue < level.height - opts.plane_tolerance_m) continue;
      if (upValue > level.height + opts.wall_height_m + opts.plane_tolerance_m) continue;
      const edge: BlockedEdge = { level: level.index, axis: dominant, boundary, other };
      blocked.set(blockedKey(edge), edge);
    }
  }
  return blocked;
}

function buildReachabilityGraph(
  cells: Map<string, CellRecord>,
  blockedEdges: Map<string, BlockedEdge>,
  opts: Required<WalkableNavmeshOptions>,
  axes: { up: number; horizontal: [number, number] }
): WalkableReachabilityGraph {
  const orderedCells = [...cells.values()].sort(compareCells);
  const nodes: WalkableGraphNode[] = orderedCells.map((cell) => ({
    id: cell.key,
    center: fromHorizontal(cell.a + 0.5, cell.b + 0.5, cell.height, opts.cell_size_m, axes),
    level: cell.level,
    height: round(cell.height),
    cell: [cell.a, cell.b],
  }));
  const nodeSet = new Set(nodes.map((node) => node.id));
  const edges: WalkableGraphEdge[] = [];
  const seen = new Set<string>();

  for (const cell of orderedCells) {
    for (const [da, db] of [[1, 0], [0, 1]] as const) {
      const next = cells.get(cellKey(cell.level, cell.a + da, cell.b + db));
      if (!next) continue;
      if (isBlocked(cell, next, blockedEdges)) continue;
      addUndirectedEdge(edges, seen, cell.key, next.key, 'floor', opts.cell_size_m);
    }
  }

  for (let i = 0; i < orderedCells.length; i++) {
    for (let j = i + 1; j < orderedCells.length; j++) {
      const a = orderedCells[i];
      const b = orderedCells[j];
      if (a.level === b.level) continue;
      const manhattan = Math.abs(a.a - b.a) + Math.abs(a.b - b.b);
      if (manhattan > 1) continue;
      const heightDelta = Math.abs(a.height - b.height);
      if (heightDelta <= opts.max_step_height_m + opts.plane_tolerance_m) {
        addUndirectedEdge(edges, seen, a.key, b.key, 'stair', Math.hypot(opts.cell_size_m, heightDelta));
      }
    }
  }

  const filteredEdges = edges.filter((edge) => nodeSet.has(edge.from) && nodeSet.has(edge.to));
  filteredEdges.sort((a, b) => `${a.from}:${a.to}`.localeCompare(`${b.from}:${b.to}`));
  return { nodes, edges: filteredEdges };
}

function buildCollisionMesh(
  cells: Map<string, CellRecord>,
  blockedEdges: Map<string, BlockedEdge>,
  opts: Required<WalkableNavmeshOptions>,
  axes: { up: number; horizontal: [number, number] }
): WalkableCollisionMesh {
  const vertices: WalkableVec3[] = [];
  const triangles: [number, number, number][] = [];
  const surfaces: WalkableSurface[] = [];

  for (const cell of [...cells.values()].sort(compareCells)) {
    const base = vertices.length;
    vertices.push(
      fromHorizontal(cell.a, cell.b, cell.height, opts.cell_size_m, axes),
      fromHorizontal(cell.a + 1, cell.b, cell.height, opts.cell_size_m, axes),
      fromHorizontal(cell.a + 1, cell.b + 1, cell.height, opts.cell_size_m, axes),
      fromHorizontal(cell.a, cell.b + 1, cell.height, opts.cell_size_m, axes)
    );
    triangles.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
    surfaces.push({ id: `surface:${cell.key}`, kind: 'floor', vertex_indices: [base, base + 1, base + 2, base + 3] });
  }

  for (const edge of [...blockedEdges.values()].sort(compareBlockedEdges)) {
    const base = vertices.length;
    const low = floorHeightForLevel(cells, edge.level);
    const high = low + opts.wall_height_m;
    const c0 = edge.other;
    const c1 = edge.other + 1;
    if (edge.axis === 0) {
      vertices.push(
        fromHorizontal(edge.boundary, c0, low, opts.cell_size_m, axes),
        fromHorizontal(edge.boundary, c1, low, opts.cell_size_m, axes),
        fromHorizontal(edge.boundary, c1, high, opts.cell_size_m, axes),
        fromHorizontal(edge.boundary, c0, high, opts.cell_size_m, axes)
      );
    } else {
      vertices.push(
        fromHorizontal(c0, edge.boundary, low, opts.cell_size_m, axes),
        fromHorizontal(c1, edge.boundary, low, opts.cell_size_m, axes),
        fromHorizontal(c1, edge.boundary, high, opts.cell_size_m, axes),
        fromHorizontal(c0, edge.boundary, high, opts.cell_size_m, axes)
      );
    }
    triangles.push([base, base + 1, base + 2], [base, base + 2, base + 3]);
    surfaces.push({ id: `surface:wall:${blockedKey(edge)}`, kind: 'wall', vertex_indices: [base, base + 1, base + 2, base + 3] });
  }

  return {
    vertices,
    triangles,
    indices: triangles.flat(),
    surfaces,
    physics: { engine: 'cannon-es', body_type: 'static-trimesh' },
  };
}

function detectHoles(
  cells: Map<string, CellRecord>,
  opts: Required<WalkableNavmeshOptions>,
  axes: { up: number; horizontal: [number, number] }
): WalkableVec3[] {
  const byLevel = new Map<number, CellRecord[]>();
  for (const cell of cells.values()) {
    if (!byLevel.has(cell.level)) byLevel.set(cell.level, []);
    byLevel.get(cell.level)!.push(cell);
  }
  const holes: WalkableVec3[] = [];

  for (const levelCells of byLevel.values()) {
    const occupied = new Set(levelCells.map((c) => `${c.a}:${c.b}`));
    const minA = Math.min(...levelCells.map((c) => c.a)) - 1;
    const maxA = Math.max(...levelCells.map((c) => c.a)) + 1;
    const minB = Math.min(...levelCells.map((c) => c.b)) - 1;
    const maxB = Math.max(...levelCells.map((c) => c.b)) + 1;
    const outside = new Set<string>();
    const queue: [number, number][] = [[minA, minB]];
    outside.add(`${minA}:${minB}`);

    while (queue.length > 0) {
      const [a, b] = queue.shift()!;
      for (const [da, db] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
        const na = a + da;
        const nb = b + db;
        if (na < minA || na > maxA || nb < minB || nb > maxB) continue;
        const key = `${na}:${nb}`;
        if (occupied.has(key) || outside.has(key)) continue;
        outside.add(key);
        queue.push([na, nb]);
      }
    }

    const height = levelCells[0].height;
    for (let a = minA + 1; a < maxA; a++) {
      for (let b = minB + 1; b < maxB; b++) {
        const key = `${a}:${b}`;
        if (!occupied.has(key) && !outside.has(key)) {
          holes.push(fromHorizontal(a + 0.5, b + 0.5, height, opts.cell_size_m, axes));
        }
      }
    }
  }

  return holes.sort((a, b) => a.join(',').localeCompare(b.join(',')));
}

function summarizeWallPlanes(
  wallPoints: WalkablePoint[],
  opts: Required<WalkableNavmeshOptions>,
  axes: { up: number; horizontal: [number, number] }
): WalkablePlane[] {
  const buckets = new Map<string, WalkablePoint[]>();
  for (const point of wallPoints) {
    const normal = point.normal!;
    const dominant = Math.abs(normal[axes.horizontal[0]]) >= Math.abs(normal[axes.horizontal[1]]) ? 0 : 1;
    const axis = axes.horizontal[dominant];
    const value = Math.round(point.position[axis] / opts.plane_tolerance_m) * opts.plane_tolerance_m;
    const key = `${axis}:${round(value)}`;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(point);
  }
  return [...buckets.entries()]
    .filter(([, points]) => points.length >= opts.min_plane_points)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, points], index) => {
      const axis = Number(key.split(':')[0]);
      return {
        id: `wall:${index}`,
        kind: 'wall',
        axis: axisName(axis),
        value: round(average(points.map((p) => p.position[axis]))),
        point_count: points.length,
      };
    });
}

function reconstructPath(
  navmesh: WalkableNavmesh,
  parent: Map<string, string | null>,
  endId: string
): WalkableVec3[] {
  const byId = new Map(navmesh.reachability_graph.nodes.map((node) => [node.id, node]));
  const ids: string[] = [];
  let current: string | null = endId;
  while (current) {
    ids.push(current);
    current = parent.get(current) ?? null;
  }
  ids.reverse();
  return ids.map((id) => byId.get(id)!.center);
}

function addUndirectedEdge(
  edges: WalkableGraphEdge[],
  seen: Set<string>,
  a: string,
  b: string,
  kind: WalkableEdgeKind,
  cost: number
): void {
  const first = `${a}->${b}`;
  const second = `${b}->${a}`;
  if (!seen.has(first)) {
    edges.push({ from: a, to: b, kind, cost: round(cost) });
    seen.add(first);
  }
  if (!seen.has(second)) {
    edges.push({ from: b, to: a, kind, cost: round(cost) });
    seen.add(second);
  }
}

function isBlocked(a: CellRecord, b: CellRecord, blockedEdges: Map<string, BlockedEdge>): boolean {
  if (a.level !== b.level) return false;
  if (a.b === b.b && Math.abs(a.a - b.a) === 1) {
    const boundary = Math.max(a.a, b.a);
    return blockedEdges.has(blockedKey({ level: a.level, axis: 0, boundary, other: a.b }));
  }
  if (a.a === b.a && Math.abs(a.b - b.b) === 1) {
    const boundary = Math.max(a.b, b.b);
    return blockedEdges.has(blockedKey({ level: a.level, axis: 1, boundary, other: a.a }));
  }
  return false;
}

function toCell(
  position: WalkableVec3,
  cellSize: number,
  axes: { horizontal: [number, number] }
): [number, number] {
  return [
    Math.floor(position[axes.horizontal[0]] / cellSize),
    Math.floor(position[axes.horizontal[1]] / cellSize),
  ];
}

function fromHorizontal(
  a: number,
  b: number,
  upValue: number,
  cellSize: number,
  axes: { up: number; horizontal: [number, number] }
): WalkableVec3 {
  const out: WalkableVec3 = [0, 0, 0];
  out[axes.horizontal[0]] = round(a * cellSize);
  out[axes.horizontal[1]] = round(b * cellSize);
  out[axes.up] = round(upValue);
  return out;
}

function cellKey(level: number, a: number, b: number): string {
  return `L${level}:${a}:${b}`;
}

function blockedKey(edge: BlockedEdge): string {
  return `L${edge.level}:axis${edge.axis}:boundary${edge.boundary}:other${edge.other}`;
}

function compareCells(a: CellRecord, b: CellRecord): number {
  return a.level - b.level || a.a - b.a || a.b - b.b;
}

function compareBlockedEdges(a: BlockedEdge, b: BlockedEdge): number {
  return a.level - b.level || a.axis - b.axis || a.boundary - b.boundary || a.other - b.other;
}

function floorHeightForLevel(cells: Map<string, CellRecord>, level: number): number {
  for (const cell of cells.values()) {
    if (cell.level === level) return cell.height;
  }
  return 0;
}

function axisName(index: number): WalkableAxis {
  return index === 0 ? 'x' : index === 1 ? 'y' : 'z';
}

function average(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function round(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

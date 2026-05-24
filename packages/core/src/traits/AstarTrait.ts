/**
 * AstarTrait — v5.2
 *
 * A* shortest-path search.
 *
 * Design note (deep-ratchet E6, 2026-05-24): the prior handler only echoed
 * `from`/`to` plus a search counter — no actual search (Pattern B stub). A full
 * NavMesh A* lives at `@holoscript/engine`'s `AStarPathfinder`, but it cannot be
 * the seam here for two structural reasons:
 *   1. `@holoscript/core` and `@holoscript/engine` already declare each other as
 *      workspace deps; a *static* import of the engine pathfinder into a core
 *      trait risks a module-level cycle. Core only consumes engine via lazy
 *      `import()` / barrel re-exports (see `cli/holoscript-runner.ts`).
 *   2. `TraitContext` carries no NavMesh, and `onEvent` is synchronous (returns
 *      `void`), so an async dynamic `import()` of the engine module cannot be
 *      awaited inside the event handler.
 *
 * The honest, cycle-safe realization is a real synchronous A* implemented in
 * core that searches over graph data carried in the event payload — either a 2D
 * occupancy grid or an explicit weighted adjacency list. Same open/closed sets,
 * g/h/f costs, admissible heuristic, and parent-pointer path reconstruction as a
 * textbook A*. No engine dependency, no import cycle.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

export interface AstarConfig {
  max_iterations: number;
  /** Heuristic for grid searches: 'manhattan' | 'euclidean' | 'chebyshev'. */
  heuristic: string;
}

/** A grid cell coordinate as [row, col]. */
export type GridCoord = [number, number];

/** A 2D occupancy grid: any value > 0 (or `true`) marks a blocked/impassable cell. */
export interface AstarGridQuery {
  /** Row-major occupancy grid; non-zero / truthy cells are blocked. */
  grid: Array<Array<number | boolean>>;
  start: GridCoord;
  goal: GridCoord;
  /** Allow diagonal moves (8-connectivity). Defaults to false (4-connectivity). */
  allowDiagonal?: boolean;
}

/** A weighted directed edge in an explicit graph. */
export interface AstarGraphEdge {
  to: string;
  /** Non-negative traversal cost. Defaults to 1 when omitted. */
  cost?: number;
}

/** An explicit weighted graph with optional per-node heuristic coordinates. */
export interface AstarGraphQuery {
  /** Adjacency list keyed by node id. */
  edges: Record<string, AstarGraphEdge[]>;
  start: string;
  goal: string;
  /**
   * Optional Euclidean coordinates per node id used for the admissible
   * heuristic. When absent, A* degrades to Dijkstra (h = 0), which is still
   * correct (admissible) — just less directed.
   */
  coords?: Record<string, number[]>;
}

export interface AstarPathResult {
  found: boolean;
  /** Ordered list of grid coords or node ids from start to goal (empty if not found). */
  path: Array<GridCoord | string>;
  /** Total accumulated path cost (0 if not found). */
  cost: number;
  /** Number of nodes expanded (popped from the open set). */
  expanded: number;
}

interface SearchNode<K> {
  key: K;
  id: string;
  g: number;
  h: number;
  f: number;
  parent: SearchNode<K> | null;
}

// =============================================================================
// HEURISTICS
// =============================================================================

function gridHeuristic(a: GridCoord, b: GridCoord, kind: string): number {
  const dr = Math.abs(a[0] - b[0]);
  const dc = Math.abs(a[1] - b[1]);
  switch (kind) {
    case 'euclidean':
      return Math.sqrt(dr * dr + dc * dc);
    case 'chebyshev':
      return Math.max(dr, dc);
    case 'manhattan':
    default:
      return dr + dc;
  }
}

function euclideanCoords(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b) return 0;
  let sum = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = a[i] - b[i];
    sum += d * d;
  }
  return Math.sqrt(sum);
}

// =============================================================================
// CORE A* (generic over node key type)
// =============================================================================

function lowestF<K>(open: Map<string, SearchNode<K>>): SearchNode<K> | null {
  let best: SearchNode<K> | null = null;
  for (const n of open.values()) {
    if (!best || n.f < best.f || (n.f === best.f && n.h < best.h)) best = n;
  }
  return best;
}

function reconstruct<K>(node: SearchNode<K>): K[] {
  const path: K[] = [];
  let cur: SearchNode<K> | null = node;
  while (cur) {
    path.unshift(cur.key);
    cur = cur.parent;
  }
  return path;
}

// =============================================================================
// GRID SEARCH
// =============================================================================

function isBlocked(grid: Array<Array<number | boolean>>, r: number, c: number): boolean {
  if (r < 0 || c < 0 || r >= grid.length) return true;
  const row = grid[r];
  if (!row || c >= row.length) return true;
  const cell = row[c];
  return cell === true || (typeof cell === 'number' && cell > 0);
}

function searchGrid(q: AstarGridQuery, maxIterations: number, heuristic: string): AstarPathResult {
  const { grid, start, goal } = q;
  const allowDiagonal = q.allowDiagonal === true;

  const keyOf = (rc: GridCoord): string => `${rc[0]},${rc[1]}`;

  // Reject malformed start/goal up-front.
  if (isBlocked(grid, start[0], start[1]) || isBlocked(grid, goal[0], goal[1])) {
    return { found: false, path: [], cost: 0, expanded: 0 };
  }

  const open = new Map<string, SearchNode<GridCoord>>();
  const gScore = new Map<string, number>();
  const closed = new Set<string>();

  const startNode: SearchNode<GridCoord> = {
    key: [start[0], start[1]],
    id: keyOf(start),
    g: 0,
    h: gridHeuristic(start, goal, heuristic),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.h;
  open.set(startNode.id, startNode);
  gScore.set(startNode.id, 0);

  const orthogonal: GridCoord[] = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];
  const diagonal: GridCoord[] = [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ];
  const moves = allowDiagonal ? [...orthogonal, ...diagonal] : orthogonal;

  let expanded = 0;
  while (open.size > 0 && expanded < maxIterations) {
    const current = lowestF(open);
    if (!current) break;

    if (current.key[0] === goal[0] && current.key[1] === goal[1]) {
      return {
        found: true,
        path: reconstruct(current),
        cost: current.g,
        expanded,
      };
    }

    open.delete(current.id);
    closed.add(current.id);
    expanded++;

    for (const [dr, dc] of moves) {
      const nr = current.key[0] + dr;
      const nc = current.key[1] + dc;
      if (isBlocked(grid, nr, nc)) continue;
      const nKey = `${nr},${nc}`;
      if (closed.has(nKey)) continue;

      // Diagonal step cost = sqrt(2); orthogonal = 1.
      const stepCost = dr !== 0 && dc !== 0 ? Math.SQRT2 : 1;
      const tentativeG = current.g + stepCost;

      const knownG = gScore.get(nKey);
      if (knownG !== undefined && tentativeG >= knownG) continue;

      const neighbor: SearchNode<GridCoord> = {
        key: [nr, nc],
        id: nKey,
        g: tentativeG,
        h: gridHeuristic([nr, nc], goal, heuristic),
        f: 0,
        parent: current,
      };
      neighbor.f = neighbor.g + neighbor.h;
      gScore.set(nKey, tentativeG);
      open.set(nKey, neighbor);
    }
  }

  return { found: false, path: [], cost: 0, expanded };
}

// =============================================================================
// GRAPH SEARCH
// =============================================================================

function searchGraph(q: AstarGraphQuery, maxIterations: number): AstarPathResult {
  const { edges, start, goal, coords } = q;

  const goalCoord = coords?.[goal];
  const heuristicFor = (id: string): number =>
    coords ? euclideanCoords(coords[id], goalCoord) : 0;

  const open = new Map<string, SearchNode<string>>();
  const gScore = new Map<string, number>();
  const closed = new Set<string>();

  const startNode: SearchNode<string> = {
    key: start,
    id: start,
    g: 0,
    h: heuristicFor(start),
    f: 0,
    parent: null,
  };
  startNode.f = startNode.h;
  open.set(start, startNode);
  gScore.set(start, 0);

  let expanded = 0;
  while (open.size > 0 && expanded < maxIterations) {
    const current = lowestF(open);
    if (!current) break;

    if (current.id === goal) {
      return { found: true, path: reconstruct(current), cost: current.g, expanded };
    }

    open.delete(current.id);
    closed.add(current.id);
    expanded++;

    const neighbors = edges[current.id] ?? [];
    for (const edge of neighbors) {
      if (closed.has(edge.to)) continue;
      const cost = typeof edge.cost === 'number' && edge.cost >= 0 ? edge.cost : 1;
      const tentativeG = current.g + cost;

      const knownG = gScore.get(edge.to);
      if (knownG !== undefined && tentativeG >= knownG) continue;

      const neighbor: SearchNode<string> = {
        key: edge.to,
        id: edge.to,
        g: tentativeG,
        h: heuristicFor(edge.to),
        f: 0,
        parent: current,
      };
      neighbor.f = neighbor.g + neighbor.h;
      gScore.set(edge.to, tentativeG);
      open.set(edge.to, neighbor);
    }
  }

  return { found: false, path: [], cost: 0, expanded };
}

/**
 * Pure, exported A* entry point. Dispatches on the query shape so callers can
 * unit-test the search without a trait runtime.
 */
export function runAstar(
  query: AstarGridQuery | AstarGraphQuery,
  config: { max_iterations: number; heuristic: string }
): AstarPathResult {
  const maxIterations =
    Number.isFinite(config.max_iterations) && config.max_iterations > 0
      ? Math.floor(config.max_iterations)
      : 10000;
  if ('grid' in query && Array.isArray(query.grid)) {
    return searchGrid(query, maxIterations, config.heuristic);
  }
  if ('edges' in query && query.edges) {
    return searchGraph(query, maxIterations);
  }
  return { found: false, path: [], cost: 0, expanded: 0 };
}

function extractQuery(event: TraitEvent): AstarGridQuery | AstarGraphQuery | null {
  const src = (event.payload ?? event) as Record<string, unknown>;
  if (Array.isArray(src.grid) && Array.isArray(src.start) && Array.isArray(src.goal)) {
    return {
      grid: src.grid as Array<Array<number | boolean>>,
      start: src.start as GridCoord,
      goal: src.goal as GridCoord,
      allowDiagonal: src.allowDiagonal === true,
    };
  }
  if (
    src.edges &&
    typeof src.edges === 'object' &&
    typeof src.start === 'string' &&
    typeof src.goal === 'string'
  ) {
    return {
      edges: src.edges as Record<string, AstarGraphEdge[]>,
      start: src.start,
      goal: src.goal,
      coords: src.coords as Record<string, number[]> | undefined,
    };
  }
  return null;
}

export const astarHandler: TraitHandler<AstarConfig> = {
  name: 'astar',
  defaultConfig: { max_iterations: 10000, heuristic: 'manhattan' },
  onAttach(node: HSPlusNode): void {
    node.__astarState = { searches: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__astarState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: AstarConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__astarState as { searches: number } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    if (t !== 'astar:find_path') return;

    state.searches++;

    const query = extractQuery(event);
    if (!query) {
      // No searchable graph supplied — report an honest failure rather than a
      // fabricated "path_found". Callers must pass a grid or adjacency list.
      context.emit?.('astar:path_not_found', {
        reason: 'no-graph',
        heuristic: config.heuristic,
        searchCount: state.searches,
      });
      return;
    }

    const result = runAstar(query, config);
    if (result.found) {
      context.emit?.('astar:path_found', {
        path: result.path,
        cost: result.cost,
        expanded: result.expanded,
        heuristic: config.heuristic,
        searchCount: state.searches,
      });
    } else {
      context.emit?.('astar:path_not_found', {
        reason: 'unreachable',
        expanded: result.expanded,
        heuristic: config.heuristic,
        searchCount: state.searches,
      });
    }
  },
};
export default astarHandler;

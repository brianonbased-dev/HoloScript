'use client';
/**
 * usePathfinding — Hook for A* pathfinding visualization
 */
import { useState, useCallback, useRef } from 'react';
import { NavMesh, AStarPathfinder } from '@holoscript/core';

interface NavPoint {
  x: number;
  y: number;
  z: number;
}

export interface PathResult {
  found: boolean;
  path: NavPoint[];
  cost: number;
  polygonsVisited: number;
  timeMs: number;
}

export interface UsePathfindingReturn {
  pathfinder: InstanceType<typeof AStarPathfinder>;
  mesh: InstanceType<typeof NavMesh>;
  lastResult: PathResult | null;
  obstacles: Array<{ id: string; position: NavPoint; radius: number }>;
  findPath: (start: NavPoint, goal: NavPoint) => PathResult;
  addObstacle: (pos: NavPoint, radius?: number) => void;
  removeObstacle: (id: string) => void;
  buildDemoMesh: () => void;
  reset: () => void;
}

function createGridMesh(
  cols: number,
  rows: number,
  cellSize: number
): InstanceType<typeof NavMesh> {
  const mesh = new NavMesh();
  const polyIds: string[][] = [];

  for (let r = 0; r < rows; r++) {
    polyIds[r] = [];
    for (let c = 0; c < cols; c++) {
      const poly = mesh.addPolygon(
        [
          { x: c * cellSize, y: 0, z: r * cellSize },
          { x: (c + 1) * cellSize, y: 0, z: r * cellSize },
          { x: (c + 1) * cellSize, y: 0, z: (r + 1) * cellSize },
          { x: c * cellSize, y: 0, z: (r + 1) * cellSize },
        ],
        true,
        1
      );
      polyIds[r][c] = poly.id;
    }
  }

  // Connect neighbors
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (c < cols - 1) mesh.connectPolygons(polyIds[r][c], polyIds[r][c + 1]);
      if (r < rows - 1) mesh.connectPolygons(polyIds[r][c], polyIds[r + 1][c]);
    }
  }
  return mesh;
}

export function usePathfinding(): UsePathfindingReturn {
  const meshRef = useRef(createGridMesh(8, 8, 4));
  const pfRef = useRef(new AStarPathfinder(meshRef.current));
  const [lastResult, setLastResult] = useState<PathResult | null>(null);
  const [obstacles, setObstacles] = useState<
    Array<{ id: string; position: NavPoint; radius: number }>
  >([]);

  const findPath = useCallback((start: NavPoint, goal: NavPoint) => {
    const result = pfRef.current.findPath(start, goal);
    setLastResult(result);
    return result;
  }, []);

  const addObstacle = useCallback((pos: NavPoint, radius = 2) => {
    const id = `obs-${Date.now()}`;
    pfRef.current.addObstacle(id, pos, radius);
    setObstacles((prev) => [...prev, { id, position: pos, radius }]);
  }, []);

  const removeObstacle = useCallback((id: string) => {
    pfRef.current.removeObstacle(id);
    setObstacles((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const buildDemoMesh = useCallback(() => {
    meshRef.current = createGridMesh(8, 8, 4);
    pfRef.current = new AStarPathfinder(meshRef.current);
    setObstacles([]);
    // Demo: find path diagonal
    const result = pfRef.current.findPath({ x: 2, y: 0, z: 2 }, { x: 30, y: 0, z: 30 });
    setLastResult(result);
  }, []);

  const reset = useCallback(() => {
    meshRef.current = createGridMesh(8, 8, 4);
    pfRef.current = new AStarPathfinder(meshRef.current);
    setObstacles([]);
    setLastResult(null);
  }, []);

  return {
    pathfinder: pfRef.current,
    mesh: meshRef.current,
    lastResult,
    obstacles,
    findPath,
    addObstacle,
    removeObstacle,
    buildDemoMesh,
    reset,
  };
}

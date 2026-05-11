import { describe, expect, it } from 'vitest';

import { WalkableTrait, buildWalkableNavmesh } from './WalkableTrait';
import {
  deriveWalkableNavmesh,
  findReachablePath,
  isWalkableAt,
  type WalkablePoint,
} from './WalkableNavmeshBuilder';

const UP: [number, number, number] = [0, 1, 0];
const DOWN: [number, number, number] = [0, -1, 0];
const WALL_X: [number, number, number] = [1, 0, 0];

function floorCell(x: number, z: number, y = 0): WalkablePoint {
  return { position: [x + 0.5, y, z + 0.5], normal: UP };
}

function wallOnXBoundary(x: number, z: number, y = 1): WalkablePoint {
  return { position: [x, y, z + 0.5], normal: WALL_X };
}

describe('WalkableTrait.validate', () => {
  it('accepts the default @walkable config', () => {
    expect(WalkableTrait.validate({})).toBe(true);
  });

  it('rejects invalid navmesh resolution settings', () => {
    expect(() => WalkableTrait.validate({ cell_size_m: 0 })).toThrow(/cell_size_m/);
    expect(() => WalkableTrait.validate({ source_format: 'las' as never })).toThrow(/source_format/);
    expect(() => WalkableTrait.validate({ physics_engine: 'ammo' as never })).toThrow(/cannon-es/);
  });
});

describe('WalkableTrait.compile', () => {
  it('emits web scaffolding that derives a Cannon-ES collision mesh', () => {
    const out = WalkableTrait.compile({ point_cloud_uri: '/scan.xyz' }, 'web');
    expect(out).toContain('deriveWalkableNavmesh');
    expect(out).toContain('point_cloud_uri');
    expect(out).toContain('fetch');
  });

  it('emits node scaffolding without a vendor navmesh service', () => {
    const out = WalkableTrait.compile({ point_cloud_uri: 'scan.xyz' }, 'node');
    expect(out).toContain('readFile');
    expect(out).toContain('without calling a vendor navmesh service');
  });
});

describe('WalkableNavmeshBuilder', () => {
  it('derives deterministic floor collision mesh and reachability graph from XYZ rows', () => {
    const text = [
      '0.5 0 0.5 0 1 0',
      '1.5 0 0.5 0 1 0',
      '0.5 0 1.5 0 1 0',
      '1.5 0 1.5 0 1 0',
      '0.5 3 0.5 0 -1 0',
      '1.5 3 0.5 0 -1 0',
      '0.5 3 1.5 0 -1 0',
    ].join('\n');

    const navmesh = deriveWalkableNavmesh(
      { format: 'xyz', text },
      { cell_size_m: 1, min_plane_points: 3 }
    );
    const repeat = deriveWalkableNavmesh(
      { format: 'xyz', text },
      { cell_size_m: 1, min_plane_points: 3 }
    );

    expect(navmesh.collision_mesh.physics).toEqual({
      engine: 'cannon-es',
      body_type: 'static-trimesh',
    });
    expect(navmesh.diagnostics.floor_cell_count).toBe(4);
    expect(navmesh.reachability_graph.nodes).toHaveLength(4);
    expect(navmesh.planes.some((plane) => plane.kind === 'ceiling')).toBe(true);
    expect(navmesh).toEqual(repeat);
  });

  it('does not mark holes in a scan as walkable', () => {
    const points: WalkablePoint[] = [];
    for (let x = 0; x < 3; x++) {
      for (let z = 0; z < 3; z++) {
        if (x === 1 && z === 1) continue;
        points.push(floorCell(x, z));
      }
    }

    const navmesh = buildWalkableNavmesh(points, { cell_size_m: 1, min_plane_points: 3 });

    expect(isWalkableAt(navmesh, [1.5, 0, 1.5])).toBe(false);
    expect(navmesh.diagnostics.holes_detected).toEqual([[1.5, 0, 1.5]]);
  });

  it('blocks paths through detected walls so users cannot clip rooms', () => {
    const navmesh = deriveWalkableNavmesh(
      [
        floorCell(0, 0),
        floorCell(1, 0),
        wallOnXBoundary(1, 0),
      ],
      { cell_size_m: 1, min_plane_points: 1 }
    );

    expect(navmesh.diagnostics.wall_edge_count).toBe(1);
    expect(findReachablePath(navmesh, [0.5, 0, 0.5], [1.5, 0, 0.5])).toBeNull();
    expect(navmesh.collision_mesh.surfaces.some((surface) => surface.kind === 'wall')).toBe(true);
  });

  it('keeps open doorways passable while wall segments remain collidable', () => {
    const points: WalkablePoint[] = [];
    for (let z = 0; z < 3; z++) {
      points.push(floorCell(0, z), floorCell(1, z));
    }
    points.push(wallOnXBoundary(1, 0), wallOnXBoundary(1, 2));

    const navmesh = deriveWalkableNavmesh(points, { cell_size_m: 1, min_plane_points: 1 });

    expect(findReachablePath(navmesh, [0.5, 0, 1.5], [1.5, 0, 1.5])).not.toBeNull();
    expect(findReachablePath(navmesh, [0.5, 0, 0.5], [1.5, 0, 0.5])).not.toBeNull();
    expect(navmesh.diagnostics.wall_edge_count).toBe(2);
  });

  it('links multi-level floor clusters through stair-height steps', () => {
    const navmesh = deriveWalkableNavmesh(
      [
        floorCell(0, 0, 0),
        floorCell(1, 0, 0.2),
        floorCell(2, 0, 0.4),
        floorCell(3, 0, 0.6),
      ],
      { cell_size_m: 1, min_plane_points: 1, max_step_height_m: 0.25 }
    );

    const path = findReachablePath(navmesh, [0.5, 0, 0.5], [3.5, 0.6, 0.5]);
    expect(path).not.toBeNull();
    expect(navmesh.diagnostics.stair_edge_count).toBeGreaterThan(0);
  });

  it('fails loudly when a capture has walls but no floor plane', () => {
    expect(() =>
      deriveWalkableNavmesh(
        [wallOnXBoundary(1, 0), wallOnXBoundary(1, 1)],
        { cell_size_m: 1, min_plane_points: 1 }
      )
    ).toThrow(/no floor plane detected/);
  });
});

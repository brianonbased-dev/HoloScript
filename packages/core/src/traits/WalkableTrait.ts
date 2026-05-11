/**
 * Walkable Trait
 *
 * Sovereign HoloScript primitive for real-estate tours and scanned interiors.
 * `@walkable` turns a point-cloud capture into a deterministic collision
 * navmesh: floors are walkable, walls are collidable, door openings remain
 * passable, holes stay non-walkable, and stair treads become reachability edges.
 *
 * @version 0.1.0
 * @sovereignty HoloScript-native; no engine/vendor navmesh bridge required
 */

import type { TraitHandler } from './TraitTypes';
import {
  deriveWalkableNavmesh,
  type WalkableAxis,
  type WalkableNavmesh,
  type WalkableNavmeshOptions,
  type WalkablePointCloudFormat,
  type WalkablePointCloudInput,
  type WalkablePointInput,
} from './WalkableNavmeshBuilder';

export interface WalkableTraitConfig extends WalkableNavmeshOptions {
  /** Capture format. XYZ text and decoded E57 points are supported. */
  source_format?: WalkablePointCloudFormat;
  /** URI/path used by emitted scaffolding to load the capture. */
  point_cloud_uri?: string;
  /** Physics backend the emitted mesh is shaped for. Default: cannon-es. */
  physics_engine?: 'cannon-es';
  /** Emit pathfinding graph alongside collision geometry. Default: true. */
  emit_reachability_graph?: boolean;
}

const DEFAULT_CONFIG: Required<Omit<WalkableTraitConfig, 'point_cloud_uri'>> = {
  source_format: 'xyz',
  physics_engine: 'cannon-es',
  emit_reachability_graph: true,
  up_axis: 'y',
  cell_size_m: 0.5,
  plane_tolerance_m: 0.08,
  min_plane_points: 3,
  max_step_height_m: 0.28,
  wall_height_m: 2.4,
  normal_floor_threshold: 0.85,
};

export function resolveWalkableConfig(config: WalkableTraitConfig = {}): Required<WalkableTraitConfig> {
  return {
    point_cloud_uri: config.point_cloud_uri ?? '',
    ...DEFAULT_CONFIG,
    ...config,
  };
}

export function buildWalkableNavmesh(
  pointCloud: WalkablePointCloudInput | WalkablePointInput[],
  config: WalkableTraitConfig = {}
): WalkableNavmesh {
  const resolved = resolveWalkableConfig(config);
  return deriveWalkableNavmesh(pointCloud, {
    up_axis: resolved.up_axis,
    cell_size_m: resolved.cell_size_m,
    plane_tolerance_m: resolved.plane_tolerance_m,
    min_plane_points: resolved.min_plane_points,
    max_step_height_m: resolved.max_step_height_m,
    wall_height_m: resolved.wall_height_m,
    normal_floor_threshold: resolved.normal_floor_threshold,
  });
}

export const WalkableTrait: TraitHandler<WalkableTraitConfig> = {
  name: 'walkable',
  defaultConfig: DEFAULT_CONFIG,

  validate(config: WalkableTraitConfig = {}): boolean {
    const sourceFormat = config.source_format;
    if (sourceFormat && !['points', 'xyz', 'e57'].includes(sourceFormat)) {
      throw new Error(`WalkableTrait: unsupported source_format '${sourceFormat}'`);
    }
    const upAxis = config.up_axis;
    if (upAxis && !(['x', 'y', 'z'] as WalkableAxis[]).includes(upAxis)) {
      throw new Error(`WalkableTrait: unsupported up_axis '${upAxis}'`);
    }
    assertPositive(config.cell_size_m, 'cell_size_m');
    assertPositive(config.plane_tolerance_m, 'plane_tolerance_m');
    assertPositive(config.wall_height_m, 'wall_height_m');
    assertNonNegative(config.max_step_height_m, 'max_step_height_m');
    if (
      config.min_plane_points !== undefined &&
      (!Number.isInteger(config.min_plane_points) || config.min_plane_points < 1)
    ) {
      throw new Error('WalkableTrait: min_plane_points must be a positive integer');
    }
    if (
      config.normal_floor_threshold !== undefined &&
      (config.normal_floor_threshold <= 0 || config.normal_floor_threshold > 1)
    ) {
      throw new Error('WalkableTrait: normal_floor_threshold must be in (0, 1]');
    }
    if (config.physics_engine && config.physics_engine !== 'cannon-es') {
      throw new Error("WalkableTrait: physics_engine currently supports only 'cannon-es'");
    }
    return true;
  },

  compile(config: WalkableTraitConfig = {}, target: string): string {
    const self = this as unknown as Record<string, (c: WalkableTraitConfig) => string>;
    switch (target) {
      case 'web':
      case 'react-three-fiber':
      case 'webxr':
        return self.compileWeb(config);
      case 'node':
      case 'node-service':
      case 'mcp-server':
        return self.compileNode(config);
      default:
        return self.compileGeneric(config);
    }
  },

  compileWeb(config: WalkableTraitConfig = {}): string {
    const r = resolveWalkableConfig(config);
    return `
// Walkable — web/react-three-fiber/webxr scaffolding.
// Load a scanned XYZ capture, derive a deterministic Cannon-ES Trimesh body,
// and keep the reachability graph for doorway/stair pathfinding.
import { deriveWalkableNavmesh } from '@holoscript/core/traits';

export const walkableConfig = ${JSON.stringify(r, null, 2)};

export async function buildWalkableCollision() {
  if (!walkableConfig.point_cloud_uri) {
    throw new Error('WalkableTrait: point_cloud_uri is required for web scaffolding');
  }
  const text = await fetch(walkableConfig.point_cloud_uri).then((res) => res.text());
  return deriveWalkableNavmesh(
    { format: walkableConfig.source_format, text },
    walkableConfig
  );
}
`.trim();
  },

  compileNode(config: WalkableTraitConfig = {}): string {
    const r = resolveWalkableConfig(config);
    return `
// Walkable — node/server scaffolding.
// Decode XYZ/E57 upstream, then build static Cannon-ES collision geometry
// and a reachability graph without calling a vendor navmesh service.
import { readFile } from 'node:fs/promises';
import { deriveWalkableNavmesh } from '@holoscript/core/traits';

export const walkableConfig = ${JSON.stringify(r, null, 2)};

export async function buildWalkableCollision() {
  if (!walkableConfig.point_cloud_uri) {
    throw new Error('WalkableTrait: point_cloud_uri is required for node scaffolding');
  }
  const text = await readFile(walkableConfig.point_cloud_uri, 'utf8');
  return deriveWalkableNavmesh(
    { format: walkableConfig.source_format, text },
    walkableConfig
  );
}
`.trim();
  },

  compileGeneric(config: WalkableTraitConfig = {}): string {
    const r = resolveWalkableConfig(config);
    return `
// Walkable — generic scaffolding.
// Supply a decoded point cloud to deriveWalkableNavmesh(); the result contains
// collision_mesh.physics={engine:'cannon-es', body_type:'static-trimesh'}.
const walkableConfig = ${JSON.stringify(r, null, 2)};
`.trim();
  },
};

function assertPositive(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value <= 0)) {
    throw new Error(`WalkableTrait: ${field} must be positive`);
  }
}

function assertNonNegative(value: number | undefined, field: string): void {
  if (value !== undefined && (!Number.isFinite(value) || value < 0)) {
    throw new Error(`WalkableTrait: ${field} must be non-negative`);
  }
}

export default WalkableTrait;

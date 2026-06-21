/** @fabric_simulation Trait — Cloth physics simulation. @trait fabric_simulation */
import { PBDSolverCPU } from '@holoscript/engine/physics/PBDSolver';
import type {
  ISoftBodyConfig,
  ISoftBodyState,
  IVector3,
} from '@holoscript/engine/physics/PhysicsTypes';
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type FabricType =
  | 'woven'
  | 'knit'
  | 'denim'
  | 'silk'
  | 'leather'
  | 'synthetic'
  | 'lace'
  | 'tulle';
export interface FabricSimulationConfig {
  fabricType: FabricType;
  stiffness: number;
  elasticity: number;
  drapeCoefficient: number;
  windResistance: number;
  gravityScale: number;
  collisionMargin: number;
  vertexCount: number;
}

const defaultConfig: FabricSimulationConfig = {
  fabricType: 'woven',
  stiffness: 0.5,
  elasticity: 0.3,
  drapeCoefficient: 0.7,
  windResistance: 0.2,
  gravityScale: 1.0,
  collisionMargin: 0.01,
  vertexCount: 1000,
};

type FabricWindPayload = {
  force?: unknown;
  direction?: unknown;
  position?: unknown;
  radius?: unknown;
};

interface FabricSimulationState {
  isSimulating: boolean;
  frameCount: number;
  settledPercent: number;
  solver: PBDSolverCPU;
  solverConfig: ISoftBodyConfig;
  vertexCount: number;
  edgeCount: number;
  triangleCount: number;
  gridColumns: number;
  gridRows: number;
  clothWidth: number;
  clothHeight: number;
  wind: IVector3;
  averageSpeed: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function finiteNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asVector3(value: unknown, fallback: IVector3): IVector3 {
  if (Array.isArray(value) && value.length >= 3) {
    return [
      finiteNumber(value[0], fallback[0]),
      finiteNumber(value[1], fallback[1]),
      finiteNumber(value[2], fallback[2]),
    ];
  }

  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return [
      finiteNumber(record.x, fallback[0]),
      finiteNumber(record.y, fallback[1]),
      finiteNumber(record.z, fallback[2]),
    ];
  }

  return fallback;
}

function normalizeVector(vector: IVector3): IVector3 {
  const length = Math.hypot(vector[0], vector[1], vector[2]);
  if (length <= 1e-6) return [1, 0, 0];
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function scaleVector(vector: IVector3, scalar: number): IVector3 {
  return [vector[0] * scalar, vector[1] * scalar, vector[2] * scalar];
}

function averageSpeed(velocities: Float32Array): number {
  const vertexCount = velocities.length / 3;
  if (vertexCount === 0) return 0;

  let total = 0;
  for (let i = 0; i < vertexCount; i++) {
    const offset = i * 3;
    total += Math.hypot(velocities[offset], velocities[offset + 1], velocities[offset + 2]);
  }
  return total / vertexCount;
}

function createFabricSolverConfig(
  node: HSPlusNode,
  config: FabricSimulationConfig
): ISoftBodyConfig & {
  vertexCount: number;
  edgeCount: number;
  triangleCount: number;
  gridColumns: number;
  gridRows: number;
  clothWidth: number;
  clothHeight: number;
} {
  const vertexCount = Math.max(4, Math.floor(config.vertexCount));
  const gridColumns = Math.max(2, Math.ceil(Math.sqrt(vertexCount)));
  const gridRows = Math.max(2, Math.ceil(vertexCount / gridColumns));
  const spacing = 1 / Math.max(gridColumns - 1, gridRows - 1);
  const clothWidth = (gridColumns - 1) * spacing;
  const clothHeight = (gridRows - 1) * spacing;

  const positions = new Float32Array(vertexCount * 3);
  const masses = new Float32Array(vertexCount);
  const edges: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < vertexCount; i++) {
    const row = Math.floor(i / gridColumns);
    const column = i % gridColumns;
    const offset = i * 3;

    positions[offset] = (column - (gridColumns - 1) / 2) * spacing;
    positions[offset + 1] = (gridRows - row) * spacing + config.collisionMargin + 0.25;
    positions[offset + 2] = 0;
    masses[i] = row === 0 ? 0 : 1;

    const right = i + 1;
    const down = i + gridColumns;
    const downRight = down + 1;

    if (column < gridColumns - 1 && right < vertexCount) {
      edges.push(i, right);
    }
    if (down < vertexCount) {
      edges.push(i, down);
    }
    if (column < gridColumns - 1 && downRight < vertexCount) {
      edges.push(i, downRight);
    }

    if (column < gridColumns - 1 && down < vertexCount && right < vertexCount) {
      indices.push(i, down, right);
    }
    if (column < gridColumns - 1 && down < vertexCount && downRight < vertexCount) {
      indices.push(right, down, downRight);
    }
  }

  const stiffness = clamp(config.stiffness, 0, 1);
  const elasticity = clamp(config.elasticity, 0, 1);
  const drape = clamp(config.drapeCoefficient, 0, 1);
  const compliance = Math.max(0.0001, (1 - stiffness) * 0.08 + elasticity * 0.02);
  const damping = clamp(0.9 + drape * 0.08 - elasticity * 0.04, 0.82, 0.995);

  return {
    id: `${node.id ?? 'fabric'}:cloth`,
    positions,
    masses,
    indices: Uint32Array.from(indices),
    edges: Uint32Array.from(edges),
    compliance,
    damping,
    collisionMargin: Math.max(0, config.collisionMargin),
    solverIterations: Math.max(6, Math.round(8 + stiffness * 12)),
    selfCollision: vertexCount >= 16,
    selfCollisionCellSize: spacing * 1.5,
    gravity: [0, -9.81 * config.gravityScale, 0],
    wind: [0, 0, 0],
    useGPU: false,
    vertexCount,
    edgeCount: edges.length / 2,
    triangleCount: indices.length / 3,
    gridColumns,
    gridRows,
    clothWidth,
    clothHeight,
  };
}

function publishFabricState(
  node: HSPlusNode,
  ctx: TraitContext,
  state: FabricSimulationState,
  simState: ISoftBodyState
): void {
  node.properties = {
    ...(node.properties ?? {}),
    fabricVertexPositions: simState.positions,
    fabricVertexNormals: simState.normals,
    fabricVertexVelocities: simState.velocities,
    fabricSettledPercent: state.settledPercent,
  };

  ctx.emit?.('fabric:stepped', {
    frameCount: state.frameCount,
    vertexCount: state.vertexCount,
    settledPercent: state.settledPercent,
    averageSpeed: state.averageSpeed,
    centerOfMass: simState.centerOfMass,
    deformationAmount: simState.deformationAmount,
    positions: simState.positions,
    normals: simState.normals,
    velocities: simState.velocities,
  });
}

function parseWindPayload(event: TraitEvent, config: FabricSimulationConfig): FabricWindPayload {
  return (event.payload ?? {}) as FabricWindPayload;
}

function windFromPayload(payload: FabricWindPayload, config: FabricSimulationConfig): IVector3 {
  const resistance = clamp(config.windResistance, 0, 1);
  const force = payload.force;

  if (typeof force === 'number') {
    const direction = normalizeVector(asVector3(payload.direction, [1, 0, 0]));
    return scaleVector(direction, force * (1 - resistance));
  }

  return scaleVector(asVector3(force, [0, 0, 0]), 1 - resistance);
}

function getFabricState(node: HSPlusNode): FabricSimulationState | undefined {
  return node.__fabricState as FabricSimulationState | undefined;
}

export function createFabricSimulationHandler(): TraitHandler<FabricSimulationConfig> {
  return {
    name: 'fabric_simulation',
    defaultConfig,
    onAttach(n: HSPlusNode, c: FabricSimulationConfig, ctx: TraitContext) {
      const solverConfig = createFabricSolverConfig(n, c);
      const solver = new PBDSolverCPU(solverConfig);

      n.__fabricState = {
        isSimulating: false,
        frameCount: 0,
        settledPercent: 0,
        solver,
        solverConfig,
        vertexCount: solverConfig.vertexCount,
        edgeCount: solverConfig.edgeCount,
        triangleCount: solverConfig.triangleCount,
        gridColumns: solverConfig.gridColumns,
        gridRows: solverConfig.gridRows,
        clothWidth: solverConfig.clothWidth,
        clothHeight: solverConfig.clothHeight,
        wind: [0, 0, 0],
        averageSpeed: 0,
      } satisfies FabricSimulationState;

      const state = solver.getState();
      n.properties = {
        ...(n.properties ?? {}),
        fabricVertexPositions: state.positions,
        fabricVertexNormals: state.normals,
        fabricVertexVelocities: state.velocities,
        fabricSettledPercent: 0,
      };

      ctx.emit?.('fabric:initialized', {
        type: c.fabricType,
        solver: 'PBDSolverCPU',
        vertices: solverConfig.vertexCount,
        constraints: solverConfig.edgeCount,
        triangles: solverConfig.triangleCount,
        grid: { columns: solverConfig.gridColumns, rows: solverConfig.gridRows },
      });
    },
    onDetach(n: HSPlusNode, _c: FabricSimulationConfig, ctx: TraitContext) {
      delete n.__fabricState;
      delete n.properties?.fabricVertexPositions;
      delete n.properties?.fabricVertexNormals;
      delete n.properties?.fabricVertexVelocities;
      delete n.properties?.fabricSettledPercent;
      ctx.emit?.('fabric:destroyed');
    },
    onUpdate(n: HSPlusNode, c: FabricSimulationConfig, ctx: TraitContext, d: number) {
      const s = getFabricState(n);
      if (!s || !s.isSimulating) return;

      const dt = clamp(d > 1 ? d / 1000 : d, 1 / 240, 1 / 15);
      const simState = s.solver.step(dt);
      s.frameCount += 1;
      s.averageSpeed = averageSpeed(simState.velocities);
      const settleVelocity = 0.02 + clamp(c.drapeCoefficient, 0, 1) * 0.03;
      s.settledPercent = clamp((1 - s.averageSpeed / settleVelocity) * 100, 0, 100);

      publishFabricState(n, ctx, s, simState);

      if (s.frameCount > 1 && s.settledPercent >= 99.5) {
        s.isSimulating = false;
        s.solver.setActive(false);
        s.settledPercent = 100;
        n.properties = { ...(n.properties ?? {}), fabricSettledPercent: 100 };
        ctx.emit?.('fabric:settled');
      }
    },
    onEvent(n: HSPlusNode, c: FabricSimulationConfig, ctx: TraitContext, e: TraitEvent) {
      const s = getFabricState(n);
      if (!s) return;
      if (e.type === 'fabric:start') {
        s.solver.reset();
        s.solver.setActive(true);
        s.solverConfig.wind = s.wind;
        s.isSimulating = true;
        s.frameCount = 0;
        s.settledPercent = 0;
        s.averageSpeed = 0;
        ctx.emit?.('fabric:simulating', {
          vertices: s.vertexCount,
          constraints: s.edgeCount,
          triangles: s.triangleCount,
        });
      }
      if (e.type === 'fabric:apply_wind') {
        const payload = parseWindPayload(e, c);
        const wind = windFromPayload(payload, c);
        const position = asVector3(payload.position, s.solver.getState().centerOfMass);
        const radius = finiteNumber(payload.radius, Math.max(s.clothWidth, s.clothHeight) * 1.5);

        s.wind = wind;
        s.solverConfig.wind = wind;
        s.solver.applyImpulse(position, wind, radius);
        s.isSimulating = true;
        s.solver.setActive(true);

        ctx.emit?.('fabric:wind_applied', {
          force: wind,
          radius,
          affectedVertices: s.vertexCount,
        });
      }
    },
  };
}

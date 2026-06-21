import { describe, expect, it } from 'vitest';
import {
  createFabricSimulationHandler,
  type FabricSimulationConfig,
} from '../FabricSimulationTrait';
import type { HSPlusNode, TraitContext } from '../types';

interface FabricEvent {
  event: string;
  payload?: unknown;
}

interface SolverState {
  positions: Float32Array;
  velocities: Float32Array;
}

interface FabricTestState {
  vertexCount: number;
  edgeCount: number;
  solver: {
    getState(): SolverState;
  };
  settledPercent: number;
  averageSpeed: number;
}

function createHarness(overrides: Partial<FabricSimulationConfig> = {}) {
  const handler = createFabricSimulationHandler();
  const events: FabricEvent[] = [];
  const context: TraitContext = {
    emit: (event, payload) => events.push({ event, payload }),
  };
  const node: HSPlusNode = { id: 'shawl-node', properties: {} };
  const config: FabricSimulationConfig = {
    ...handler.defaultConfig,
    vertexCount: 9,
    stiffness: 0.65,
    elasticity: 0.25,
    drapeCoefficient: 0.7,
    windResistance: 0,
    gravityScale: 1,
    collisionMargin: 0.01,
    ...overrides,
  };

  handler.onAttach(node, config, context);

  return { handler, events, context, node, config };
}

function fabricState(node: HSPlusNode): FabricTestState {
  const state = node.__fabricState as FabricTestState | undefined;
  if (!state) throw new Error('Expected fabric state to be attached');
  return state;
}

describe('FabricSimulationTrait', () => {
  it('allocates a PBD cloth body using the configured vertex count', () => {
    const { events, node } = createHarness({ vertexCount: 12 });
    const state = fabricState(node);

    expect(state.vertexCount).toBe(12);
    expect(state.edgeCount).toBeGreaterThan(0);
    expect(state.solver.getState().positions).toHaveLength(12 * 3);
    expect(node.properties?.fabricVertexPositions).toBeInstanceOf(Float32Array);
    expect(events[0]).toMatchObject({
      event: 'fabric:initialized',
      payload: { solver: 'PBDSolverCPU', vertices: 12 },
    });
  });

  it('steps solver positions instead of advancing settle from frame count only', () => {
    const { handler, context, node, config, events } = createHarness();
    const state = fabricState(node);
    const before = state.solver.getState().positions.slice();

    handler.onEvent(node, config, context, { type: 'fabric:start' });
    for (let i = 0; i < 8; i++) {
      handler.onUpdate(node, config, context, 1 / 60);
    }

    const after = state.solver.getState().positions;
    const dynamicVertexY = 4 * 3 + 1;
    expect(Math.abs(after[dynamicVertexY] - before[dynamicVertexY])).toBeGreaterThan(0.001);
    expect(state.averageSpeed).toBeGreaterThan(0);
    expect(state.settledPercent).toBeGreaterThanOrEqual(0);
    expect(state.settledPercent).toBeLessThan(100);
    expect(events.some((entry) => entry.event === 'fabric:stepped')).toBe(true);
  });

  it('applies wind as a solver impulse and exposes updated vertex deformation', () => {
    const { handler, context, node, config, events } = createHarness();
    const state = fabricState(node);

    handler.onEvent(node, config, context, { type: 'fabric:start' });
    const beforeX = state.solver.getState().positions[12];
    handler.onEvent(node, config, context, {
      type: 'fabric:apply_wind',
      payload: { force: [12, 0, 0], radius: 10 },
    });
    handler.onUpdate(node, config, context, 1 / 60);

    const after = state.solver.getState();
    expect(after.positions[12]).toBeGreaterThan(beforeX);
    expect(node.properties?.fabricVertexPositions).toBe(after.positions);
    expect(events.at(-2)).toMatchObject({
      event: 'fabric:wind_applied',
      payload: { force: [12, 0, 0], affectedVertices: 9 },
    });
  });
});

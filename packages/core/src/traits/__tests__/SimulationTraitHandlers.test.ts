import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockStepFn, mockDisposeFn, mockSolveFn } = vi.hoisted(() => ({
  mockStepFn: vi.fn(),
  mockDisposeFn: vi.fn(),
  mockSolveFn: vi.fn(),
}));

vi.mock('../SimulationSolverFactory', () => ({
  SimulationSolverFactory: {
    create: vi.fn().mockReturnValue({
      step: mockStepFn,
      dispose: mockDisposeFn,
      solve: mockSolveFn,
    }),
    register: vi.fn(),
    has: vi.fn(),
    types: vi.fn(() => []),
    clear: vi.fn(),
  },
}));

import {
  thermalSimulationHandler,
  structuralFEMHandler,
} from '../SimulationTraitHandlers';

import { SimulationSolverFactory } from '../SimulationSolverFactory';

function makeNode() {
  return {
    id: 'n1',
    traits: new Set(),
    emit: vi.fn(),
  } as any;
}

// ─── thermalSimulationHandler ────────────────────────────────────────────────

describe('thermalSimulationHandler', () => {
  let node: any;
  let ctx: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    node = makeNode();
    ctx = { emit: vi.fn() };
    vi.clearAllMocks();
    (SimulationSolverFactory.create as ReturnType<typeof vi.fn>).mockReturnValue({
      step: mockStepFn,
      dispose: mockDisposeFn,
    });
  });

  it('has name thermal_simulation', () => {
    expect(thermalSimulationHandler.name).toBe('thermal_simulation');
  });

  it('has defaultConfig with expected fields', () => {
    expect(thermalSimulationHandler.defaultConfig).toMatchObject({
      default_material: 'air',
    });
  });

  it('onAttach sets __thermalState with solver', () => {
    const cfg = thermalSimulationHandler.defaultConfig as any;
    thermalSimulationHandler.onAttach!(node, cfg, ctx as any);
    const state = node.__thermalState;
    expect(state).toBeDefined();
    expect(state.solver).toBeDefined();
    expect(state.isSimulating).toBe(true);
  });

  it('onAttach emits thermal_simulation_create', () => {
    const cfg = thermalSimulationHandler.defaultConfig as any;
    thermalSimulationHandler.onAttach!(node, cfg, ctx as any);
    expect(ctx.emit).toHaveBeenCalledWith('thermal_simulation_create', expect.anything());
  });

  it('onUpdate calls solver.step with delta/1000', () => {
    const cfg = thermalSimulationHandler.defaultConfig as any;
    thermalSimulationHandler.onAttach!(node, cfg, ctx as any);
    thermalSimulationHandler.onUpdate!(node, cfg, ctx as any, 16);
    expect(mockStepFn).toHaveBeenCalledWith(0.016);
  });

  it('onUpdate skips when not simulating', () => {
    node.__thermalState = { solver: null, isSimulating: false };
    const cfg = thermalSimulationHandler.defaultConfig as any;
    thermalSimulationHandler.onUpdate!(node, cfg, ctx as any, 16);
    expect(mockStepFn).not.toHaveBeenCalled();
  });

  it('onDetach calls dispose and clears state', () => {
    const cfg = thermalSimulationHandler.defaultConfig as any;
    thermalSimulationHandler.onAttach!(node, cfg, ctx as any);
    thermalSimulationHandler.onDetach!(node, cfg, ctx as any);
    expect(mockDisposeFn).toHaveBeenCalled();
    expect(node.__thermalState).toBeUndefined();
  });

  it('isSimulating=false when solver is null', () => {
    (SimulationSolverFactory.create as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
    const cfg = thermalSimulationHandler.defaultConfig as any;
    thermalSimulationHandler.onAttach!(node, cfg, ctx as any);
    const state = node.__thermalState;
    expect(state.isSimulating).toBe(false);
  });
});

// ─── structuralFEMHandler ────────────────────────────────────────────────────

describe('structuralFEMHandler', () => {
  let node: any;
  let ctx: { emit: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    node = makeNode();
    ctx = { emit: vi.fn() };
    vi.clearAllMocks();
    (SimulationSolverFactory.create as ReturnType<typeof vi.fn>).mockReturnValue({
      step: mockStepFn,
      dispose: mockDisposeFn,
      solve: mockSolveFn,
    });
  });

  it('has name structural_fem', () => {
    expect(structuralFEMHandler.name).toBe('structural_fem');
  });

  it('onAttach sets __structuralState', () => {
    const cfg = structuralFEMHandler.defaultConfig as any;
    structuralFEMHandler.onAttach!(node, cfg, ctx as any);
    const state = node.__structuralState;
    expect(state).toBeDefined();
    expect(state.solver).toBeDefined();
  });

  it('onAttach calls solve() immediately for static analysis', () => {
    const cfg = structuralFEMHandler.defaultConfig as any;
    structuralFEMHandler.onAttach!(node, cfg, ctx as any);
    expect(mockSolveFn).toHaveBeenCalled();
  });

  it('onDetach disposes solver and clears state', () => {
    const cfg = structuralFEMHandler.defaultConfig as any;
    structuralFEMHandler.onAttach!(node, cfg, ctx as any);
    structuralFEMHandler.onDetach!(node, cfg, ctx as any);
    expect(mockDisposeFn).toHaveBeenCalled();
    expect(node.__structuralState).toBeUndefined();
  });
});

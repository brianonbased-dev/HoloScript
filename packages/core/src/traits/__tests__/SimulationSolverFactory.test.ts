import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SimulationSolverFactory, type SimulationSolver } from '../SimulationSolverFactory';

describe('SimulationSolverFactory', () => {
  beforeEach(() => {
    SimulationSolverFactory.clear();
  });

  it('starts empty after clear()', () => {
    expect(SimulationSolverFactory.types()).toEqual([]);
  });

  it('register() adds a factory', () => {
    const factory = (_cfg: Record<string, unknown>): SimulationSolver => ({
      dispose: vi.fn(),
    });
    SimulationSolverFactory.register('thermal', factory);
    expect(SimulationSolverFactory.has('thermal')).toBe(true);
  });

  it('has() returns false for unregistered type', () => {
    expect(SimulationSolverFactory.has('nonexistent')).toBe(false);
  });

  it('types() lists registered types', () => {
    SimulationSolverFactory.register('thermal', (_) => ({ dispose: vi.fn() }));
    SimulationSolverFactory.register('structural', (_) => ({ dispose: vi.fn() }));
    const types = SimulationSolverFactory.types();
    expect(types).toContain('thermal');
    expect(types).toContain('structural');
    expect(types.length).toBe(2);
  });

  it('create() returns null for unregistered type', () => {
    const solver = SimulationSolverFactory.create('unknown', {});
    expect(solver).toBeNull();
  });

  it('create() calls factory and returns solver', () => {
    const factoryFn = vi.fn((_cfg: Record<string, unknown>): SimulationSolver => ({
      dispose: vi.fn(),
      step: vi.fn(),
    }));
    SimulationSolverFactory.register('hydraulic', factoryFn);
    const solver = SimulationSolverFactory.create('hydraulic', { pressure: 1.0 });
    expect(factoryFn).toHaveBeenCalledWith({ pressure: 1.0 });
    expect(solver).not.toBeNull();
    expect(typeof solver!.dispose).toBe('function');
  });

  it('create() passes config to factory', () => {
    let receivedConfig: Record<string, unknown> | null = null;
    SimulationSolverFactory.register('test_solver', (cfg) => {
      receivedConfig = cfg;
      return { dispose: vi.fn() };
    });
    SimulationSolverFactory.create('test_solver', { resolution: 64 });
    expect(receivedConfig).toEqual({ resolution: 64 });
  });

  it('clear() removes all registrations', () => {
    SimulationSolverFactory.register('thermal', (_) => ({ dispose: vi.fn() }));
    SimulationSolverFactory.clear();
    expect(SimulationSolverFactory.types()).toEqual([]);
    expect(SimulationSolverFactory.has('thermal')).toBe(false);
  });

  it('supports multiple registrations independently', () => {
    const disposeFn1 = vi.fn();
    const disposeFn2 = vi.fn();
    SimulationSolverFactory.register('a', (_) => ({ dispose: disposeFn1 }));
    SimulationSolverFactory.register('b', (_) => ({ dispose: disposeFn2 }));

    const solverA = SimulationSolverFactory.create('a', {});
    const solverB = SimulationSolverFactory.create('b', {});

    solverA!.dispose();
    expect(disposeFn1).toHaveBeenCalled();
    expect(disposeFn2).not.toHaveBeenCalled();

    solverB!.dispose();
    expect(disposeFn2).toHaveBeenCalled();
  });
});

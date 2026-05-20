/**
 * AffinityTrait — Unit tests
 *
 * Acceptance criteria:
 *  ✓ Handler registers under name 'affinity'
 *  ✓ onAttach: creates solver via SimulationSolverFactory (or gracefully falls back to null when factory not initialised)
 *  ✓ onUpdate: calls solver.step() with delta converted to seconds
 *  ✓ onDetach: calls solver.dispose() and cleans up node state
 *  ✓ Emits affinity_create / affinity_destroy events
 *  ✓ Handles missing solver gracefully (factory not registered in unit context)
 *  ✓ Default config values are applied
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { affinityHandler, type AffinityTraitConfig } from '../AffinityTrait';
import {
  createMockContext,
  createMockNode,
  type MockContext,
} from './traitTestHelpers';

// ─── Mock SimulationSolverFactory ─────────────────────────────────────────────
//
// Core must not import engine. In the unit-test environment the factory has no
// registered 'affinity-ode' creator, so create() returns null. We test that
// the handler is robust to a null solver AND also test the wired-solver path
// by injecting a mock factory.

vi.mock('../SimulationSolverFactory', () => {
  const mockSolver = {
    step: vi.fn(),
    dispose: vi.fn(),
    solve: vi.fn(),
  };

  return {
    SimulationSolverFactory: {
      create: vi.fn().mockReturnValue(mockSolver),
    },
    // Re-export the type so imports don't break
    get SimulationSolver() { return {}; },
  };
});

import { SimulationSolverFactory } from '../SimulationSolverFactory';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeNode() {
  return createMockNode() as unknown as Record<string, unknown>;
}

function makeCtx(): MockContext {
  return createMockContext();
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('affinityHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('is named "affinity"', () => {
    expect(affinityHandler.name).toBe('affinity');
  });

  it('has sensible default config', () => {
    const cfg = affinityHandler.defaultConfig as AffinityTraitConfig;
    expect(cfg.timeStep).toBe(0.1);
    expect(cfg.enableSternberg).toBe(false);
    expect(cfg.enableNashEffort).toBe(false);
    expect(cfg.agentIds).toEqual(['agent_R', 'agent_J']);
  });

  describe('onAttach', () => {
    it('calls SimulationSolverFactory.create with "affinity-ode"', () => {
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(node as never, {}, ctx as never);

      expect(SimulationSolverFactory.create).toHaveBeenCalledWith(
        'affinity-ode',
        expect.objectContaining({ timeStep: 0.1 })
      );
    });

    it('stores __affinityState on the node', () => {
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(node as never, {}, ctx as never);

      expect(node.__affinityState).toBeDefined();
      expect((node.__affinityState as { isRunning: boolean }).isRunning).toBe(true);
    });

    it('emits affinity_create event', () => {
      const node = makeNode();
      const ctx = makeCtx() as MockContext;
      affinityHandler.onAttach!(node as never, {}, ctx as never);

      const created = ctx.emittedEvents.find((e) => e.event === 'affinity_create');
      expect(created).toBeDefined();
      expect((created!.data as { node: unknown }).node).toBe(node);
    });

    it('passes enableNashEffort=true through to solver config', () => {
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(
        node as never,
        { enableNashEffort: true } as AffinityTraitConfig,
        ctx as never
      );

      const call = (SimulationSolverFactory.create as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(call[1].nashEffort.enabled).toBe(true);
    });

    it('passes archetypes to agents array', () => {
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(
        node as never,
        {
          agentIds: ['romeo', 'juliet'],
          archetypes: ['eager_beaver', 'hermit'],
        } as AffinityTraitConfig,
        ctx as never
      );

      const call = (SimulationSolverFactory.create as ReturnType<typeof vi.fn>).mock.calls[0];
      const agents = call[1].agents as Array<{ id: string; archetype: string }>;
      expect(agents[0].id).toBe('romeo');
      expect(agents[0].archetype).toBe('eager_beaver');
      expect(agents[1].id).toBe('juliet');
      expect(agents[1].archetype).toBe('hermit');
    });

    it('marks isRunning=false when factory returns null', () => {
      (SimulationSolverFactory.create as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(node as never, {}, ctx as never);

      const state = node.__affinityState as { isRunning: boolean };
      expect(state.isRunning).toBe(false);
    });
  });

  describe('onUpdate', () => {
    it('calls solver.step() with delta in seconds', () => {
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(node as never, {}, ctx as never);

      const mockSolver = (node.__affinityState as { solver: { step: ReturnType<typeof vi.fn> } }).solver;
      affinityHandler.onUpdate!(node as never, {}, ctx as never, 200);

      expect(mockSolver.step).toHaveBeenCalledWith(0.2);
    });

    it('is a no-op when solver is null', () => {
      (SimulationSolverFactory.create as ReturnType<typeof vi.fn>).mockReturnValueOnce(null);
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(node as never, {}, ctx as never);

      // Should not throw
      expect(() =>
        affinityHandler.onUpdate!(node as never, {}, ctx as never, 100)
      ).not.toThrow();
    });

    it('is a no-op when __affinityState is absent', () => {
      const node = makeNode();
      const ctx = makeCtx();
      // Do NOT attach — state is absent
      expect(() =>
        affinityHandler.onUpdate!(node as never, {}, ctx as never, 100)
      ).not.toThrow();
    });
  });

  describe('onDetach', () => {
    it('calls solver.dispose()', () => {
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(node as never, {}, ctx as never);

      const mockSolver = (node.__affinityState as { solver: { dispose: ReturnType<typeof vi.fn> } }).solver;
      affinityHandler.onDetach!(node as never, {}, ctx as never);

      expect(mockSolver.dispose).toHaveBeenCalled();
    });

    it('removes __affinityState from node', () => {
      const node = makeNode();
      const ctx = makeCtx();
      affinityHandler.onAttach!(node as never, {}, ctx as never);
      affinityHandler.onDetach!(node as never, {}, ctx as never);

      expect(node.__affinityState).toBeUndefined();
    });

    it('emits affinity_destroy event', () => {
      const node = makeNode();
      const ctx = makeCtx() as MockContext;
      affinityHandler.onAttach!(node as never, {}, ctx as never);
      affinityHandler.onDetach!(node as never, {}, ctx as never);

      const destroyed = ctx.emittedEvents.find((e) => e.event === 'affinity_destroy');
      expect(destroyed).toBeDefined();
      expect((destroyed!.data as { node: unknown }).node).toBe(node);
    });

    it('is a no-op when called without prior attach', () => {
      const node = makeNode();
      const ctx = makeCtx();
      expect(() =>
        affinityHandler.onDetach!(node as never, {}, ctx as never)
      ).not.toThrow();
    });
  });
});

/**
 * @evolve_program trait tests — the native gated-evolution authoring surface.
 * @see ../EvolveProgramTrait.ts
 */
import { describe, it, expect, vi } from 'vitest';
import { evolveProgramHandler } from '../EvolveProgramTrait';

describe('evolveProgramHandler (@evolve_program trait)', () => {
  it('registers under the unprefixed name with bounded-search defaults', () => {
    expect(evolveProgramHandler.name).toBe('evolve_program');
    expect(evolveProgramHandler.defaultConfig).toEqual({
      target: '',
      goal: '',
      fitnessGate: '',
      proposerModel: 'brittney-edge:v0-4',
      generations: 8,
      population: 4,
      archiveSize: 8,
    });
  });

  it('stashes the evolution policy and announces it gated + never-self-shipping', () => {
    const node: Record<string, unknown> = {};
    const emit = vi.fn();
    evolveProgramHandler.onAttach?.(
      node as never,
      {
        target: 'packages/core/src/compiler/WASMCompiler.ts',
        goal: 'shrink emitted WAT while all tests pass',
        fitnessGate: 'pnpm --filter @holoscript/core exec vitest run src/compiler/WASMCompiler.test.ts',
        proposerModel: 'brittney-edge:v0-4',
        generations: 6,
        population: 3,
        archiveSize: 8,
      },
      { emit } as never
    );
    expect(node.__evolveProgram).toEqual({
      target: 'packages/core/src/compiler/WASMCompiler.ts',
      goal: 'shrink emitted WAT while all tests pass',
      fitnessGate: 'pnpm --filter @holoscript/core exec vitest run src/compiler/WASMCompiler.test.ts',
      proposerModel: 'brittney-edge:v0-4',
      generations: 6,
      population: 3,
      archiveSize: 8,
    });
    // The two invariants the trait guarantees, surfaced on the declaration event.
    expect(emit).toHaveBeenCalledWith(
      'evolve_program_declared',
      expect.objectContaining({ node, gated: true, selfShips: false })
    );
  });

  it('fills bounded-search defaults when only target/goal/gate are declared', () => {
    const node: Record<string, unknown> = {};
    evolveProgramHandler.onAttach?.(
      node as never,
      { target: 't', goal: 'g', fitnessGate: 'cmd' },
      { emit: () => {} } as never
    );
    const policy = node.__evolveProgram as { proposerModel: string; generations: number };
    expect(policy.proposerModel).toBe('brittney-edge:v0-4');
    expect(policy.generations).toBe(8);
  });

  it('clears the policy on detach', () => {
    const node: Record<string, unknown> = { __evolveProgram: { target: 't' } };
    evolveProgramHandler.onDetach?.(node as never, {} as never, { emit: () => {} } as never);
    expect(node.__evolveProgram).toBeUndefined();
  });
});

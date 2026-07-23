import { describe, expect, it } from 'vitest';
import { createSemanticClosureReceipt, type SemanticClosureEntry } from '../semantic-closure';

const stages = {
  parsed: { status: 'passed' as const },
  typed: { status: 'passed' as const },
  lowered: { status: 'passed' as const },
  enforced: { status: 'passed' as const },
  executed: { status: 'passed' as const },
  target_preserved: { status: 'passed' as const },
};

function entry(
  constructId: string,
  surface: SemanticClosureEntry['surface']
): SemanticClosureEntry {
  return {
    constructId,
    surface,
    kind: 'fixture',
    stages,
  };
}

describe('semantic closure receipt', () => {
  it('fails closed when an admitted construct is not reported', () => {
    expect(() =>
      createSemanticClosureReceipt({
        sourceDigest: 'sha256:fixture',
        toolchain: 'test',
        target: 'holo-vm',
        expectedConstructs: ['main.holo#world', 'agent.hsplus#brain'],
        entries: [entry('main.holo#world', '.holo')],
      })
    ).toThrow(/unreported construct.*agent\.hsplus#brain/i);
  });

  it('requires a diagnostic and reason for every deferred stage', () => {
    const incomplete: SemanticClosureEntry = {
      ...entry('agent.hsplus#brain', '.hsplus'),
      stages: {
        ...stages,
        executed: { status: 'deferred' },
      },
    };

    expect(() =>
      createSemanticClosureReceipt({
        sourceDigest: 'sha256:fixture',
        toolchain: 'test',
        target: 'cognitive-vm',
        expectedConstructs: [incomplete.constructId],
        entries: [incomplete],
      })
    ).toThrow(/deferred.*reason.*diagnostic/i);
  });

  it('sorts entries deterministically and derives a complete summary', () => {
    const receipt = createSemanticClosureReceipt({
      sourceDigest: 'sha256:fixture',
      toolchain: 'test',
      target: 'triad',
      expectedConstructs: ['policy.hs#decide', 'main.holo#world', 'agent.hsplus#brain'],
      entries: [
        entry('policy.hs#decide', '.hs'),
        entry('main.holo#world', '.holo'),
        entry('agent.hsplus#brain', '.hsplus'),
      ],
    });

    expect(receipt.schemaVersion).toBe('holoscript.semantic-closure-receipt.v1');
    expect(receipt.entries.map((item) => item.constructId)).toEqual([
      'agent.hsplus#brain',
      'main.holo#world',
      'policy.hs#decide',
    ]);
    expect(receipt.summary).toEqual({
      totalConstructs: 3,
      passedStages: 18,
      deferredStages: 0,
      rejectedStages: 0,
      notApplicableStages: 0,
      complete: true,
      allStagesPassed: true,
    });
  });

  it('records an honest, incomplete receipt when a target defers semantics', () => {
    const deferred: SemanticClosureEntry = {
      ...entry('policy.hs#effect', '.hs'),
      stages: {
        ...stages,
        executed: {
          status: 'deferred',
          diagnosticCode: 'HS-CLOSURE-EXEC-001',
          reason: 'native effect ABI is not available for this effect',
        },
        target_preserved: { status: 'not_applicable', reason: 'execution was deferred' },
      },
    };

    const receipt = createSemanticClosureReceipt({
      sourceDigest: 'sha256:fixture',
      toolchain: 'test',
      target: 'native',
      expectedConstructs: [deferred.constructId],
      entries: [deferred],
    });

    expect(receipt.summary).toMatchObject({
      totalConstructs: 1,
      deferredStages: 1,
      notApplicableStages: 1,
      complete: false,
      allStagesPassed: false,
    });
  });

  it('distinguishes structurally complete receipts from all-stage preservation', () => {
    const spatial: SemanticClosureEntry = {
      ...entry('main.holo#object:Beacon', '.holo'),
      stages: {
        ...stages,
        executed: {
          status: 'not_applicable',
          reason: 'the cognitive target does not instantiate spatial objects',
        },
      },
    };

    const receipt = createSemanticClosureReceipt({
      sourceDigest: 'sha256:fixture',
      toolchain: 'test',
      target: 'cognitive-vm',
      expectedConstructs: [spatial.constructId],
      entries: [spatial],
    });

    expect(receipt.summary).toMatchObject({
      complete: true,
      allStagesPassed: false,
      notApplicableStages: 1,
    });
  });
});

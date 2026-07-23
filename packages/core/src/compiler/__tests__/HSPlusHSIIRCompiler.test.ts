import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { runExactTrace } from '../HSIExactTrace';
import { HSIAdmissionError, type HSIScenarioStep } from '../HSIIRTypes';
import { lowerHSPlusProgramToHSIIR } from '../HSPlusHSIIRCompiler';

const FIXTURE_PATH = new URL(
  '../../../../../examples/hsplus-systems-component/resilient-worker.hsplus',
  import.meta.url
);

const SCENARIO: HSIScenarioStep[] = [
  { kind: 'fire-trigger', machine: 'ResilientWorker', input: 'start' },
  { kind: 'set-input', machine: 'ResilientWorker', input: 'failures', value: 3 },
  { kind: 'fire-trigger', machine: 'ResilientWorker', input: 'reset' },
];

function fixture(): string {
  return readFileSync(FIXTURE_PATH, 'utf8');
}

describe('HSPlus HSI-IR systems-component lowering', () => {
  it('lowers typed .hsplus state-machine source through the canonical parser', () => {
    const ir = lowerHSPlusProgramToHSIIR(fixture());

    expect(ir.world.name).toBe('ResilientWorker');
    expect(ir.provenance.sourceSurface).toBe('hsplus');
    expect(ir.entities).toEqual([]);
    expect(ir.state).toEqual([]);
    expect(ir.machines).toHaveLength(1);
    expect(ir.machines[0]).toMatchObject({
      name: 'ResilientWorker',
      initialState: 'idle',
      states: ['idle', 'open', 'running'],
      inputs: [
        expect.objectContaining({ name: 'start', inputType: 'trigger', baseline: false }),
        expect.objectContaining({ name: 'reset', inputType: 'trigger', baseline: false }),
        expect.objectContaining({ name: 'failures', inputType: 'int', baseline: 0 }),
      ],
    });
    expect(ir.machines[0]?.transitions.map((transition) => transition.reads)).toEqual([
      ['start'],
      ['failures'],
      ['reset'],
    ]);
  });

  it('executes a deterministic exact trace without a host-JavaScript body', () => {
    const source = fixture();
    const firstIR = lowerHSPlusProgramToHSIIR(source);
    const secondIR = lowerHSPlusProgramToHSIIR(source);
    const first = runExactTrace(firstIR, SCENARIO);
    const second = runExactTrace(secondIR, SCENARIO);

    expect(firstIR.provenance.deterministicDigest).toBe(secondIR.provenance.deterministicDigest);
    expect(first.deterministicDigest).toBe(second.deterministicDigest);
    expect(first.steps.map((step) => step.transitions[0]?.to)).toEqual(['running', 'open', 'idle']);
    expect(first.final.machineStates).toEqual({ ResilientWorker: 'idle' });
    expect(first.valid).toBe(true);
  });

  it('enforces declared input types at the exact-trace boundary', () => {
    const ir = lowerHSPlusProgramToHSIIR(fixture());

    expect(() =>
      runExactTrace(ir, [
        {
          kind: 'set-input',
          machine: 'ResilientWorker',
          input: 'failures',
          value: false,
        },
      ])
    ).toThrowError(/input-type/);
    expect(() =>
      runExactTrace(ir, [
        {
          kind: 'set-input',
          machine: 'ResilientWorker',
          input: 'start',
          value: true,
        },
      ])
    ).toThrowError(/trigger-step-kind/);
  });

  it('rejects an undeclared initial state', () => {
    const mutated = fixture().replace('initial: idle', 'initial: missing');
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(/unknown-initial-state/);
  });

  it('rejects duplicate states before object-key normalization can hide them', () => {
    const mutated = fixture().replace('state running {}', 'state idle {}\n  state running {}');
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(/duplicate-state/);
  });

  it('rejects a typed input whose default has the wrong type', () => {
    const mutated = fixture().replace('input failures: int = 0', 'input failures: int = "zero"');
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(/input-default-type/);
  });

  it('rejects a transition guard that reads an undeclared slot', () => {
    const mutated = fixture().replace('failures >= 3', 'missing >= 3');
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(/unknown-slot/);
  });

  it('rejects unsupported top-level constructs instead of partially lowering them', () => {
    const mutated = `${fixture()}\nobject Probe { status: "unlowered" }\n`;
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(HSIAdmissionError);
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(/unsupported-top-level/);
  });

  it('rejects unknown machine syntax instead of accepting parser-erased semantics', () => {
    const mutated = fixture().replace('initial: idle', 'initial: idle\n  mystery: true');
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(
      /Unsupported state_machine declaration 'mystery'/
    );
  });

  it('rejects unknown state syntax instead of accepting parser-erased semantics', () => {
    const mutated = fixture().replace('state idle {}', 'state idle { mystery: true }');
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(
      /Unsupported state declaration 'mystery'/
    );
  });

  it('rejects unknown transition clauses instead of accepting parser-erased semantics', () => {
    const mutated = fixture().replace(
      'idle -> running when start',
      'idle -> running whenever start'
    );
    expect(() => lowerHSPlusProgramToHSIIR(mutated)).toThrowError(
      /Unsupported state transition clause 'whenever'/
    );
  });
});

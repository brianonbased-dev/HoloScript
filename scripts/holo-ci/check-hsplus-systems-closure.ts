#!/usr/bin/env tsx
/**
 * Product tracer for the first ordinary systems-component `.hsplus` lowering:
 *
 *   canonical parser -> shared sovereign HSI-IR -> exact deterministic trace
 *
 * Usage:
 *   pnpm check:hsplus-systems-closure
 *   pnpm check:hsplus-systems-closure:test
 *   pnpm check:hsplus-systems-closure -- --json
 *   pnpm check:hsplus-systems-closure -- --receipt .scratch/hsplus-systems.json
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runExactTrace } from '../../packages/core/src/compiler/HSIExactTrace';
import { lowerHSPlusProgramToHSIIR } from '../../packages/core/src/compiler/HSPlusHSIIRCompiler';
import {
  HSIAdmissionError,
  hsiStableStringify,
  type HSIScenarioStep,
} from '../../packages/core/src/compiler/HSIIRTypes';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_SOURCE = resolve(
  REPO_ROOT,
  'examples/hsplus-systems-component/resilient-worker.hsplus'
);
const SCHEMA_VERSION = 'holoscript.hsplus-systems-closure.v1' as const;

const SCENARIO: HSIScenarioStep[] = [
  { kind: 'fire-trigger', machine: 'ResilientWorker', input: 'start' },
  { kind: 'set-input', machine: 'ResilientWorker', input: 'failures', value: 3 },
  { kind: 'fire-trigger', machine: 'ResilientWorker', input: 'reset' },
];

interface CliOptions {
  sourcePath: string;
  receiptPath?: string;
  json: boolean;
  selfTest: boolean;
}

interface RejectionReceipt {
  mutation: string;
  error: string;
}

interface ClosureReceipt {
  schemaVersion: typeof SCHEMA_VERSION;
  source: string;
  sourceDigest: string;
  irDigest: string;
  traceDigest: string;
  executionPlane: 'HSIExactTrace/evaluateExpressionIR';
  machine: {
    name: string;
    inputs: Array<{ name: string; type: string; baseline: unknown }>;
    states: string[];
  };
  scenario: HSIScenarioStep[];
  transitions: Array<{ from: string; to: string }>;
  finalMachineStates: Record<string, string>;
  deterministicReplay: true;
  declaredUnknowns: string[];
  rejectedMutations?: RejectionReceipt[];
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalized(path: string): string {
  return path.split(sep).join('/');
}

function parseCli(argv: string[]): CliOptions {
  const valueAfter = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    const value = argv[index + 1];
    invariant(value && !value.startsWith('--'), `${flag} requires a value`);
    return value;
  };

  const receipt = valueAfter('--receipt');
  return {
    sourcePath: resolve(valueAfter('--source') ?? DEFAULT_SOURCE),
    receiptPath: receipt ? resolve(receipt) : undefined,
    json: argv.includes('--json'),
    selfTest: argv.includes('--self-test'),
  };
}

function expectRejected(mutation: string, source: string, pattern: RegExp): RejectionReceipt {
  try {
    lowerHSPlusProgramToHSIIR(source);
  } catch (error) {
    invariant(error instanceof HSIAdmissionError, `${mutation} threw a non-admission error`);
    invariant(
      pattern.test(error.message),
      `${mutation} failed for the wrong reason: ${error.message}`
    );
    return { mutation, error: error.message };
  }
  throw new Error(`${mutation} was admitted`);
}

function runSelfTests(source: string): RejectionReceipt[] {
  const rejected = [
    expectRejected(
      'undeclared-initial-state',
      source.replace('initial: idle', 'initial: missing'),
      /unknown-initial-state/
    ),
    expectRejected(
      'wrong-typed-default',
      source.replace('input failures: int = 0', 'input failures: int = "zero"'),
      /input-default-type/
    ),
    expectRejected(
      'unknown-guard-slot',
      source.replace('failures >= 3', 'missing >= 3'),
      /unknown-slot/
    ),
    expectRejected(
      'unsupported-top-level-object',
      `${source}\nobject Probe { status: "unlowered" }\n`,
      /unsupported-top-level/
    ),
    expectRejected(
      'parser-erased-machine-clause',
      source.replace('initial: idle', 'initial: idle\n  mystery: true'),
      /Unsupported state_machine declaration 'mystery'/
    ),
    expectRejected(
      'host-lifecycle-code',
      source.replace('state idle {}', 'state idle { on_entry { unsafe() } }'),
      /lifecycle code outside the sovereign subset/
    ),
  ];

  const ir = lowerHSPlusProgramToHSIIR(source);
  try {
    runExactTrace(ir, [
      {
        kind: 'set-input',
        machine: 'ResilientWorker',
        input: 'failures',
        value: false,
      },
    ]);
  } catch (error) {
    invariant(error instanceof HSIAdmissionError, 'runtime-input-type threw a non-admission error');
    invariant(
      /input-type/.test(error.message),
      `runtime-input-type failed for the wrong reason: ${error.message}`
    );
    rejected.push({ mutation: 'runtime-input-type', error: error.message });
    return rejected;
  }
  throw new Error('runtime-input-type was admitted');
}

function buildReceipt(sourcePath: string, selfTest: boolean): ClosureReceipt {
  const source = readFileSync(sourcePath, 'utf8');
  const firstIR = lowerHSPlusProgramToHSIIR(source);
  const secondIR = lowerHSPlusProgramToHSIIR(source);
  invariant(
    hsiStableStringify(firstIR) === hsiStableStringify(secondIR),
    'same source produced different HSI-IR'
  );
  invariant(firstIR.provenance.sourceSurface === 'hsplus', 'source surface was not retained');
  invariant(firstIR.machines.length === 1, 'fixture must lower exactly one machine');
  invariant(
    firstIR.entities.length === 0 &&
      firstIR.relations.length === 0 &&
      firstIR.state.length === 0 &&
      firstIR.eventHandlers.length === 0 &&
      firstIR.predicates.length === 0,
    'unsupported world semantics were silently synthesized'
  );

  const machine = firstIR.machines[0]!;
  invariant(machine.name === 'ResilientWorker', 'unexpected machine name');
  invariant(machine.initialState === 'idle', 'unexpected initial state');
  invariant(
    hsiStableStringify(machine.states) === hsiStableStringify(['idle', 'open', 'running']),
    'unexpected state inventory'
  );

  const firstTrace = runExactTrace(firstIR, SCENARIO);
  const secondTrace = runExactTrace(secondIR, SCENARIO);
  invariant(
    hsiStableStringify(firstTrace) === hsiStableStringify(secondTrace),
    'same IR and scenario produced different exact traces'
  );
  invariant(firstTrace.valid, 'exact trace is invalid');

  const transitions = firstTrace.steps.flatMap((step) =>
    step.transitions.map(({ from, to }) => ({ from, to }))
  );
  invariant(
    hsiStableStringify(transitions) ===
      hsiStableStringify([
        { from: 'idle', to: 'running' },
        { from: 'running', to: 'open' },
        { from: 'open', to: 'idle' },
      ]),
    'observed transition trace does not match the systems contract'
  );
  invariant(
    firstTrace.final.machineStates.ResilientWorker === 'idle',
    'worker did not reset to idle'
  );

  const relativeSource = relative(REPO_ROOT, sourcePath);
  const receipt: ClosureReceipt = {
    schemaVersion: SCHEMA_VERSION,
    source:
      relativeSource.length > 0 && !relativeSource.startsWith('..')
        ? normalized(relativeSource)
        : normalized(sourcePath),
    sourceDigest: firstIR.world.sourceDigest,
    irDigest: firstIR.provenance.deterministicDigest,
    traceDigest: firstTrace.deterministicDigest,
    executionPlane: 'HSIExactTrace/evaluateExpressionIR',
    machine: {
      name: machine.name,
      inputs: machine.inputs.map((input) => ({
        name: input.name,
        type: input.inputType,
        baseline: input.baseline,
      })),
      states: machine.states,
    },
    scenario: SCENARIO,
    transitions,
    finalMachineStates: firstTrace.final.machineStates,
    deterministicReplay: true,
    declaredUnknowns: firstIR.declaredUnknowns,
  };
  if (selfTest) receipt.rejectedMutations = runSelfTests(source);
  return receipt;
}

function main(): void {
  const options = parseCli(process.argv.slice(2));
  const receipt = buildReceipt(options.sourcePath, options.selfTest);
  const serialized = `${JSON.stringify(receipt, null, 2)}\n`;

  if (options.receiptPath) {
    mkdirSync(dirname(options.receiptPath), { recursive: true });
    writeFileSync(options.receiptPath, serialized, 'utf8');
  }

  if (options.json) {
    process.stdout.write(serialized);
    return;
  }

  console.log(
    `[hsplus-systems-closure] PASS ${receipt.machine.name}: ` +
      `${receipt.transitions.map(({ from, to }) => `${from}->${to}`).join(', ')}`
  );
  console.log(`[hsplus-systems-closure] IR ${receipt.irDigest}`);
  console.log(`[hsplus-systems-closure] trace ${receipt.traceDigest}`);
  if (receipt.rejectedMutations) {
    console.log(
      `[hsplus-systems-closure] rejected ${receipt.rejectedMutations.length} adversarial mutations`
    );
  }
  if (options.receiptPath) {
    console.log(`[hsplus-systems-closure] receipt ${normalized(options.receiptPath)}`);
  }
}

main();

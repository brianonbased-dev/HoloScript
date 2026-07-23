#!/usr/bin/env tsx
/**
 * One product tracer for HoloScript's three canonical source surfaces.
 *
 * The gate proves a checked-in `.holo` composition, `.hsplus` agent brain, and
 * `.hs` decision kernel as one executable system. It deliberately records
 * honest deferrals in HoloMeaning instead of treating "parsed" as "worked".
 *
 * Usage:
 *   pnpm check:three-surface-closure
 *   pnpm check:three-surface-closure -- --self-test
 *   pnpm check:three-surface-closure -- --receipt .scratch/three-surface.json
 *   pnpm check:three-surface-closure -- --require-complete
 */

import { createHash } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { delimiter, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

import {
  UaalBehaviorCompiler,
  resolveUaalBehaviorOperand,
} from '../../packages/core/src/compiler/UaalBehaviorCompiler';
import { HoloCompositionParser } from '../../packages/core/src/parser/HoloCompositionParser';
import {
  HoloScriptPlusParser,
  preprocessAgentBrainSource,
  type HoloBrainDecl,
} from '../../packages/core/src/parser/HoloScriptPlusParser';
import { checkToolAllowed } from '../../packages/core/src/traits/FrameDeclarationTrait';
import { loadBrain } from '../../packages/holoscript-agent/src/brain';
import { augmentWithOnTaskCognition } from '../../packages/holoscript-agent/src/cognitive-verbs';
import { evaluateReflectGate } from '../../packages/holoscript-agent/src/reflect-evaluator';
import {
  createSemanticClosureReceipt,
  type SemanticClosureEntry,
  type SemanticClosureReceipt,
  type SemanticClosureStageResult,
} from '../../packages/meaning/src/semantic-closure';
import { UAALOpCode } from '../../packages/uaal/src/opcodes';
import type { UAALBytecode, UAALOperand } from '../../packages/uaal/src/opcodes';
import { UAALVirtualMachine } from '../../packages/uaal/src/vm';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const DEFAULT_PROJECT_DIR = resolve(REPO_ROOT, 'examples/three-surface-agent');
const COMPILER_WASM_MANIFEST = resolve(REPO_ROOT, 'packages/compiler-wasm/Cargo.toml');
const COMPILER_NATIVE_MANIFEST = resolve(REPO_ROOT, 'packages/compiler-native/Cargo.toml');
const WASM_NODE_MODULE = resolve(REPO_ROOT, 'packages/compiler-wasm/pkg-node/holoscript_wasm.js');
const TAG = '[three-surface-closure]';
const RUST_COMPILE_TIMEOUT_MS = 300_000;
const NATIVE_EXECUTION_TIMEOUT_MS = 10_000;

type SurfaceEntryKey = 'composition' | 'agent' | 'logic';
type BindingKind = 'event' | 'decision' | 'effect';
type ThreeSurfaceBinding = ThreeSurfaceProjectManifest['bindings'][number];

interface ThreeSurfaceProjectManifest {
  schemaVersion: 'holoscript.project.v1';
  name: string;
  entries: Record<SurfaceEntryKey, string>;
  bindings: Array<{ from: string; to: string; kind: BindingKind }>;
  expected: {
    /** Independent admission inventory; never derived from emitted evidence. */
    constructs: string[];
    /** Exact per-target exclusions permitted by the strict product gate. */
    notApplicableStages: string[];
    state: Record<string, boolean | number | string | null>;
    events: string[];
  };
}

interface RustFunctionNode {
  type: 'Function';
  name: string;
  params?: string[];
  param_types?: Array<string | null>;
  return_type?: string | null;
}

interface RustProgram {
  type: 'Program';
  body: Array<RustFunctionNode | { type: 'Export'; declaration: RustFunctionNode }>;
}

interface ThreeSurfaceObservation {
  holo: {
    state: Record<string, UAALOperand>;
    events: string[];
    instructions: number;
    injectedEffects: number;
  };
  hsplus: {
    brain: string;
    version?: string;
    targets: string[];
    cognitiveActions: string[];
    decisionSignal: number;
    runtimeEvents: string[];
    frameAllowedProbe: boolean;
    frameDeniedProbe: string;
  };
  hs: {
    functions: string[];
    instructions: number;
    nativeResult: number;
    cognitiveResult: UAALOperand;
  };
}

interface ThreeSurfaceClosureReport {
  schemaVersion: 'holoscript.three-surface-closure.v1';
  project: string;
  sourceDigest: string;
  entries: Record<SurfaceEntryKey, string>;
  bindings: ThreeSurfaceProjectManifest['bindings'];
  observed: ThreeSurfaceObservation;
  semanticClosure: SemanticClosureReceipt;
}

interface LoadedProject {
  projectDir: string;
  manifestPath: string;
  manifestRaw: string;
  manifest: ThreeSurfaceProjectManifest;
  paths: Record<SurfaceEntryKey, string>;
  sources: Record<SurfaceEntryKey, string>;
}

interface CliOptions {
  projectDir: string;
  receiptPath?: string;
  json: boolean;
  selfTest: boolean;
  requireComplete: boolean;
}

const PASSED: SemanticClosureStageResult = { status: 'passed' };

function notApplicable(reason: string): SemanticClosureStageResult {
  return { status: 'not_applicable', reason };
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function normalized(path: string): string {
  return path.split(sep).join('/');
}

function parseCli(argv: string[]): CliOptions {
  const readValue = (flag: string): string | undefined => {
    const index = argv.indexOf(flag);
    if (index < 0) return undefined;
    const value = argv[index + 1];
    invariant(value && !value.startsWith('--'), `${flag} requires a value`);
    return value;
  };

  return {
    projectDir: resolve(readValue('--project') ?? DEFAULT_PROJECT_DIR),
    receiptPath: readValue('--receipt'),
    json: argv.includes('--json'),
    selfTest: argv.includes('--self-test'),
    requireComplete: argv.includes('--require-complete'),
  };
}

function validateManifest(value: unknown): asserts value is ThreeSurfaceProjectManifest {
  invariant(value !== null && typeof value === 'object', 'project manifest must be an object');
  const manifest = value as Partial<ThreeSurfaceProjectManifest>;
  invariant(
    manifest.schemaVersion === 'holoscript.project.v1',
    'project manifest must use holoscript.project.v1'
  );
  invariant(
    typeof manifest.name === 'string' && manifest.name.length > 0,
    'project name is required'
  );
  invariant(
    manifest.entries !== null && typeof manifest.entries === 'object',
    'entries are required'
  );

  const expectedExtensions: Record<SurfaceEntryKey, string> = {
    composition: '.holo',
    agent: '.hsplus',
    logic: '.hs',
  };
  for (const key of Object.keys(expectedExtensions) as SurfaceEntryKey[]) {
    const entry = manifest.entries?.[key];
    invariant(typeof entry === 'string' && entry.length > 0, `entries.${key} is required`);
    invariant(
      entry.endsWith(expectedExtensions[key]),
      `entries.${key} must end in ${expectedExtensions[key]}`
    );
  }

  invariant(Array.isArray(manifest.bindings), 'bindings must be an array');
  invariant(manifest.bindings.length === 3, 'the triad must declare exactly three bindings');
  const kinds = new Set(manifest.bindings.map((binding) => binding.kind));
  for (const kind of ['event', 'decision', 'effect'] as const) {
    invariant(kinds.has(kind), `the triad is missing its ${kind} binding`);
  }

  invariant(
    manifest.expected !== null && typeof manifest.expected === 'object',
    'expected observations are required'
  );
  invariant(
    manifest.expected?.state !== null && typeof manifest.expected?.state === 'object',
    'expected.state must be an object'
  );
  invariant(Array.isArray(manifest.expected?.events), 'expected.events must be an array');
  invariant(
    Array.isArray(manifest.expected?.constructs) &&
      manifest.expected.constructs.length > 0 &&
      manifest.expected.constructs.every(
        (construct) => typeof construct === 'string' && construct.length > 0
      ),
    'expected.constructs must be a non-empty string inventory'
  );
  invariant(
    new Set(manifest.expected.constructs).size === manifest.expected.constructs.length,
    'expected.constructs must not contain duplicates'
  );
  invariant(
    Array.isArray(manifest.expected.notApplicableStages) &&
      manifest.expected.notApplicableStages.every(
        (stage) => typeof stage === 'string' && stage.length > 0
      ),
    'expected.notApplicableStages must be a string inventory'
  );
  invariant(
    new Set(manifest.expected.notApplicableStages).size ===
      manifest.expected.notApplicableStages.length,
    'expected.notApplicableStages must not contain duplicates'
  );
}

function resolveProjectFile(projectDir: string, entry: string): string {
  invariant(!isAbsolute(entry), `project entry must be relative: ${entry}`);
  const resolved = resolve(projectDir, entry);
  const withinProject = relative(projectDir, resolved);
  invariant(
    withinProject.length > 0 && !withinProject.startsWith('..') && !isAbsolute(withinProject),
    `project entry escapes the project directory: ${entry}`
  );
  invariant(existsSync(resolved), `project entry does not exist: ${entry}`);
  return resolved;
}

function loadProject(projectDir: string): LoadedProject {
  const manifestPath = resolve(projectDir, 'holoscript.project.json');
  invariant(existsSync(manifestPath), `project manifest not found: ${manifestPath}`);
  const manifestRaw = readFileSync(manifestPath, 'utf8');
  const parsed = JSON.parse(manifestRaw) as unknown;
  validateManifest(parsed);

  const paths = Object.fromEntries(
    (Object.keys(parsed.entries) as SurfaceEntryKey[]).map((key) => [
      key,
      resolveProjectFile(projectDir, parsed.entries[key]),
    ])
  ) as Record<SurfaceEntryKey, string>;
  const sources = Object.fromEntries(
    (Object.keys(paths) as SurfaceEntryKey[]).map((key) => [key, readFileSync(paths[key], 'utf8')])
  ) as Record<SurfaceEntryKey, string>;

  return { projectDir, manifestPath, manifestRaw, manifest: parsed, paths, sources };
}

function computeSourceDigest(project: LoadedProject): string {
  const hash = createHash('sha256');
  hash.update('holoscript.three-surface-source.v1\0');
  hash.update(project.manifestRaw);
  for (const key of (Object.keys(project.paths) as SurfaceEntryKey[]).sort()) {
    hash.update(`\0${key}:${project.manifest.entries[key]}\0`);
    hash.update(project.sources[key]);
  }
  return `sha256:${hash.digest('hex')}`;
}

function resolveCargoCommand(): string {
  const names = process.platform === 'win32' ? ['cargo.exe', 'cargo.cmd', 'cargo.bat'] : ['cargo'];
  const fromPath = (process.env.PATH ?? '')
    .split(delimiter)
    .filter(Boolean)
    .flatMap((entry) => names.map((name) => resolve(entry, name)));
  const userHome = process.env.USERPROFILE ?? process.env.HOME ?? '';
  const homeFallback = userHome
    ? [
        resolve(
          userHome,
          process.platform === 'win32' ? '.cargo/bin/cargo.exe' : '.cargo/bin/cargo'
        ),
      ]
    : [];
  const candidates = [process.env.CARGO, ...fromPath, ...homeFallback].filter(
    (candidate): candidate is string => Boolean(candidate)
  );
  return candidates.find((candidate) => existsSync(candidate)) ?? 'cargo';
}

function compileHsToUaal(source: string): UAALBytecode {
  const stdout = execFileSync(
    resolveCargoCommand(),
    ['run', '--quiet', '--manifest-path', COMPILER_WASM_MANIFEST, '--bin', 'compile_to_uaal'],
    {
      cwd: REPO_ROOT,
      input: source,
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      timeout: RUST_COMPILE_TIMEOUT_MS,
    }
  );
  const result = JSON.parse(stdout.trim()) as UAALBytecode | { error: string };
  invariant(!('error' in result), `Rust .hs -> UAAL lowering failed: ${result.error}`);
  return result;
}

function executeHsNatively(sourcePath: string, sourceOverride?: string): number {
  const scratchDir = mkdtempSync(join(tmpdir(), 'holoscript-three-surface-'));
  const executablePath = join(
    scratchDir,
    process.platform === 'win32' ? 'three-surface-policy.exe' : 'three-surface-policy'
  );
  const compilerSourcePath =
    sourceOverride === undefined ? sourcePath : join(scratchDir, 'three-surface-policy.hs');

  try {
    if (sourceOverride !== undefined) {
      writeFileSync(compilerSourcePath, sourceOverride, 'utf8');
    }
    execFileSync(
      resolveCargoCommand(),
      [
        'run',
        '--quiet',
        '--manifest-path',
        COMPILER_NATIVE_MANIFEST,
        '--bin',
        'holoscriptc',
        '--',
        compilerSourcePath,
        '-o',
        executablePath,
      ],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        timeout: RUST_COMPILE_TIMEOUT_MS,
      }
    );
    const execution = spawnSync(executablePath, [], {
      cwd: scratchDir,
      encoding: 'utf8',
      timeout: NATIVE_EXECUTION_TIMEOUT_MS,
    });
    if (execution.error) throw execution.error;
    invariant(!execution.signal, `native .hs executable terminated by ${execution.signal}`);
    invariant(execution.status !== null, 'native .hs executable did not report an exit status');
    return execution.status;
  } finally {
    rmSync(scratchDir, { recursive: true, force: true });
  }
}

function loadRustProgram(source: string): { program: RustProgram; compilerVersion: string } {
  invariant(existsSync(WASM_NODE_MODULE), `tracked WASM parser not found: ${WASM_NODE_MODULE}`);
  const require = createRequire(import.meta.url);
  const wasm = require(WASM_NODE_MODULE) as {
    parse(source: string): string;
    validate_detailed(source: string): string;
    version(): string;
  };
  const validation = JSON.parse(wasm.validate_detailed(source)) as {
    valid?: boolean;
    errors?: Array<{ code?: string; message?: string }>;
  };
  invariant(
    validation.valid === true && (validation.errors?.length ?? 0) === 0,
    `canonical WASM .hs semantic validation failed: ${JSON.stringify(validation.errors ?? [])}`
  );
  const parsed = JSON.parse(wasm.parse(source)) as
    | RustProgram
    | { error?: string; errors?: unknown[] };
  invariant(!('error' in parsed), `canonical WASM .hs parser failed: ${parsed.error}`);
  invariant(
    !('errors' in parsed) || !Array.isArray(parsed.errors) || parsed.errors.length === 0,
    `canonical WASM .hs parser returned errors: ${JSON.stringify(parsed.errors)}`
  );
  invariant(
    parsed.type === 'Program' && Array.isArray(parsed.body),
    'canonical .hs AST is malformed'
  );
  return { program: parsed, compilerVersion: wasm.version() };
}

function rustFunctions(program: RustProgram): RustFunctionNode[] {
  return program.body.map((node) => (node.type === 'Export' ? node.declaration : node));
}

function readDecisionSignal(actions: HoloBrainDecl['states'][number]['cognitiveActions']): number {
  const planAction = actions?.find((action) => action.verb === 'plan');
  invariant(planAction, '.hsplus on_task must carry a typed plan action');
  const state = planAction.config.state;
  invariant(
    state !== null && typeof state === 'object' && !Array.isArray(state),
    '.hsplus plan must declare an object-valued state'
  );
  const signal = (state as Record<string, unknown>).signal;
  invariant(
    typeof signal === 'number' &&
      Number.isInteger(signal) &&
      signal >= -2_147_483_648 &&
      signal <= 2_147_483_647,
    `.hsplus plan state.signal must be an i32, received ${String(signal)}`
  );
  return signal;
}

function bindDecisionSignal(source: string, signal: number): string {
  const entryPattern =
    /(function\s+main\s*\(\s*\)\s*:\s*i32\s*\{\s*(?:\/\/[^\r\n]*\r?\n\s*)?return\s+decide\s*\(\s*)-?\d+(\s*\)\s*\})/m;
  const matches = source.match(new RegExp(entryPattern.source, 'gm')) ?? [];
  invariant(
    matches.length === 1,
    '.hs decision binding requires exactly one typed main adapter returning decide(<i32>)'
  );
  return source.replace(entryPattern, `$1${signal}$2`);
}

function registerHsI32BinaryHandler(vm: UAALVirtualMachine): void {
  vm.registerHandler(UAALOpCode.EXEC, (proxy, operands) => {
    const [abi, operator] = operands;
    if (abi !== 'hs.i32.binary.v1' || typeof operator !== 'string') {
      throw new Error(`unsupported .hs EXEC ABI: ${String(abi)}`);
    }
    const right = proxy.pop();
    const left = proxy.pop();
    if (typeof left !== 'number' || typeof right !== 'number') {
      throw new Error('hs.i32.binary.v1 requires numeric operands');
    }

    let result: UAALOperand;
    switch (operator) {
      case '+':
        result = (left + right) | 0;
        break;
      case '-':
        result = (left - right) | 0;
        break;
      case '*':
        result = Math.imul(left, right);
        break;
      case '==':
        result = left === right;
        break;
      case '!=':
        result = left !== right;
        break;
      case '<':
        result = left < right;
        break;
      case '<=':
        result = left <= right;
        break;
      case '>':
        result = left > right;
        break;
      case '>=':
        result = left >= right;
        break;
      default:
        throw new Error(`unsupported hs.i32.binary.v1 operator: ${operator}`);
    }
    proxy.push(result);
  });
}

function collectBindingInventory(
  manifest: ThreeSurfaceProjectManifest,
  holoActions: string[],
  holoHandlers: string[],
  brainStates: string[],
  functions: string[]
): Set<string> {
  return new Set([
    ...holoActions.map((name) => `${manifest.entries.composition}#${name}`),
    ...holoHandlers.map((name) => `${manifest.entries.composition}#${name}`),
    ...brainStates.map((name) => `${manifest.entries.agent}#${name}`),
    ...functions.map((name) => `${manifest.entries.logic}#${name}`),
  ]);
}

function validateBindings(
  manifest: ThreeSurfaceProjectManifest,
  inventory: ReadonlySet<string>
): void {
  const seen = new Set<string>();
  for (const binding of manifest.bindings) {
    invariant(
      ['event', 'decision', 'effect'].includes(binding.kind),
      `unknown binding kind: ${String(binding.kind)}`
    );
    invariant(inventory.has(binding.from), `binding source does not exist: ${binding.from}`);
    invariant(inventory.has(binding.to), `binding target does not exist: ${binding.to}`);
    const identity = `${binding.kind}:${binding.from}->${binding.to}`;
    invariant(!seen.has(identity), `duplicate binding: ${identity}`);
    seen.add(identity);
  }
}

function bindingConstructId(binding: ThreeSurfaceBinding): string {
  return `binding:${binding.kind}:${binding.from}->${binding.to}`;
}

function requireBinding(
  manifest: ThreeSurfaceProjectManifest,
  kind: BindingKind,
  from: string,
  to: string
): ThreeSurfaceBinding {
  const binding = manifest.bindings.find(
    (candidate) => candidate.kind === kind && candidate.from === from && candidate.to === to
  );
  invariant(binding, `missing executable ${kind} binding: ${from} -> ${to}`);
  return binding;
}

async function executeDecisionEffect(
  decision: UAALOperand,
  execute: () => Promise<void>
): Promise<boolean> {
  invariant(
    typeof decision === 'number' && Number.isInteger(decision),
    `effect binding requires an integer policy decision, received ${String(decision)}`
  );
  if (decision <= 0) return false;
  await execute();
  return true;
}

function assertObserved(
  manifest: ThreeSurfaceProjectManifest,
  observed: ThreeSurfaceObservation
): void {
  invariant(
    JSON.stringify(observed.holo.state) === JSON.stringify(manifest.expected.state),
    `composition state mismatch: expected ${JSON.stringify(manifest.expected.state)}, got ${JSON.stringify(observed.holo.state)}`
  );
  invariant(
    JSON.stringify(observed.holo.events) === JSON.stringify(manifest.expected.events),
    `composition events mismatch: expected ${JSON.stringify(manifest.expected.events)}, got ${JSON.stringify(observed.holo.events)}`
  );
  invariant(
    observed.hs.nativeResult === observed.hs.cognitiveResult,
    `.hs target mismatch: native=${observed.hs.nativeResult}, cognitive=${String(observed.hs.cognitiveResult)}`
  );
}

async function evaluateProject(project: LoadedProject): Promise<ThreeSurfaceClosureReport> {
  const sourceDigest = computeSourceDigest(project);

  // .holo: parse the composition, preserve its bodies, lower the on_start path,
  // and execute all emitted effects through the real UAAL VM.
  const holoResult = new HoloCompositionParser({ tolerant: false }).parse(
    project.sources.composition
  );
  invariant(
    holoResult.success && holoResult.ast,
    `.holo parse failed: ${holoResult.errors.map((error) => error.message).join('; ')}`
  );
  const composition = holoResult.ast;
  const holoActions = [...(composition.actions ?? []), ...(composition.logic?.actions ?? [])];
  const holoHandlers = [
    ...(composition.eventHandlers ?? []),
    ...(composition.logic?.handlers ?? []),
  ];
  invariant(
    holoActions.some((action) => action.name === 'apply_decision'),
    'missing .holo action'
  );
  invariant(
    holoHandlers.some((handler) => handler.event === 'on_start'),
    'missing .holo handler'
  );
  const eventBinding = requireBinding(
    project.manifest,
    'event',
    `${project.manifest.entries.composition}#on_start`,
    `${project.manifest.entries.agent}#on_task`
  );
  const decisionBinding = requireBinding(
    project.manifest,
    'decision',
    `${project.manifest.entries.agent}#on_task`,
    `${project.manifest.entries.logic}#decide`
  );
  const effectBinding = requireBinding(
    project.manifest,
    'effect',
    `${project.manifest.entries.logic}#decide`,
    `${project.manifest.entries.composition}#apply_decision`
  );
  const executedBindings = new Set<string>();

  const imported = new Map(
    composition.imports.flatMap((entry) =>
      entry.specifiers.map((specifier) => [specifier.imported, entry.source] as const)
    )
  );
  invariant(
    imported.get('TriadAgent') === `./${project.manifest.entries.agent}`,
    '.holo must import TriadAgent from the declared .hsplus entry'
  );
  invariant(
    imported.get('decide') === `./${project.manifest.entries.logic}`,
    '.holo must import decide from the declared .hs entry'
  );

  const initialState = Object.fromEntries(
    (composition.state?.properties ?? []).map((property) => [property.key, property.value])
  ) as Record<string, UAALOperand>;
  const holoState: Record<string, UAALOperand> = { ...initialState };
  const emittedEvents: string[] = [];
  const holoCompile = new UaalBehaviorCompiler().compile(composition, {
    sourceSurface: '.holo',
    entryPoints: ['event:on_start'],
  });
  invariant(
    holoCompile.semanticClosure.entries.every((entry) => entry.stages.lowered.status === 'passed'),
    'the checked-in .holo tracer contains a construct without UAAL lowering'
  );

  const holoVm = new UAALVirtualMachine({ recordLog: true });
  holoVm.registerHandler(UAALOpCode.EXECUTE, (proxy, operands) => {
    const [operation, operatorOrData, value] = operands;
    invariant(typeof operation === 'string', '.holo EXECUTE operation must be a string');
    if (operation.startsWith('assign:state.')) {
      const key = operation.slice('assign:state.'.length);
      invariant(key in holoState, `.holo assignment targets undeclared state: ${key}`);
      invariant(typeof operatorOrData === 'string', `.holo assignment ${key} lacks an operator`);
      const resolvedValue = resolveUaalBehaviorOperand(value ?? null, proxy.getState().context);
      switch (operatorOrData) {
        case '=':
          holoState[key] = resolvedValue;
          return;
        case '+=':
          invariant(
            typeof holoState[key] === 'number' && typeof resolvedValue === 'number',
            `.holo += requires numeric state and value for ${key}`
          );
          holoState[key] = holoState[key] + resolvedValue;
          return;
        default:
          throw new Error(`unsupported .holo assignment operator: ${operatorOrData}`);
      }
    }
    if (operation.startsWith('emit:')) {
      emittedEvents.push(operation.slice('emit:'.length));
      return;
    }
    throw new Error(`unsupported .holo effect in closure tracer: ${operation}`);
  });
  // .hsplus: normalize only the explicit #brain document, parse one typed AST,
  // project it through the edge runtime, execute deterministic cognitive verbs,
  // and probe the real frame boundary checker in both directions.
  const preparedBrain = preprocessAgentBrainSource(project.sources.agent);
  const hsplusResult = new HoloScriptPlusParser({ strict: true }).parse(preparedBrain.source);
  invariant(
    hsplusResult.success && hsplusResult.ast,
    `.hsplus parse failed: ${hsplusResult.errors.map((error) => error.message).join('; ')}`
  );
  const brain = (hsplusResult.ast as { root: HoloBrainDecl }).root;
  invariant(brain.type === 'brain', '.hsplus root must be a typed brain');
  invariant(brain.name === preparedBrain.header.brainName, '.hsplus header/AST brain name drift');
  invariant(brain.identity, '.hsplus brain must declare typed identity');
  invariant(brain.frameDeclaration, '.hsplus brain must declare a frame');
  const onTask = brain.states.find((state) => state.name === 'on_task');
  invariant(onTask, '.hsplus brain must declare on_task');
  invariant(
    onTask.actions.length === 0,
    `.hsplus on_task contains opaque unsupported actions: ${onTask.actions.join(', ')}`
  );
  const cognitiveActions = onTask.cognitiveActions ?? [];
  invariant(cognitiveActions.length > 0, '.hsplus on_task must contain typed cognitive actions');
  const decisionSignal = readDecisionSignal(cognitiveActions);

  const runtimeBrain = await loadBrain(project.paths.agent);
  invariant(runtimeBrain.domain === brain.identity.domain, '.hsplus runtime domain drift');
  invariant(
    JSON.stringify(runtimeBrain.capabilityTags) === JSON.stringify(brain.identity.capabilityTags),
    '.hsplus runtime capability-tag drift'
  );
  invariant(runtimeBrain.frameDeclaration, '.hsplus runtime frame projection is missing');
  invariant(
    JSON.stringify(runtimeBrain.frameDeclaration) === JSON.stringify(brain.frameDeclaration),
    '.hsplus canonical/runtime frame drift'
  );
  invariant(
    JSON.stringify(runtimeBrain.onTaskActions?.map((action) => action.verb)) ===
      JSON.stringify(cognitiveActions.map((action) => action.verb)),
    '.hsplus canonical/runtime cognitive-action drift'
  );

  const cognitiveEvents: Array<Record<string, unknown>> = [];
  const augmentedPrompt = await augmentWithOnTaskCognition({
    systemPrompt: runtimeBrain.systemPrompt,
    onTaskActions: runtimeBrain.onTaskActions ?? [],
    task: { id: 'three-surface-agent', title: 'execute the deterministic decision policy' },
    queryPrivateKnowledge: async () => [
      {
        id: 'three-surface-policy',
        content: 'The three-surface decision policy returns one for a positive signal.',
      },
    ],
    plan: async () => '1. Read the signal.\n2. Execute policy.hs.\n3. Apply the decision.',
    log: (event) => cognitiveEvents.push(event),
  });
  invariant(augmentedPrompt.includes('[Recalled memory'), '.hsplus recall did not execute');
  invariant(augmentedPrompt.includes('[Plan]'), '.hsplus plan did not execute');
  executedBindings.add(bindingConstructId(eventBinding));

  const allowedProbe = checkToolAllowed(brain.frameDeclaration, 'triad_decide');
  const deniedProbe = checkToolAllowed(
    brain.frameDeclaration,
    'treasury_transfer',
    'treasury-custody'
  );
  invariant(allowedProbe.allowed, '.hsplus frame rejected its declared decision tool');
  invariant(
    !deniedProbe.allowed && deniedProbe.violation_type === 'domain_denied',
    '.hsplus frame did not reject its denied domain'
  );

  // .hs: the same checked-in decision kernel must parse through the tracked WASM
  // authority, lower through the current Rust source, and agree on native/UAAL result.
  const { program: rustProgram, compilerVersion } = loadRustProgram(project.sources.logic);
  const functions = rustFunctions(rustProgram);
  invariant(
    functions.every(
      (fn) =>
        fn.return_type === 'i32' &&
        (fn.param_types ?? []).every((parameterType) => parameterType === 'i32')
    ),
    '.hs closure tracer must remain explicitly typed i32'
  );
  const functionNames = functions.map((fn) => fn.name);
  invariant(
    JSON.stringify(functionNames) === JSON.stringify(['decide', 'main']),
    `.hs function inventory drift: ${functionNames.join(', ')}`
  );
  const boundLogicSource = bindDecisionSignal(project.sources.logic, decisionSignal);
  loadRustProgram(boundLogicSource);
  const hsBytecode = compileHsToUaal(boundLogicSource);
  const nativeResult = executeHsNatively(project.paths.logic, boundLogicSource);
  const hsVm = new UAALVirtualMachine({ recordLog: true });
  registerHsI32BinaryHandler(hsVm);
  const hsExecution = await hsVm.execute(hsBytecode);
  invariant(
    hsExecution.taskStatus === 'HALTED',
    `.hs cognitive execution failed: ${hsExecution.taskStatus}`
  );
  invariant(
    hsVm.exportLog().steps.some((step) => step.opcode === UAALOpCode.EXEC && step.injected),
    '.hs cognitive execution never crossed the hs.i32.binary.v1 handler'
  );
  invariant(
    executedBindings.has(bindingConstructId(eventBinding)),
    '.hs policy executed before the .holo event reached the .hsplus on_task state'
  );
  executedBindings.add(bindingConstructId(decisionBinding));

  // The effect edge is causal, not an inventory-only link: a non-positive
  // policy result leaves the composition at its authored initial state. The
  // checked-in positive decision is what admits the on_start/apply_decision VM
  // path and produces the observed state/event effects.
  invariant(
    executedBindings.has(bindingConstructId(decisionBinding)),
    '.holo effect executed before the .hsplus -> .hs decision edge'
  );
  const effectExecuted = await executeDecisionEffect(hsExecution.stackTop, async () => {
    const holoExecution = await holoVm.execute(holoCompile.bytecode as unknown as UAALBytecode);
    invariant(
      holoExecution.taskStatus === 'HALTED',
      `.holo cognitive execution failed: ${holoExecution.taskStatus}`
    );
  });
  invariant(effectExecuted, 'the canonical positive policy decision did not trigger .holo effects');
  executedBindings.add(bindingConstructId(effectBinding));

  const holoLog = holoVm.exportLog();
  const injectedEffects = holoLog.steps.filter(
    (step) => step.opcode === UAALOpCode.EXECUTE && step.injected
  ).length;
  invariant(
    injectedEffects === holoCompile.stats.executeCalls,
    `.holo effect trace mismatch: emitted=${holoCompile.stats.executeCalls}, executed=${injectedEffects}`
  );

  invariant(runtimeBrain.reflect, '.hsplus runtime reflect projection is missing');
  const reflectChecks = [
    {
      label: 'native and UAAL policy results agree',
      passed: nativeResult === hsExecution.stackTop,
    },
    {
      label: 'composition state matches the declared observation',
      passed: JSON.stringify(holoState) === JSON.stringify(project.manifest.expected.state),
    },
    {
      label: 'composition events match the declared observation',
      passed: JSON.stringify(emittedEvents) === JSON.stringify(project.manifest.expected.events),
    },
    {
      label: 'the protected domain remains denied',
      passed: !deniedProbe.allowed && deniedProbe.violation_type === 'domain_denied',
    },
  ];
  const failedReflectChecks = reflectChecks
    .filter((check) => !check.passed)
    .map((check) => check.label);
  const deterministicReflectContent =
    failedReflectChecks.length === 0
      ? 'All executable criteria passed.\nVERDICT: PASS'
      : `Failed criteria: ${failedReflectChecks.join('; ')}.\nVERDICT: FAIL`;
  const reflectResult = await evaluateReflectGate({
    criteria: runtimeBrain.reflect.criteria,
    artifact: JSON.stringify({
      decision: hsExecution.stackTop,
      state: holoState,
      events: emittedEvents,
    }),
    evaluator: {
      complete: async () => ({
        content: deterministicReflectContent,
        usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      }),
    },
    model: 'deterministic-closure-evaluator',
    escalateOnFail: runtimeBrain.reflect.escalateOnFail,
  });
  invariant(
    reflectResult.pass && reflectResult.parsed && !reflectResult.shouldEscalate,
    `.hsplus reflect gate did not produce a parsed PASS: ${reflectResult.verdict}`
  );

  const inventory = collectBindingInventory(
    project.manifest,
    holoActions.map((action) => action.name),
    holoHandlers.map((handler) => handler.event),
    brain.states.map((state) => state.name),
    functionNames
  );
  validateBindings(project.manifest, inventory);
  for (const binding of project.manifest.bindings) {
    invariant(
      executedBindings.has(bindingConstructId(binding)),
      `binding was declared but not executed: ${bindingConstructId(binding)}`
    );
  }

  const observed: ThreeSurfaceObservation = {
    holo: {
      state: holoState,
      events: emittedEvents,
      instructions: holoCompile.bytecode.instructions.length,
      injectedEffects,
    },
    hsplus: {
      brain: brain.name,
      version: preparedBrain.header.version,
      targets: preparedBrain.header.targets,
      cognitiveActions: cognitiveActions.map((action) => action.verb),
      decisionSignal,
      runtimeEvents: [
        ...cognitiveEvents.map((event) => String(event.ev)),
        `reflect:${reflectResult.verdict}`,
      ],
      frameAllowedProbe: allowedProbe.allowed,
      frameDeniedProbe: deniedProbe.violation_type ?? 'none',
    },
    hs: {
      functions: functionNames,
      instructions: hsBytecode.instructions.length,
      nativeResult,
      cognitiveResult: hsExecution.stackTop,
    },
  };
  assertObserved(project.manifest, observed);

  const compositionConstructId = `${project.manifest.entries.composition}#composition:${composition.name}`;
  const importConstructIds = composition.imports.flatMap((entry) =>
    entry.specifiers.map(
      (specifier) => `${project.manifest.entries.composition}#import:${specifier.imported}`
    )
  );
  const stateConstructIds = (composition.state?.properties ?? []).map(
    (property) => `${project.manifest.entries.composition}#state:${property.key}`
  );
  const objectConstructIds = composition.objects.map(
    (object) => `${project.manifest.entries.composition}#object:${object.name}`
  );

  const entries: SemanticClosureEntry[] = [
    {
      constructId: compositionConstructId,
      surface: '.holo',
      kind: 'composition',
      target: 'three-surface-runtime',
      stages: {
        parsed: PASSED,
        typed: PASSED,
        lowered: PASSED,
        enforced: PASSED,
        executed: PASSED,
        target_preserved: PASSED,
      },
    },
    ...composition.imports.flatMap((entry) =>
      entry.specifiers.map(
        (specifier): SemanticClosureEntry => ({
          constructId: `${project.manifest.entries.composition}#import:${specifier.imported}`,
          surface: '.holo',
          kind: 'cross-surface-import',
          target: 'three-surface-runtime',
          stages: {
            parsed: PASSED,
            typed: PASSED,
            lowered: PASSED,
            enforced: PASSED,
            executed: PASSED,
            target_preserved: PASSED,
          },
        })
      )
    ),
    ...(composition.state?.properties ?? []).map(
      (property): SemanticClosureEntry => ({
        constructId: `${project.manifest.entries.composition}#state:${property.key}`,
        surface: '.holo',
        kind: 'state-property',
        target: 'cognitive-vm/uaal-bytecode',
        stages: {
          parsed: PASSED,
          typed: PASSED,
          lowered: PASSED,
          enforced: PASSED,
          executed: PASSED,
          target_preserved: PASSED,
        },
      })
    ),
    ...composition.objects.map(
      (object): SemanticClosureEntry => ({
        constructId: `${project.manifest.entries.composition}#object:${object.name}`,
        surface: '.holo',
        kind: 'spatial-object',
        target: 'cognitive-vm/uaal-bytecode',
        stages: {
          parsed: PASSED,
          typed: notApplicable(
            'spatial object properties are schema-parsed, not behavior-typed by this target'
          ),
          lowered: notApplicable(
            'spatial objects target HoloVM, outside the cognitive UAAL target'
          ),
          enforced: notApplicable(
            'the cognitive tracer does not cross a spatial-runtime policy boundary'
          ),
          executed: notApplicable('the cognitive tracer does not instantiate spatial objects'),
          target_preserved: notApplicable(
            'spatial target preservation requires a HoloVM/render receipt'
          ),
        },
      })
    ),
    ...holoCompile.semanticClosure.entries.map((entry) => ({
      ...entry,
      constructId: `${project.manifest.entries.composition}#${entry.constructId}`,
      stages: {
        ...entry.stages,
        enforced: PASSED,
        executed: PASSED,
        target_preserved: PASSED,
      },
    })),
  ];

  const hsplusBaseStages = {
    parsed: PASSED,
    typed: PASSED,
    lowered: PASSED,
    enforced: PASSED,
    executed: PASSED,
    target_preserved: PASSED,
  } as const;
  entries.push(
    {
      constructId: `${project.manifest.entries.agent}#${brain.name}`,
      surface: '.hsplus',
      kind: 'brain',
      target: 'edge-agent-runtime',
      stages: hsplusBaseStages,
    },
    {
      constructId: `${project.manifest.entries.agent}#identity`,
      surface: '.hsplus',
      kind: 'brain-identity',
      target: 'edge-agent-runtime',
      stages: hsplusBaseStages,
    },
    {
      constructId: `${project.manifest.entries.agent}#frame_declaration`,
      surface: '.hsplus',
      kind: 'frame-declaration',
      target: 'edge-agent-runtime',
      stages: hsplusBaseStages,
    },
    {
      constructId: `${project.manifest.entries.agent}#on_task`,
      surface: '.hsplus',
      kind: 'brain-state',
      target: 'edge-agent-runtime',
      stages: {
        ...hsplusBaseStages,
        executed: PASSED,
      },
    },
    ...cognitiveActions.map(
      (action, index): SemanticClosureEntry => ({
        constructId: `${project.manifest.entries.agent}#on_task/${index}:${action.verb}`,
        surface: '.hsplus',
        kind: `cognitive-action:${action.verb}`,
        target: 'edge-agent-runtime',
        stages: {
          parsed: PASSED,
          typed: PASSED,
          lowered: PASSED,
          enforced:
            action.verb === 'reflect'
              ? PASSED
              : notApplicable('the deterministic tracer action does not cross a tool boundary'),
          executed: PASSED,
          target_preserved: PASSED,
        },
      })
    )
  );

  for (const fn of functions) {
    entries.push({
      constructId: `${project.manifest.entries.logic}#${fn.name}`,
      surface: '.hs',
      kind: fn.name === 'main' ? 'native-entrypoint' : 'function',
      target: 'native+uaal',
      stages: {
        parsed: PASSED,
        typed: PASSED,
        lowered: PASSED,
        enforced: notApplicable('the pure i32 decision kernel has no external effects'),
        executed: PASSED,
        target_preserved: PASSED,
      },
    });
  }

  for (const binding of project.manifest.bindings) {
    entries.push({
      constructId: bindingConstructId(binding),
      surface: binding.kind === 'event' ? '.holo' : binding.kind === 'decision' ? '.hsplus' : '.hs',
      kind: `cross-surface-binding:${binding.kind}`,
      target: 'three-surface-runtime',
      stages: {
        parsed: PASSED,
        typed: PASSED,
        lowered: PASSED,
        enforced: PASSED,
        executed: PASSED,
        target_preserved: PASSED,
      },
    });
  }

  // These inventories come directly from canonical ASTs and the manifest,
  // independently of the emitted evidence array. The checked-in manifest is a
  // second, human-reviewable admission inventory; either side drifting redlines
  // the receipt constructor.
  const parserInventory = [
    compositionConstructId,
    ...importConstructIds,
    ...stateConstructIds,
    ...objectConstructIds,
    ...holoCompile.semanticClosure.entries.map(
      (entry) => `${project.manifest.entries.composition}#${entry.constructId}`
    ),
    `${project.manifest.entries.agent}#${brain.name}`,
    `${project.manifest.entries.agent}#identity`,
    `${project.manifest.entries.agent}#frame_declaration`,
    `${project.manifest.entries.agent}#on_task`,
    ...cognitiveActions.map(
      (action, index) => `${project.manifest.entries.agent}#on_task/${index}:${action.verb}`
    ),
    ...functions.map((fn) => `${project.manifest.entries.logic}#${fn.name}`),
    ...project.manifest.bindings.map(bindingConstructId),
  ].sort();
  const manifestInventory = [...project.manifest.expected.constructs].sort();
  invariant(
    JSON.stringify(parserInventory) === JSON.stringify(manifestInventory),
    `canonical parser inventory differs from expected.constructs\nparser=${JSON.stringify(parserInventory)}\nmanifest=${JSON.stringify(manifestInventory)}`
  );

  const semanticClosure = createSemanticClosureReceipt({
    sourceDigest,
    toolchain: `three-surface-closure@1+holoscript-wasm@${compilerVersion}`,
    target: 'sovereign-native+edge-agent+uaal',
    expectedConstructs: project.manifest.expected.constructs,
    entries,
  });
  const actualNotApplicableStages = semanticClosure.entries
    .flatMap((entry) =>
      Object.entries(entry.stages)
        .filter(([, stage]) => stage.status === 'not_applicable')
        .map(([stage]) => `${entry.constructId}:${stage}`)
    )
    .sort();
  const expectedNotApplicableStages = [...project.manifest.expected.notApplicableStages].sort();
  invariant(
    JSON.stringify(actualNotApplicableStages) === JSON.stringify(expectedNotApplicableStages),
    `target-inapplicable stage inventory drift\nactual=${JSON.stringify(actualNotApplicableStages)}\nexpected=${JSON.stringify(expectedNotApplicableStages)}`
  );

  const unexpectedDeferrals = semanticClosure.entries.flatMap((entry) =>
    Object.entries(entry.stages)
      .filter(([, stage]) => stage.status === 'deferred')
      .filter(
        ([stage, result]) => !(stage === 'typed' && result.diagnosticCode === 'HS-CLOSURE-TYPE-001')
      )
      .map(
        ([stage, result]) =>
          `${entry.constructId}:${stage}:${result.diagnosticCode ?? 'missing-code'}`
      )
  );
  invariant(
    unexpectedDeferrals.length === 0,
    `unexpected semantic deferral(s): ${unexpectedDeferrals.join(', ')}`
  );
  invariant(
    semanticClosure.summary.rejectedStages === 0,
    'semantic closure contains rejected stages'
  );

  return {
    schemaVersion: 'holoscript.three-surface-closure.v1',
    project: project.manifest.name,
    sourceDigest,
    entries: project.manifest.entries,
    bindings: project.manifest.bindings,
    observed,
    semanticClosure,
  };
}

async function runSelfTest(
  project: LoadedProject,
  report: ThreeSurfaceClosureReport
): Promise<void> {
  const wrongState = structuredClone(project.manifest);
  wrongState.expected.state.decision_count =
    Number(wrongState.expected.state.decision_count ?? 0) + 41;
  let stateRejected = false;
  try {
    assertObserved(wrongState, report.observed);
  } catch {
    stateRejected = true;
  }
  invariant(stateRejected, 'self-test failed: wrong expected state was accepted');

  const wrongBinding = structuredClone(project.manifest);
  wrongBinding.bindings[1].to = `${wrongBinding.entries.logic}#missing_decision`;
  let bindingRejected = false;
  try {
    const inventory = collectBindingInventory(
      wrongBinding,
      ['apply_decision'],
      ['on_start'],
      ['on_task'],
      report.observed.hs.functions
    );
    validateBindings(wrongBinding, inventory);
  } catch {
    bindingRejected = true;
  }
  invariant(bindingRejected, 'self-test failed: nonexistent binding target was accepted');

  const missingConstruct = structuredClone(project.manifest);
  missingConstruct.expected.constructs = missingConstruct.expected.constructs.slice(0, -1);
  let inventoryRejected = false;
  try {
    createSemanticClosureReceipt({
      sourceDigest: report.sourceDigest,
      toolchain: 'three-surface-self-test',
      target: 'mutation',
      expectedConstructs: missingConstruct.expected.constructs,
      entries: report.semanticClosure.entries,
    });
  } catch {
    inventoryRejected = true;
  }
  invariant(inventoryRejected, 'self-test failed: incomplete admission inventory was accepted');

  const zeroPolicy = structuredClone(project);
  zeroPolicy.sources.logic = zeroPolicy.sources.logic.replace(
    /return\s+1(\s*\r?\n\s*\})/,
    'return 0$1'
  );
  invariant(
    zeroPolicy.sources.logic !== project.sources.logic,
    'self-test could not locate the positive policy result'
  );
  let zeroPolicyRejected = false;
  try {
    await evaluateProject(zeroPolicy);
  } catch (error) {
    zeroPolicyRejected =
      error instanceof Error &&
      error.message.includes('positive policy decision did not trigger .holo effects');
  }
  invariant(
    zeroPolicyRejected,
    'self-test failed: changing the policy result did not stop the composition effect edge'
  );

  const zeroPlanSignal = structuredClone(project);
  zeroPlanSignal.sources.agent = zeroPlanSignal.sources.agent.replace(/signal:\s*1/, 'signal: 0');
  invariant(
    zeroPlanSignal.sources.agent !== project.sources.agent,
    'self-test could not locate the typed .hsplus plan signal'
  );
  let planSignalRejected = false;
  try {
    await evaluateProject(zeroPlanSignal);
  } catch (error) {
    planSignalRejected =
      error instanceof Error &&
      error.message.includes('positive policy decision did not trigger .holo effects');
  }
  invariant(
    planSignalRejected,
    'self-test failed: changing the .hsplus plan signal did not stop the composition effect edge'
  );
}

function writeReceipt(path: string, report: ThreeSurfaceClosureReport): void {
  const absolute = resolve(REPO_ROOT, path);
  mkdirSync(dirname(absolute), { recursive: true });
  writeFileSync(absolute, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(`${TAG} receipt: ${normalized(relative(REPO_ROOT, absolute))}`);
}

async function main(): Promise<void> {
  const options = parseCli(process.argv.slice(2));
  const project = loadProject(options.projectDir);
  const report = await evaluateProject(project);

  if (options.selfTest) {
    await runSelfTest(project, report);
    console.log(
      `${TAG} self-test OK — state, binding, inventory, policy-result, and plan-signal mutations were rejected`
    );
  }
  if (options.requireComplete) {
    invariant(
      report.semanticClosure.summary.complete,
      `semantic closure is honest but incomplete: ${report.semanticClosure.summary.deferredStages} deferred stage(s)`
    );
  }
  if (options.receiptPath) writeReceipt(options.receiptPath, report);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(
      `${TAG} OK — ${report.project}: .holo state/events, .hsplus cognition/frame, and .hs native/UAAL parity agree`
    );
    console.log(
      `${TAG} source=${report.sourceDigest} constructs=${report.semanticClosure.summary.totalConstructs} deferred=${report.semanticClosure.summary.deferredStages}`
    );
  }
}

main().catch((error: unknown) => {
  console.error(`${TAG} FAIL — ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

import {
  HEADLESS_EXPERIMENT_HASH_ALGORITHM,
  canonicalizeHeadlessValue,
  hashHeadlessValue,
} from '@holoscript/engine/runtime';
import type {
  UAALBytecode,
  UAALExecutionLog,
  UAALInstruction,
  UAALOpCode,
  UAALVMExecutionProfile,
} from '@holoscript/uaal';

export const RUST_WASM_UAAL_HS_PLAN_KERNEL = 'holoscript-rust-wasm-uaal-plan-kernel-v1' as const;
export const HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA =
  'holoscript.hs-plan-kernel-execution-provenance.v1' as const;
export const HS_PLAN_KERNEL_TRACE_SCHEMA = 'holoscript.uaal-plan-kernel-trace.v1' as const;
export const HS_PLAN_KERNEL_PARSER = '@holoscript/wasm/node.parse' as const;
export const HS_PLAN_KERNEL_COMPILER = '@holoscript/wasm/node.compile_to_uaal' as const;
export const HS_PLAN_KERNEL_VM = 'holoscript.uaal-virtual-machine.v1' as const;
export const HS_PLAN_KERNEL_UAAL_LIMITS = Object.freeze({
  maxStackSize: 4,
  maxInstructions: 16,
  maxCallDepth: 2,
});
export const HS_PLAN_KERNEL_TRACE_PROGRAM_COUNTERS = Object.freeze([0, 2, 3, 1] as const);
export const HS_PLAN_KERNEL_TRACE_OPCODES = Object.freeze([50, 1, 51, 255] as const);

const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_PARSER_PACKET_BYTES = 1024 * 1024;
const MAX_COMPILER_PACKET_BYTES = 1024 * 1024;
const MAX_PLAN_JSON_BYTES = 512 * 1024;
const MAX_PROVENANCE_BYTES = 16 * 1024;

export interface HsPlanKernelExecutionResult {
  count: number;
  data: unknown[];
  provenance: HsPlanKernelExecutionProvenance;
}

type DeterministicUAALExecutionTrace = Omit<UAALExecutionLog, 'startedAt' | 'finishedAt'>;

export interface HsPlanKernelCompactTrace {
  schema: typeof HS_PLAN_KERNEL_TRACE_SCHEMA;
  executionLogVersion: 'uaal.execution-log.v0';
  executedInstructionCount: 4;
  programCounters: typeof HS_PLAN_KERNEL_TRACE_PROGRAM_COUNTERS;
  opcodes: typeof HS_PLAN_KERNEL_TRACE_OPCODES;
  traceHash: string;
  finalTaskStatus: 'HALTED';
}

export interface HsPlanKernelVmExecutionProfile {
  readonly schema: 'holoscript.uaal-vm.execution-profile.v1';
  readonly implementation: typeof HS_PLAN_KERNEL_VM;
  readonly limits: {
    readonly maxStackSize: 4;
    readonly maxInstructions: 16;
    readonly maxCallDepth: 2;
  };
  readonly registeredHandlerOpcodes: readonly [];
}

export interface HsPlanKernelExecutionProvenance {
  schema: typeof HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA;
  engine: typeof RUST_WASM_UAAL_HS_PLAN_KERNEL;
  hashAlgorithm: typeof HEADLESS_EXPERIMENT_HASH_ALGORITHM;
  sourceHash: string;
  parser: {
    implementation: typeof HS_PLAN_KERNEL_PARSER;
    astHash: string;
  };
  compiler: {
    implementation: typeof HS_PLAN_KERNEL_COMPILER;
    crateVersion: string;
  };
  bytecode: {
    version: 1;
    instructionCount: 5;
    hashAlgorithm: 'sha256-uaal-bytecode-canonical-v1';
    sha256: string;
  };
  vm: {
    implementation: typeof HS_PLAN_KERNEL_VM;
    profile: HsPlanKernelVmExecutionProfile;
    trace: HsPlanKernelCompactTrace;
  };
  result: {
    returnedPlanHash: string;
    recordCount: number;
  };
  provenanceCommitment: string;
}

export interface HsPlanKernelProvenanceVerificationOptions {
  expectedSource: string;
  expectedRecords?: unknown[];
}

export interface HsPlanKernelProvenanceVerificationResult {
  valid: boolean;
  errors: string[];
}

function fail(message: string): never {
  throw new Error(`Deterministic .hs plan kernel: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(
  value: unknown,
  expected: readonly string[],
  label: string
): asserts value is Record<string, unknown> {
  if (!isRecord(value)) fail(`${label} must be an object`);
  const actual = Object.keys(value).sort();
  const required = [...expected].sort();
  if (canonicalizeHeadlessValue(actual) !== canonicalizeHeadlessValue(required)) {
    fail(`${label} fields do not match the sealed contract`);
  }
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseAuthoredPlanLiteral(raw: string): { value: string; astHash: string } {
  if (byteLength(raw) > MAX_PARSER_PACKET_BYTES) {
    fail(`Rust/WASM parser packet exceeds ${MAX_PARSER_PACKET_BYTES} bytes`);
  }
  let program: unknown;
  try {
    program = JSON.parse(raw);
  } catch (error) {
    fail(
      `Rust/WASM parser returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!isRecord(program) || program.type !== 'Program') {
    fail('Rust/WASM parser rejected the single exported main() kernel');
  }
  if (!Array.isArray(program.body) || program.body.length !== 1) {
    fail('source must contain exactly one exported main() function');
  }
  if (!Array.isArray(program.directives) || program.directives.length !== 0) {
    fail('directives are not admitted in the deterministic plan kernel');
  }
  const exported = program.body[0];
  if (!isRecord(exported) || exported.type !== 'Export' || !isRecord(exported.declaration)) {
    fail('the deterministic plan kernel must export main()');
  }
  const declaration = exported.declaration;
  const hasNoLifetimes =
    declaration.lifetimes === undefined ||
    (Array.isArray(declaration.lifetimes) && declaration.lifetimes.length === 0);
  const hasNoParameterTypes =
    declaration.param_types === undefined ||
    (Array.isArray(declaration.param_types) && declaration.param_types.length === 0);
  if (
    declaration.type !== 'Function' ||
    declaration.name !== 'main' ||
    !hasNoLifetimes ||
    !Array.isArray(declaration.params) ||
    declaration.params.length !== 0 ||
    !hasNoParameterTypes ||
    declaration.return_type !== 'string' ||
    !Array.isArray(declaration.body) ||
    declaration.body.length !== 1
  ) {
    fail(
      'main() must have no lifetime binders, no parameters, return string, and contain one return statement'
    );
  }
  const returned = declaration.body[0];
  if (
    !isRecord(returned) ||
    returned.type !== 'Return' ||
    !isRecord(returned.argument) ||
    returned.argument.type !== 'String' ||
    typeof returned.argument.value !== 'string'
  ) {
    fail('main() must return one string literal');
  }
  return {
    value: returned.argument.value,
    astHash: hashHeadlessValue(program),
  };
}

function validateInstruction(
  value: unknown,
  index: number,
  expectedOpcode: UAALOpCode
): UAALInstruction {
  if (!isRecord(value) || value.opCode !== expectedOpcode) {
    fail(`Rust/WASM compiler emitted non-kernel instruction ${index}`);
  }
  const keys = Object.keys(value).sort();
  const expectsOperands = index === 0 || index === 2;
  const expectedKeys = expectsOperands ? ['opCode', 'operands'] : ['opCode'];
  if (canonicalizeHeadlessValue(keys) !== canonicalizeHeadlessValue(expectedKeys)) {
    fail(`Rust/WASM compiler emitted unsupported instruction fields at ${index}`);
  }
  const operands = Array.isArray(value.operands) ? value.operands : [];
  if (expectsOperands && !Array.isArray(value.operands)) {
    fail(`Rust/WASM compiler omitted instruction operands at ${index}`);
  }
  if (index === 0) {
    if (operands.length !== 1 || operands[0] !== 2) {
      fail('Rust/WASM compiler did not bootstrap the single main() kernel');
    }
  }
  if (index === 2) {
    if (operands.length !== 1 || typeof operands[0] !== 'string') {
      fail('Rust/WASM compiler did not emit one string plan result');
    }
  }
  return value as unknown as UAALInstruction;
}

function parseKernelBytecode(raw: string, kernelOpcodes: readonly UAALOpCode[]): UAALBytecode {
  if (byteLength(raw) > MAX_COMPILER_PACKET_BYTES) {
    fail(`Rust/WASM compiler packet exceeds ${MAX_COMPILER_PACKET_BYTES} bytes`);
  }
  let packet: unknown;
  try {
    packet = JSON.parse(raw);
  } catch (error) {
    fail(
      `Rust/WASM compiler returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (!isRecord(packet)) fail('Rust/WASM compiler returned a non-object packet');
  if (typeof packet.error === 'string') {
    fail(`Rust/WASM compile failed: ${packet.error}`);
  }
  if (packet.version !== 1 || !Array.isArray(packet.instructions)) {
    fail('Rust/WASM compiler returned an unsupported UAAL packet');
  }
  assertExactKeys(packet, ['version', 'instructions'], 'UAAL bytecode packet');
  if (packet.instructions.length !== kernelOpcodes.length) {
    fail('Rust/WASM compiler emitted code outside the constant plan kernel');
  }
  const instructions = packet.instructions.map((instruction, index) =>
    validateInstruction(instruction, index, kernelOpcodes[index])
  );
  return { version: 1, instructions };
}

function parseCanonicalPlan(value: string): unknown[] {
  if (byteLength(value) > MAX_PLAN_JSON_BYTES) {
    fail(`main() result exceeds ${MAX_PLAN_JSON_BYTES} bytes`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    fail(`main() result is not JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!Array.isArray(parsed)) fail('main() result must be a JSON array');
  let canonical: string;
  try {
    canonical = canonicalizeHeadlessValue(parsed);
  } catch (error) {
    fail(
      `main() result is not strict JSON: ${error instanceof Error ? error.message : String(error)}`
    );
  }
  if (canonical !== value) {
    fail('main() result must use canonical JSON encoding');
  }
  return parsed;
}

function expectedKernelOpcodes(uaal: typeof import('@holoscript/uaal')): readonly UAALOpCode[] {
  return [
    uaal.UAALOpCode.CALL,
    uaal.UAALOpCode.HALT,
    uaal.UAALOpCode.PUSH,
    uaal.UAALOpCode.RET,
    uaal.UAALOpCode.RET,
  ] as const;
}

function deterministicExecutionTrace(log: UAALExecutionLog): DeterministicUAALExecutionTrace {
  return {
    version: log.version,
    bytecodeSha256: log.bytecodeSha256,
    initialContext: log.initialContext,
    limits: log.limits,
    steps: log.steps,
    result: log.result,
  };
}

function provenancePreimage(
  provenance: HsPlanKernelExecutionProvenance
): Omit<HsPlanKernelExecutionProvenance, 'provenanceCommitment'> {
  return {
    schema: provenance.schema,
    engine: provenance.engine,
    hashAlgorithm: provenance.hashAlgorithm,
    sourceHash: provenance.sourceHash,
    parser: provenance.parser,
    compiler: provenance.compiler,
    bytecode: provenance.bytecode,
    vm: provenance.vm,
    result: provenance.result,
  };
}

function assertSha256(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
    fail(`${label} must be a SHA-256 digest`);
  }
}

function assertExpectedVmProfile(
  profile: UAALVMExecutionProfile
): asserts profile is HsPlanKernelVmExecutionProfile {
  if (
    canonicalizeHeadlessValue(profile) !==
    canonicalizeHeadlessValue({
      schema: 'holoscript.uaal-vm.execution-profile.v1',
      implementation: HS_PLAN_KERNEL_VM,
      limits: HS_PLAN_KERNEL_UAAL_LIMITS,
      registeredHandlerOpcodes: [],
    })
  ) {
    fail('UAAL VM execution profile is not the handler-free bounded kernel profile');
  }
}

/**
 * Compile and execute the deliberately tiny `.hs` deterministic-plan kernel.
 *
 * Rust/WASM parses and emits the function. The service-independent UAAL VM
 * executes its exact constant-return bytecode. This proves a real `.hs`
 * entrypoint through both shipped layers, but is not general pipeline, native
 * machine-code, or full-language execution.
 */
export async function executeHsPlanKernel(source: string): Promise<HsPlanKernelExecutionResult> {
  if (typeof source !== 'string' || source.trim().length === 0) {
    fail('source must be a non-empty string');
  }
  if (byteLength(source) > MAX_SOURCE_BYTES) {
    fail(`source exceeds ${MAX_SOURCE_BYTES} bytes`);
  }
  const [wasm, uaal] = await Promise.all([
    import('@holoscript/wasm/node'),
    import('@holoscript/uaal'),
  ]);
  const parsed = parseAuthoredPlanLiteral(wasm.parse(source));
  const kernelOpcodes = expectedKernelOpcodes(uaal);
  const bytecode = parseKernelBytecode(wasm.compile_to_uaal(source), kernelOpcodes);
  const emittedPlan = (bytecode.instructions[2].operands as [string])[0];
  if (emittedPlan !== parsed.value) {
    fail('Rust/WASM compiler result does not match the authored main() literal');
  }

  const vm = new uaal.UAALVirtualMachine({
    ...HS_PLAN_KERNEL_UAAL_LIMITS,
    recordLog: true,
  });
  const vmProfile = vm.getExecutionProfile();
  assertExpectedVmProfile(vmProfile);
  const result = await vm.execute(bytecode);
  const executionTrace = deterministicExecutionTrace(vm.exportLog());
  const finalVmProfile = vm.getExecutionProfile();
  assertExpectedVmProfile(finalVmProfile);
  if (canonicalizeHeadlessValue(finalVmProfile) !== canonicalizeHeadlessValue(vmProfile)) {
    fail('UAAL VM execution profile changed while the plan kernel ran');
  }
  if (
    result.taskStatus !== 'HALTED' ||
    !result.state.isHalted ||
    result.state.callStack.length !== 0 ||
    result.state.stack.length !== 1 ||
    Object.keys(result.state.context).length !== 0 ||
    result.stackTop !== emittedPlan
  ) {
    fail('UAAL VM did not halt with the single compiled plan result');
  }
  if (
    executionTrace.steps.some(
      (step) =>
        step.injected === true ||
        step.source !== undefined ||
        step.effects !== undefined ||
        step.threw === true
    )
  ) {
    fail('UAAL VM plan kernel used an injected, handler, nondeterministic, or throwing step');
  }
  const observedProgramCounters = executionTrace.steps.map((step) => step.pc);
  const observedOpcodes = executionTrace.steps.map((step) => step.opcode);
  if (
    canonicalizeHeadlessValue(observedProgramCounters) !==
      canonicalizeHeadlessValue(HS_PLAN_KERNEL_TRACE_PROGRAM_COUNTERS) ||
    canonicalizeHeadlessValue(observedOpcodes) !==
      canonicalizeHeadlessValue(HS_PLAN_KERNEL_TRACE_OPCODES)
  ) {
    fail('UAAL VM execution trace differs from the exact plan kernel');
  }

  const data = parseCanonicalPlan(result.stackTop);
  const bytecodeHash = uaal.computeUAALBytecodeSha256(bytecode);
  if (executionTrace.bytecodeSha256 !== bytecodeHash) {
    fail('UAAL execution trace bytecode hash does not match the compiled packet');
  }
  const compilerVersion = wasm.version();
  if (typeof compilerVersion !== 'string' || compilerVersion.length === 0) {
    fail('Rust/WASM compiler did not expose its crate version');
  }
  const provenanceWithoutCommitment: Omit<HsPlanKernelExecutionProvenance, 'provenanceCommitment'> =
    {
      schema: HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA,
      engine: RUST_WASM_UAAL_HS_PLAN_KERNEL,
      hashAlgorithm: HEADLESS_EXPERIMENT_HASH_ALGORITHM,
      sourceHash: hashHeadlessValue(source),
      parser: {
        implementation: HS_PLAN_KERNEL_PARSER,
        astHash: parsed.astHash,
      },
      compiler: {
        implementation: HS_PLAN_KERNEL_COMPILER,
        crateVersion: compilerVersion,
      },
      bytecode: {
        version: 1,
        instructionCount: 5,
        hashAlgorithm: uaal.UAAL_BYTECODE_HASH_ALGORITHM,
        sha256: bytecodeHash,
      },
      vm: {
        implementation: vmProfile.implementation,
        profile: vmProfile,
        trace: {
          schema: HS_PLAN_KERNEL_TRACE_SCHEMA,
          executionLogVersion: executionTrace.version,
          executedInstructionCount: 4,
          programCounters: HS_PLAN_KERNEL_TRACE_PROGRAM_COUNTERS,
          opcodes: HS_PLAN_KERNEL_TRACE_OPCODES,
          traceHash: hashHeadlessValue(executionTrace),
          finalTaskStatus: 'HALTED',
        },
      },
      result: {
        returnedPlanHash: hashHeadlessValue(data),
        recordCount: data.length,
      },
    };
  const provenance: HsPlanKernelExecutionProvenance = {
    ...provenanceWithoutCommitment,
    provenanceCommitment: hashHeadlessValue(provenanceWithoutCommitment),
  };
  if (byteLength(canonicalizeHeadlessValue(provenance)) > MAX_PROVENANCE_BYTES) {
    fail(`execution provenance exceeds ${MAX_PROVENANCE_BYTES} bytes`);
  }
  return { count: data.length, data, provenance };
}

/**
 * Re-verify an untrusted plan-kernel provenance claim against the installed
 * compiler/VM contracts. Parsing, compilation, and VM execution are repeated
 * from the required source and must reproduce the claim exactly.
 */
export async function verifyHsPlanKernelExecutionProvenance(
  input: unknown,
  options: HsPlanKernelProvenanceVerificationOptions
): Promise<HsPlanKernelProvenanceVerificationResult> {
  try {
    const canonicalInput = canonicalizeHeadlessValue(input);
    if (byteLength(canonicalInput) > MAX_PROVENANCE_BYTES) {
      fail(`execution provenance exceeds ${MAX_PROVENANCE_BYTES} bytes`);
    }
    assertExactKeys(
      input,
      [
        'schema',
        'engine',
        'hashAlgorithm',
        'sourceHash',
        'parser',
        'compiler',
        'bytecode',
        'vm',
        'result',
        'provenanceCommitment',
      ],
      'execution provenance'
    );
    const provenance = input as unknown as HsPlanKernelExecutionProvenance;
    assertExactKeys(provenance.parser, ['implementation', 'astHash'], 'parser provenance');
    assertExactKeys(provenance.compiler, ['implementation', 'crateVersion'], 'compiler provenance');
    assertExactKeys(provenance.vm, ['implementation', 'profile', 'trace'], 'VM provenance');
    assertExactKeys(
      provenance.bytecode,
      ['version', 'instructionCount', 'hashAlgorithm', 'sha256'],
      'UAAL bytecode provenance'
    );
    assertExactKeys(provenance.result, ['returnedPlanHash', 'recordCount'], 'result provenance');
    assertExactKeys(
      provenance.vm.trace,
      [
        'schema',
        'executionLogVersion',
        'executedInstructionCount',
        'programCounters',
        'opcodes',
        'traceHash',
        'finalTaskStatus',
      ],
      'compact UAAL execution trace'
    );
    if (
      provenance.schema !== HS_PLAN_KERNEL_EXECUTION_PROVENANCE_SCHEMA ||
      provenance.engine !== RUST_WASM_UAAL_HS_PLAN_KERNEL ||
      provenance.hashAlgorithm !== HEADLESS_EXPERIMENT_HASH_ALGORITHM
    ) {
      fail('execution provenance identity mismatch');
    }
    if (
      provenance.parser.implementation !== HS_PLAN_KERNEL_PARSER ||
      provenance.compiler.implementation !== HS_PLAN_KERNEL_COMPILER ||
      provenance.vm.implementation !== HS_PLAN_KERNEL_VM
    ) {
      fail('compiler or VM implementation identity mismatch');
    }
    assertSha256(provenance.sourceHash, 'sourceHash');
    assertSha256(provenance.parser.astHash, 'parser.astHash');
    assertSha256(provenance.bytecode.sha256, 'bytecode.sha256');
    assertSha256(provenance.vm.trace.traceHash, 'vm.trace.traceHash');
    assertSha256(provenance.result.returnedPlanHash, 'result.returnedPlanHash');
    assertSha256(provenance.provenanceCommitment, 'provenanceCommitment');
    assertExpectedVmProfile(provenance.vm.profile);
    if (
      provenance.bytecode.version !== 1 ||
      provenance.bytecode.instructionCount !== 5 ||
      provenance.bytecode.hashAlgorithm !== 'sha256-uaal-bytecode-canonical-v1' ||
      provenance.vm.trace.schema !== HS_PLAN_KERNEL_TRACE_SCHEMA ||
      provenance.vm.trace.executionLogVersion !== 'uaal.execution-log.v0' ||
      provenance.vm.trace.executedInstructionCount !== 4 ||
      canonicalizeHeadlessValue(provenance.vm.trace.programCounters) !==
        canonicalizeHeadlessValue(HS_PLAN_KERNEL_TRACE_PROGRAM_COUNTERS) ||
      canonicalizeHeadlessValue(provenance.vm.trace.opcodes) !==
        canonicalizeHeadlessValue(HS_PLAN_KERNEL_TRACE_OPCODES) ||
      provenance.vm.trace.finalTaskStatus !== 'HALTED'
    ) {
      fail('recorded UAAL bytecode or compact trace is outside the exact plan kernel');
    }
    if (provenance.provenanceCommitment !== hashHeadlessValue(provenancePreimage(provenance))) {
      fail('execution provenance commitment mismatch');
    }
    if (!options || typeof options.expectedSource !== 'string') {
      fail('source-backed verification requires the expected .hs source');
    }
    const observed = await executeHsPlanKernel(options.expectedSource);
    if (canonicalizeHeadlessValue(observed.provenance) !== canonicalizeHeadlessValue(provenance)) {
      fail('source-backed compiler/VM evidence differs from the sealed provenance');
    }
    if (
      options.expectedRecords !== undefined &&
      canonicalizeHeadlessValue(observed.data) !==
        canonicalizeHeadlessValue(options.expectedRecords)
    ) {
      fail('returned plan differs from the expected records');
    }
    return { valid: true, errors: [] };
  } catch (error) {
    return {
      valid: false,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
}

import { canonicalizeHeadlessValue } from '@holoscript/engine/runtime';
import type { UAALBytecode, UAALInstruction, UAALOpCode } from '@holoscript/uaal';

export const RUST_WASM_UAAL_HS_PLAN_KERNEL = 'holoscript-rust-wasm-uaal-plan-kernel-v1' as const;

const MAX_SOURCE_BYTES = 256 * 1024;
const MAX_PARSER_PACKET_BYTES = 1024 * 1024;
const MAX_COMPILER_PACKET_BYTES = 1024 * 1024;
const MAX_PLAN_JSON_BYTES = 512 * 1024;

export interface HsPlanKernelExecutionResult {
  count: number;
  data: unknown[];
}

function fail(message: string): never {
  throw new Error(`Deterministic .hs plan kernel: ${message}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function byteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function parseAuthoredPlanLiteral(raw: string): string {
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
  return returned.argument.value;
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
  const authoredPlan = parseAuthoredPlanLiteral(wasm.parse(source));
  const kernelOpcodes = [
    uaal.UAALOpCode.CALL,
    uaal.UAALOpCode.HALT,
    uaal.UAALOpCode.PUSH,
    uaal.UAALOpCode.RET,
    uaal.UAALOpCode.RET,
  ] as const;
  const bytecode = parseKernelBytecode(wasm.compile_to_uaal(source), kernelOpcodes);
  const emittedPlan = (bytecode.instructions[2].operands as [string])[0];
  if (emittedPlan !== authoredPlan) {
    fail('Rust/WASM compiler result does not match the authored main() literal');
  }

  const result = await new uaal.UAALVirtualMachine({
    maxInstructions: 16,
    maxStackSize: 4,
    maxCallDepth: 2,
  }).execute(bytecode);
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

  const data = parseCanonicalPlan(result.stackTop);
  return { count: data.length, data };
}

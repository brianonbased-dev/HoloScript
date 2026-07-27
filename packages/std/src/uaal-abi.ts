/**
 * Public host adapter for the EXEC ABIs emitted by HoloScript's UAAL compiler.
 *
 * The VM deliberately leaves EXEC host-defined. This adapter keeps the standard-library
 * arithmetic and aggregate-value contracts in one versioned, independently testable place.
 */

export const HOLOSCRIPT_I32_BINARY_ABI = 'hs.i32.binary.v1' as const;
export const HOLOSCRIPT_F32_BINARY_ABI = 'hs.f32.binary.v1' as const;
export const HOLOSCRIPT_F64_BINARY_ABI = 'hs.f64.binary.v1' as const;
export const HOLOSCRIPT_AGGREGATE_VALUE_ABI = 'hs.aggregate.value.v1' as const;

export type HoloScriptStdUaalOperand =
  | string
  | number
  | boolean
  | Record<string, unknown>
  | HoloScriptStdUaalOperand[]
  | null;

export interface HoloScriptStdUaalVmProxy {
  push(value: HoloScriptStdUaalOperand): void;
  pop(): HoloScriptStdUaalOperand;
  peek(): HoloScriptStdUaalOperand;
}

export type HoloScriptStdUaalExecHandler = (
  proxy: HoloScriptStdUaalVmProxy,
  operands: HoloScriptStdUaalOperand[]
) => void | Promise<void>;

export interface HoloScriptStdUaalVm {
  registerHandler(opcode: number, handler: HoloScriptStdUaalExecHandler): void;
}

interface AggregateEnvelope extends Record<string, unknown> {
  readonly abi: typeof HOLOSCRIPT_AGGREGATE_VALUE_ABI;
  readonly layout: string;
  readonly fields: readonly string[];
  readonly types: readonly string[];
  readonly values: readonly HoloScriptStdUaalOperand[];
}

function requireStringArray(
  value: HoloScriptStdUaalOperand | undefined,
  label: string
): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} ${label} must be a string array`);
  }
  return [...value];
}

function requireScalarField(
  value: HoloScriptStdUaalOperand,
  type: string,
  field: string
): void {
  switch (type) {
    case 'i32':
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < -2_147_483_648 ||
        value > 2_147_483_647
      ) {
        throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} field \`${field}\` requires i32`);
      }
      return;
    case 'f32':
      if (
        typeof value !== 'number' ||
        !Number.isFinite(value) ||
        Math.fround(value) !== value
      ) {
        throw new Error(
          `${HOLOSCRIPT_AGGREGATE_VALUE_ABI} field \`${field}\` requires finite rounded f32`
        );
      }
      return;
    case 'f64':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} field \`${field}\` requires finite f64`);
      }
      return;
    case 'bool':
      if (typeof value !== 'boolean') {
        throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} field \`${field}\` requires bool`);
      }
      return;
    default:
      throw new Error(
        `${HOLOSCRIPT_AGGREGATE_VALUE_ABI} rejects unsupported field type \`${type}\``
      );
  }
}

function isAggregateEnvelope(value: HoloScriptStdUaalOperand): value is AggregateEnvelope {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    value.abi === HOLOSCRIPT_AGGREGATE_VALUE_ABI &&
    typeof value.layout === 'string' &&
    Array.isArray(value.fields) &&
    Array.isArray(value.types) &&
    Array.isArray(value.values)
  );
}

function executeAggregateAbi(
  proxy: HoloScriptStdUaalVmProxy,
  operands: HoloScriptStdUaalOperand[]
): void {
  const operation = operands[1];
  const layout = operands[2];
  if (typeof operation !== 'string' || typeof layout !== 'string') {
    throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} requires operation and layout`);
  }

  if (operation === 'construct') {
    const fields = requireStringArray(operands[3], 'fields');
    const types = requireStringArray(operands[4], 'types');
    if (fields.length !== types.length) {
      throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} field/type arity mismatch`);
    }
    const values = new Array<HoloScriptStdUaalOperand>(fields.length);
    for (let index = fields.length - 1; index >= 0; index -= 1) {
      const value = proxy.pop();
      requireScalarField(value, types[index], fields[index]);
      values[index] = value;
    }
    const aggregate: AggregateEnvelope = Object.freeze({
      abi: HOLOSCRIPT_AGGREGATE_VALUE_ABI,
      layout,
      fields: Object.freeze(fields),
      types: Object.freeze(types),
      values: Object.freeze(values),
    });
    proxy.push(aggregate);
    return;
  }

  if (operation === 'project') {
    const field = operands[3];
    const index = operands[4];
    const type = operands[5];
    if (
      typeof field !== 'string' ||
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      typeof type !== 'string'
    ) {
      throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} projection metadata is malformed`);
    }
    const aggregate = proxy.pop();
    if (!isAggregateEnvelope(aggregate)) {
      throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} projection requires an aggregate value`);
    }
    if (aggregate.layout !== layout) {
      throw new Error(
        `${HOLOSCRIPT_AGGREGATE_VALUE_ABI} layout mismatch: expected \`${layout}\`, found \`${aggregate.layout}\``
      );
    }
    if (aggregate.fields[index] !== field || aggregate.types[index] !== type) {
      throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} projection descriptor mismatch`);
    }
    const value = aggregate.values[index];
    if (value === undefined) {
      throw new Error(`${HOLOSCRIPT_AGGREGATE_VALUE_ABI} projection index is out of bounds`);
    }
    requireScalarField(value, type, field);
    proxy.push(value);
    return;
  }

  throw new Error(
    `${HOLOSCRIPT_AGGREGATE_VALUE_ABI} does not support operation \`${operation}\``
  );
}

function executeNumericAbi(
  proxy: HoloScriptStdUaalVmProxy,
  abi: string,
  operator: string
): void {
  const right = proxy.pop();
  const left = proxy.pop();
  if (typeof left !== 'number' || typeof right !== 'number') {
    throw new Error(`${abi} requires numeric operands`);
  }
  const isI32 = abi === HOLOSCRIPT_I32_BINARY_ABI;
  const isF32 = abi === HOLOSCRIPT_F32_BINARY_ABI;
  if (!isI32 && (!Number.isFinite(left) || !Number.isFinite(right))) {
    throw new Error(`${abi} requires finite operands`);
  }
  const roundedLeft = isF32 ? Math.fround(left) : left;
  const roundedRight = isF32 ? Math.fround(right) : right;
  const pushArithmetic = (value: number): void => {
    proxy.push(isF32 ? Math.fround(value) : value);
  };
  switch (operator) {
    case '+':
      if (isI32) proxy.push((left + right) | 0);
      else pushArithmetic(roundedLeft + roundedRight);
      return;
    case '-':
      if (isI32) proxy.push((left - right) | 0);
      else pushArithmetic(roundedLeft - roundedRight);
      return;
    case '*':
      if (isI32) proxy.push(Math.imul(left, right));
      else pushArithmetic(roundedLeft * roundedRight);
      return;
    case '/':
      if (isI32) throw new Error(`${HOLOSCRIPT_I32_BINARY_ABI} does not support division`);
      if (roundedRight === 0) throw new Error(`${abi} rejects division by zero`);
      pushArithmetic(roundedLeft / roundedRight);
      return;
    case '==':
      proxy.push(roundedLeft === roundedRight);
      return;
    case '!=':
      proxy.push(roundedLeft !== roundedRight);
      return;
    case '<':
      proxy.push(roundedLeft < roundedRight);
      return;
    case '<=':
      proxy.push(roundedLeft <= roundedRight);
      return;
    case '>':
      proxy.push(roundedLeft > roundedRight);
      return;
    case '>=':
      proxy.push(roundedLeft >= roundedRight);
      return;
    default:
      throw new Error(`unsupported ${abi} operator: ${operator}`);
  }
}

/**
 * Register the standard HoloScript EXEC ABI multiplexer on a UAAL VM.
 *
 * `execOpcode` is explicit so this package does not couple itself to a specific UAAL package
 * version. Pass `UAALOpCode.EXEC` from the VM used by the embedding host.
 */
export function registerHoloScriptStdUaalExecHandler(
  vm: HoloScriptStdUaalVm,
  execOpcode: number
): void {
  vm.registerHandler(execOpcode, (proxy, operands) => {
    const abi = operands[0];
    if (abi === HOLOSCRIPT_AGGREGATE_VALUE_ABI) {
      executeAggregateAbi(proxy, operands);
      return;
    }
    const operator = operands[1];
    if (
      (abi !== HOLOSCRIPT_I32_BINARY_ABI &&
        abi !== HOLOSCRIPT_F32_BINARY_ABI &&
        abi !== HOLOSCRIPT_F64_BINARY_ABI) ||
      typeof operator !== 'string'
    ) {
      throw new Error(`unsupported HoloScript EXEC ABI: ${String(abi)}`);
    }
    executeNumericAbi(proxy, abi, operator);
  });
}

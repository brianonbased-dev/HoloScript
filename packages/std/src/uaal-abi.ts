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
export const HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2 = 'hs.aggregate.value.v2' as const;

type HoloScriptAggregateValueAbi =
  | typeof HOLOSCRIPT_AGGREGATE_VALUE_ABI
  | typeof HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2;

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
  readonly abi: HoloScriptAggregateValueAbi;
  readonly layout: string;
  readonly fields: readonly string[];
  readonly types: readonly string[];
  readonly values: readonly HoloScriptStdUaalOperand[];
}

function requireStringArray(
  value: HoloScriptStdUaalOperand | undefined,
  label: string,
  abi: HoloScriptAggregateValueAbi
): string[] {
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === 'string')) {
    throw new Error(`${abi} ${label} must be a string array`);
  }
  return [...value];
}

function requireIndexArray(
  value: HoloScriptStdUaalOperand | undefined,
  label: string,
  abi: HoloScriptAggregateValueAbi
): number[] {
  if (
    !Array.isArray(value) ||
    !value.every((entry) => typeof entry === 'number' && Number.isInteger(entry) && entry >= 0)
  ) {
    throw new Error(`${abi} ${label} must be a non-negative integer array`);
  }
  return [...value] as number[];
}

function requireScalarField(
  value: HoloScriptStdUaalOperand,
  type: string,
  field: string,
  abi: HoloScriptAggregateValueAbi
): void {
  switch (type) {
    case 'i32':
      if (
        typeof value !== 'number' ||
        !Number.isInteger(value) ||
        value < -2_147_483_648 ||
        value > 2_147_483_647
      ) {
        throw new Error(`${abi} field \`${field}\` requires i32`);
      }
      return;
    case 'f32':
      if (typeof value !== 'number' || !Number.isFinite(value) || Math.fround(value) !== value) {
        throw new Error(`${abi} field \`${field}\` requires finite rounded f32`);
      }
      return;
    case 'f64':
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        throw new Error(`${abi} field \`${field}\` requires finite f64`);
      }
      return;
    case 'bool':
      if (typeof value !== 'boolean') {
        throw new Error(`${abi} field \`${field}\` requires bool`);
      }
      return;
    default:
      throw new Error(`${abi} rejects unsupported scalar field type \`${type}\``);
  }
}

function isAggregateEnvelope(value: HoloScriptStdUaalOperand): value is AggregateEnvelope {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    (value.abi === HOLOSCRIPT_AGGREGATE_VALUE_ABI ||
      value.abi === HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2) &&
    typeof value.layout === 'string' &&
    Array.isArray(value.fields) &&
    value.fields.every((field) => typeof field === 'string') &&
    Array.isArray(value.types) &&
    value.types.every((type) => typeof type === 'string') &&
    Array.isArray(value.values) &&
    value.fields.length === value.types.length &&
    value.fields.length === value.values.length
  );
}

function requireAggregateField(
  value: HoloScriptStdUaalOperand,
  layout: string,
  field: string,
  abi: HoloScriptAggregateValueAbi
): AggregateEnvelope {
  if (!isAggregateEnvelope(value)) {
    throw new Error(`${abi} field \`${field}\` requires nested aggregate \`${layout}\``);
  }
  if (value.layout !== layout) {
    throw new Error(
      `${abi} nested layout mismatch for field \`${field}\`: expected \`${layout}\`, found \`${value.layout}\``
    );
  }
  return value;
}

function requireFieldValue(
  value: HoloScriptStdUaalOperand,
  type: string,
  field: string,
  abi: HoloScriptAggregateValueAbi
): void {
  if (type === 'i32' || type === 'f32' || type === 'f64' || type === 'bool') {
    requireScalarField(value, type, field, abi);
    return;
  }
  if (abi === HOLOSCRIPT_AGGREGATE_VALUE_ABI) {
    throw new Error(`${abi} rejects nested field layout \`${type}\``);
  }
  requireAggregateField(value, type, field, abi);
}

function executeAggregateAbi(
  proxy: HoloScriptStdUaalVmProxy,
  operands: HoloScriptStdUaalOperand[],
  abi: HoloScriptAggregateValueAbi
): void {
  const operation = operands[1];
  const layout = operands[2];
  if (typeof operation !== 'string' || typeof layout !== 'string') {
    throw new Error(`${abi} requires operation and layout`);
  }

  if (operation === 'construct') {
    const fields = requireStringArray(operands[3], 'fields', abi);
    const types = requireStringArray(operands[4], 'types', abi);
    if (fields.length !== types.length) {
      throw new Error(`${abi} field/type arity mismatch`);
    }
    const values = new Array<HoloScriptStdUaalOperand>(fields.length);
    for (let index = fields.length - 1; index >= 0; index -= 1) {
      const value = proxy.pop();
      requireFieldValue(value, types[index], fields[index], abi);
      values[index] = value;
    }
    const aggregate: AggregateEnvelope = Object.freeze({
      abi,
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
      throw new Error(`${abi} projection metadata is malformed`);
    }
    const aggregate = proxy.pop();
    if (!isAggregateEnvelope(aggregate)) {
      throw new Error(`${abi} projection requires an aggregate value`);
    }
    if (aggregate.abi !== abi || aggregate.layout !== layout) {
      throw new Error(
        `${abi} layout mismatch: expected \`${layout}\`, found \`${aggregate.layout}\``
      );
    }
    if (aggregate.fields[index] !== field || aggregate.types[index] !== type) {
      throw new Error(`${abi} projection descriptor mismatch`);
    }
    if (index < 0 || index >= aggregate.values.length) {
      throw new Error(`${abi} projection index is out of bounds`);
    }
    const value = aggregate.values[index];
    requireScalarField(value, type, field, abi);
    proxy.push(value);
    return;
  }

  if (operation === 'project_path' && abi === HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2) {
    const fields = requireStringArray(operands[3], 'projection fields', abi);
    const indices = requireIndexArray(operands[4], 'projection indices', abi);
    const leafType = operands[5];
    if (fields.length === 0 || fields.length !== indices.length || typeof leafType !== 'string') {
      throw new Error(`${abi} projection path metadata is malformed`);
    }
    const root = proxy.pop();
    if (!isAggregateEnvelope(root) || root.abi !== abi) {
      throw new Error(`${abi} projection path requires a v2 aggregate value`);
    }
    if (root.layout !== layout) {
      throw new Error(`${abi} layout mismatch: expected \`${layout}\`, found \`${root.layout}\``);
    }

    let current = root;
    for (let pathIndex = 0; pathIndex < fields.length; pathIndex += 1) {
      const field = fields[pathIndex];
      const index = indices[pathIndex];
      if (index >= current.values.length || current.fields[index] !== field) {
        throw new Error(`${abi} projection path descriptor mismatch at \`${field}\``);
      }
      const descriptor = current.types[index];
      const value = current.values[index];
      const isLeaf = pathIndex + 1 === fields.length;
      if (isLeaf) {
        if (descriptor !== leafType) {
          throw new Error(`${abi} projection leaf descriptor mismatch at \`${field}\``);
        }
        requireScalarField(value, leafType, fields.join('.'), abi);
        proxy.push(value);
        return;
      }
      current = requireAggregateField(
        value,
        descriptor,
        fields.slice(0, pathIndex + 1).join('.'),
        abi
      );
    }
  }

  throw new Error(`${abi} does not support operation \`${operation}\``);
}

function executeNumericAbi(proxy: HoloScriptStdUaalVmProxy, abi: string, operator: string): void {
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
    if (abi === HOLOSCRIPT_AGGREGATE_VALUE_ABI || abi === HOLOSCRIPT_AGGREGATE_VALUE_ABI_V2) {
      executeAggregateAbi(proxy, operands, abi);
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

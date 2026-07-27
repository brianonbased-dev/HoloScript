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
export const HOLOSCRIPT_OWNED_BUFFER_ABI = 'hs.buffer.owned.v1' as const;

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

export interface HoloScriptStdUaalOwnedBufferOpcodes {
  readonly allocate: number;
  readonly move: number;
  readonly load: number;
  readonly store: number;
  readonly drop: number;
  readonly length: number;
}

interface OwnedBufferToken extends Record<string, unknown> {
  readonly abi: typeof HOLOSCRIPT_OWNED_BUFFER_ABI;
  readonly token: number;
  readonly elementType: string;
  readonly length: number;
}

interface OwnedBufferCell {
  readonly elementType: string;
  readonly values: HoloScriptStdUaalOperand[];
  currentToken: number;
  dropped: boolean;
}

interface AggregateEnvelope extends Record<string, unknown> {
  readonly abi: HoloScriptAggregateValueAbi;
  readonly layout: string;
  readonly fields: readonly string[];
  readonly types: readonly string[];
  readonly values: readonly HoloScriptStdUaalOperand[];
}

function requireOwnedBufferElement(
  value: HoloScriptStdUaalOperand,
  elementType: string,
  context: string
): void {
  if (elementType === 'i32') {
    if (
      typeof value !== 'number' ||
      !Number.isInteger(value) ||
      value < -2_147_483_648 ||
      value > 2_147_483_647
    ) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} ${context} requires i32`);
    }
    return;
  }
  if (elementType === 'f32') {
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.fround(value) !== value) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} ${context} requires finite rounded f32`);
    }
    return;
  }
  if (elementType === 'f64') {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} ${context} requires finite f64`);
    }
    return;
  }
  if (elementType === 'bool') {
    if (typeof value !== 'boolean') {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} ${context} requires bool`);
    }
    return;
  }
  throw new Error(
    `${HOLOSCRIPT_OWNED_BUFFER_ABI} rejects unsupported element type \`${elementType}\``
  );
}

function requireOwnedBufferElementType(operands: HoloScriptStdUaalOperand[]): string {
  const elementType = operands[0];
  if (
    elementType !== 'i32' &&
    elementType !== 'f32' &&
    elementType !== 'f64' &&
    elementType !== 'bool'
  ) {
    throw new Error(
      `${HOLOSCRIPT_OWNED_BUFFER_ABI} requires an i32, f32, f64, or bool element type`
    );
  }
  return elementType;
}

function isOwnedBufferToken(value: HoloScriptStdUaalOperand): value is OwnedBufferToken {
  return (
    value !== null &&
    !Array.isArray(value) &&
    typeof value === 'object' &&
    value.abi === HOLOSCRIPT_OWNED_BUFFER_ABI &&
    typeof value.token === 'number' &&
    Number.isInteger(value.token) &&
    typeof value.elementType === 'string' &&
    typeof value.length === 'number' &&
    Number.isInteger(value.length) &&
    value.length >= 0
  );
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

/**
 * Register the explicit owned-buffer opcodes emitted by HoloScript's UAAL compiler.
 *
 * Each frozen operand token names one affine owner. A move rotates that token without cloning
 * its backing cell, while stale-token, double-drop, type, and bounds checks fail closed at the
 * host boundary even for malformed bytecode that bypassed the compiler's static ownership pass.
 */
export function registerHoloScriptStdUaalOwnedBufferHandlers(
  vm: HoloScriptStdUaalVm,
  opcodes: HoloScriptStdUaalOwnedBufferOpcodes
): void {
  let nextToken = 1;
  const cells = new Map<number, OwnedBufferCell>();

  const makeToken = (cell: OwnedBufferCell): OwnedBufferToken => {
    const tokenId = nextToken;
    nextToken += 1;
    cell.currentToken = tokenId;
    cells.set(tokenId, cell);
    return Object.freeze({
      abi: HOLOSCRIPT_OWNED_BUFFER_ABI,
      token: tokenId,
      elementType: cell.elementType,
      length: cell.values.length,
    });
  };

  const requireActive = (
    value: HoloScriptStdUaalOperand,
    elementType: string
  ): { token: OwnedBufferToken; cell: OwnedBufferCell } => {
    if (!isOwnedBufferToken(value)) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} requires an owned-buffer token`);
    }
    const cell = cells.get(value.token);
    if (!cell || cell.elementType !== elementType || value.elementType !== elementType) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} token element-type mismatch`);
    }
    if (cell.dropped) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} owner was already dropped`);
    }
    if (cell.currentToken !== value.token) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} stale owner used after move`);
    }
    return { token: value, cell };
  };

  const requireIndex = (value: HoloScriptStdUaalOperand, length: number): number => {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} index requires i32`);
    }
    if (value < 0 || value >= length) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} index is out of bounds`);
    }
    return value;
  };

  vm.registerHandler(opcodes.allocate, (proxy, operands) => {
    const elementType = requireOwnedBufferElementType(operands);
    const fill = proxy.pop();
    const length = proxy.pop();
    if (
      typeof length !== 'number' ||
      !Number.isInteger(length) ||
      length < 0 ||
      length > 0x7fff_ffff
    ) {
      throw new Error(`${HOLOSCRIPT_OWNED_BUFFER_ABI} length requires non-negative i32`);
    }
    requireOwnedBufferElement(fill, elementType, 'fill');
    const cell: OwnedBufferCell = {
      elementType,
      values: new Array<HoloScriptStdUaalOperand>(length).fill(fill),
      currentToken: 0,
      dropped: false,
    };
    proxy.push(makeToken(cell));
  });

  vm.registerHandler(opcodes.move, (proxy, operands) => {
    const elementType = requireOwnedBufferElementType(operands);
    const { cell } = requireActive(proxy.pop(), elementType);
    proxy.push(makeToken(cell));
  });

  vm.registerHandler(opcodes.load, (proxy, operands) => {
    const elementType = requireOwnedBufferElementType(operands);
    const rawIndex = proxy.pop();
    const { cell } = requireActive(proxy.pop(), elementType);
    const index = requireIndex(rawIndex, cell.values.length);
    const value = cell.values[index];
    requireOwnedBufferElement(value, elementType, `element ${index}`);
    proxy.push(value);
  });

  vm.registerHandler(opcodes.store, (proxy, operands) => {
    const elementType = requireOwnedBufferElementType(operands);
    const value = proxy.pop();
    const rawIndex = proxy.pop();
    const { cell } = requireActive(proxy.pop(), elementType);
    const index = requireIndex(rawIndex, cell.values.length);
    requireOwnedBufferElement(value, elementType, `element ${index}`);
    cell.values[index] = value;
  });

  vm.registerHandler(opcodes.drop, (proxy, operands) => {
    const elementType = requireOwnedBufferElementType(operands);
    const { cell } = requireActive(proxy.pop(), elementType);
    cell.dropped = true;
    cell.values.length = 0;
  });

  vm.registerHandler(opcodes.length, (proxy, operands) => {
    const elementType = requireOwnedBufferElementType(operands);
    const { cell } = requireActive(proxy.pop(), elementType);
    proxy.push(cell.values.length);
  });
}

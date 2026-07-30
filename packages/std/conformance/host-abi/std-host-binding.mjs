/**
 * Canonical std host-ABI binding implementation (v0).
 *
 * Implements packages/std/conformance/host-abi/std-host-abi.v0.json as one
 * self-contained, dependency-free ESM module so the identical host code runs
 * on every target: the engine deterministic runtime (node), the compiler-wasm
 * evaluator's host-callback boundary (node WebAssembly / browser), and the
 * owned-metal job bundle (Jetson). Twin-derived semantics with fail-closed
 * rails: every function is pure, every domain violation is a thrown
 * StdHostAbiError, results are strict JSON with finite, non-negative-zero
 * numbers. The generator's admission gate asserts twin agreement on every
 * corpus vector whose semantics coincide with the TypeScript twin.
 */

export class StdHostAbiError extends Error {
  constructor(code, message) {
    super(`std-host-abi ${code}: ${message}`);
    this.code = code;
  }
}

export const STD_HOST_ABI_SCHEMA = 'holoscript.std-host-abi.v0';
export const STD_CALLABLE_SCHEMA = 'holoscript.std-callable.v0';
export const STD_ITERABLE_SCHEMA = 'holoscript.std-iterable.v0';

const MAX_COLLECTION_ITEMS = 1_000_000;
const MAX_CALLABLE_NODES = 128;
const MAX_CALLABLE_DEPTH = 16;
const MAX_CALLABLE_INVOCATIONS = 1_000_000;

function fail(code, message) {
  throw new StdHostAbiError(code, message);
}

function checkNumber(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
    fail('bad-number', `${label} must be a finite non-negative-zero number`);
  }
  return value;
}

function checkString(value, label) {
  if (typeof value !== 'string') fail('bad-string', `${label} must be a string`);
  return value;
}

function checkArray(value, label) {
  if (!Array.isArray(value)) fail('bad-list', `${label} must be a JSON array`);
  return value;
}

function checkQuat(value, label) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).sort().join(',') !== 'w,x,y,z'
  ) {
    fail('bad-quat', `${label} must be a { x, y, z, w } object`);
  }
  for (const key of ['x', 'y', 'z', 'w']) checkNumber(value[key], `${label}.${key}`);
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function checkMap(value, label) {
  if (!isPlainObject(value)) fail('bad-map', `${label} must be a JSON object`);
  return value;
}

function checkExactKeys(value, label, expectedKeys) {
  const actual = Object.keys(checkMap(value, label)).sort();
  const expected = [...expectedKeys].sort();
  if (actual.join(',') !== expected.join(',')) {
    fail(
      'bad-descriptor',
      `${label} keys must be exactly [${expected.join(', ')}], got [${actual.join(', ')}]`
    );
  }
}

function checkStrictJson(value, label) {
  if (value === undefined) fail('bad-value', `${label} is undefined`);
  if (typeof value === 'number') return checkNumber(value, label);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (Array.isArray(value)) {
    value.forEach((item, index) => checkStrictJson(item, `${label}[${index}]`));
    return value;
  }
  if (isPlainObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        fail('unsafe-key', `${label} contains forbidden key "${key}"`);
      }
      checkStrictJson(child, `${label}.${key}`);
    }
    return value;
  }
  fail('bad-value', `${label} is not strict JSON`);
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function structuralEqual(a, b) {
  return canonical(a) === canonical(b);
}

function canonicalSet(items, label) {
  checkArray(items, label);
  const seen = new Map();
  for (const item of items) {
    checkStrictJson(item, `${label} element`);
    const key = canonical(item);
    if (!seen.has(key)) seen.set(key, item);
  }
  return [...seen.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([, v]) => v);
}

function finiteResult(value, label) {
  if (!Number.isFinite(value) || Object.is(value, -0)) {
    fail('bad-result', `${label} produced a non-finite or negative-zero number`);
  }
  return value;
}

function checkCollectionSize(items, label) {
  if (items.length > MAX_COLLECTION_ITEMS) {
    fail('bad-count', `${label} exceeds ${MAX_COLLECTION_ITEMS} elements`);
  }
  return items;
}

function validateCallableExpression(expression, arity, label, state, depth = 0) {
  if (depth > MAX_CALLABLE_DEPTH) {
    fail('callable-too-deep', `${label} exceeds depth ${MAX_CALLABLE_DEPTH}`);
  }
  state.nodes += 1;
  if (state.nodes > MAX_CALLABLE_NODES) {
    fail('callable-too-large', `${label} exceeds ${MAX_CALLABLE_NODES} expression nodes`);
  }
  checkMap(expression, label);
  const keys = Object.keys(expression);
  if (keys.length === 1 && keys[0] === 'arg') {
    const index = checkNumber(expression.arg, `${label}.arg`);
    if (!Number.isInteger(index) || index < 0 || index >= arity) {
      fail('bad-callable-arg', `${label}.arg must be an integer in [0, ${arity})`);
    }
    return;
  }
  if (keys.length === 1 && keys[0] === 'const') {
    checkStrictJson(expression.const, `${label}.const`);
    return;
  }
  if (keys.length === 1 && keys[0] === 'get') {
    const pair = checkArray(expression.get, `${label}.get`);
    if (pair.length !== 2) fail('bad-descriptor', `${label}.get must contain [target, key]`);
    validateCallableExpression(pair[0], arity, `${label}.get[0]`, state, depth + 1);
    const key = pair[1];
    if (
      typeof key !== 'string' &&
      !(typeof key === 'number' && Number.isInteger(key) && key >= 0)
    ) {
      fail('bad-descriptor', `${label}.get[1] must be a string or non-negative integer`);
    }
    return;
  }
  if (keys.length === 1 && keys[0] === 'array') {
    const items = checkArray(expression.array, `${label}.array`);
    items.forEach((item, index) =>
      validateCallableExpression(item, arity, `${label}.array[${index}]`, state, depth + 1)
    );
    return;
  }
  if (keys.length === 1 && keys[0] === 'object') {
    const entries = checkMap(expression.object, `${label}.object`);
    for (const [key, value] of Object.entries(entries)) {
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        fail('unsafe-key', `${label}.object contains forbidden key "${key}"`);
      }
      validateCallableExpression(value, arity, `${label}.object.${key}`, state, depth + 1);
    }
    return;
  }
  if (keys.length === 2 && keys.includes('op') && keys.includes('args')) {
    const operator = checkString(expression.op, `${label}.op`);
    const operands = checkArray(expression.args, `${label}.args`);
    const operatorArity = {
      add: 2,
      sub: 2,
      mul: 2,
      div: 2,
      mod: 2,
      eq: 2,
      ne: 2,
      lt: 2,
      lte: 2,
      gt: 2,
      gte: 2,
      and: 2,
      or: 2,
      not: 1,
      neg: 1,
      if: 3,
    }[operator];
    if (!operatorArity) fail('bad-callable-op', `${label}.op "${operator}" is not admitted`);
    if (operands.length !== operatorArity) {
      fail(
        'bad-callable-arity',
        `${label}.op "${operator}" requires ${operatorArity} operands, got ${operands.length}`
      );
    }
    operands.forEach((operand, index) =>
      validateCallableExpression(operand, arity, `${label}.args[${index}]`, state, depth + 1)
    );
    return;
  }
  fail(
    'bad-descriptor',
    `${label} must be one of {arg}, {const}, {get}, {array}, {object}, or {op,args}`
  );
}

function callableNumber(value, label) {
  return checkNumber(value, label);
}

function callableBoolean(value, label) {
  if (typeof value !== 'boolean') fail('bad-callable-result', `${label} must be a boolean`);
  return value;
}

function evaluateCallableExpression(expression, args, label) {
  if (Object.prototype.hasOwnProperty.call(expression, 'arg')) {
    return args[expression.arg];
  }
  if (Object.prototype.hasOwnProperty.call(expression, 'const')) {
    return structuredClone(expression.const);
  }
  if (Object.prototype.hasOwnProperty.call(expression, 'get')) {
    const target = evaluateCallableExpression(expression.get[0], args, `${label}.get[0]`);
    const key = expression.get[1];
    if (Array.isArray(target) && typeof key === 'number') {
      if (key >= target.length) fail('out-of-range', `${label}.get index ${key} is absent`);
      return target[key];
    }
    if (isPlainObject(target) && typeof key === 'string') {
      if (!Object.prototype.hasOwnProperty.call(target, key)) {
        fail('missing-key', `${label}.get key "${key}" is absent`);
      }
      return target[key];
    }
    fail('bad-callable-get', `${label}.get target/key types do not match`);
  }
  if (Object.prototype.hasOwnProperty.call(expression, 'array')) {
    return expression.array.map((item, index) =>
      evaluateCallableExpression(item, args, `${label}.array[${index}]`)
    );
  }
  if (Object.prototype.hasOwnProperty.call(expression, 'object')) {
    return Object.fromEntries(
      Object.keys(expression.object)
        .sort()
        .map((key) => [
          key,
          evaluateCallableExpression(expression.object[key], args, `${label}.object.${key}`),
        ])
    );
  }

  const operands = expression.args.map((operand, index) =>
    evaluateCallableExpression(operand, args, `${label}.args[${index}]`)
  );
  switch (expression.op) {
    case 'add':
      if (typeof operands[0] === 'string' && typeof operands[1] === 'string') {
        return operands[0] + operands[1];
      }
      return finiteResult(
        callableNumber(operands[0], `${label}.left`) +
          callableNumber(operands[1], `${label}.right`),
        `${label}.add`
      );
    case 'sub':
      return finiteResult(
        callableNumber(operands[0], `${label}.left`) -
          callableNumber(operands[1], `${label}.right`),
        `${label}.sub`
      );
    case 'mul':
      return finiteResult(
        callableNumber(operands[0], `${label}.left`) *
          callableNumber(operands[1], `${label}.right`),
        `${label}.mul`
      );
    case 'div': {
      const divisor = callableNumber(operands[1], `${label}.right`);
      if (divisor === 0) fail('division-by-zero', `${label}.div divisor must be nonzero`);
      return finiteResult(
        callableNumber(operands[0], `${label}.left`) / divisor,
        `${label}.div`
      );
    }
    case 'mod': {
      const divisor = callableNumber(operands[1], `${label}.right`);
      if (divisor === 0) fail('division-by-zero', `${label}.mod divisor must be nonzero`);
      return finiteResult(
        callableNumber(operands[0], `${label}.left`) % divisor,
        `${label}.mod`
      );
    }
    case 'eq':
      return structuralEqual(operands[0], operands[1]);
    case 'ne':
      return !structuralEqual(operands[0], operands[1]);
    case 'lt':
    case 'lte':
    case 'gt':
    case 'gte': {
      const [left, right] = operands;
      if (
        !(
          (typeof left === 'number' && typeof right === 'number') ||
          (typeof left === 'string' && typeof right === 'string')
        )
      ) {
        fail('bad-callable-result', `${label}.${expression.op} requires matching scalar types`);
      }
      if (typeof left === 'number') {
        callableNumber(left, `${label}.left`);
        callableNumber(right, `${label}.right`);
      }
      if (expression.op === 'lt') return left < right;
      if (expression.op === 'lte') return left <= right;
      if (expression.op === 'gt') return left > right;
      return left >= right;
    }
    case 'and':
      return (
        callableBoolean(operands[0], `${label}.left`) &&
        callableBoolean(operands[1], `${label}.right`)
      );
    case 'or':
      return (
        callableBoolean(operands[0], `${label}.left`) ||
        callableBoolean(operands[1], `${label}.right`)
      );
    case 'not':
      return !callableBoolean(operands[0], `${label}.operand`);
    case 'neg':
      return finiteResult(-callableNumber(operands[0], `${label}.operand`), `${label}.neg`);
    case 'if':
      return callableBoolean(operands[0], `${label}.condition`) ? operands[1] : operands[2];
    default:
      fail('bad-callable-op', `${label}.op "${expression.op}" is not admitted`);
  }
}

function compileCallable(descriptor, expectedArity, label) {
  checkExactKeys(descriptor, label, ['schema', 'arity', 'body']);
  if (descriptor.schema !== STD_CALLABLE_SCHEMA) {
    fail('bad-descriptor', `${label}.schema must be "${STD_CALLABLE_SCHEMA}"`);
  }
  const arity = checkNumber(descriptor.arity, `${label}.arity`);
  if (!Number.isInteger(arity) || arity !== expectedArity) {
    fail('bad-callable-arity', `${label}.arity must be exactly ${expectedArity}`);
  }
  validateCallableExpression(descriptor.body, arity, `${label}.body`, { nodes: 0 });
  let remaining = MAX_CALLABLE_INVOCATIONS;
  return (...args) => {
    if (args.length !== arity) {
      fail('bad-callable-arity', `${label} expected ${arity} arguments, got ${args.length}`);
    }
    if (remaining <= 0) {
      fail('callable-budget-exhausted', `${label} exceeded ${MAX_CALLABLE_INVOCATIONS} calls`);
    }
    remaining -= 1;
    const result = evaluateCallableExpression(descriptor.body, args, `${label}.body`);
    return checkStrictJson(result, `${label} result`);
  };
}

// --- math --------------------------------------------------------------------

const math = {
  clamp(value, min, max) {
    checkNumber(value, 'value');
    checkNumber(min, 'min');
    checkNumber(max, 'max');
    return finiteResult(Math.max(min, Math.min(max, value)), 'clamp');
  },
  lerp(a, b, t) {
    checkNumber(a, 'a');
    checkNumber(b, 'b');
    checkNumber(t, 't');
    return finiteResult(a + (b - a) * t, 'lerp');
  },
  quat_slerp(a, b, t) {
    checkQuat(a, 'a');
    checkQuat(b, 'b');
    checkNumber(t, 't');
    let dot = a.x * b.x + a.y * b.y + a.z * b.z + a.w * b.w;
    let bx = b.x;
    let by = b.y;
    let bz = b.z;
    let bw = b.w;
    if (dot < 0) {
      bx = -b.x;
      by = -b.y;
      bz = -b.z;
      bw = -b.w;
      dot = -dot;
    }
    let out;
    if (dot > 0.9995) {
      const lx = a.x + (bx - a.x) * t;
      const ly = a.y + (by - a.y) * t;
      const lz = a.z + (bz - a.z) * t;
      const lw = a.w + (bw - a.w) * t;
      const len = Math.sqrt(lx * lx + ly * ly + lz * lz + lw * lw);
      out = { x: lx / len, y: ly / len, z: lz / len, w: lw / len };
    } else {
      const theta0 = Math.acos(dot);
      const theta = theta0 * t;
      const sinTheta = Math.sin(theta);
      const sinTheta0 = Math.sin(theta0);
      const s0 = Math.cos(theta) - (dot * sinTheta) / sinTheta0;
      const s1 = sinTheta / sinTheta0;
      out = {
        x: a.x * s0 + bx * s1,
        y: a.y * s0 + by * s1,
        z: a.z * s0 + bz * s1,
        w: a.w * s0 + bw * s1,
      };
    }
    for (const key of ['x', 'y', 'z', 'w']) {
      out[key] = finiteResult(out[key] === 0 ? 0 : out[key], `quat_slerp.${key}`);
    }
    return out;
  },
};

// --- list_lib ----------------------------------------------------------------

const list_lib = {
  list_of(items) {
    checkArray(items, 'items');
    checkStrictJson(items, 'items');
    return [...items];
  },
  list_range(start, end, step) {
    checkNumber(start, 'start');
    checkNumber(end, 'end');
    checkNumber(step, 'step');
    if (step === 0) fail('zero-step', 'step must be nonzero');
    const out = [];
    for (let i = start; step > 0 ? i < end : i > end; i += step) {
      out.push(finiteResult(i === 0 ? 0 : i, 'range element'));
      if (out.length > MAX_COLLECTION_ITEMS) {
        fail('bad-count', `range exceeds ${MAX_COLLECTION_ITEMS} elements`);
      }
    }
    return out;
  },
  list_from(iterable) {
    if (Array.isArray(iterable)) {
      checkStrictJson(iterable, 'iterable');
      return [...iterable];
    }
    if (typeof iterable === 'string') return [...iterable];
    checkMap(iterable, 'iterable');
    if (iterable.schema !== STD_ITERABLE_SCHEMA) {
      fail('bad-descriptor', `iterable.schema must be "${STD_ITERABLE_SCHEMA}"`);
    }
    if (iterable.kind === 'list') {
      checkExactKeys(iterable, 'iterable', ['schema', 'kind', 'values']);
      const values = checkCollectionSize(checkArray(iterable.values, 'iterable.values'), 'iterable');
      checkStrictJson(values, 'iterable.values');
      return [...values];
    }
    if (iterable.kind === 'set') {
      checkExactKeys(iterable, 'iterable', ['schema', 'kind', 'values']);
      return canonicalSet(iterable.values, 'iterable.values');
    }
    if (iterable.kind === 'map') {
      checkExactKeys(iterable, 'iterable', ['schema', 'kind', 'value']);
      const value = checkMap(iterable.value, 'iterable.value');
      checkStrictJson(value, 'iterable.value');
      return Object.keys(value)
        .sort()
        .map((key) => [key, value[key]]);
    }
    fail('bad-descriptor', 'iterable.kind must be "list", "set", or "map"');
  },
  list_repeat(value, count) {
    checkStrictJson(value, 'value');
    checkNumber(count, 'count');
    if (!Number.isInteger(count) || count < 0) {
      fail('bad-count', 'count must be a non-negative integer');
    }
    if (count > MAX_COLLECTION_ITEMS) {
      fail('bad-count', `count exceeds ${MAX_COLLECTION_ITEMS}`);
    }
    return Array(count).fill(value);
  },
  list_map(lst, fn) {
    checkCollectionSize(checkArray(lst, 'lst'), 'lst');
    const callback = compileCallable(fn, 2, 'fn');
    return lst.map((item, index) => callback(item, index));
  },
  list_flat_map(lst, fn) {
    checkCollectionSize(checkArray(lst, 'lst'), 'lst');
    const callback = compileCallable(fn, 2, 'fn');
    const out = [];
    lst.forEach((item, index) => {
      const mapped = checkArray(callback(item, index), `fn result at index ${index}`);
      out.push(...mapped);
      checkCollectionSize(out, 'flat-map result');
    });
    return out;
  },
  list_filter(lst, predicate) {
    checkCollectionSize(checkArray(lst, 'lst'), 'lst');
    const callback = compileCallable(predicate, 2, 'predicate');
    return lst.filter((item, index) =>
      callableBoolean(callback(item, index), `predicate result at index ${index}`)
    );
  },
  list_reduce(lst, fn, initial) {
    checkCollectionSize(checkArray(lst, 'lst'), 'lst');
    checkStrictJson(initial, 'initial');
    const callback = compileCallable(fn, 3, 'fn');
    return lst.reduce((acc, item, index) => callback(acc, item, index), initial);
  },
  list_sort(lst, comparator) {
    checkCollectionSize(checkArray(lst, 'lst'), 'lst');
    const callback = compileCallable(comparator, 2, 'comparator');
    return lst
      .map((value, index) => ({ value, index }))
      .sort((left, right) => {
        const order = callableNumber(
          callback(left.value, right.value),
          'comparator result'
        );
        return order === 0 ? left.index - right.index : order;
      })
      .map(({ value }) => value);
  },
  list_reverse(lst) {
    checkArray(lst, 'lst');
    return [...lst].reverse();
  },
  list_flatten(lst) {
    checkArray(lst, 'lst');
    const out = [];
    for (const item of lst) {
      if (Array.isArray(item)) out.push(...item);
      else out.push(item);
    }
    return out;
  },
  list_unique(lst) {
    checkArray(lst, 'lst');
    const seen = new Set();
    const out = [];
    for (const item of lst) {
      const key = canonical(item);
      if (!seen.has(key)) {
        seen.add(key);
        out.push(item);
      }
    }
    return out;
  },
  list_get(lst, index) {
    checkArray(lst, 'lst');
    checkNumber(index, 'index');
    if (!Number.isInteger(index) || index < 0 || index >= lst.length) {
      fail('out-of-range', `index ${index} outside [0, ${lst.length})`);
    }
    return lst[index];
  },
  list_first(lst) {
    checkArray(lst, 'lst');
    if (lst.length === 0) fail('empty-list', 'first of empty list');
    return lst[0];
  },
  list_last(lst) {
    checkArray(lst, 'lst');
    if (lst.length === 0) fail('empty-list', 'last of empty list');
    return lst[lst.length - 1];
  },
  list_contains(lst, item) {
    checkArray(lst, 'lst');
    checkStrictJson(item, 'item');
    return lst.some((element) => structuralEqual(element, item));
  },
  list_index_of(lst, item) {
    checkArray(lst, 'lst');
    checkStrictJson(item, 'item');
    const index = lst.findIndex((element) => structuralEqual(element, item));
    return index;
  },
  list_length(lst) {
    checkArray(lst, 'lst');
    return lst.length;
  },
  list_is_empty(lst) {
    checkArray(lst, 'lst');
    return lst.length === 0;
  },
  list_join(lst, sep) {
    checkArray(lst, 'lst');
    checkString(sep, 'sep');
    return lst
      .map((element, index) => {
        if (typeof element === 'string') return element;
        if (typeof element === 'number') {
          checkNumber(element, `element ${index}`);
          return String(element);
        }
        fail('unjoinable-element', `element ${index} is neither string nor number`);
      })
      .join(sep);
  },
  list_zip(a, b) {
    checkArray(a, 'a');
    checkArray(b, 'b');
    const length = Math.min(a.length, b.length);
    const out = [];
    for (let i = 0; i < length; i++) out.push([a[i], b[i]]);
    return out;
  },
  list_chunk(lst, size) {
    checkArray(lst, 'lst');
    checkNumber(size, 'size');
    if (!Number.isInteger(size) || size <= 0) fail('bad-size', 'size must be a positive integer');
    const out = [];
    for (let i = 0; i < lst.length; i += size) out.push(lst.slice(i, i + size));
    return out;
  },
  list_to_array(lst) {
    checkArray(lst, 'lst');
    checkStrictJson(lst, 'lst');
    return [...lst];
  },
  list_to_set(lst) {
    return canonicalSet(lst, 'lst');
  },
};

// --- map_lib -----------------------------------------------------------------

const map_lib = {
  map_set(m, key, value) {
    checkMap(m, 'm');
    checkString(key, 'key');
    checkStrictJson(value, 'value');
    return { ...m, [key]: value };
  },
  map_get(m, key) {
    checkMap(m, 'm');
    checkString(key, 'key');
    if (!Object.prototype.hasOwnProperty.call(m, key)) {
      fail('missing-key', `key "${key}" is absent`);
    }
    return m[key];
  },
  map_has(m, key) {
    checkMap(m, 'm');
    checkString(key, 'key');
    return Object.prototype.hasOwnProperty.call(m, key);
  },
  map_delete(m, key) {
    checkMap(m, 'm');
    checkString(key, 'key');
    const out = { ...m };
    delete out[key];
    return out;
  },
  map_keys(m) {
    checkMap(m, 'm');
    return Object.keys(m).sort();
  },
  map_values(m) {
    checkMap(m, 'm');
    return Object.keys(m)
      .sort()
      .map((key) => m[key]);
  },
  map_entries(m) {
    checkMap(m, 'm');
    return Object.keys(m)
      .sort()
      .map((key) => [key, m[key]]);
  },
  map_map_values(m, fn) {
    checkMap(m, 'm');
    checkStrictJson(m, 'm');
    const callback = compileCallable(fn, 2, 'fn');
    return Object.fromEntries(
      Object.keys(m)
        .sort()
        .map((key) => [key, callback(m[key], key)])
    );
  },
  map_filter(m, predicate) {
    checkMap(m, 'm');
    checkStrictJson(m, 'm');
    const callback = compileCallable(predicate, 2, 'predicate');
    return Object.fromEntries(
      Object.keys(m)
        .sort()
        .filter((key) =>
          callableBoolean(callback(m[key], key), `predicate result at key "${key}"`)
        )
        .map((key) => [key, m[key]])
    );
  },
  map_merge(a, b) {
    checkMap(a, 'a');
    checkMap(b, 'b');
    return { ...a, ...b };
  },
  map_size(m) {
    checkMap(m, 'm');
    return Object.keys(m).length;
  },
};

// --- set_lib -----------------------------------------------------------------

const set_lib = {
  set_add(s, item) {
    checkStrictJson(item, 'item');
    return canonicalSet([...canonicalSet(s, 's'), item], 'set_add');
  },
  set_has(s, item) {
    checkStrictJson(item, 'item');
    return canonicalSet(s, 's').some((element) => structuralEqual(element, item));
  },
  set_delete(s, item) {
    checkStrictJson(item, 'item');
    return canonicalSet(s, 's').filter((element) => !structuralEqual(element, item));
  },
  set_union(a, b) {
    return canonicalSet([...canonicalSet(a, 'a'), ...canonicalSet(b, 'b')], 'set_union');
  },
  set_intersection(a, b) {
    const bKeys = new Set(canonicalSet(b, 'b').map(canonical));
    return canonicalSet(a, 'a').filter((element) => bKeys.has(canonical(element)));
  },
  set_difference(a, b) {
    const bKeys = new Set(canonicalSet(b, 'b').map(canonical));
    return canonicalSet(a, 'a').filter((element) => !bKeys.has(canonical(element)));
  },
  set_size(s) {
    return canonicalSet(s, 's').length;
  },
  set_to_array(s) {
    return canonicalSet(s, 's');
  },
};

export function createStdHostBindings() {
  return { math, list_lib, map_lib, set_lib };
}

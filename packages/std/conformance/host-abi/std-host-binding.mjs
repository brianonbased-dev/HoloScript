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
      if (out.length > 1_000_000) fail('bad-count', 'range exceeds 1e6 elements');
    }
    return out;
  },
  list_repeat(value, count) {
    checkStrictJson(value, 'value');
    checkNumber(count, 'count');
    if (!Number.isInteger(count) || count < 0) {
      fail('bad-count', 'count must be a non-negative integer');
    }
    return Array(count).fill(value);
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
};

export function createStdHostBindings() {
  return { math, list_lib, map_lib, set_lib };
}

export const STD_HOST_ABI_SCHEMA = 'holoscript.std-host-abi.v0';

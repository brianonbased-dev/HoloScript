/**
 * @holoscript/std - Standard Library for HoloScript Plus
 *
 * Provides core types, math utilities, collections, string operations,
 * time management, spatial math, physics primitives, materials, and events
 * for HoloScript Plus programs.
 *
 * @example
 * ```hsplus
 * import { Vec3, createPBRMaterial, EventBus } from "@holoscript/std";
 *
 * let position = Vec3(0, 1, 0);
 * let steel = createPBRMaterial("Steel", "metal");
 * let bus = new EventBus();
 * ```
 */

// Re-export everything from types.js
export * from './types.js';

// Spatial math (v4.2)
export {
  Vec3, Quaternion, Transform, Ray, AABB,
  distance, lerp as spatialLerp, clamp as spatialClamp,
  degToRad as spatialDegToRad, radToDeg as spatialRadToDeg,
} from './spatial.js';

// Physics primitives (v4.2)
export {
  createBoxCollider, createSphereCollider, createCapsuleCollider,
  createRigidbody,
} from './physics.js';
export type {
  ColliderConfig, ColliderShapeType, RigidbodyConfig,
  ForceFieldConfig, ForceFieldType, JointConfig, JointType, RaycastHit,
} from './physics.js';

// Materials (v4.2)
export {
  MATERIAL_PRESETS, createPBRMaterial,
} from './materials.js';
export type {
  PBRMaterial, UnlitMaterial, TextureMapType, TextureConfig,
} from './materials.js';

// Events (v4.2)
export { EventBus } from './events.js';
export type { EventHandler } from './events.js';

// Math utilities - export objects from math.ts
export {
  // Constants
  PI,
  TAU,
  HALF_PI,
  EPSILON,
  DEG_TO_RAD,
  RAD_TO_DEG,

  // Basic math functions
  clamp,
  lerp,
  inverseLerp,
  remap,
  smoothstep,
  smootherstep,
  sign,
  fract,
  mod,
  step,
  degToRad,
  radToDeg,

  // Math utility objects (access methods like vec2Math.add(), vec3Math.cross(), etc.)
  vec2Math,
  vec3Math,
  quatMath,
  aabbMath,
  noise,
  random,
} from './math.js';

// Re-export with alternate names for convenience
export { degToRad as toRadians, radToDeg as toDegrees } from './math.js';

// Collections
export {
  List,
  HoloMap,
  HoloSet,
  HoloMap as Map,
  HoloSet as Set,
  SpatialGrid,
  PriorityQueue,
} from './collections.js';

// String utilities
export {
  isBlank,
  isNotBlank,
  capitalize,
  titleCase,
  camelCase,
  pascalCase,
  snakeCase,
  kebabCase,
  constantCase,
  padLeft,
  padRight,
  center,
  truncate,
  truncateMiddle,
  repeat,
  reverse,
  count,
  containsIgnoreCase,
  startsWithIgnoreCase,
  endsWithIgnoreCase,
  removeWhitespace,
  collapseWhitespace,
  removePrefix,
  removeSuffix,
  wrap as wrapString,
  unwrap,
  lines,
  words,
  chars,
  join,
  format,
  formatNumber,
  numberWithCommas,
  formatBytes,
  formatDuration,
  escapeHtml,
  unescapeHtml,
  escapeRegex,
  slugify,
  isValidIdentifier,
  isNumeric,
  isAlphanumeric,
  isAlpha,
  randomString,
  uuid,
  indent,
  dedent,
  wordWrap,
  levenshtein,
  similarity,
} from './string.js';

// Economic primitives (v4.3)
export {
  // Tradeable
  generateTxHash,
  executeTrade,
  // Depreciation
  calculateDepreciation,
  depreciatedValue,
  isDestroyed,
  calculateRepairCost,
  DEFAULT_DEPRECIATION,
  // Bonding curves
  bondingCurvePrice,
  bondingCurveBuyCost,
  bondingCurveSellRefund,
  spatialPrice,
  DEFAULT_BONDING_CURVE,
  // Wealth taxation
  calculateTaxRate,
  calculateTaxAmount,
  calculateRedistribution,
  DEFAULT_WEALTH_TAX,
  // PID control
  createPIDState,
  updatePID,
  createDualLoopPIDState,
  updateDualLoopPID,
  DEFAULT_PID,
  // Faucet-sink tracking
  createFaucetSinkMetrics,
  recordFaucet,
  recordSink,
  resetMetricsPeriod,
} from './traits/EconomicPrimitives.js';
export type {
  Currency,
  AgentID,
  EconomicResult,
  EconomicError,
  EconomicPermission,
  OwnershipRecord,
  TransferRecord,
  DepreciationConfig,
  BondingCurveType,
  BondingCurveConfig,
  WealthTaxConfig,
  PIDConfig,
  PIDState,
  DualLoopPIDConfig,
  DualLoopPIDState,
  FaucetSinkMetrics,
} from './traits/EconomicPrimitives.js';

// Economic traits (v4.3)
export {
  EconomicTraits,
  getEconomicTraitNames,
  getEconomicTrait,
  validateTraitComposition,
  getRequiredPermissions,
} from './traits/EconomicTraits.js';
export type {
  EconomicTraitDefinition,
} from './traits/EconomicTraits.js';

// Time utilities
export {
  now,
  hrTime,
  sleep,
  waitUntil,
  withTimeout,
  retry,
  debounce,
  throttle,
  measure,
  timed,
  Stopwatch,
  IntervalTimer,
  CountdownTimer,
  FrameTimer,
  schedule,
  scheduleInterval,
  scheduleFrame,
  createTicker,
  DateTime,
} from './time.js';

/**
 * Print to console (HoloScript standard output)
 */
export function print(...args: unknown[]): void {
  console.log(...args);
}

/**
 * Print error to console
 */
export function printError(...args: unknown[]): void {
  console.error(...args);
}

/**
 * Print warning to console
 */
export function printWarn(...args: unknown[]): void {
  console.warn(...args);
}

/**
 * Assert a condition is true
 */
export function assert(condition: boolean, message?: string): asserts condition {
  if (!condition) {
    throw new Error(message ?? 'Assertion failed');
  }
}

/**
 * Assert a value is not null or undefined
 */
export function assertDefined<T>(
  value: T | null | undefined,
  message?: string
): asserts value is T {
  if (value === null || value === undefined) {
    throw new Error(message ?? 'Value is null or undefined');
  }
}

/**
 * Unreachable code marker (for exhaustiveness checking)
 */
export function unreachable(message?: string): never {
  throw new Error(message ?? 'Unreachable code reached');
}

/**
 * Todo marker (throws at runtime)
 */
export function todo(message?: string): never {
  throw new Error(`TODO: ${message ?? 'Not implemented'}`);
}

/**
 * Deep clone an object
 */
export function clone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(clone) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof Map) {
    return new Map([...value].map(([k, v]) => [clone(k), clone(v)])) as T;
  }

  if (value instanceof Set) {
    return new Set([...value].map(clone)) as T;
  }

  const result: Record<string, unknown> = {};
  for (const key in value) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      result[key] = clone((value as Record<string, unknown>)[key]);
    }
  }
  return result as T;
}

/**
 * Deep equality check
 */
export function equals(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;

  if (typeof a !== 'object') return false;

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false;
    return a.every((item, i) => equals(item, b[i]));
  }

  if (a instanceof Date && b instanceof Date) {
    return a.getTime() === b.getTime();
  }

  if (a instanceof Map && b instanceof Map) {
    if (a.size !== b.size) return false;
    for (const [key, value] of a) {
      if (!b.has(key) || !equals(value, b.get(key))) return false;
    }
    return true;
  }

  if (a instanceof Set && b instanceof Set) {
    if (a.size !== b.size) return false;
    for (const value of a) {
      if (!b.has(value)) return false;
    }
    return true;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b as object);
  if (keysA.length !== keysB.length) return false;

  return keysA.every((key) =>
    equals((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])
  );
}

/**
 * Pipe a value through a series of functions
 */
export function pipe<A>(value: A): A;
export function pipe<A, B>(value: A, fn1: (a: A) => B): B;
export function pipe<A, B, C>(value: A, fn1: (a: A) => B, fn2: (b: B) => C): C;
export function pipe<A, B, C, D>(value: A, fn1: (a: A) => B, fn2: (b: B) => C, fn3: (c: C) => D): D;
export function pipe<A, B, C, D, E>(
  value: A,
  fn1: (a: A) => B,
  fn2: (b: B) => C,
  fn3: (c: C) => D,
  fn4: (d: D) => E
): E;
export function pipe(value: unknown, ...fns: ((x: unknown) => unknown)[]): unknown {
  return fns.reduce((acc, fn) => fn(acc), value);
}

/**
 * Compose functions right to left
 */
export function compose<A>(): (a: A) => A;
export function compose<A, B>(fn1: (a: A) => B): (a: A) => B;
export function compose<A, B, C>(fn2: (b: B) => C, fn1: (a: A) => B): (a: A) => C;
export function compose<A, B, C, D>(
  fn3: (c: C) => D,
  fn2: (b: B) => C,
  fn1: (a: A) => B
): (a: A) => D;
export function compose(...fns: ((x: unknown) => unknown)[]): (x: unknown) => unknown {
  return (value: unknown) => fns.reduceRight((acc, fn) => fn(acc), value);
}

/**
 * Identity function
 */
export function identity<T>(value: T): T {
  return value;
}

/**
 * No-operation function
 */
export function noop(): void {}

/**
 * Create a constant function
 */
export function constant<T>(value: T): () => T {
  return () => value;
}

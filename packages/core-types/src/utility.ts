/**
 * Shared utility types for the HoloScript ecosystem.
 *
 * These replace common `as any` patterns found across ~877 occurrences in core.
 * Import from `@holoscript/core-types` or `@holoscript/core-types/utility`.
 *
 * @packageDocumentation
 */

// ── Deep Recursion Utilities ─────────────────────────────────────────────────

/**
 * Recursively make all properties optional.
 * Replaces 3+ duplicate definitions in SecurityPolicy, GRPOConfig, TrainingPipelineConfig.
 * Arrays are preserved as-is (not recursed into element type).
 */
export type DeepPartial<T> = {
  [P in keyof T]?: T[P] extends ReadonlyArray<infer _U>
    ? T[P]
    : T[P] extends object
      ? DeepPartial<T[P]>
      : T[P];
};

/**
 * Recursively make all properties readonly.
 * Useful for frozen config objects and immutable state snapshots.
 */
export type DeepReadonly<T> = {
  readonly [P in keyof T]: T[P] extends ReadonlyArray<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T[P] extends object
      ? DeepReadonly<T[P]>
      : T[P];
};

// ── Typed Event Emitter ──────────────────────────────────────────────────────

/**
 * Event map: keys are event names, values are the payload type.
 *
 * @example
 * ```ts
 * interface MyEvents {
 *   connect: { url: string };
 *   error: { error: Error };
 *   close: { code: number; reason: string };
 * }
 * ```
 */
export type EventMap = Record<string, unknown>;

/**
 * Typed event emitter interface. Replaces ~122 `as any` casts around
 * `.emit()` / `.on()` / `.once()` calls on EventEmitter subclasses.
 *
 * Use as an interface that classes can implement alongside extending EventEmitter,
 * or use the `TypedEventHandler` / `TypedEventKey` helpers for standalone typing.
 *
 * @example
 * ```ts
 * interface StreamEvents {
 *   data: { chunk: Uint8Array };
 *   error: { error: Error };
 *   close: { code: number; reason: string };
 * }
 *
 * class MyStream extends EventEmitter implements TypedEventEmitter<StreamEvents> {
 *   // emit('data', { chunk }) is now type-checked
 * }
 * ```
 */
export interface TypedEventEmitter<Events extends EventMap> {
  on<K extends keyof Events & string>(
    event: K,
    listener: (payload: Events[K]) => void,
  ): this;
  once<K extends keyof Events & string>(
    event: K,
    listener: (payload: Events[K]) => void,
  ): this;
  emit<K extends keyof Events & string>(
    event: K,
    payload: Events[K],
  ): boolean;
  off<K extends keyof Events & string>(
    event: K,
    listener: (payload: Events[K]) => void,
  ): this;
  removeAllListeners<K extends keyof Events & string>(event?: K): this;
}

/** Extract valid event keys from an event map. */
export type TypedEventKey<Events extends EventMap> = keyof Events & string;

/** Extract the handler signature for a specific event. */
export type TypedEventHandler<
  Events extends EventMap,
  K extends keyof Events,
> = (payload: Events[K]) => void;

// ── Record & Object Utilities ────────────────────────────────────────────────

/**
 * Like `Record<K, V>` but requires ALL keys from union K to be present.
 * Replaces `{} as any` patterns when building Records that must cover an enum/union.
 *
 * @example
 * ```ts
 * type Platform = 'quest' | 'desktop' | 'mobile';
 * // Error if any platform key is missing:
 * const budget: StrictRecord<Platform, number> = { quest: 100, desktop: 200, mobile: 50 };
 * ```
 */
export type StrictRecord<K extends string | number | symbol, V> = {
  [P in K]: V;
};

/**
 * Remove `readonly` from all properties.
 * Useful when you need to build an object incrementally then freeze it.
 */
export type Mutable<T> = {
  -readonly [P in keyof T]: T[P];
};

/**
 * Deep version of Mutable — removes readonly recursively.
 */
export type DeepMutable<T> = {
  -readonly [P in keyof T]: T[P] extends ReadonlyArray<infer U>
    ? Array<DeepMutable<U>>
    : T[P] extends object
      ? DeepMutable<T[P]>
      : T[P];
};

/**
 * Pick only the keys of T whose values extend V.
 *
 * @example
 * ```ts
 * interface Config { name: string; count: number; label: string; }
 * type StringKeys = PickByValue<Config, string>; // { name: string; label: string }
 * ```
 */
export type PickByValue<T, V> = Pick<
  T,
  { [K in keyof T]-?: T[K] extends V ? K : never }[keyof T]
>;

/**
 * Omit keys whose values extend V.
 * Complement of PickByValue.
 */
export type OmitByValue<T, V> = Pick<
  T,
  { [K in keyof T]-?: T[K] extends V ? never : K }[keyof T]
>;

// ── Global & Platform Extension Utilities ────────────────────────────────────

/**
 * Safely access non-standard properties on globalThis / window / navigator.
 * Replaces 36+ `(global as any).gc`, `(performance as any).memory`,
 * `(navigator as any).language` patterns.
 *
 * @example
 * ```ts
 * interface PerformanceMemory { usedJSHeapSize: number; totalJSHeapSize: number; }
 * const mem = getGlobalProp<PerformanceMemory>(performance, 'memory');
 * if (mem) console.log(mem.usedJSHeapSize);
 * ```
 */
export type GlobalExtension<T> = T & Record<string, unknown>;

/**
 * Type-safe way to describe a global object with known extra properties.
 * Use with `globalThis` to avoid `(global as any)`.
 *
 * @example
 * ```ts
 * type NodeGlobal = ExtendedGlobal<{ gc?: () => void; __coverage__?: unknown }>;
 * const g = globalThis as NodeGlobal;
 * if (g.gc) g.gc();
 * ```
 */
export type ExtendedGlobal<Extensions extends Record<string, unknown>> =
  typeof globalThis & Extensions;

// ── Dynamic Property Access ──────────────────────────────────────────────────

/**
 * Safely extract a property from an object whose shape is only partially known.
 * Replaces `(obj as any).prop` patterns (~60+ in codebase).
 *
 * Returns `T[K]` if K is a known key, otherwise `unknown`.
 */
export type SafeGet<T, K extends string> = K extends keyof T ? T[K] : unknown;

/**
 * An object with known properties plus arbitrary string keys returning unknown.
 * Useful when an object has a typed base but may carry extra dynamic fields.
 *
 * @example
 * ```ts
 * interface HoloNode { type: string; name: string; }
 * type DynamicNode = Extensible<HoloNode>;
 * // node.type is string, node.customProp is unknown (not any)
 * ```
 */
export type Extensible<T> = T & { [key: string]: unknown };

// ── Branded / Nominal Types ──────────────────────────────────────────────────

/**
 * Create a branded/nominal type to prevent mixing structurally identical types.
 * Useful for IDs, tokens, and other string/number values that shouldn't be interchangeable.
 *
 * @example
 * ```ts
 * type UserId = Brand<string, 'UserId'>;
 * type SessionId = Brand<string, 'SessionId'>;
 * // Cannot assign UserId to SessionId even though both are strings.
 * ```
 */
export type Brand<T, B extends string> = T & { readonly __brand: B };

// ── Function Utilities ───────────────────────────────────────────────────────

/**
 * A function that accepts anything and returns void.
 * Replaces `(...args: any[]) => void` callback patterns.
 */
export type AnyCallback = (...args: unknown[]) => void;

/**
 * Extract the resolved type from a Promise.
 * Built-in `Awaited` exists in TS 4.5+ but this works for older targets too.
 */
export type UnwrapPromise<T> = T extends Promise<infer U> ? U : T;

// ── Partial Construction ─────────────────────────────────────────────────────

/**
 * Make only specific keys optional, leaving the rest required.
 * Replaces patterns where `} as any` is used to construct an object missing
 * a few fields that will be filled in later.
 *
 * @example
 * ```ts
 * interface FullConfig { host: string; port: number; tls: boolean; }
 * type InitConfig = PartialBy<FullConfig, 'tls'>; // tls is optional, rest required
 * ```
 */
export type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;

/**
 * Make only specific keys required, leaving the rest optional.
 * Inverse of PartialBy.
 */
export type RequiredBy<T, K extends keyof T> = Omit<T, K> &
  Required<Pick<T, K>>;

// ── JSON-safe Types ──────────────────────────────────────────────────────────

/**
 * Values that survive JSON.stringify/JSON.parse round-tripping.
 * Replaces `any` in JSON serialization contexts.
 */
export type JsonPrimitive = string | number | boolean | null;
export type JsonArray = ReadonlyArray<JsonValue>;
export type JsonObject = { readonly [key: string]: JsonValue };
export type JsonValue = JsonPrimitive | JsonArray | JsonObject;

/**
 * Mutable version of JsonValue for building JSON objects incrementally.
 */
export type MutableJsonObject = { [key: string]: MutableJsonValue };
export type MutableJsonArray = Array<MutableJsonValue>;
export type MutableJsonValue =
  | JsonPrimitive
  | MutableJsonArray
  | MutableJsonObject;

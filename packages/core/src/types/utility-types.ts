/**
 * Shared utility types for eliminating `as unknown` patterns.
 *
 * These are the subset of @holoscript/core-types/utility used within @holoscript/core.
 * When workspace linking is configured, this file can be replaced with:
 *   export type { ExtendedGlobal, Extensible, ... } from '@holoscript/core-types/utility';
 *
 * @module types/utility-types
 */

// ── Global & Platform Extension Utilities ────────────────────────────────────

/**
 * Type-safe way to describe a global object with known extra properties.
 * Use with `globalThis` to avoid `(global as unknown)`.
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

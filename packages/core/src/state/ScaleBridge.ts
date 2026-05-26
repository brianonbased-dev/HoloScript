import { computeContentHash } from '../deploy/provenance';

export const SCALE_BRIDGE_PROJECTION_SCHEMA = 'holoscript.scale-bridge.projection.v0.1.0' as const;

export type ScaleBridgeProjectionSchema = typeof SCALE_BRIDGE_PROJECTION_SCHEMA;

export type ScaleBridgeJson =
  | string
  | number
  | boolean
  | null
  | ScaleBridgeJson[]
  | { [key: string]: ScaleBridgeJson };

export interface ScaleDescriptor {
  /** Stable identifier for the target scale, e.g. "room", "building", or "coarse-world". */
  id: string;
  /** Optional human-readable target scale label. */
  label?: string;
  /** Optional scale family or grain; kept data-driven so core stays domain-agnostic. */
  granularity?: string;
  /** Dot paths to retain from the authoritative state. Empty means retain all paths. */
  includePaths?: string[];
  /** Dot paths to remove after inclusion. */
  excludePaths?: string[];
  /** Per-path maximum array length for coarse projections. */
  collectionLimits?: Record<string, number>;
  /** Per-path stride for array downsampling. A stride of 2 keeps every other entry. */
  collectionStride?: Record<string, number>;
  /** Fallback stride for arrays without a path-specific stride. */
  defaultStride?: number;
  metadata?: { [key: string]: ScaleBridgeJson };
}

export interface ScaleBridgeProvenanceEdge {
  type: 'scale_projection';
  hashAlgorithm: 'sha256';
  sourceStateHash: string;
  projectedStateHash: string;
  targetScaleId: string;
}

export interface ScaleBridgeProjection<TState extends ScaleBridgeJson = ScaleBridgeJson> {
  schema: ScaleBridgeProjectionSchema;
  targetScale: ScaleDescriptor;
  state: TState;
  provenance: {
    edge: ScaleBridgeProvenanceEdge;
    carriedReceipts: ScaleBridgeJson[];
  };
}

type JsonObject = { [key: string]: ScaleBridgeJson };

const RECEIPT_ANCHOR_KEYS = new Set([
  'provenance',
  'provenanceHash',
  'receipt',
  'receipts',
  'receiptChain',
  'payloadHash',
]);

export class ScaleBridge {
  static project(sourceState: unknown, scaleDescriptor: ScaleDescriptor): ScaleBridgeProjection {
    const targetScale = normalizeScaleDescriptor(scaleDescriptor);
    const sourceJson = toScaleBridgeJson(sourceState);
    const sourceStateHash = ScaleBridge.hashState(sourceJson);
    const projectedState = projectJson(sourceJson, targetScale, '');
    const projectedStateHash = ScaleBridge.hashState(projectedState);

    return {
      schema: SCALE_BRIDGE_PROJECTION_SCHEMA,
      targetScale,
      state: projectedState,
      provenance: {
        edge: {
          type: 'scale_projection',
          hashAlgorithm: 'sha256',
          sourceStateHash,
          projectedStateHash,
          targetScaleId: targetScale.id,
        },
        carriedReceipts: collectReceiptAnchors(sourceJson),
      },
    };
  }

  static hashState(state: unknown): string {
    return computeContentHash(canonicalizeScaleBridgeJson(state));
  }
}

export function canonicalizeScaleBridgeJson(value: unknown): string {
  return JSON.stringify(toScaleBridgeJson(value));
}

function normalizeScaleDescriptor(descriptor: ScaleDescriptor): ScaleDescriptor {
  const id = descriptor.id.trim();
  if (!id) {
    throw new Error('[scale-bridge] scaleDescriptor.id is required');
  }

  return {
    ...descriptor,
    id,
    includePaths: normalizePaths(descriptor.includePaths),
    excludePaths: normalizePaths(descriptor.excludePaths),
    collectionLimits: normalizePositiveIntegerMap(descriptor.collectionLimits),
    collectionStride: normalizePositiveIntegerMap(descriptor.collectionStride),
    defaultStride:
      descriptor.defaultStride === undefined
        ? undefined
        : Math.max(1, Math.floor(descriptor.defaultStride)),
  };
}

function normalizePaths(paths: string[] | undefined): string[] | undefined {
  if (!paths) return undefined;
  const normalized = paths.map((path) => path.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
}

function normalizePositiveIntegerMap(
  value: Record<string, number> | undefined
): Record<string, number> | undefined {
  if (!value) return undefined;
  const normalized: Record<string, number> = {};
  for (const [path, count] of Object.entries(value)) {
    const key = path.trim();
    if (key && Number.isFinite(count)) {
      normalized[key] = Math.max(1, Math.floor(count));
    }
  }
  return Object.keys(normalized).length > 0 ? normalized : undefined;
}

function projectJson(
  source: ScaleBridgeJson,
  descriptor: ScaleDescriptor,
  path: string
): ScaleBridgeJson {
  const included =
    descriptor.includePaths && path === ''
      ? pickIncludedPaths(source, descriptor)
      : cloneWithCollectionRules(source, descriptor, path);

  if (path === '' && descriptor.excludePaths) {
    const mutable = ensureObjectClone(included);
    for (const excludePath of descriptor.excludePaths) {
      deletePath(mutable, excludePath.split('.'));
    }
    return mutable;
  }

  return included;
}

function pickIncludedPaths(source: ScaleBridgeJson, descriptor: ScaleDescriptor): ScaleBridgeJson {
  if (!descriptor.includePaths) {
    return cloneWithCollectionRules(source, descriptor, '');
  }

  const output: JsonObject = {};
  for (const includePath of descriptor.includePaths) {
    const segments = includePath.split('.');
    const value = getPath(source, segments);
    if (value !== undefined) {
      setPath(output, segments, cloneWithCollectionRules(value, descriptor, includePath));
    }
  }
  return output;
}

function cloneWithCollectionRules(
  value: ScaleBridgeJson,
  descriptor: ScaleDescriptor,
  path: string
): ScaleBridgeJson {
  if (Array.isArray(value)) {
    const stride = descriptor.collectionStride?.[path] ?? descriptor.defaultStride ?? 1;
    const limit = descriptor.collectionLimits?.[path] ?? value.length;
    return value
      .filter((_entry, index) => index % stride === 0)
      .slice(0, limit)
      .map((entry, index) =>
        cloneWithCollectionRules(entry, descriptor, joinPath(path, String(index)))
      );
  }

  if (isJsonObject(value)) {
    const output: JsonObject = {};
    for (const key of Object.keys(value).sort()) {
      output[key] = cloneWithCollectionRules(value[key], descriptor, joinPath(path, key));
    }
    return output;
  }

  return value;
}

function collectReceiptAnchors(value: ScaleBridgeJson): ScaleBridgeJson[] {
  const receipts: ScaleBridgeJson[] = [];

  const visit = (entry: ScaleBridgeJson, key?: string): void => {
    if (key && RECEIPT_ANCHOR_KEYS.has(key)) {
      receipts.push(entry);
    }

    if (Array.isArray(entry)) {
      entry.forEach((item) => visit(item));
      return;
    }

    if (isJsonObject(entry)) {
      for (const childKey of Object.keys(entry)) {
        visit(entry[childKey], childKey);
      }
    }
  };

  visit(value);
  return receipts;
}

function toScaleBridgeJson(value: unknown): ScaleBridgeJson {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error('[scale-bridge] Non-finite numbers are not projection-safe');
    }
    return value;
  }
  if (typeof value === 'bigint') {
    throw new Error(
      '[scale-bridge] BigInt values are not projection-safe; serialize before projecting'
    );
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map((entry) => toScaleBridgeJson(entry));
  }
  if (typeof value === 'object') {
    const output: JsonObject = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const entry = (value as Record<string, unknown>)[key];
      if (entry !== undefined) {
        output[key] = toScaleBridgeJson(entry);
      }
    }
    return output;
  }

  throw new Error(`[scale-bridge] Unsupported projection value: ${typeof value}`);
}

function getPath(value: ScaleBridgeJson, segments: string[]): ScaleBridgeJson | undefined {
  let current: ScaleBridgeJson | undefined = value;
  for (const segment of segments) {
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (!isJsonObject(current)) return undefined;
    current = current[segment];
  }
  return current;
}

function setPath(target: JsonObject, segments: string[], value: ScaleBridgeJson): void {
  let current = target;
  for (let index = 0; index < segments.length - 1; index++) {
    const segment = segments[index];
    const next = current[segment];
    if (!isJsonObject(next)) {
      current[segment] = {};
    }
    current = current[segment] as JsonObject;
  }
  current[segments[segments.length - 1]] = value;
}

function deletePath(target: JsonObject, segments: string[]): void {
  let current: ScaleBridgeJson = target;
  for (let index = 0; index < segments.length - 1; index++) {
    if (!isJsonObject(current)) return;
    current = current[segments[index]];
  }
  if (isJsonObject(current)) {
    delete current[segments[segments.length - 1]];
  }
}

function ensureObjectClone(value: ScaleBridgeJson): JsonObject {
  if (isJsonObject(value)) return { ...value };
  return { value };
}

function isJsonObject(value: ScaleBridgeJson | undefined): value is JsonObject {
  return (
    value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value)
  );
}

function joinPath(parent: string, child: string): string {
  return parent ? `${parent}.${child}` : child;
}

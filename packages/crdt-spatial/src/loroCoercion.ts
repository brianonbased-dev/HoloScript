/**
 * CRDT-02 — Safe coercion for Loro map / counter reads used by SpatialCRDTBridge.
 *
 * After JSON round-trips, cross-peer sync, or tooling exports, scalar fields may
 * surface as `string` or `bigint` instead of `number`. Unchecked `as number`
 * casts yield NaN at runtime and break rotation/position math.
 */

/** LoroCounter.value is numeric but may be typed as number or bigint across versions. */
export function coerceCounterValue(value: unknown): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof value === 'string') {
    const n = Number(value.trim());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

/**
 * Coerce a Loro scalar to a finite number, or return `fallback` (e.g. default
 * scale component).
 */
export function coerceFiniteNumber(value: unknown, fallback: number): number {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'number') return Number.isFinite(value) ? value : fallback;
  if (typeof value === 'bigint') {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof value === 'string') {
    const t = value.trim();
    if (t === '') return fallback;
    const n = Number(t);
    return Number.isFinite(n) ? n : fallback;
  }
  if (typeof value === 'boolean') return value ? 1 : 0;
  return fallback;
}

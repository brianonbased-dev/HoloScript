import { createHash } from 'node:crypto';

export function sha256(value: string | Uint8Array): string {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

export function stableValue(value: unknown): unknown {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((item) => (item === undefined ? null : stableValue(item)));
  }
  if (value instanceof Date) return value.toISOString();

  const normalized: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    const child = (value as Record<string, unknown>)[key];
    if (child === undefined || typeof child === 'function') continue;
    normalized[key] = stableValue(child);
  }
  return normalized;
}

export function stableHash(value: unknown): string {
  return sha256(JSON.stringify(stableValue(value)));
}

import { createHash } from 'node:crypto';

function stableStringify(value: unknown): string {
  if (value === undefined) return 'null';
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .filter((key) => record[key] !== undefined)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
    .join(',')}}`;
}

export function canonicalReceiptBody(receipt: Record<string, unknown>): string {
  const { hash: _hash, ...body } = receipt;
  return stableStringify(body);
}

export function sha256ReceiptHash(receipt: Record<string, unknown>): string {
  const body = canonicalReceiptBody(receipt);
  return `sha256:${createHash('sha256').update(body, 'utf8').digest('hex')}`;
}

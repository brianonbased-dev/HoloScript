import { createHash } from 'node:crypto';

export function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, canonical(v)])
    );
  }
  return value;
}

export function sha256Bytes(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function sha256Text(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

export function hashValue(value) {
  return `sha256:${sha256Text(typeof value === 'string' ? value : JSON.stringify(canonical(value)))}`;
}

export function withHash(receipt) {
  const base = { ...receipt, hashAlgorithm: 'sha256' };
  return { ...base, hash: hashValue(base) };
}

export function stageReceipt({ name, schemaVersion = 1, input, output, metrics, honestScope }) {
  return withHash({
    kind: 'holoshell-stage-receipt',
    name,
    schemaVersion,
    inputHash: input === undefined ? undefined : hashValue(input),
    outputHash: output === undefined ? undefined : hashValue(output),
    metrics,
    honestScope,
  });
}

export function chainReceipt({ name, schemaVersion = 1, stages, metrics, honestScope }) {
  const orderedStages = (stages ?? []).map((stage, index) => ({
    index,
    name: stage.name,
    hash: stage.hash,
  }));
  return withHash({
    kind: 'holoshell-chain-receipt',
    name,
    schemaVersion,
    stages: orderedStages,
    stageCount: orderedStages.length,
    metrics,
    honestScope,
  });
}

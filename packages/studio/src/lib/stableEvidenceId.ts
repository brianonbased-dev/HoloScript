type EvidencePart = string | number | boolean | null | undefined;

function canonicalEvidenceInput(parts: readonly EvidencePart[]): string {
  return parts
    .map((part) => {
      const value = part === undefined ? '<undefined>' : part === null ? '<null>' : String(part);
      return `${value.length}:${value}`;
    })
    .join('|');
}

export function stableFNV1a64(input: string): string {
  let hash = BigInt('0xcbf29ce484222325');
  const prime = BigInt('0x100000001b3');
  const mask = BigInt('0xffffffffffffffff');

  for (let i = 0; i < input.length; i += 1) {
    hash ^= BigInt(input.charCodeAt(i));
    hash = (hash * prime) & mask;
  }

  return hash.toString(16).padStart(16, '0');
}

export function stableEvidenceFingerprint(parts: readonly EvidencePart[]): string {
  return `fnv1a-64:${stableFNV1a64(canonicalEvidenceInput(parts))}`;
}

export function stableMockCommitHash(parts: readonly EvidencePart[]): string {
  return `mock:${stableFNV1a64(canonicalEvidenceInput(parts)).slice(0, 8)}`;
}

export function stableUnitInterval(parts: readonly EvidencePart[]): number {
  const hex = stableFNV1a64(canonicalEvidenceInput(parts));
  const sample = Number.parseInt(hex.slice(0, 13), 16);
  return sample / Number.parseInt('fffffffffffff', 16);
}

import { describe, it, expect } from 'vitest';
import { consolidate, MatterUnit } from '../staged-matter';

function makeUnit(name: string, tags: string[] = []): MatterUnit {
  const id = `unit-${name}-${Math.random().toString(36).slice(2, 8)}`;
  const manifest = {
    name,
    tags,
    provenanceHashes: [],
    derivationEdges: [],
  };
  const canonical = JSON.stringify({ id, manifest });
  let h = 0;
  for (let i = 0; i < canonical.length; i++) {
    h = ((h << 5) - h + canonical.charCodeAt(i)) | 0;
  }
  const provenanceHash = Math.abs(h).toString(16).padStart(8, '0');
  return { id, provenanceHash, manifest };
}

describe('consolidate', () => {
  it('returns a consolidated unit whose manifest contains both source provenance hashes', () => {
    const a = makeUnit('block-a', ['solid']);
    const b = makeUnit('block-b', ['solid']);

    const c = consolidate(a, b);

    expect(c.manifest.provenanceHashes).toContain(a.provenanceHash);
    expect(c.manifest.provenanceHashes).toContain(b.provenanceHash);
  });

  it('includes derivation edges pointing back to both source units', () => {
    const a = makeUnit('block-a', ['solid']);
    const b = makeUnit('block-b', ['solid']);

    const c = consolidate(a, b);

    const edgeFromA = c.manifest.derivationEdges.find(
      (e) => e.from === a.id && e.relation === 'consolidated'
    );
    const edgeFromB = c.manifest.derivationEdges.find(
      (e) => e.from === b.id && e.relation === 'consolidated'
    );

    expect(edgeFromA).toBeDefined();
    expect(edgeFromB).toBeDefined();
  });

  it('FAILS when a source provenance hash is dropped (adversarial)', () => {
    const a = makeUnit('block-a', ['solid']);
    const b = makeUnit('block-b', ['solid']);

    const c = consolidate(a, b);

    // Simulate an adversarial drop of one hash
    const tampered = {
      ...c,
      manifest: {
        ...c.manifest,
        provenanceHashes: c.manifest.provenanceHashes.filter(
          (h) => h !== a.provenanceHash
        ),
      },
    };

    expect(tampered.manifest.provenanceHashes).not.toContain(a.provenanceHash);
    expect(tampered.manifest.provenanceHashes).toContain(b.provenanceHash);
  });

  it('FAILS when a derivation edge is missing (adversarial)', () => {
    const a = makeUnit('block-a', ['solid']);
    const b = makeUnit('block-b', ['solid']);

    const c = consolidate(a, b);

    // Simulate an adversarial removal of the edge to A
    const tampered = {
      ...c,
      manifest: {
        ...c.manifest,
        derivationEdges: c.manifest.derivationEdges.filter(
          (e) => !(e.from === a.id && e.relation === 'consolidated')
        ),
      },
    };

    const missingEdge = tampered.manifest.derivationEdges.find(
      (e) => e.from === a.id && e.relation === 'consolidated'
    );
    expect(missingEdge).toBeUndefined();
  });

  it('propagates pre-existing derivation edges from both inputs', () => {
    const a = makeUnit('block-a', ['solid']);
    a.manifest.derivationEdges.push({
      from: 'prior-unit',
      relation: 'produced',
      timestamp: 1,
    });

    const b = makeUnit('block-b', ['solid']);
    const c = consolidate(a, b);

    expect(c.manifest.derivationEdges.some((e) => e.from === 'prior-unit')).toBe(true);
  });

  it('propagates pre-existing provenance hashes from both inputs', () => {
    const a = makeUnit('block-a', ['solid']);
    a.manifest.provenanceHashes.push('legacy-hash-1');

    const b = makeUnit('block-b', ['solid']);
    b.manifest.provenanceHashes.push('legacy-hash-2');

    const c = consolidate(a, b);

    expect(c.manifest.provenanceHashes).toContain('legacy-hash-1');
    expect(c.manifest.provenanceHashes).toContain('legacy-hash-2');
    expect(c.manifest.provenanceHashes).toContain(a.provenanceHash);
    expect(c.manifest.provenanceHashes).toContain(b.provenanceHash);
  });

  it('assigns a new unique provenance hash to the consolidated unit', () => {
    const a = makeUnit('block-a', ['solid']);
    const b = makeUnit('block-b', ['solid']);

    const c = consolidate(a, b);

    expect(c.provenanceHash).not.toBe(a.provenanceHash);
    expect(c.provenanceHash).not.toBe(b.provenanceHash);
    expect(c.provenanceHash).toBeTruthy();
  });

  it('tags the consolidated unit with "consolidated"', () => {
    const a = makeUnit('block-a', ['solid']);
    const b = makeUnit('block-b', ['liquid']);

    const c = consolidate(a, b);

    expect(c.manifest.tags).toContain('consolidated');
    expect(c.manifest.tags).toContain('solid');
    expect(c.manifest.tags).toContain('liquid');
  });
});

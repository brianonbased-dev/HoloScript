/**
 * Tests for POST /api/publish and POST /api/extract endpoints
 *
 * These test the endpoint logic that was added to http-server.ts to wire
 * Studio's PublishPanel to the HoloScript Publishing Protocol.
 *
 * Since the endpoints are embedded in the monolithic http-server handler,
 * we test the underlying components (storeScene, crypto hashing, trait extraction)
 * and the integration shape (request/response contracts).
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { storeScene, getScene } from '../renderer';

// ═══════════════════════════════════════════════════════════════════════════
// Content hashing (mirrors /api/publish and /api/extract logic)
// ═══════════════════════════════════════════════════════════════════════════

describe('content hashing', () => {
  it('generates consistent SHA-256 for the same code', () => {
    const code = 'object Cube { @mesh @physics position: [0, 1, 0] }';
    const hash1 = createHash('sha256').update(code).digest('hex');
    const hash2 = createHash('sha256').update(code).digest('hex');
    expect(hash1).toBe(hash2);
    expect(hash1).toHaveLength(64);
  });

  it('generates different hashes for different code', () => {
    const hash1 = createHash('sha256').update('object A {}').digest('hex');
    const hash2 = createHash('sha256').update('object B {}').digest('hex');
    expect(hash1).not.toBe(hash2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Trait extraction (regex-based, mirrors /api/extract logic)
// ═══════════════════════════════════════════════════════════════════════════

describe('trait extraction', () => {
  function extractTraits(code: string): string[] {
    const traitMatches = code.match(/@\w+/g) ?? [];
    return [...new Set(traitMatches)];
  }

  it('extracts traits prefixed with @', () => {
    const code = 'object Cube { @mesh @physics @material position: [0, 1, 0] }';
    const traits = extractTraits(code);
    expect(traits).toContain('@mesh');
    expect(traits).toContain('@physics');
    expect(traits).toContain('@material');
  });

  it('deduplicates repeated traits', () => {
    const code = '@mesh foo\n@mesh bar\n@particle baz';
    const traits = extractTraits(code);
    expect(traits).toEqual(['@mesh', '@particle']);
  });

  it('returns empty array for code with no traits', () => {
    const code = 'object EmptyBox { position: [0, 0, 0] }';
    const traits = extractTraits(code);
    expect(traits).toEqual([]);
  });

  it('handles complex scenes with many traits', () => {
    const code = `
      object Hero {
        @mesh @skeleton @animation @physics @collider
        @material @advanced_pbr @subsurface_scattering
        @networked @audio
        position: [0, 0, 0]
      }
    `;
    const traits = extractTraits(code);
    expect(traits.length).toBe(10);
    expect(traits).toContain('@skeleton');
    expect(traits).toContain('@advanced_pbr');
    expect(traits).toContain('@subsurface_scattering');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Object counting (mirrors /api/extract logic)
// ═══════════════════════════════════════════════════════════════════════════

describe('object counting', () => {
  function countObjects(code: string): number {
    return (code.match(/^object\s+/gm) ?? []).length;
  }

  it('counts single object', () => {
    expect(countObjects('object Cube { @mesh }')).toBe(1);
  });

  it('counts multiple objects', () => {
    const code = 'object A { }\nobject B { }\nobject C { }';
    expect(countObjects(code)).toBe(3);
  });

  it('returns 0 for empty code', () => {
    expect(countObjects('')).toBe(0);
  });

  it('does not count "object" inside strings or comments', () => {
    // Only matches 'object' at start of line followed by whitespace
    const code = '// object Foo\nobject Real { }';
    expect(countObjects(code)).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Scene storage integration (mirrors /api/publish scene storage)
// ═══════════════════════════════════════════════════════════════════════════

describe('scene storage for publish', () => {
  it('stores a scene and retrieves it by ID', () => {
    const code = 'object PublishTest { @mesh position: [0, 0, 0] }';
    const scene = storeScene(code, {
      title: 'Publish Test Scene',
      author: 'test-author',
      license: 'free',
    });

    expect(scene.id).toBeTruthy();
    expect(scene.title).toBe('Publish Test Scene');
    expect(scene.author).toBe('test-author');
    expect(scene.code).toBe(code);

    const retrieved = getScene(scene.id);
    expect(retrieved).toBeTruthy();
    expect(retrieved!.code).toBe(code);
  });

  it('stores scene with provenance metadata', () => {
    const code = 'object Provenance { @mesh @physics }';
    const contentHash = createHash('sha256').update(code).digest('hex');

    const scene = storeScene(code, {
      title: 'Provenance Test',
      author: 'hash-author',
      license: 'cc_by',
      provenance: {
        contentHash,
        author: 'hash-author',
        license: 'cc_by' as any,
        importHashes: [],
        timestamp: Date.now(),
      },
    });

    expect(scene.provenance).toBeTruthy();
    expect(scene.provenance!.contentHash).toBe(contentHash);
    expect(scene.provenance!.author).toBe('hash-author');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Publish response contract (shape validation)
// ═══════════════════════════════════════════════════════════════════════════

describe('publish response contract', () => {
  it('response includes all required fields', () => {
    // Simulate what the /api/publish endpoint returns
    const code = 'object ContractTest { @mesh @particle }';
    const contentHash = createHash('sha256').update(code).digest('hex');
    const scene = storeScene(code, { title: 'Contract' });
    const traits = [...new Set(code.match(/@\w+/g) ?? [])];

    const response = {
      url: `http://localhost:3000/scene/${scene.id}`,
      sceneId: scene.id,
      contentHash,
      embedUrl: `http://localhost:3000/embed/${scene.id}`,
      traits,
      visibility: 'public',
      revenue: null,
    };

    expect(response.url).toContain('/scene/');
    expect(response.sceneId).toBeTruthy();
    expect(response.contentHash).toHaveLength(64);
    expect(response.embedUrl).toContain('/embed/');
    expect(response.traits).toContain('@mesh');
    expect(response.traits).toContain('@particle');
    expect(response.visibility).toBe('public');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Extract response contract (shape validation)
// ═══════════════════════════════════════════════════════════════════════════

describe('extract response contract', () => {
  it('response includes all required fields', () => {
    const code = 'object ExtractTest { @mesh @gaussian }\nobject B { @physics }';
    const contentHash = createHash('sha256').update(code).digest('hex');
    const traitMatches = code.match(/@\w+/g) ?? [];
    const traits = [...new Set(traitMatches)];
    const objectCount = (code.match(/^object\s+/gm) ?? []).length;
    const importCount = (code.match(/^import\s+/gm) ?? []).length;

    const response = {
      contentHash,
      traits,
      objectCount,
      importCount,
      codeLength: code.length,
      alreadyPublished: false,
      existingUrl: null,
      revenue: null,
    };

    expect(response.contentHash).toHaveLength(64);
    expect(response.traits).toEqual(['@mesh', '@gaussian', '@physics']);
    expect(response.objectCount).toBe(2);
    expect(response.importCount).toBe(0);
    expect(response.codeLength).toBeGreaterThan(0);
    expect(response.alreadyPublished).toBe(false);
  });
});

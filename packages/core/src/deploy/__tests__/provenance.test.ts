import { describe, it, expect } from 'vitest';
import {
  computeContentHash,
  classifyPublishMode,
  extractImports,
  generateProvenance,
} from '../provenance';

// =============================================================================
// computeContentHash
// =============================================================================

describe('computeContentHash', () => {
  it('returns a 64-char hex string (SHA-256)', () => {
    const hash = computeContentHash('hello world');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('produces deterministic output for the same input', () => {
    const a = computeContentHash('scene test { object cube {} }');
    const b = computeContentHash('scene test { object cube {} }');
    expect(a).toBe(b);
  });

  it('produces different hashes for different inputs', () => {
    const a = computeContentHash('scene A {}');
    const b = computeContentHash('scene B {}');
    expect(a).not.toBe(b);
  });

  it('normalizes CRLF to LF before hashing', () => {
    const crlf = computeContentHash('line1\r\nline2');
    const lf = computeContentHash('line1\nline2');
    expect(crlf).toBe(lf);
  });

  it('handles empty string', () => {
    const hash = computeContentHash('');
    expect(hash).toHaveLength(64);
  });
});

// =============================================================================
// classifyPublishMode
// =============================================================================

describe('classifyPublishMode', () => {
  it('returns "original" when no imports', () => {
    const ast = { imports: [], body: [{ type: 'scene' }] };
    expect(classifyPublishMode(ast)).toBe('original');
  });

  it('returns "original" when imports array is missing', () => {
    const ast = { body: [{ type: 'object' }] };
    expect(classifyPublishMode(ast)).toBe('original');
  });

  it('returns "remix" when imports + own content', () => {
    const ast = {
      imports: [{ path: '@maria/warrior' }],
      body: [{ type: 'scene' }, { type: 'ObjectDeclaration' }],
    };
    expect(classifyPublishMode(ast)).toBe('remix');
  });

  it('returns "curated" when imports but no own content', () => {
    const ast = {
      imports: [{ path: '@maria/warrior' }, { path: '@jake/fire-vfx' }],
      body: [{ type: 'import' }, { type: 'deploy' }],
    };
    expect(classifyPublishMode(ast)).toBe('curated');
  });

  it('recognizes composition node type as own content', () => {
    const ast = {
      imports: [{ path: './template' }],
      body: [{ type: 'composition' }],
    };
    expect(classifyPublishMode(ast)).toBe('remix');
  });

  it('recognizes character node type as own content', () => {
    const ast = {
      imports: [{ path: '@lib/skeleton' }],
      body: [{ type: 'character' }],
    };
    expect(classifyPublishMode(ast)).toBe('remix');
  });

  it('recognizes environment node type as own content', () => {
    const ast = {
      imports: [{ path: '@lib/sky' }],
      body: [{ type: 'environment' }],
    };
    expect(classifyPublishMode(ast)).toBe('remix');
  });

  it('handles nested ast structure (ast.ast.imports)', () => {
    const ast = {
      ast: {
        imports: [{ path: './lib' }],
        body: [],
      },
    };
    expect(classifyPublishMode(ast)).toBe('curated');
  });

  it('handles null/undefined AST gracefully', () => {
    expect(classifyPublishMode(null)).toBe('original');
    expect(classifyPublishMode(undefined)).toBe('original');
    expect(classifyPublishMode({})).toBe('original');
  });
});

// =============================================================================
// extractImports
// =============================================================================

describe('extractImports', () => {
  it('extracts imports with path field', () => {
    const ast = {
      imports: [{ path: '@maria/warrior' }, { path: './local-file' }],
    };
    const result = extractImports(ast);
    expect(result).toHaveLength(2);
    expect(result[0].path).toBe('@maria/warrior');
    expect(result[1].path).toBe('./local-file');
  });

  it('extracts imports with source field (fallback)', () => {
    const ast = {
      imports: [{ source: '@jake/fire-vfx' }],
    };
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('@jake/fire-vfx');
  });

  it('preserves hash and author when present', () => {
    const ast = {
      imports: [
        {
          path: '@maria/warrior',
          hash: 'abc123',
          author: 'maria',
        },
      ],
    };
    const result = extractImports(ast);
    expect(result[0].hash).toBe('abc123');
    expect(result[0].author).toBe('maria');
  });

  it('filters out imports with empty paths', () => {
    const ast = {
      imports: [{ path: '' }, { path: '@valid/import' }, {}],
    };
    const result = extractImports(ast);
    expect(result).toHaveLength(1);
    expect(result[0].path).toBe('@valid/import');
  });

  it('returns empty array for no imports', () => {
    expect(extractImports({})).toEqual([]);
    expect(extractImports({ imports: null })).toEqual([]);
    expect(extractImports(null)).toEqual([]);
  });
});

// =============================================================================
// generateProvenance
// =============================================================================

describe('generateProvenance', () => {
  const source = 'scene test { object cube { position: [0,0,0] } }';
  const originalAst = { imports: [], body: [{ type: 'scene' }] };
  const remixAst = {
    imports: [{ path: '@maria/warrior' }],
    body: [{ type: 'scene' }],
  };

  it('generates a complete provenance block', () => {
    const prov = generateProvenance(source, originalAst, {
      author: 'brian',
      license: 'cc_by',
      createdAt: '2026-03-27T00:00:00Z',
    });

    expect(prov.author).toBe('brian');
    expect(prov.created).toBe('2026-03-27T00:00:00Z');
    expect(prov.hash).toHaveLength(64);
    expect(prov.license).toBe('cc_by');
    expect(prov.version).toBe(1);
    expect(prov.publishMode).toBe('original');
    expect(prov.imports).toEqual([]);
  });

  it('auto-classifies remix mode when imports present', () => {
    const prov = generateProvenance(source, remixAst, {
      author: 'brian',
      license: 'cc_by_sa',
    });

    expect(prov.publishMode).toBe('remix');
    expect(prov.imports).toHaveLength(1);
    expect(prov.imports[0].path).toBe('@maria/warrior');
  });

  it('defaults created to now when createdAt not provided', () => {
    const prov = generateProvenance(source, originalAst, {
      author: 'test',
      license: 'free',
    });

    // Should be a valid ISO string
    expect(() => new Date(prov.created)).not.toThrow();
    expect(new Date(prov.created).getFullYear()).toBeGreaterThanOrEqual(2026);
  });

  it('hash changes when source changes', () => {
    const prov1 = generateProvenance('scene A {}', originalAst, {
      author: 'test',
      license: 'free',
    });
    const prov2 = generateProvenance('scene B {}', originalAst, {
      author: 'test',
      license: 'free',
    });

    expect(prov1.hash).not.toBe(prov2.hash);
  });
});

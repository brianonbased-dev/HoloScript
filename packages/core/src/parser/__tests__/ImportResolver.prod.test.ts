/**
 * ImportResolver Tests
 *
 * All tests use in-memory readFile mocks — no filesystem access.
 * Covers:
 *   - Basic resolve: scope populated from @export
 *   - Alias namespace: exports under alias.Name
 *   - Named imports: only matching exports in scope
 *   - Module cache: readFile called exactly once per path
 *   - Cycle detection: error with 'cycle' code, no infinite loop
 *   - Transitive deps: a→b→c, all exports reachable from a
 *   - not_found: missing file → error with 'not_found' code
 *   - named_not_exported: requesting unexported name → error
 *   - clearCache / getCachedPaths
 *   - resolveImportPath utility
 *   - disabled mode: returns empty scope
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ImportResolver, resolveImportPath, type ImportResolveOptions } from '../ImportResolver';

// =============================================================================
// Test helpers
// =============================================================================

/** Build an in-memory readFile function from a path→source map */
function makeReader(files: Record<string, string>) {
  const calls: string[] = [];
  const reader = vi.fn(async (path: string) => {
    calls.push(path);
    if (path in files) return files[path];
    throw new Error(`File not found: ${path}`);
  });
  return { reader, calls };
}

/** Parse a minimal HS+ source with @export and an orb/template */
function hsExport(name: string, kind = 'template', extra = '') {
  return `@export ${kind} "${name}"\norb ${name.toLowerCase()} { ${extra} }\n`;
}

/** Parse a minimal HS+ import */
function hsImport(path: string, alias?: string, named?: string[]) {
  if (named) return `@import { ${named.join(', ')} } from "${path}"\n`;
  if (alias) return `@import "${path}" as ${alias}\n`;
  return `@import "${path}"\n`;
}

/** Build a minimal single-import parse result via real parser */
async function parseWith(source: string) {
  const { HoloScriptPlusParser } = await import('../HoloScriptPlusParser');
  const p = new HoloScriptPlusParser({ enableTypeScriptImports: true });
  return p.parse(source);
}

const BASE = '/project';
function opts(
  reader: (p: string) => Promise<string>,
  extra: Partial<ImportResolveOptions> = {}
): ImportResolveOptions {
  return { baseDir: BASE, readFile: reader, ...extra };
}

// =============================================================================
// resolveImportPath utility
// =============================================================================

describe('resolveImportPath', () => {
  it('resolves relative ./path from a base dir', () => {
    expect(resolveImportPath('./foo.hs', '/project')).toBe('/project/foo.hs');
  });

  it('resolves ../path correctly', () => {
    expect(resolveImportPath('../shared/ui.hs', '/project/scenes')).toBe('/project/shared/ui.hs');
  });

  it('returns absolute path unchanged', () => {
    expect(resolveImportPath('/abs/path.hs', '/any')).toBe('/abs/path.hs');
  });

  it('normalizes backslashes to forward slashes', () => {
    const r = resolveImportPath('./foo.hs', 'C:\\Users\\joe\\project');
    expect(r).toBe('C:/Users/joe/project/foo.hs');
  });

  it('handles double dot in the middle of base', () => {
    expect(resolveImportPath('./b.hs', '/a/x/../y')).toBe('/a/y/b.hs');
  });
});

// =============================================================================
// Basic resolve
// =============================================================================

describe('ImportResolver — basic', () => {
  let resolver: ImportResolver;
  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('returns empty scope when no imports', async () => {
    const result = await parseWith('orb x { }\n');
    const { reader } = makeReader({});
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));
    expect(res.scope.size).toBe(0);
    expect(res.errors).toHaveLength(0);
  });

  it('resolves a simple import and populates scope under alias', async () => {
    const libSrc = hsExport('Button');
    const sceneSrc = hsImport('./lib.hs');
    const { reader } = makeReader({ [`${BASE}/lib.hs`]: libSrc });

    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.errors).toHaveLength(0);
    // Default alias = 'lib', so scope key is 'lib.Button'
    expect(res.scope.has('lib.Button')).toBe(true);
    expect(res.scope.get('lib.Button')).toBeDefined();
  });

  it('resolves import with explicit alias', async () => {
    const libSrc = hsExport('Card');
    const sceneSrc = hsImport('./ui-kit.hs', 'UI');
    const { reader } = makeReader({ [`${BASE}/ui-kit.hs`]: libSrc });

    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.scope.has('UI.Card')).toBe(true);
  });
});

// =============================================================================
// Named imports
// =============================================================================

describe('ImportResolver — named imports', () => {
  let resolver: ImportResolver;
  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('only imports listed names via named imports', async () => {
    const libSrc = [hsExport('Button'), hsExport('Card'), hsExport('Input')].join('');
    const sceneSrc = hsImport('./ui.hs', undefined, ['Button', 'Card']);
    const { reader } = makeReader({ [`${BASE}/ui.hs`]: libSrc });

    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.scope.has('Button')).toBe(true);
    expect(res.scope.has('Card')).toBe(true);
    // Input was not listed — should NOT be in scope
    expect(res.scope.has('Input')).toBe(false);
  });

  it('errors on named import that is not exported', async () => {
    const libSrc = hsExport('Button');
    const sceneSrc = hsImport('./ui.hs', undefined, ['Button', 'Ghost']);
    const { reader } = makeReader({ [`${BASE}/ui.hs`]: libSrc });

    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.errors.some((e) => e.code === 'named_not_exported')).toBe(true);
    expect(res.errors.find((e) => e.code === 'named_not_exported')?.message).toContain('Ghost');
  });
});

// =============================================================================
// Module cache
// =============================================================================

describe('ImportResolver — module cache', () => {
  let resolver: ImportResolver;
  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('reads each imported file exactly once even if imported twice', async () => {
    const libSrc = hsExport('Shared');
    const { reader, calls } = makeReader({ [`${BASE}/shared.hs`]: libSrc });

    // Import shared.hs from two different scene parsings
    const src1 = await parseWith(hsImport('./shared.hs'));
    const src2 = await parseWith(hsImport('./shared.hs'));

    await resolver.resolve(src1, `${BASE}/scene1.hs`, opts(reader));
    await resolver.resolve(src2, `${BASE}/scene2.hs`, opts(reader));

    // Only one actual file read
    expect(calls.filter((c) => c === `${BASE}/shared.hs`).length).toBe(1);
  });

  it('getCachedPaths returns resolved paths', async () => {
    const libSrc = hsExport('X');
    const { reader } = makeReader({ [`${BASE}/x.hs`]: libSrc });
    const result = await parseWith(hsImport('./x.hs'));
    await resolver.resolve(result, `${BASE}/s.hs`, opts(reader));
    expect(resolver.getCachedPaths()).toContain(`${BASE}/x.hs`);
  });

  it('clearCache removes cached entries', async () => {
    const libSrc = hsExport('Y');
    const { reader } = makeReader({ [`${BASE}/y.hs`]: libSrc });
    const result = await parseWith(hsImport('./y.hs'));
    await resolver.resolve(result, `${BASE}/s.hs`, opts(reader));
    resolver.clearCache();
    expect(resolver.getCachedPaths()).toHaveLength(0);
  });
});

// =============================================================================
// File not found
// =============================================================================

describe('ImportResolver — file not found', () => {
  let resolver: ImportResolver;
  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('returns not_found error for missing file', async () => {
    const { reader } = makeReader({}); // empty — nothing exists
    const result = await parseWith(hsImport('./missing.hs'));
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].code).toBe('not_found');
    expect(res.errors[0].importPath).toBe('./missing.hs');
  });

  it('continues resolving other imports after a missing file', async () => {
    const libSrc = hsExport('Found');
    const { reader } = makeReader({ [`${BASE}/found.hs`]: libSrc });

    const sceneSrc = [hsImport('./missing.hs'), hsImport('./found.hs')].join('');
    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.errors.some((e) => e.code === 'not_found')).toBe(true);
    expect(res.scope.has('found.Found')).toBe(true);
  });
});

// =============================================================================
// Cycle detection
// =============================================================================

describe('ImportResolver — cycle detection', () => {
  let resolver: ImportResolver;
  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('detects direct self-import cycle', async () => {
    const selfSrc = `@import "./self.hs"\norb x { }\n`;
    const { reader } = makeReader({ [`${BASE}/self.hs`]: selfSrc });

    const result = await parseWith(selfSrc);
    const res = await resolver.resolve(result, `${BASE}/self.hs`, opts(reader));

    // Should have a cycle error
    expect(res.errors.some((e) => e.code === 'cycle')).toBe(true);
  });

  it('detects two-file cycle: a→b→a', async () => {
    const aSrc = `@import "./b.hs"\norb a { }\n`;
    const bSrc = `@import "./a.hs"\norb b { }\n`;
    const { reader } = makeReader({
      [`${BASE}/a.hs`]: aSrc,
      [`${BASE}/b.hs`]: bSrc,
    });

    const result = await parseWith(aSrc);
    const res = await resolver.resolve(result, `${BASE}/a.hs`, opts(reader));

    expect(res.errors.some((e) => e.code === 'cycle')).toBe(true);
    const cycleErr = res.errors.find((e) => e.code === 'cycle')!;
    expect(cycleErr.message).toContain('Circular import');
  });

  it('does not infinite-loop on deep cycle', async () => {
    // a→b→c→a (3-cycle)
    const aSrc = `@import "./b.hs"\norb a { }\n`;
    const bSrc = `@import "./c.hs"\norb b { }\n`;
    const cSrc = `@import "./a.hs"\norb c { }\n`;
    const { reader } = makeReader({
      [`${BASE}/a.hs`]: aSrc,
      [`${BASE}/b.hs`]: bSrc,
      [`${BASE}/c.hs`]: cSrc,
    });

    const result = await parseWith(aSrc);
    // Must complete without hanging
    const res = await resolver.resolve(result, `${BASE}/a.hs`, opts(reader));
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// Transitive dependencies
// =============================================================================

describe('ImportResolver — transitive deps', () => {
  let resolver: ImportResolver;
  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('resolves a→b→c chain, c exports reachable from a', async () => {
    const cSrc = hsExport('BaseWidget');
    const bSrc = `@import "./c.hs"\n@export template "MidWidget"\norb mid { }\n`;
    const aSrc = `@import "./b.hs"\norb scene { }\n`;

    const { reader } = makeReader({
      [`${BASE}/a.hs`]: aSrc,
      [`${BASE}/b.hs`]: bSrc,
      [`${BASE}/c.hs`]: cSrc,
    });

    const result = await parseWith(aSrc);
    const res = await resolver.resolve(result, `${BASE}/a.hs`, opts(reader));

    // b directly exports MidWidget
    expect(res.scope.has('b.MidWidget')).toBe(true);
    // BaseWidget from c is re-exported through b (transitive merge)
    expect(res.scope.has('b.BaseWidget')).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});

// =============================================================================
// Max depth
// =============================================================================

describe('ImportResolver — max depth', () => {
  let resolver: ImportResolver;
  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('respects maxDepth option', async () => {
    // Simulate a long (non-cyclic) chain: a→b→c→d→e
    const eSrc = hsExport('E');
    const dSrc = `@import "./e.hs"\n` + hsExport('D');
    const cSrc = `@import "./d.hs"\n` + hsExport('C');
    const bSrc = `@import "./c.hs"\n` + hsExport('B');
    const aSrc = `@import "./b.hs"\norb a { }\n`;

    const { reader } = makeReader({
      [`${BASE}/a.hs`]: aSrc,
      [`${BASE}/b.hs`]: bSrc,
      [`${BASE}/c.hs`]: cSrc,
      [`${BASE}/d.hs`]: dSrc,
      [`${BASE}/e.hs`]: eSrc,
    });

    const result = await parseWith(aSrc);
    // max depth of 1 should cause an error when resolving b's dep on c
    const res = await resolver.resolve(result, `${BASE}/a.hs`, opts(reader, { maxDepth: 1 }));

    expect(res.errors.some((e) => e.code === 'max_depth')).toBe(true);
  });
});

// =============================================================================
// Disabled mode
// =============================================================================

describe('ImportResolver — disabled mode', () => {
  it('returns empty scope when disabled: true', async () => {
    const result = await parseWith(hsImport('./foo.hs'));
    const { reader } = makeReader({ [`${BASE}/foo.hs`]: hsExport('X') });
    const resolver = new ImportResolver();
    const res = await resolver.resolve(result, `${BASE}/s.hs`, {
      baseDir: BASE,
      readFile: reader,
      disabled: true,
    });
    expect(res.scope.size).toBe(0);
    expect(res.errors).toHaveLength(0);
  });
});

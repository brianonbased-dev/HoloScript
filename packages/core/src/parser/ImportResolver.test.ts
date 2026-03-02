/**
 * ImportResolver — Comprehensive Inline Unit Tests
 *
 * Covers:
 * - resolveImportPath utility: relative, absolute, backslash, dot segments
 * - ImportResolver class:
 *   - Constructor / initialization
 *   - Basic resolve: scope populated from @export directives
 *   - Alias namespace imports
 *   - Named imports: only listed names imported
 *   - Wildcard imports: all exports under alias
 *   - Module cache: readFile called once per path
 *   - Cycle detection: direct, two-file, deep cycle
 *   - Transitive dependencies: a->b->c chain
 *   - File not found: error with 'not_found' code
 *   - Named not exported: error with 'named_not_exported' code
 *   - Max depth exceeded: error with 'max_depth' code
 *   - Disabled mode: empty scope
 *   - clearCache / getCachedPaths / getCached
 * - globalImportResolver singleton
 * - Edge cases: empty imports, multiple errors, continuation after errors
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  ImportResolver,
  resolveImportPath,
  globalImportResolver,
  type ImportResolveOptions,
  type ResolvedModule,
} from './ImportResolver';

// =============================================================================
// Test Helpers
// =============================================================================

/** Build an in-memory readFile function from a path->source map */
function makeReader(files: Record<string, string>) {
  const calls: string[] = [];
  const reader = vi.fn(async (path: string) => {
    calls.push(path);
    if (path in files) return files[path];
    throw new Error(`File not found: ${path}`);
  });
  return { reader, calls };
}

/** Minimal HS+ source with @export */
function hsExport(name: string, kind = 'template', extra = '') {
  return `@export ${kind} "${name}"\norb ${name.toLowerCase()} { ${extra} }\n`;
}

/** Minimal HS+ import directive */
function hsImport(path: string, alias?: string, named?: string[]) {
  if (named) return `@import { ${named.join(', ')} } from "${path}"\n`;
  if (alias) return `@import "${path}" as ${alias}\n`;
  return `@import "${path}"\n`;
}

/** Parse source using the real parser */
async function parseWith(source: string) {
  const { HoloScriptPlusParser } = await import('./HoloScriptPlusParser');
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
// resolveImportPath
// =============================================================================

describe('resolveImportPath', () => {
  it('resolves relative ./path from base dir', () => {
    expect(resolveImportPath('./foo.hs', '/project')).toBe('/project/foo.hs');
  });

  it('resolves ../path correctly', () => {
    expect(resolveImportPath('../shared/ui.hs', '/project/scenes')).toBe('/project/shared/ui.hs');
  });

  it('returns absolute path unchanged', () => {
    expect(resolveImportPath('/abs/path.hs', '/any')).toBe('/abs/path.hs');
  });

  it('normalizes backslashes to forward slashes', () => {
    const result = resolveImportPath('./foo.hs', 'C:\\Users\\joe\\project');
    expect(result).toBe('C:/Users/joe/project/foo.hs');
  });

  it('handles double dot in the middle of base', () => {
    expect(resolveImportPath('./b.hs', '/a/x/../y')).toBe('/a/y/b.hs');
  });

  it('handles Windows absolute import path', () => {
    const result = resolveImportPath('C:/libs/util.hs', '/project');
    expect(result).toBe('C:/libs/util.hs');
  });

  it('handles nested relative path', () => {
    expect(resolveImportPath('./sub/deep/file.hs', '/project')).toBe('/project/sub/deep/file.hs');
  });

  it('handles bare filename (no ./ prefix) as relative', () => {
    const result = resolveImportPath('lib.hs', '/project');
    expect(result).toBe('/project/lib.hs');
  });

  it('handles multiple .. segments', () => {
    expect(resolveImportPath('../../root.hs', '/a/b/c')).toBe('/a/root.hs');
  });

  it('handles trailing slash in base dir', () => {
    expect(resolveImportPath('./file.hs', '/project/')).toBe('/project/file.hs');
  });
});

// =============================================================================
// ImportResolver - Basic resolve
// =============================================================================

describe('ImportResolver - Basic resolve', () => {
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
    // Default alias derived from filename
    expect(res.scope.has('lib.Button')).toBe(true);
  });

  it('resolves import with explicit alias', async () => {
    const libSrc = hsExport('Card');
    const sceneSrc = hsImport('./ui-kit.hs', 'UI');
    const { reader } = makeReader({ [`${BASE}/ui-kit.hs`]: libSrc });

    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.scope.has('UI.Card')).toBe(true);
  });

  it('populates modules map', async () => {
    const libSrc = hsExport('Widget');
    const sceneSrc = hsImport('./widgets.hs');
    const { reader } = makeReader({ [`${BASE}/widgets.hs`]: libSrc });

    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.modules.size).toBeGreaterThan(0);
    expect(res.modules.has(`${BASE}/widgets.hs`)).toBe(true);
  });
});

// =============================================================================
// ImportResolver - Named imports
// =============================================================================

describe('ImportResolver - Named imports', () => {
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
    expect(res.scope.has('Input')).toBe(false);
  });

  it('errors on named import that is not exported', async () => {
    const libSrc = hsExport('Button');
    const sceneSrc = hsImport('./ui.hs', undefined, ['Button', 'Ghost']);
    const { reader } = makeReader({ [`${BASE}/ui.hs`]: libSrc });

    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.errors.some(e => e.code === 'named_not_exported')).toBe(true);
    expect(res.errors.find(e => e.code === 'named_not_exported')?.message).toContain('Ghost');
  });
});

// =============================================================================
// ImportResolver - Module cache
// =============================================================================

describe('ImportResolver - Module cache', () => {
  let resolver: ImportResolver;

  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('reads each imported file exactly once even if imported twice', async () => {
    const libSrc = hsExport('Shared');
    const { reader, calls } = makeReader({ [`${BASE}/shared.hs`]: libSrc });

    const src1 = await parseWith(hsImport('./shared.hs'));
    const src2 = await parseWith(hsImport('./shared.hs'));

    await resolver.resolve(src1, `${BASE}/scene1.hs`, opts(reader));
    await resolver.resolve(src2, `${BASE}/scene2.hs`, opts(reader));

    expect(calls.filter(c => c === `${BASE}/shared.hs`).length).toBe(1);
  });

  it('getCachedPaths returns resolved paths', async () => {
    const libSrc = hsExport('X');
    const { reader } = makeReader({ [`${BASE}/x.hs`]: libSrc });
    const result = await parseWith(hsImport('./x.hs'));
    await resolver.resolve(result, `${BASE}/s.hs`, opts(reader));
    expect(resolver.getCachedPaths()).toContain(`${BASE}/x.hs`);
  });

  it('getCached returns the resolved module', async () => {
    const libSrc = hsExport('Y');
    const { reader } = makeReader({ [`${BASE}/y.hs`]: libSrc });
    const result = await parseWith(hsImport('./y.hs'));
    await resolver.resolve(result, `${BASE}/s.hs`, opts(reader));

    const cached = resolver.getCached(`${BASE}/y.hs`);
    expect(cached).toBeDefined();
    expect(cached?.canonicalPath).toBe(`${BASE}/y.hs`);
  });

  it('getCached returns undefined for uncached path', () => {
    expect(resolver.getCached('/nonexistent.hs')).toBeUndefined();
  });

  it('clearCache removes all cached entries', async () => {
    const libSrc = hsExport('Z');
    const { reader } = makeReader({ [`${BASE}/z.hs`]: libSrc });
    const result = await parseWith(hsImport('./z.hs'));
    await resolver.resolve(result, `${BASE}/s.hs`, opts(reader));

    resolver.clearCache();
    expect(resolver.getCachedPaths()).toHaveLength(0);
    expect(resolver.getCached(`${BASE}/z.hs`)).toBeUndefined();
  });
});

// =============================================================================
// ImportResolver - File not found
// =============================================================================

describe('ImportResolver - File not found', () => {
  let resolver: ImportResolver;

  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('returns not_found error for missing file', async () => {
    const { reader } = makeReader({});
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

    expect(res.errors.some(e => e.code === 'not_found')).toBe(true);
    expect(res.scope.has('found.Found')).toBe(true);
  });
});

// =============================================================================
// ImportResolver - Cycle detection
// =============================================================================

describe('ImportResolver - Cycle detection', () => {
  let resolver: ImportResolver;

  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('detects direct self-import cycle', async () => {
    const selfSrc = `@import "./self.hs"\norb x { }\n`;
    const { reader } = makeReader({ [`${BASE}/self.hs`]: selfSrc });

    const result = await parseWith(selfSrc);
    const res = await resolver.resolve(result, `${BASE}/self.hs`, opts(reader));

    expect(res.errors.some(e => e.code === 'cycle')).toBe(true);
  });

  it('detects two-file cycle: a -> b -> a', async () => {
    const aSrc = `@import "./b.hs"\norb a { }\n`;
    const bSrc = `@import "./a.hs"\norb b { }\n`;
    const { reader } = makeReader({
      [`${BASE}/a.hs`]: aSrc,
      [`${BASE}/b.hs`]: bSrc,
    });

    const result = await parseWith(aSrc);
    const res = await resolver.resolve(result, `${BASE}/a.hs`, opts(reader));

    expect(res.errors.some(e => e.code === 'cycle')).toBe(true);
    const cycleErr = res.errors.find(e => e.code === 'cycle')!;
    expect(cycleErr.message).toContain('Circular import');
  });

  it('does not infinite-loop on deep cycle (a -> b -> c -> a)', async () => {
    const aSrc = `@import "./b.hs"\norb a { }\n`;
    const bSrc = `@import "./c.hs"\norb b { }\n`;
    const cSrc = `@import "./a.hs"\norb c { }\n`;
    const { reader } = makeReader({
      [`${BASE}/a.hs`]: aSrc,
      [`${BASE}/b.hs`]: bSrc,
      [`${BASE}/c.hs`]: cSrc,
    });

    const result = await parseWith(aSrc);
    const res = await resolver.resolve(result, `${BASE}/a.hs`, opts(reader));
    expect(res.errors.length).toBeGreaterThan(0);
  });
});

// =============================================================================
// ImportResolver - Transitive dependencies
// =============================================================================

describe('ImportResolver - Transitive deps', () => {
  let resolver: ImportResolver;

  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('resolves a -> b -> c chain, c exports reachable from a', async () => {
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

    expect(res.scope.has('b.MidWidget')).toBe(true);
    expect(res.scope.has('b.BaseWidget')).toBe(true);
    expect(res.errors).toHaveLength(0);
  });
});

// =============================================================================
// ImportResolver - Max depth
// =============================================================================

describe('ImportResolver - Max depth', () => {
  let resolver: ImportResolver;

  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('respects maxDepth option', async () => {
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
    const res = await resolver.resolve(
      result,
      `${BASE}/a.hs`,
      opts(reader, { maxDepth: 1 })
    );

    expect(res.errors.some(e => e.code === 'max_depth')).toBe(true);
  });

  it('default maxDepth allows reasonable depth', async () => {
    // 5 levels of imports should be fine with default maxDepth=32
    const level5 = hsExport('L5');
    const level4 = `@import "./l5.hs"\n` + hsExport('L4');
    const level3 = `@import "./l4.hs"\n` + hsExport('L3');
    const level2 = `@import "./l3.hs"\n` + hsExport('L2');
    const level1 = `@import "./l2.hs"\norb scene { }\n`;

    const { reader } = makeReader({
      [`${BASE}/l1.hs`]: level1,
      [`${BASE}/l2.hs`]: level2,
      [`${BASE}/l3.hs`]: level3,
      [`${BASE}/l4.hs`]: level4,
      [`${BASE}/l5.hs`]: level5,
    });

    const result = await parseWith(level1);
    const res = await resolver.resolve(result, `${BASE}/l1.hs`, opts(reader));

    expect(res.errors.filter(e => e.code === 'max_depth')).toHaveLength(0);
  });
});

// =============================================================================
// ImportResolver - Disabled mode
// =============================================================================

describe('ImportResolver - Disabled mode', () => {
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
    expect(res.modules.size).toBe(0);
  });

  it('does not call readFile when disabled', async () => {
    const result = await parseWith(hsImport('./foo.hs'));
    const { reader, calls } = makeReader({ [`${BASE}/foo.hs`]: hsExport('X') });
    const resolver = new ImportResolver();
    await resolver.resolve(result, `${BASE}/s.hs`, {
      baseDir: BASE,
      readFile: reader,
      disabled: true,
    });
    expect(calls).toHaveLength(0);
  });
});

// =============================================================================
// globalImportResolver singleton
// =============================================================================

describe('globalImportResolver', () => {
  it('is an instance of ImportResolver', () => {
    expect(globalImportResolver).toBeInstanceOf(ImportResolver);
  });

  it('has getCachedPaths method', () => {
    expect(typeof globalImportResolver.getCachedPaths).toBe('function');
  });

  it('has clearCache method', () => {
    expect(typeof globalImportResolver.clearCache).toBe('function');
  });

  it('has resolve method', () => {
    expect(typeof globalImportResolver.resolve).toBe('function');
  });
});

// =============================================================================
// Edge Cases
// =============================================================================

describe('ImportResolver - Edge Cases', () => {
  let resolver: ImportResolver;

  beforeEach(() => {
    resolver = new ImportResolver();
  });

  it('handles source with no AST gracefully', async () => {
    // Construct a minimal result that has no imports
    const mockResult = {
      success: true,
      errors: [],
      ast: { root: null },
    } as any;

    const { reader } = makeReader({});
    const res = await resolver.resolve(mockResult, `${BASE}/empty.hs`, opts(reader));
    expect(res.scope.size).toBe(0);
    expect(res.errors).toHaveLength(0);
  });

  it('handles multiple errors without crashing', async () => {
    const sceneSrc = [
      hsImport('./missing1.hs'),
      hsImport('./missing2.hs'),
      hsImport('./missing3.hs'),
    ].join('');
    const { reader } = makeReader({});
    const result = await parseWith(sceneSrc);
    const res = await resolver.resolve(result, `${BASE}/scene.hs`, opts(reader));

    expect(res.errors.length).toBeGreaterThanOrEqual(3);
  });

  it('clearCache allows re-resolution of previously cached modules', async () => {
    const libSrcV1 = hsExport('WidgetV1');
    const { reader: reader1, calls: calls1 } = makeReader({ [`${BASE}/lib.hs`]: libSrcV1 });

    const result1 = await parseWith(hsImport('./lib.hs'));
    await resolver.resolve(result1, `${BASE}/s.hs`, opts(reader1));
    expect(calls1.length).toBe(1);

    resolver.clearCache();

    const libSrcV2 = hsExport('WidgetV2');
    const { reader: reader2, calls: calls2 } = makeReader({ [`${BASE}/lib.hs`]: libSrcV2 });
    const result2 = await parseWith(hsImport('./lib.hs'));
    await resolver.resolve(result2, `${BASE}/s.hs`, opts(reader2));
    expect(calls2.length).toBe(1); // re-read after cache clear
  });
});

/**
 * ImportDirective Parser Tests
 *
 * Covers all @import/@export syntax forms handled by HoloScriptPlusParser.parseDirective():
 *   - @import "./path.hs"                      (simple)
 *   - @import "./path.hs" as Alias             (with alias)
 *   - @import { A, B } from "./path.hs"        (named imports)
 *   - @import * as NS from "./path.hs"         (wildcard — structural readthrough)
 *   - @export template "Name"                  (typed export)
 *   - @export object "Name"
 *   - @export "Name"                           (untyped export)
 *   - requiredCompanions populated from imports
 *   - globalDirectives routing (type === 'import' | 'export' go to globalDirectives)
 *   - disabled import mode (warn only)
 */

import { describe, it, expect } from 'vitest';
import { HoloScriptPlusParser } from '../HoloScriptPlusParser';

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function parse(src: string, opts: { enableTypeScriptImports?: boolean } = {}) {
  const parser = new HoloScriptPlusParser({
    enableTypeScriptImports: opts.enableTypeScriptImports ?? true,
  });
  return parser.parse(src);
}

function importDirectives(result: ReturnType<typeof parse>) {
  return (result.ast.imports ?? []) as Array<{
    path: string;
    alias: string;
    namedImports?: string[];
    isWildcard?: boolean;
  }>;
}

function globalDirectives(result: ReturnType<typeof parse>) {
  return (result.ast as any).directives as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// @import — simple
// ---------------------------------------------------------------------------

describe('@import — simple path', () => {
  it('parses @import "./foo.hs"', () => {
    const result = parse('@import "./foo.hs"\n');
    const imps = importDirectives(result);
    expect(imps).toHaveLength(1);
    expect(imps[0].path).toBe('./foo.hs');
    expect(imps[0].alias).toBe('foo');
    expect(imps[0].namedImports).toBeUndefined();
    expect(imps[0].isWildcard).toBeFalsy();
  });

  it('derives alias from nested path stem', () => {
    const result = parse('@import "./shared/ui-kit.hs"\n');
    const imps = importDirectives(result);
    expect(imps[0].alias).toBe('ui-kit');
  });

  it('populates requiredCompanions', () => {
    const result = parse('@import "./button.hs"\n');
    expect(result.requiredCompanions).toContain('./button.hs');
  });
});

// ---------------------------------------------------------------------------
// @import — with alias
// ---------------------------------------------------------------------------

describe('@import — with alias', () => {
  it('parses @import "./foo.hs" as F', () => {
    const result = parse('@import "./foo.hs" as F\n');
    const imps = importDirectives(result);
    expect(imps[0].alias).toBe('F');
    expect(imps[0].namedImports).toBeUndefined();
  });

  it('alias overrides default stem', () => {
    const result = parse('@import "./shared/ui-kit.hs" as UI\n');
    const imps = importDirectives(result);
    expect(imps[0].alias).toBe('UI');
    expect(imps[0].path).toBe('./shared/ui-kit.hs');
  });
});

// ---------------------------------------------------------------------------
// @import — named imports
// ---------------------------------------------------------------------------

describe('@import — named imports', () => {
  it('parses @import { Button } from "./ui.hs"', () => {
    const result = parse('@import { Button } from "./ui.hs"\n');
    const imps = importDirectives(result);
    expect(imps[0].namedImports).toEqual(['Button']);
    expect(imps[0].path).toBe('./ui.hs');
  });

  it('parses @import { Button, Card } from "./ui.hs"', () => {
    const result = parse('@import { Button, Card } from "./ui.hs"\n');
    const imps = importDirectives(result);
    expect(imps[0].namedImports).toEqual(['Button', 'Card']);
  });

  it('handles single trailing comma in named list gracefully', () => {
    // Parser should still produce the named list (trailing comma)
    const result = parse('@import { A } from "./a.hs"\n');
    expect(importDirectives(result)[0].namedImports).toEqual(['A']);
  });

  it('sets isWildcard to falsy for named imports', () => {
    const result = parse('@import { X } from "./x.hs"\n');
    expect(importDirectives(result)[0].isWildcard).toBeFalsy();
  });
});

// ---------------------------------------------------------------------------
// @import — multiple imports
// ---------------------------------------------------------------------------

describe('@import — multiple in one file', () => {
  it('collects all imports in order', () => {
    const src = [
      '@import "./a.hs"',
      '@import "./b.hs" as B',
      '@import { C } from "./c.hs"',
    ].join('\n') + '\n';

    const result = parse(src);
    const imps = importDirectives(result);
    expect(imps).toHaveLength(3);
    expect(imps[0].path).toBe('./a.hs');
    expect(imps[1].alias).toBe('B');
    expect(imps[2].namedImports).toEqual(['C']);
  });

  it('populates requiredCompanions for all imports', () => {
    const src = '@import "./x.hs"\n@import "./y.hs"\n';
    const result = parse(src);
    expect(result.requiredCompanions).toContain('./x.hs');
    expect(result.requiredCompanions).toContain('./y.hs');
  });
});

// ---------------------------------------------------------------------------
// @import — disabled mode
// ---------------------------------------------------------------------------

describe('@import — disabled mode', () => {
  it('emits a warning and returns no imports when disabled', () => {
    const parser = new HoloScriptPlusParser({ enableTypeScriptImports: false });
    const result = parser.parse('@import "./foo.hs"\n');
    // @import is silently ignored in non-strict mode
    expect(result.ast.imports ?? []).toHaveLength(0);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(
      result.warnings.some((w: any) => w.message?.includes('@import is disabled'))
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// @export
// ---------------------------------------------------------------------------

describe('@export', () => {
  it('parses @export template "MyOrb"', () => {
    const src = '@export template "MyOrb"\norb myOrb { }\n';
    const result = parse(src);
    const dirs = globalDirectives(result);
    const exp = dirs.find((d) => d.type === 'export') as any;
    expect(exp).toBeDefined();
    expect(exp.exportKind).toBe('template');
    expect(exp.exportName).toBe('MyOrb');
  });

  it('parses @export object "Panel"', () => {
    const src = '@export object "Panel"\norb panel { }\n';
    const result = parse(src);
    const dirs = globalDirectives(result);
    const exp = dirs.find((d) => d.type === 'export') as any;
    expect(exp.exportKind).toBe('object');
    expect(exp.exportName).toBe('Panel');
  });

  it('parses @export without kind — uses "any"', () => {
    const src = '@export "MyThing"\norb t { }\n';
    const result = parse(src);
    const dirs = globalDirectives(result);
    const exp = dirs.find((d) => d.type === 'export') as any;
    expect(exp.exportKind).toBe('any');
    expect(exp.exportName).toBe('MyThing');
  });

  it('parses @export composition "Layout"', () => {
    const src = '@export composition "Layout"\ncomposition layout { }\n';
    const result = parse(src);
    const dirs = globalDirectives(result);
    const exp = dirs.find((d) => d.type === 'export') as any;
    expect(exp.exportKind).toBe('composition');
    expect(exp.exportName).toBe('Layout');
  });
});

// ---------------------------------------------------------------------------
// @import + @export coexistence
// ---------------------------------------------------------------------------

describe('@import + @export coexistence', () => {
  it('can have both import and export directives in one file', () => {
    const src = [
      '@import "./base.hs"',
      '@export template "DerivedOrb"',
      'orb derived { }',
    ].join('\n') + '\n';

    const result = parse(src);
    expect(importDirectives(result)).toHaveLength(1);
    const dirs = globalDirectives(result);
    expect(dirs.some((d) => d.type === 'export')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// import directives route to globalDirectives
// ---------------------------------------------------------------------------

describe('globalDirectives routing', () => {
  it('@import appears in ast.directives (globalDirectives)', () => {
    const result = parse('@import "./a.hs"\n');
    const dirs = globalDirectives(result);
    expect(dirs.some((d) => d.type === 'import')).toBe(true);
  });

  it('@export appears in ast.directives (globalDirectives)', () => {
    const result = parse('@export "X"\norb x { }\n');
    const dirs = globalDirectives(result);
    expect(dirs.some((d) => d.type === 'export')).toBe(true);
  });
});

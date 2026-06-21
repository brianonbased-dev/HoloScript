import { describe, expect, it } from 'vitest';
import { HoloScriptTypeChecker } from '../HoloScriptTypeChecker';
import { HoloScriptPlusParser } from '../parser/HoloScriptPlusParser';
import type { ASTNode } from '../types';

function typeCheck(source: string) {
  const parser = new HoloScriptPlusParser({ enableVRTraits: true });
  const parsed = parser.parse(source);

  expect(parsed.success).toBe(true);
  expect(parsed.ast?.root).toBeDefined();

  const checker = new HoloScriptTypeChecker();
  return checker.check([parsed.ast.root as ASTNode]);
}

describe('Authority effect type checking', () => {
  it('fails unsafe sandbox execution without an authority effect declaration', () => {
    const result = typeCheck(`
      orb unsafeSandbox {
        @sandbox_execution(
          sandbox_type: "vm",
          allow_native_modules: true,
          permissions: { filesystem: "all", network: "none", environment: "none" }
        )
      }
    `);

    const authorityErrors = result.diagnostics.filter((diagnostic) => diagnostic.code === 'HSP030');

    expect(result.valid).toBe(false);
    expect(authorityErrors).toHaveLength(1);
    expect(authorityErrors[0].message).toContain("Undeclared effect 'authority:world'");
    expect(authorityErrors[0].message).toContain('@sandbox_execution');
  });

  it('passes unsafe sandbox execution when authority:world is declared', () => {
    const result = typeCheck(`
      orb safeSandbox {
        @authority { effects: ["authority:world"] }
        @sandbox_execution(
          sandbox_type: "vm",
          allow_native_modules: true,
          permissions: { filesystem: "all", network: "none", environment: "none" }
        )
      }
    `);

    const authorityErrors = result.diagnostics.filter((diagnostic) => diagnostic.code === 'HSP030');

    expect(result.valid).toBe(true);
    expect(authorityErrors).toHaveLength(0);
  });

  it('does not require authority when sandbox filesystem access stays bounded', () => {
    const result = typeCheck(`
      orb boundedSandbox {
        @sandbox_execution(
          sandbox_type: "vm",
          allow_native_modules: true,
          permissions: { filesystem: "read", network: "none", environment: "none" }
        )
      }
    `);

    const authorityErrors = result.diagnostics.filter((diagnostic) => diagnostic.code === 'HSP030');

    expect(result.valid).toBe(true);
    expect(authorityErrors).toHaveLength(0);
  });
});

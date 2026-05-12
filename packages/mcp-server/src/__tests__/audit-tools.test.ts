import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { countCompilerFiles, countTraitCategoryFiles } from '../audit-tools';

describe('audit-tools native metric collectors', () => {
  let root: string | undefined;

  afterEach(() => {
    if (root) {
      rmSync(root, { recursive: true, force: true });
      root = undefined;
    }
  });

  function workspace(): string {
    root = mkdtempSync(join(tmpdir(), 'hs-audit-tools-'));
    return root;
  }

  it('counts compiler implementation files without shell commands', () => {
    const repo = workspace();
    const compilerDir = join(repo, 'packages', 'core', 'src', 'compiler');
    mkdirSync(compilerDir, { recursive: true });
    writeFileSync(join(compilerDir, 'UnityCompiler.ts'), 'export {};\n');
    writeFileSync(join(compilerDir, 'VisionOSCompiler.ts'), 'export {};\n');
    writeFileSync(join(compilerDir, 'CompilerBase.ts'), 'export {};\n');
    writeFileSync(join(compilerDir, 'UnityCompiler.test.ts'), 'export {};\n');
    writeFileSync(join(compilerDir, 'NotACompiler.tsx'), 'export {};\n');

    expect(countCompilerFiles(repo)).toBe('2');
  });

  it('counts trait category files without shell commands', () => {
    const repo = workspace();
    const constantsDir = join(repo, 'packages', 'core', 'src', 'traits', 'constants');
    mkdirSync(constantsDir, { recursive: true });
    writeFileSync(join(constantsDir, 'rendering.ts'), 'export {};\n');
    writeFileSync(join(constantsDir, 'physics.ts'), 'export {};\n');
    writeFileSync(join(constantsDir, 'index.d.ts'), 'export {};\n');
    mkdirSync(join(constantsDir, 'nested'), { recursive: true });
    writeFileSync(join(constantsDir, 'nested', 'ignored.ts'), 'export {};\n');

    expect(countTraitCategoryFiles(repo)).toBe('2');
  });
});

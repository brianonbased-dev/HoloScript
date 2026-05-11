import { readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('plugin manager remote imports', () => {
  it('marks runtime plugin imports as intentionally webpack-ignored', () => {
    const source = readFileSync(path.resolve(__dirname, '../pluginManager.ts'), 'utf8');
    const runtimeImports = source.match(/import\([^)]*(?:cdnUrl|source)[^)]*\)/g) ?? [];

    expect(runtimeImports).toHaveLength(2);
    for (const runtimeImport of runtimeImports) {
      expect(runtimeImport).toContain('webpackIgnore: true');
      expect(runtimeImport).toContain('@vite-ignore');
    }
  });
});

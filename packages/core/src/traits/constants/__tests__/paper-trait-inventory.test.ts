import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as constants from '../index';

type TraitExportSummary = {
  exportName: string;
  count: number;
};

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((v) => typeof v === 'string');
}

describe('Paper 11 Benchmark: trait inventory', () => {
  it('counts category files and trait definitions and writes machine-readable JSON', () => {
    const constantsDir = path.resolve(__dirname, '..');

    const topLevelCategoryFiles = fs
      .readdirSync(constantsDir, { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name)
      .filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts') && name !== 'index.ts')
      .sort();

    const traitExports: TraitExportSummary[] = Object.entries(constants)
      .filter(([key, value]) => key.endsWith('_TRAITS') && isStringArray(value))
      .map(([key, value]) => ({ exportName: key, count: value.length }))
      .sort((a, b) => a.exportName.localeCompare(b.exportName));

    const vrTraits = constants.VR_TRAITS;
    expect(isStringArray(vrTraits)).toBe(true);

    const totalTraitDefinitions = traitExports.reduce((sum, x) => sum + x.count, 0);
    const vrTraitsCount = vrTraits.length;
    const uniqueVRTraitsCount = new Set(vrTraits).size;

    const payload = {
      generatedAt: new Date().toISOString(),
      source: 'packages/core/src/traits/constants/__tests__/paper-trait-inventory.test.ts',
      categoryFileCount: topLevelCategoryFiles.length,
      categoryFiles: topLevelCategoryFiles,
      exportedTraitArraysCount: traitExports.length,
      totalTraitDefinitions,
      vrTraitsCount,
      uniqueVRTraitsCount,
      duplicateCountInVRTraits: vrTraitsCount - uniqueVRTraitsCount,
      topExportsByCount: [...traitExports].sort((a, b) => b.count - a.count).slice(0, 20),
      exports: traitExports,
      verificationCommand:
        'pnpm --filter @holoscript/core exec vitest run src/traits/constants/__tests__/paper-trait-inventory.test.ts',
    };

    const repoRoot = path.resolve(__dirname, '../../../../../../');
    const outFile =
      process.env.PAPER_TRAIT_INVENTORY_OUT ??
      path.join(repoRoot, '.bench-logs', 'paper-trait-inventory.json');

    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), 'utf8');

    console.log('[paper-trait-inventory] category files:', payload.categoryFileCount);
    console.log('[paper-trait-inventory] exported *_TRAITS arrays:', payload.exportedTraitArraysCount);
    console.log('[paper-trait-inventory] total trait definitions (sum of arrays):', payload.totalTraitDefinitions);
    console.log('[paper-trait-inventory] VR_TRAITS count:', payload.vrTraitsCount);
    console.log('[paper-trait-inventory] unique VR_TRAITS count:', payload.uniqueVRTraitsCount);
    console.log('[paper-trait-inventory] duplicate entries in VR_TRAITS:', payload.duplicateCountInVRTraits);
    console.log('[paper-trait-inventory] JSON artifact:', outFile);

    expect(payload.categoryFileCount).toBeGreaterThan(0);
    expect(payload.exportedTraitArraysCount).toBeGreaterThan(0);
    expect(payload.vrTraitsCount).toBeGreaterThan(0);
    expect(fs.existsSync(outFile)).toBe(true);
  });
});

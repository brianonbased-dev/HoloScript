import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { scanImprovementMarkers } from '../absorb-scanner';

describe('scanImprovementMarkers', () => {
  let tempDir: string | undefined;

  afterEach(() => {
    if (tempDir) {
      rmSync(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function workspace(): string {
    tempDir = mkdtempSync(join(tmpdir(), 'hs-framework-scan-'));
    return tempDir;
  }

  it('scans TypeScript markers without requiring grep', async () => {
    const root = workspace();
    mkdirSync(join(root, 'src'), { recursive: true });
    writeFileSync(
      join(root, 'src', 'agent.ts'),
      [
        'export const value = 1;',
        '// TODO: add focused coverage',
        '// FIXME: remove brittle branch',
        '// HACK: temporary adapter shim',
      ].join('\n')
    );

    const result = await scanImprovementMarkers(root);

    expect(result.scanned).toBe(true);
    expect(result.filesAnalyzed).toBe(1);
    expect(result.issuesFound).toBe(3);
    expect(result.improvements.map((task) => task.description)).toEqual([
      `TODO in ${join('src', 'agent.ts')}:2`,
      `FIXME in ${join('src', 'agent.ts')}:3`,
      `HACK in ${join('src', 'agent.ts')}:4`,
    ]);
    expect(result.improvements.map((task) => task.priority)).toEqual([3, 1, 2]);
  });

  it('ignores generated and dependency directories', async () => {
    const root = workspace();
    mkdirSync(join(root, 'src'), { recursive: true });
    mkdirSync(join(root, 'dist'), { recursive: true });
    mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true });
    writeFileSync(join(root, 'src', 'live.tsx'), '// TODO: real source marker\n');
    writeFileSync(join(root, 'dist', 'built.ts'), '// FIXME: generated marker\n');
    writeFileSync(join(root, 'node_modules', 'dep', 'index.ts'), '// HACK: dependency marker\n');

    const result = await scanImprovementMarkers(root);

    expect(result.filesAnalyzed).toBe(1);
    expect(result.issuesFound).toBe(1);
    expect(result.improvements[0]).toMatchObject({
      title: 'real source marker',
      file: join('src', 'live.tsx'),
      line: 1,
    });
  });
});

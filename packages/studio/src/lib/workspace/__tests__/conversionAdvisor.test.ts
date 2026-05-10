import { describe, expect, it } from 'vitest';
import { buildConversionCandidates } from '../conversionAdvisor';

describe('buildConversionCandidates', () => {
  it('ranks quick-win conversion candidates from repo paths', () => {
    const candidates = buildConversionCandidates({
      maxCandidates: 10,
      projectDNA: { kind: 'frontend', frameworks: ['next.js', 'react', 'three'] },
      paths: [
        'package.json',
        'src/app/dashboard/page.tsx',
        'src/app/api/generate/route.ts',
        'src/components/SceneCanvas.tsx',
        'scripts/sync-knowledge.mjs',
        'src/stores/workspaceStore.ts',
        'prisma/schema.prisma',
        'README.md',
      ],
    });

    expect(candidates.length).toBeGreaterThanOrEqual(6);
    expect(candidates.map((candidate) => candidate.rank)).toEqual(
      Array.from({ length: candidates.length }, (_, index) => index + 1)
    );
    expect(candidates[0].detectedPattern).toMatch(/route|declarative config/);

    expect(candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          sourcePaths: ['package.json'],
          detectedPattern: 'declarative config',
          target: '.hsplus',
          effort: 'quick',
          risk: 'low',
        }),
        expect.objectContaining({
          sourcePaths: ['src/app/dashboard/page.tsx'],
          detectedPattern: 'route or page surface',
          target: '.hsplus',
        }),
        expect.objectContaining({
          sourcePaths: ['src/app/api/generate/route.ts'],
          target: 'mcp-tool',
        }),
        expect.objectContaining({
          sourcePaths: ['src/components/SceneCanvas.tsx'],
          target: 'hololand-scene',
        }),
        expect.objectContaining({
          sourcePaths: ['scripts/sync-knowledge.mjs'],
          target: '.hs',
        }),
        expect.objectContaining({
          sourcePaths: ['prisma/schema.prisma'],
          target: 'trait-package',
        }),
      ])
    );
  });

  it('respects maxCandidates and uses stable ids', () => {
    const input = {
      maxCandidates: 2,
      paths: ['package.json', 'src/app/page.tsx', 'scripts/build.mjs'],
    };

    const first = buildConversionCandidates(input);
    const second = buildConversionCandidates(input);

    expect(first).toHaveLength(2);
    expect(first.map((candidate) => candidate.id)).toEqual(second.map((candidate) => candidate.id));
  });
});

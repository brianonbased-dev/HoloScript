import { describe, expect, it } from 'vitest';
import { detectProjectDNA } from '../projectDNA';

// ─── Test data builders ─────────────────────────────────────────────────────

function makeStats(overrides: Partial<Parameters<typeof detectProjectDNA>[0]['stats']> = {}) {
  return {
    totalFiles: 100,
    totalSymbols: 500,
    totalImports: 200,
    totalLoc: 10_000,
    filesByLanguage: { ts: 60, tsx: 30, css: 10 },
    symbolsByType: { function: 200, class: 50, variable: 250 },
    totalCalls: 300,
    errors: [],
    ...overrides,
  };
}

function makeInput(overrides: {
  stats?: Partial<Parameters<typeof detectProjectDNA>[0]['stats']>;
  hubFiles?: Parameters<typeof detectProjectDNA>[0]['hubFiles'];
  paths?: string[];
} = {}) {
  return {
    stats: makeStats(overrides.stats),
    hubFiles: overrides.hubFiles ?? [],
    leafFirstOrder: overrides.paths ?? [
      'src/index.ts',
      'src/utils.ts',
      'package.json',
    ],
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('detectProjectDNA', () => {
  it('returns a valid ProjectDNA object', () => {
    const dna = detectProjectDNA(makeInput());
    expect(dna.kind).toBeTruthy();
    expect(dna.confidence).toBeGreaterThan(0);
    expect(Array.isArray(dna.languages)).toBe(true);
    expect(Array.isArray(dna.frameworks)).toBe(true);
    expect(Array.isArray(dna.packageManagers)).toBe(true);
    expect(Array.isArray(dna.runtimes)).toBe(true);
    expect(dna.repoShape).toBeTruthy();
    expect(Array.isArray(dna.riskSignals)).toBe(true);
    expect(Array.isArray(dna.strengths)).toBe(true);
    expect(dna.recommendedProfile).toBeTruthy();
    expect(['quick', 'balanced', 'deep']).toContain(dna.recommendedMode);
  });

  it('detects frontend projects', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { filesByLanguage: { tsx: 80, ts: 15, css: 5 } },
      paths: [
        'src/components/App.tsx',
        'src/components/Header.tsx',
        'src/pages/index.tsx',
        'src/styles/global.css',
        'package.json',
        'next.config.js',
      ],
    }));
    expect(dna.kind).toBe('frontend');
  });

  it('detects service/API projects', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { filesByLanguage: { ts: 90, json: 10 } },
      paths: [
        'src/routes/users.ts',
        'src/controllers/auth.ts',
        'src/middleware/cors.ts',
        'src/api/v1/health.ts',
        'prisma/schema.prisma',
        'package.json',
      ],
    }));
    expect(dna.kind).toBe('service');
  });

  it('detects spatial/XR projects', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { filesByLanguage: { holo: 20, hsplus: 10, ts: 5 } },
      paths: [
        'scenes/main.holo',
        'skills/render.hsplus',
        'assets/model.gltf',
        'shaders/water.wgsl',
      ],
    }));
    expect(dna.kind).toBe('spatial');
  });

  it('detects agent/MCP backend projects', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { filesByLanguage: { ts: 80, json: 20 } },
      paths: [
        'src/mcp/server.ts',
        'src/tools/search.ts',
        'src/agent/planner.ts',
        'src/skills/code-review.ts',
        'package.json',
      ],
    }));
    expect(dna.kind).toBe('agent-backend');
  });

  it('detects monorepo shape', () => {
    const dna = detectProjectDNA(makeInput({
      paths: [
        'packages/core/src/index.ts',
        'packages/cli/src/main.ts',
        'pnpm-workspace.yaml',
      ],
    }));
    expect(dna.repoShape).toBe('monorepo');
  });

  it('detects single-package shape', () => {
    const dna = detectProjectDNA(makeInput({
      paths: ['src/index.ts', 'src/lib.ts'],
    }));
    expect(dna.repoShape).toBe('single-package');
  });

  it('detects languages from stats', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { filesByLanguage: { py: 50, ts: 30, rs: 20 } },
    }));
    expect(dna.languages).toContain('py');
    expect(dna.languages).toContain('ts');
    expect(dna.languages).toContain('rs');
  });

  it('detects node runtime for TS/JS', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { filesByLanguage: { ts: 80, tsx: 20 } },
    }));
    expect(dna.runtimes).toContain('node');
  });

  it('detects python runtime', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { filesByLanguage: { py: 100 } },
    }));
    expect(dna.runtimes).toContain('python');
  });

  it('detects package managers from file paths', () => {
    const dna = detectProjectDNA(makeInput({
      paths: ['src/index.ts', 'pnpm-lock.yaml'],
    }));
    expect(dna.packageManagers).toContain('pnpm');
  });

  it('detects risk signals for large codebases', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { totalLoc: 200_000 },
    }));
    expect(dna.riskSignals).toContain('large-codebase');
  });

  it('detects god-file risk from hub files', () => {
    const dna = detectProjectDNA(makeInput({
      hubFiles: [{ path: 'src/god.ts', inDegree: 25, symbols: 100 }],
    }));
    expect(dna.riskSignals).toContain('god-file');
  });

  it('detects strengths: has-tests', () => {
    const dna = detectProjectDNA(makeInput({
      paths: ['src/index.ts', 'src/__tests__/index.test.ts'],
    }));
    expect(dna.strengths).toContain('has-tests');
  });

  it('detects strengths: has-ci', () => {
    const dna = detectProjectDNA(makeInput({
      paths: ['src/index.ts', '.github/workflows/ci.yml'],
    }));
    expect(dna.strengths).toContain('has-ci');
  });

  it('recommends quick mode for small repos', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { totalFiles: 20 },
    }));
    expect(dna.recommendedMode).toBe('quick');
  });

  it('recommends balanced mode for medium repos', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { totalFiles: 200 },
    }));
    expect(dna.recommendedMode).toBe('balanced');
  });

  it('recommends deep mode for large repos', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { totalFiles: 1000 },
    }));
    expect(dna.recommendedMode).toBe('deep');
  });

  it('confidence is between 0 and 1', () => {
    const dna = detectProjectDNA(makeInput());
    expect(dna.confidence).toBeGreaterThanOrEqual(0);
    expect(dna.confidence).toBeLessThanOrEqual(1);
  });

  it('recommendedProfile maps to kind', () => {
    const dna = detectProjectDNA(makeInput({
      stats: { filesByLanguage: { tsx: 100 } },
      paths: ['src/components/App.tsx', 'src/pages/index.tsx'],
    }));
    // Frontend kind -> frontend profile
    if (dna.kind === 'frontend') {
      expect(dna.recommendedProfile).toBe('frontend');
    }
  });
});

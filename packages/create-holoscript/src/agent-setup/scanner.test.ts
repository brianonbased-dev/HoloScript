import { describe, expect, it } from 'vitest';
import path from 'node:path';
import { scanProject } from './scanner.js';
import { generateAllFiles } from './generator.js';

describe('agent-setup scanner + generator', () => {
  it('builds project dna and generates core files', () => {
    const pkgRoot = path.resolve(process.cwd());
    const dna = scanProject(pkgRoot);

    // Test runs from packages/create-holoscript after the agent-setup
    // merge (2026-04-29) — package.json name in cwd is now "create-holoscript".
    expect(dna.name).toBe('create-holoscript');
    expect(dna.languages).toContain('ts');

    const files = generateAllFiles(dna);
    const paths = files.map((f) => f.path);

    expect(paths).toContain('AGENTS.md');
    expect(paths).toContain('.claude/NORTH_STAR.md');
    expect(paths).toContain('team-connect.mjs');
  }, 15_000);
});

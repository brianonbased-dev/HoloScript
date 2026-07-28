import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FleetSelfImproveIO } from './FleetSelfImproveIO';
import { resolvePackageBinary } from './PackageToolRuntime';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('FleetSelfImproveIO production tool custody', () => {
  let rootDir: string;
  let io: FleetSelfImproveIO;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(packageRoot, '.fleet tools & paths-'));
    io = new FleetSelfImproveIO({
      rootDir,
      llmComplete: async () => '',
      toolTimeoutMs: 45_000,
      log: () => {},
    });
  });

  afterEach(() => {
    io.cleanup();
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('runs package-owned vitest, TypeScript, and ESLint with metacharacters in the root path', async () => {
    const testFile = 'passing.self-improve.proposal.test.ts';
    await io.writeFile(
      testFile,
      `import { describe, expect, it } from 'vitest';

describe('fleet tool custody', () => {
  it('runs the generated test', () => {
    expect(2 + 2).toBe(4);
  });
});
`
    );

    const vitest = await io.runVitest(testFile);
    expect(vitest).toMatchObject({
      passed: true,
      testsPassed: 1,
      testsFailed: 0,
      testsTotal: 1,
    });
    await expect(io.runTypeCheck()).resolves.toBe(true);
    await expect(io.runLint()).resolves.toEqual({ issueCount: 0, filesLinted: 1 });

    for (const [packageName, binaryName] of [
      ['vitest', 'vitest'],
      ['typescript', 'tsc'],
      ['eslint', 'eslint'],
    ] as const) {
      const binaryPath = resolvePackageBinary(packageName, binaryName);
      expect(fs.existsSync(binaryPath)).toBe(true);
      expect(binaryPath).not.toContain(`${path.sep}.bin${path.sep}`);
    }
  }, 60_000);

  it('fails closed when TypeScript or ESLint rejects a proposal', async () => {
    await io.writeFile(
      'invalid-type.self-improve.proposal.test.ts',
      'const typedValue: string = 42;\nexport { typedValue };\n'
    );
    await expect(io.runTypeCheck()).resolves.toBe(false);

    await io.writeFile(
      'invalid-lint.self-improve.proposal.test.ts',
      'export function unreachable(): number {\n  return 1;\n  console.log("never");\n}\n'
    );
    const lint = await io.runLint();
    expect(lint.filesLinted).toBe(1);
    expect(lint.issueCount).toBeGreaterThan(0);
  });

  it('rejects root escapes and refuses to overwrite an existing proposal', async () => {
    const escapeName = `fleet-escape-${process.pid}-${Date.now()}.test.ts`;
    const escapedPath = path.resolve(rootDir, '..', escapeName);

    await expect(io.writeFile(`../${escapeName}`, 'export {};\n')).rejects.toThrow(
      'escapes rootDir'
    );
    expect(fs.existsSync(escapedPath)).toBe(false);

    const existingPath = path.join(rootDir, 'existing.test.ts');
    fs.writeFileSync(existingPath, 'original\n', 'utf8');
    await expect(io.writeFile('existing.test.ts', 'replacement\n')).rejects.toThrow();
    expect(fs.readFileSync(existingPath, 'utf8')).toBe('original\n');
  });
});

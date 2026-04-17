import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * SDK Version-Floor Guard
 *
 * Fails CI if any package declares an @anthropic-ai/sdk version floor below
 * what the current HoloScript Claude API conventions require.
 *
 * Why this exists:
 * Opus 4.7 and adaptive thinking / output_config.effort / Opus 4.6-family
 * sampling-param removal are only supported in newer SDK releases. If a
 * package pins an older floor, callers installing that package alone may
 * resolve an SDK too old to serve the code we ship — and the failure mode
 * is silent 400s in production, not a build error.
 *
 * This test runs in CI and checks every package.json under packages/ for
 * the @anthropic-ai/sdk dependency (dependencies, peerDependencies,
 * devDependencies), and also scans the AgentInferenceExportTarget code
 * generator's emitted package.json dep.
 *
 * If you're bumping the required floor, update MINIMUM_SDK_VERSION below
 * and run `pnpm --filter "@holoscript/*" update @anthropic-ai/sdk`.
 *
 * See docs/strategy/claude-api-migration-checklist.md for context.
 */

// Minimum @anthropic-ai/sdk version required for current HoloScript conventions.
// Supports: Opus 4.7, adaptive thinking, output_config.effort, sampling-param
// removal, structured outputs via messages.parse(), prompt caching.
//
// If bumping this: update docs/strategy/claude-api-migration-checklist.md too.
const MINIMUM_SDK_VERSION = '0.88.0';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PACKAGES_DIR = path.resolve(__dirname, '..', '..', '..');

/**
 * Parse a semver range and return true if it could resolve to something
 * BELOW the minimum. We're conservative here: any `^X.Y.Z` where X.Y.Z is
 * below the minimum fails; bare version strings must also be >=. `*`,
 * `latest`, and unpinned git deps are considered acceptable (developer
 * intent is "get the newest").
 */
function versionRangeAllowsBelowMinimum(range: string, minimum: string): boolean {
  // Unpinned / catch-all — trust the developer
  if (range === '*' || range === 'latest' || range === '') return false;
  if (range.startsWith('git') || range.startsWith('file:') || range.startsWith('workspace:')) {
    return false;
  }

  // Strip leading semver operators
  const cleaned = range.replace(/^[~^>=<]+/, '').trim();
  if (!cleaned) return false;

  // Naive semver compare — sufficient for our x.y.z floors
  const [aMajor = 0, aMinor = 0, aPatch = 0] = cleaned
    .split('.')
    .map((part) => parseInt(part, 10) || 0);
  const [bMajor = 0, bMinor = 0, bPatch = 0] = minimum
    .split('.')
    .map((part) => parseInt(part, 10) || 0);

  if (aMajor !== bMajor) return aMajor < bMajor;
  if (aMinor !== bMinor) return aMinor < bMinor;
  return aPatch < bPatch;
}

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

function findPackageJsons(startDir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(startDir)) return results;

  const entries = fs.readdirSync(startDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name.startsWith('.')) {
      continue;
    }
    const full = path.join(startDir, entry.name);
    if (entry.isDirectory()) {
      const pkg = path.join(full, 'package.json');
      if (fs.existsSync(pkg)) results.push(pkg);
    }
  }
  return results;
}

describe('@anthropic-ai/sdk version floor', () => {
  const packageJsons = findPackageJsons(PACKAGES_DIR);

  it('discovers at least one package to audit', () => {
    expect(packageJsons.length).toBeGreaterThan(0);
  });

  for (const pkgPath of packageJsons) {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as PackageJson;
    const pkgName = pkg.name ?? path.basename(path.dirname(pkgPath));

    const sections: Array<[keyof PackageJson & string, Record<string, string> | undefined]> = [
      ['dependencies', pkg.dependencies],
      ['peerDependencies', pkg.peerDependencies],
      ['devDependencies', pkg.devDependencies],
    ];

    for (const [section, deps] of sections) {
      if (!deps) continue;
      const sdkRange = deps['@anthropic-ai/sdk'];
      if (!sdkRange) continue;

      it(`${pkgName} → ${section}."@anthropic-ai/sdk" meets floor ${MINIMUM_SDK_VERSION}`, () => {
        expect(
          versionRangeAllowsBelowMinimum(sdkRange, MINIMUM_SDK_VERSION),
          `${pkgPath}\n  ${section}."@anthropic-ai/sdk": "${sdkRange}"\n  ` +
            `Required floor: ^${MINIMUM_SDK_VERSION}\n  ` +
            `Update with: pnpm --filter ${pkgName} update @anthropic-ai/sdk\n  ` +
            `See docs/strategy/claude-api-migration-checklist.md`
        ).toBe(false);
      });
    }
  }
});

describe('code generator emits up-to-date SDK dep', () => {
  // The AgentInferenceExportTarget code generator emits a package.json into
  // every generated agent project. That emitted floor must also meet our
  // minimum, or we ship broken scaffolding to users.

  const codegenPath = path.resolve(
    PACKAGES_DIR,
    'core',
    'src',
    'compiler',
    'AgentInferenceExportTarget.ts'
  );

  if (!fs.existsSync(codegenPath)) {
    it.skip('AgentInferenceExportTarget.ts not found — skipping codegen audit', () => {});
    return;
  }

  const source = fs.readFileSync(codegenPath, 'utf-8');

  it('emits @anthropic-ai/sdk dep that meets floor', () => {
    // Match the literal string the generator writes into package.json,
    // e.g. `'@anthropic-ai/sdk': '^0.88.0',`
    const match = source.match(/['"]@anthropic-ai\/sdk['"]\s*:\s*['"]([^'"]+)['"]/);
    expect(match, 'codegen does not declare @anthropic-ai/sdk in emitted package.json').not.toBeNull();

    const emittedRange = match![1];
    expect(
      versionRangeAllowsBelowMinimum(emittedRange, MINIMUM_SDK_VERSION),
      `AgentInferenceExportTarget.ts emits @anthropic-ai/sdk: "${emittedRange}"\n  ` +
        `Required floor: ^${MINIMUM_SDK_VERSION}\n  ` +
        `Generated agents using retired SDK versions will fail at runtime.\n  ` +
        `Update the emitPackageJson() body and re-run tests.`
    ).toBe(false);
  });
});

describe('retired model regression guard', () => {
  // Fails if any source file hardcodes a retired Claude model ID.
  // These are known-broken; using them produces 404s from the API.

  const BANNED_MODELS = [
    'claude-3-5-sonnet-20241022', // Retired 2025-10-28
    'claude-3-5-haiku-20241022', // Retired 2026-02-19
    'claude-3-opus-20240229', // Retired 2026-01-05
    'claude-3-sonnet-20240229', // Retired 2025-07-21
    'claude-3-7-sonnet-20250219', // Retired 2026-02-19
    'claude-2.1', // Retired 2025-07-21
    'claude-2.0', // Retired 2025-07-21
  ];

  // Files allowed to mention retired models (for documentation / historical purposes)
  const ALLOWED_FILES = [
    'docs/',
    'CHANGELOG',
    'README',
    'migration-checklist', // this doc itself references them
    'sdk-version-floor.test.ts', // this test file
    '__tests__/', // test fixtures may reference them
  ];

  // Directory names that contain build artifacts, caches, or third-party code.
  // These rebuild from source, so stale retired-model strings there are harmless.
  const EXCLUDED_DIRS = new Set([
    'node_modules',
    'dist',
    'build',
    'out',
    'temp-dts',
    'coverage',
    '.next',
    '.turbo',
    '.vite',
    '.cache',
  ]);

  function findSourceFiles(dir: string, results: string[] = []): string[] {
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (EXCLUDED_DIRS.has(entry.name) || entry.name.startsWith('.')) {
        continue;
      }
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        findSourceFiles(full, results);
      } else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
        // Skip .d.ts declaration files — they rebuild from .ts sources.
        if (entry.name.endsWith('.d.ts')) continue;
        // Skip compiled .js/.cjs/.mjs if a sibling .ts/.tsx exists — those
        // are build artifacts that will be regenerated (monorepos with
        // mixed source + compiled output end up with this shape).
        if (/\.(js|cjs|mjs)$/.test(entry.name)) {
          const base = entry.name.replace(/\.(js|cjs|mjs)$/, '');
          const tsSibling = path.join(dir, `${base}.ts`);
          const tsxSibling = path.join(dir, `${base}.tsx`);
          if (fs.existsSync(tsSibling) || fs.existsSync(tsxSibling)) continue;
        }
        results.push(full);
      }
    }
    return results;
  }

  // Normalize path separators so allowlist patterns (written with `/`)
  // match on Windows where `path.join` emits `\`. Use path.posix-style checks.
  const sourceFiles = findSourceFiles(PACKAGES_DIR).filter((f) => {
    const normalized = f.split(path.sep).join('/');
    return !ALLOWED_FILES.some((allowed) => normalized.includes(allowed));
  });

  it('no source file hardcodes a retired Claude model', () => {
    const violations: Array<{ file: string; model: string; line: number }> = [];

    for (const file of sourceFiles) {
      const content = fs.readFileSync(file, 'utf-8');
      const lines = content.split('\n');
      for (let i = 0; i < lines.length; i++) {
        for (const model of BANNED_MODELS) {
          if (lines[i].includes(model)) {
            violations.push({ file: path.relative(PACKAGES_DIR, file), model, line: i + 1 });
          }
        }
      }
    }

    if (violations.length > 0) {
      const msg = violations
        .map((v) => `  ${v.file}:${v.line} — uses retired model "${v.model}"`)
        .join('\n');
      throw new Error(
        `Found ${violations.length} reference(s) to retired Claude models:\n${msg}\n\n` +
          `See docs/strategy/claude-api-migration-checklist.md for the replacement mapping.`
      );
    }
  }, 20000);
});

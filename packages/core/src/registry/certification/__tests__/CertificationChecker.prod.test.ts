/**
 * CertificationChecker — Production Tests
 *
 * Covers all 4 check categories (17 checks total), grade thresholds,
 * cert gate (required-all-pass + grade B+), config overrides.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  CertificationChecker,
  createCertificationChecker,
  DEFAULT_CERTIFICATION_CONFIG,
  type PackageFiles,
} from '../CertificationChecker';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

function minimalFiles(overrides: Partial<PackageFiles> = {}): PackageFiles {
  return {
    manifest: {
      name: '@test/widget',
      version: '1.2.3',
      description: 'A well-described HoloScript widget package',
      author: { name: 'Alice', email: 'alice@example.com' },
      license: 'MIT',
      repository: { url: 'https://github.com/test/widget' },
    },
    readme: '# Widget\n\nA useful package.\n\n```ts\nconst x = 1;\n```\n'.padEnd(250, ' '),
    changelog: '## 1.2.3\n- Initial release\n',
    license: 'MIT License\n\nCopyright (c) 2025\n',
    sourceFiles: [{ path: 'src/index.ts', content: 'export const hello = () => "world";' }],
    testFiles: [
      {
        path: 'src/__tests__/index.test.ts',
        content: 'test("hello", () => expect(hello()).toBe("world"));',
      },
    ],
    ...overrides,
  };
}

function excellentFiles(): PackageFiles {
  return minimalFiles({
    sourceFiles: [
      { path: 'src/a.ts', content: 'export const a = 1;' },
      { path: 'src/b.ts', content: 'export const b = 2;' },
    ],
    testFiles: [
      { path: 'src/__tests__/a.test.ts', content: 'test("a", () => expect(1).toBe(1));' },
      { path: 'src/__tests__/b.test.ts', content: 'test("b", () => expect(2).toBe(2));' },
    ],
  });
}

// ─── Construction ─────────────────────────────────────────────────────────────

describe('CertificationChecker — construction', () => {
  it('createCertificationChecker() returns instance', () => {
    expect(createCertificationChecker()).toBeInstanceOf(CertificationChecker);
  });
  it('DEFAULT_CERTIFICATION_CONFIG has requiredCoverage=80', () => {
    expect(DEFAULT_CERTIFICATION_CONFIG.requiredCoverage).toBe(80);
  });
  it('DEFAULT_CERTIFICATION_CONFIG allows MIT license', () => {
    expect(DEFAULT_CERTIFICATION_CONFIG.allowedLicenses).toContain('MIT');
  });
});

// ─── certify: result shape ─────────────────────────────────────────────────────

describe('CertificationChecker — certify: result structure', () => {
  let checker: CertificationChecker;
  beforeEach(() => {
    checker = new CertificationChecker();
  });

  it('returns packageName from manifest', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.packageName).toBe('@test/widget');
  });
  it('returns packageVersion from manifest', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.packageVersion).toBe('1.2.3');
  });
  it('timestamp is a valid ISO date string', async () => {
    const r = await checker.certify(minimalFiles());
    expect(() => new Date(r.timestamp)).not.toThrow();
    expect(new Date(r.timestamp).getFullYear()).toBeGreaterThan(2020);
  });
  it('returns checks array with 17 entries', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.checks).toHaveLength(17);
  });
  it('summary counts sum to total checks', async () => {
    const r = await checker.certify(minimalFiles());
    const total = r.summary.passed + r.summary.failed + r.summary.warnings + r.summary.skipped;
    expect(total).toBe(r.checks.length);
  });
  it('score ≤ maxScore', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.score).toBeLessThanOrEqual(r.maxScore);
  });
  it('grade is one of A/B/C/D/F', async () => {
    const r = await checker.certify(minimalFiles());
    expect(['A', 'B', 'C', 'D', 'F']).toContain(r.grade);
  });
});

// ─── certify: certified=true path ────────────────────────────────────────────

describe('CertificationChecker — certify: certified package', () => {
  let checker: CertificationChecker;
  beforeEach(() => {
    checker = new CertificationChecker();
  });

  it('certified=true for excellent package', async () => {
    const r = await checker.certify(excellentFiles());
    expect(r.certified).toBe(true);
  });
  it('certificateId starts with CERT- when certified', async () => {
    const r = await checker.certify(excellentFiles());
    expect(r.certificateId).toMatch(/^CERT-/);
  });
  it('expiresAt is ~1 year from now when certified', async () => {
    const r = await checker.certify(excellentFiles());
    const expiresAt = new Date(r.expiresAt!);
    const diff = expiresAt.getTime() - Date.now();
    const oneYear = 365 * 24 * 60 * 60 * 1000;
    expect(diff).toBeGreaterThan(oneYear * 0.9);
    expect(diff).toBeLessThan(oneYear * 1.1);
  });
});

// ─── certify: certified=false paths ──────────────────────────────────────────

describe('CertificationChecker — certify: uncertified package', () => {
  let checker: CertificationChecker;
  beforeEach(() => {
    checker = new CertificationChecker();
  });

  it('no-readme → certified=false', async () => {
    const r = await checker.certify(minimalFiles({ readme: undefined }));
    expect(r.certified).toBe(false);
    expect(r.certificateId).toBeUndefined();
    expect(r.expiresAt).toBeUndefined();
  });
  it('no-license file → fails required license check → certified=false', async () => {
    const r = await checker.certify(
      minimalFiles({
        license: undefined,
        manifest: {
          name: '@test/w',
          version: '1.0.0',
          license: undefined,
        },
      })
    );
    expect(r.certified).toBe(false);
  });
  it('invalid semver → certified=false', async () => {
    const r = await checker.certify(
      minimalFiles({
        manifest: { ...minimalFiles().manifest, version: 'not-semver' },
      })
    );
    expect(r.certified).toBe(false);
  });
  it('JS-only source files → warning on typed check', async () => {
    const r = await checker.certify(
      minimalFiles({
        sourceFiles: [{ path: 'src/index.js', content: 'module.exports = 1;' }],
      })
    );
    const typedCheck = r.checks.find((c) => c.id === 'code_typed')!;
    expect(['failed', 'warning']).toContain(typedCheck.status);
  });
  it('eval() in source → dangerous patterns → certified=false', async () => {
    const r = await checker.certify(
      minimalFiles({
        sourceFiles: [{ path: 'src/bad.ts', content: 'eval("dangerous")' }],
      })
    );
    const patternCheck = r.checks.find((c) => c.id === 'security_patterns')!;
    expect(patternCheck.status).toBe('failed');
    expect(r.certified).toBe(false);
  });
  it('`var` usage → linting failure', async () => {
    const r = await checker.certify(
      minimalFiles({
        sourceFiles: [{ path: 'src/old.ts', content: 'var x = 5;' }],
      })
    );
    const lintCheck = r.checks.find((c) => c.id === 'code_linting')!;
    expect(lintCheck.status).toBe('failed');
  });
});

// ─── check: documentation ─────────────────────────────────────────────────────

describe('CertificationChecker — checks: documentation', () => {
  let checker: CertificationChecker;
  beforeEach(() => {
    checker = new CertificationChecker();
  });

  it('short readme (< 200 chars) → doc_readme = warning', async () => {
    const r = await checker.certify(minimalFiles({ readme: '# Short' }));
    const rc = r.checks.find((c) => c.id === 'doc_readme')!;
    expect(rc.status).toBe('warning');
  });
  it('no readme → doc_readme = failed', async () => {
    const r = await checker.certify(minimalFiles({ readme: undefined }));
    expect(r.checks.find((c) => c.id === 'doc_readme')!.status).toBe('failed');
  });
  it('readme with code block → doc_examples = passed', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.checks.find((c) => c.id === 'doc_examples')!.status).toBe('passed');
  });
  it('changelog not required → doc_changelog = skipped when no changelog', async () => {
    const checker2 = new CertificationChecker({ requireChangelog: false });
    const r = await checker2.certify(minimalFiles({ changelog: undefined }));
    expect(r.checks.find((c) => c.id === 'doc_changelog')!.status).toBe('skipped');
  });
  it('MIT license → doc_license = passed', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.checks.find((c) => c.id === 'doc_license')!.status).toBe('passed');
  });
  it('GPL license (not in allowed list) → doc_license = warning', async () => {
    const r = await checker.certify(
      minimalFiles({
        license: 'GPL License text',
        manifest: { ...minimalFiles().manifest, license: 'GPL-3.0' },
      })
    );
    expect(r.checks.find((c) => c.id === 'doc_license')!.status).toBe('warning');
  });
  it('description ≥ 20 chars → doc_description = passed', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.checks.find((c) => c.id === 'doc_description')!.status).toBe('passed');
  });
});

// ─── check: security ──────────────────────────────────────────────────────────

describe('CertificationChecker — checks: security', () => {
  let checker: CertificationChecker;
  beforeEach(() => {
    checker = new CertificationChecker();
  });

  it('no suspicious patterns → security_network = passed', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.checks.find((c) => c.id === 'security_network')!.status).toBe('passed');
  });
  it('fetch("http://...") → security_network = warning', async () => {
    const r = await checker.certify(
      minimalFiles({
        sourceFiles: [{ path: 'src/x.ts', content: `fetch('http://evil.com/data')` }],
      })
    );
    expect(r.checks.find((c) => c.id === 'security_network')!.status).toBe('warning');
  });
  it('innerHTML= → security_patterns = failed', async () => {
    const r = await checker.certify(
      minimalFiles({
        sourceFiles: [
          { path: 'src/x.ts', content: `document.getElementById('x').innerHTML = userInput;` },
        ],
      })
    );
    expect(r.checks.find((c) => c.id === 'security_patterns')!.status).toBe('failed');
  });
  it('≤50 deps → security_deps = passed', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.checks.find((c) => c.id === 'security_deps')!.status).toBe('passed');
  });
  it('>50 deps → security_deps = warning', async () => {
    const deps: Record<string, string> = {};
    for (let i = 0; i < 55; i++) deps[`pkg-${i}`] = '1.0.0';
    const r = await checker.certify(
      minimalFiles({
        manifest: { ...minimalFiles().manifest, dependencies: deps },
      })
    );
    expect(r.checks.find((c) => c.id === 'security_deps')!.status).toBe('warning');
  });
});

// ─── check: maintenance ───────────────────────────────────────────────────────

describe('CertificationChecker — checks: maintenance', () => {
  let checker: CertificationChecker;
  beforeEach(() => {
    checker = new CertificationChecker();
  });

  it('valid semver → maint_semver = passed', async () => {
    const r = await checker.certify(minimalFiles());
    expect(r.checks.find((c) => c.id === 'maint_semver')!.status).toBe('passed');
  });
  it('prerelease semver 1.0.0-beta.1 → maint_semver = passed', async () => {
    const r = await checker.certify(
      minimalFiles({
        manifest: { ...minimalFiles().manifest, version: '1.0.0-beta.1' },
      })
    );
    expect(r.checks.find((c) => c.id === 'maint_semver')!.status).toBe('passed');
  });
  it('no repository → maint_repository = warning', async () => {
    const r = await checker.certify(
      minimalFiles({
        manifest: { ...minimalFiles().manifest, repository: undefined },
      })
    );
    expect(r.checks.find((c) => c.id === 'maint_repository')!.status).toBe('warning');
  });
  it('author = string → maint_author = passed', async () => {
    const r = await checker.certify(
      minimalFiles({
        manifest: { ...minimalFiles().manifest, author: 'Bob' },
      })
    );
    expect(r.checks.find((c) => c.id === 'maint_author')!.status).toBe('passed');
  });
  it('no author → maint_author = warning', async () => {
    const r = await checker.certify(
      minimalFiles({
        manifest: { ...minimalFiles().manifest, author: undefined },
      })
    );
    expect(r.checks.find((c) => c.id === 'maint_author')!.status).toBe('warning');
  });
});

// ─── Score calculation ────────────────────────────────────────────────────────

describe('CertificationChecker — score and grade', () => {
  it('perfect package grades A or B', async () => {
    const checker = new CertificationChecker();
    const r = await checker.certify(excellentFiles());
    expect(['A', 'B']).toContain(r.grade);
  });
  it('minimal (broken) package grades C/D/F', async () => {
    const checker = new CertificationChecker();
    const r = await checker.certify({
      manifest: { name: 'b', version: 'bad', license: 'GPL-3.0' },
      sourceFiles: [
        { path: 'src/a.js', content: 'var x = eval("a"); console.log(x); innerHTML = x;' },
      ],
      testFiles: [],
    });
    expect(['C', 'D', 'F']).toContain(r.grade);
  });
  it('console.log in source → code_no_console = warning (not required)', async () => {
    const checker = new CertificationChecker();
    const r = await checker.certify(
      minimalFiles({
        sourceFiles: [{ path: 'src/x.ts', content: 'console.log("hi")' }],
      })
    );
    const check = r.checks.find((c) => c.id === 'code_no_console')!;
    expect(check.status).toBe('warning');
    expect(check.required).toBe(false);
  });
});

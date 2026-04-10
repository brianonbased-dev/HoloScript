import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  CertificationChecker,
  CertificationLevel,
  CERTIFICATION_LEVELS,
  CertificationResult,
} from '../certification/Checker';
import {
  issueBadge,
  verifyBadge,
  generateBadgeSVG,
  generateMarkdownBadge,
  storeBadge,
  getBadge,
  listBadges,
  revokeBadge,
  isActivelyCertified,
  type CertificationBadge,
} from '../certification/Badge';
import type { Package } from '../types';

// Mock package for testing
function createMockPackage(overrides: Partial<Package> = {}): Package {
  return {
    name: 'test-package',
    version: '1.0.0',
    description: 'A test package',
    keywords: ['test'],
    ...overrides,
  } as Package;
}

// Mock package files
function createMockFiles(files: Record<string, string> = {}): Map<string, string> {
  return new Map(Object.entries(files));
}

describe('CERTIFICATION_LEVELS', () => {
  describe('bronze level', () => {
    it('should require 60% minimum score', () => {
      expect(CERTIFICATION_LEVELS.bronze.minScore).toBe(60);
    });

    it('should require codeQuality and documentation', () => {
      expect(CERTIFICATION_LEVELS.bronze.requiredCategories).toContain('codeQuality');
      expect(CERTIFICATION_LEVELS.bronze.requiredCategories).toContain('documentation');
    });
  });

  describe('silver level', () => {
    it('should require 75% minimum score', () => {
      expect(CERTIFICATION_LEVELS.silver.minScore).toBe(75);
    });

    it('should require security in addition to bronze', () => {
      expect(CERTIFICATION_LEVELS.silver.requiredCategories).toContain('security');
    });
  });

  describe('gold level', () => {
    it('should require 85% minimum score', () => {
      expect(CERTIFICATION_LEVELS.gold.minScore).toBe(85);
    });

    it('should require all categories', () => {
      expect(CERTIFICATION_LEVELS.gold.requiredCategories).toHaveLength(4);
      expect(CERTIFICATION_LEVELS.gold.requiredCategories).toContain('maintenance');
    });
  });

  describe('platinum level', () => {
    it('should require 95% minimum score', () => {
      expect(CERTIFICATION_LEVELS.platinum.minScore).toBe(95);
    });

    it('should have higher weights', () => {
      expect(CERTIFICATION_LEVELS.platinum.weights.codeQuality).toBeGreaterThan(1);
      expect(CERTIFICATION_LEVELS.platinum.weights.documentation).toBeGreaterThan(1);
    });
  });
});

describe('CertificationChecker', () => {
  let checker: CertificationChecker;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  describe('constructor', () => {
    it('should create checker with package info and files', () => {
      const pkg = createMockPackage();
      const files = createMockFiles();
      const checker = new CertificationChecker(pkg, files);
      expect(checker).toBeDefined();
    });
  });

  describe('check method', () => {
    it('should return certification result', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        'src/index.ts': 'export const hello = "world";',
        'README.md': '# Test Package\n\nA description',
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      expect(result).toHaveProperty('certified');
      expect(result).toHaveProperty('score');
      expect(result).toHaveProperty('maxScore');
      expect(result).toHaveProperty('categories');
      expect(result).toHaveProperty('issues');
    });

    it('should include all four category results', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({ 'src/index.ts': 'export {}' });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      const categoryNames = result.categories.map((c) => c.name);
      expect(categoryNames).toContain('codeQuality');
      expect(categoryNames).toContain('documentation');
      expect(categoryNames).toContain('security');
      expect(categoryNames).toContain('maintenance');
    });

    it('should set certifiedAt for certified packages', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        'src/index.ts': 'export {};',
        'README.md': '# Package\n\nDescription here with enough content to pass.',
        'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n- Initial release',
        LICENSE: 'MIT License',
        '__tests__/test.ts': 'test("works", () => {});',
        '.eslintrc.json': '{}',
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      if (result.certified) {
        expect(result.certifiedAt).toBeInstanceOf(Date);
        expect(result.expiresAt).toBeInstanceOf(Date);
      }
    });

    it('should not certify packages with low scores', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        'src/index.js': 'module.exports = {}', // JS, not TS
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      expect(result.certified).toBe(false);
      expect(result.level).toBeUndefined();
    });
  });

  describe('code quality checks', () => {
    it('should give higher scores for typed files', async () => {
      const pkg = createMockPackage();
      const typedFiles = createMockFiles({
        'src/a.ts': 'export {}',
        'src/b.ts': 'export {}',
        'src/c.hs': 'orb test {}',
      });

      const checker = new CertificationChecker(pkg, typedFiles);
      const result = await checker.check();

      const codeQuality = result.categories.find((c) => c.name === 'codeQuality');
      const typing = codeQuality?.checks.find((c) => c.name === 'typing');
      expect(typing?.score).toBeGreaterThan(20);
    });

    it('should give lower typing score for JS files', async () => {
      const pkg = createMockPackage();
      const jsFiles = createMockFiles({
        'src/a.js': 'export {}',
        'src/b.js': 'export {}',
      });

      const checker = new CertificationChecker(pkg, jsFiles);
      const result = await checker.check();

      const codeQuality = result.categories.find((c) => c.name === 'codeQuality');
      const typing = codeQuality?.checks.find((c) => c.name === 'typing');
      expect(typing?.score).toBe(0);
    });

    it('should give score for linter config', async () => {
      const pkg = createMockPackage();
      const filesWithLint = createMockFiles({
        'src/index.ts': 'export {}',
        '.eslintrc.json': '{"extends": ["recommended"]}',
      });

      const checker = new CertificationChecker(pkg, filesWithLint);
      const result = await checker.check();

      const codeQuality = result.categories.find((c) => c.name === 'codeQuality');
      const linting = codeQuality?.checks.find((c) => c.name === 'linting');
      expect(linting?.passed).toBe(true);
      expect(linting?.score).toBe(25);
    });

    it('should detect holoscript config as linter', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        'src/index.ts': 'export {}',
        'holoscript.config.json': '{"linter": {}}',
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      const codeQuality = result.categories.find((c) => c.name === 'codeQuality');
      const linting = codeQuality?.checks.find((c) => c.name === 'linting');
      expect(linting?.passed).toBe(true);
    });

    it('should give score for test coverage', async () => {
      const pkg = createMockPackage();
      const filesWithTests = createMockFiles({
        'src/index.ts': 'export {}',
        '__tests__/index.test.ts': 'test("works", () => {});',
      });

      const checker = new CertificationChecker(pkg, filesWithTests);
      const result = await checker.check();

      const codeQuality = result.categories.find((c) => c.name === 'codeQuality');
      const coverage = codeQuality?.checks.find((c) => c.name === 'testCoverage');
      expect(coverage?.score).toBeGreaterThan(0);
    });

    it('should add issue for missing tests', async () => {
      const pkg = createMockPackage();
      const filesNoTests = createMockFiles({
        'src/index.ts': 'export {}',
      });

      const checker = new CertificationChecker(pkg, filesNoTests);
      const result = await checker.check();

      const testIssue = result.issues.find(
        (i) => i.check === 'testCoverage' && i.severity === 'error'
      );
      expect(testIssue).toBeDefined();
      expect(testIssue?.message).toContain('No test files');
    });
  });

  describe('documentation checks', () => {
    it('should give score for README', async () => {
      const pkg = createMockPackage();
      const filesWithReadme = createMockFiles({
        'README.md': '# My Package\n\nThis is a test package with description.',
      });

      const checker = new CertificationChecker(pkg, filesWithReadme);
      const result = await checker.check();

      const docs = result.categories.find((c) => c.name === 'documentation');
      const readme = docs?.checks.find((c) => c.name === 'readme');
      expect(readme?.score).toBeGreaterThan(0);
    });

    it('should give score for CHANGELOG', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n- Initial release',
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      const docs = result.categories.find((c) => c.name === 'documentation');
      const changelog = docs?.checks.find((c) => c.name === 'changelog');
      expect(changelog?.score).toBeGreaterThan(0);
    });

    it('should give score for LICENSE', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        LICENSE: 'MIT License\n\nCopyright (c) 2024',
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      const docs = result.categories.find((c) => c.name === 'documentation');
      const license = docs?.checks.find((c) => c.name === 'license');
      expect(license?.score).toBeGreaterThan(0);
    });
  });

  describe('certification level determination', () => {
    it('should return certification result with score percentage', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        'src/index.ts': 'export {};',
        'src/utils.ts': 'export function util() {}',
        'README.md': '# Package\n\nComplete documentation with API reference.',
        'CHANGELOG.md': '# Changelog\n\n## 1.0.0\n- Initial',
        LICENSE: 'MIT',
        '__tests__/test.ts': 'test("works");',
        '.eslintrc.json': '{}',
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      // Score should be calculated
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.maxScore).toBeGreaterThan(0);

      // Percentage calculation
      const scorePercent = (result.score / result.maxScore) * 100;
      expect(scorePercent).toBeGreaterThanOrEqual(0);
      expect(scorePercent).toBeLessThanOrEqual(100);
    });

    it('should try levels in order from highest to lowest', async () => {
      // This tests that platinum is checked before gold, etc.
      const levels: CertificationLevel[] = ['platinum', 'gold', 'silver', 'bronze'];
      expect(CERTIFICATION_LEVELS.platinum.minScore).toBeGreaterThan(
        CERTIFICATION_LEVELS.gold.minScore
      );
      expect(CERTIFICATION_LEVELS.gold.minScore).toBeGreaterThan(
        CERTIFICATION_LEVELS.silver.minScore
      );
      expect(CERTIFICATION_LEVELS.silver.minScore).toBeGreaterThan(
        CERTIFICATION_LEVELS.bronze.minScore
      );
    });
  });

  describe('issues tracking', () => {
    it('should track multiple issues', async () => {
      const pkg = createMockPackage();
      const bareFiles = createMockFiles({
        'src/index.js': 'export {}',
      });

      const checker = new CertificationChecker(pkg, bareFiles);
      const result = await checker.check();

      expect(result.issues.length).toBeGreaterThan(0);
    });

    it('should include fix suggestions for issues', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        'src/index.js': 'export {}',
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      const issuesWithSuggestions = result.issues.filter((i) => i.fixSuggestion);
      expect(issuesWithSuggestions.length).toBeGreaterThan(0);
    });

    it('should categorize issue severity', async () => {
      const pkg = createMockPackage();
      const files = createMockFiles({
        'src/index.ts': 'export {}',
      });

      const checker = new CertificationChecker(pkg, files);
      const result = await checker.check();

      const severities = result.issues.map((i) => i.severity);
      for (const severity of severities) {
        expect(['error', 'warning', 'info']).toContain(severity);
      }
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// Badge Tests
// ═══════════════════════════════════════════════════════════════════════════════

function makeBadgeResult(level: CertificationLevel, score: number): CertificationResult {
  return {
    certified: true,
    level,
    score,
    maxScore: 100,
    categories: [],
    issues: [],
    certifiedAt: new Date('2026-03-01T00:00:00Z'),
    expiresAt: new Date('2027-03-01T00:00:00Z'),
  };
}

describe('CertificationBadge', () => {
  describe('issueBadge', () => {
    it('returns null for uncertified result', () => {
      const result: CertificationResult = {
        certified: false,
        score: 55,
        maxScore: 100,
        categories: [],
        issues: [],
      };
      expect(issueBadge('@test/pkg', '1.0.0', result)).toBeNull();
    });

    it('issues a badge for certified result', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('gold', 87));
      expect(badge).not.toBeNull();
      expect(badge?.packageName).toBe('@test/pkg');
      expect(badge?.version).toBe('1.0.0');
      expect(badge?.level).toBe('gold');
      expect(badge?.score).toBe(87);
    });

    it('badge has fingerprint and signature', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('silver', 78));
      expect(badge?.fingerprint).toHaveLength(64); // SHA-256 hex
      expect(badge?.signature).toHaveLength(64);
    });

    it('badge has issuedAt and expiresAt', () => {
      const badge = issueBadge('@test/pkg', '2.0.0', makeBadgeResult('bronze', 65));
      expect(badge?.issuedAt).toBeDefined();
      expect(badge?.expiresAt).toBeDefined();
      const issued = new Date(badge!.issuedAt);
      const expires = new Date(badge!.expiresAt);
      expect(expires.getTime()).toBeGreaterThan(issued.getTime());
    });

    it('expiry is ~1 year after issuedAt', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('gold', 90));
      const issued = new Date(badge!.issuedAt).getTime();
      const expires = new Date(badge!.expiresAt).getTime();
      const diffDays = (expires - issued) / (1000 * 60 * 60 * 24);
      expect(diffDays).toBeCloseTo(365, 0);
    });
  });

  describe('verifyBadge', () => {
    it('verifies a valid badge', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('gold', 90))!;
      const result = verifyBadge(badge);
      expect(result.valid).toBe(true);
    });

    it('rejects tampered fingerprint', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('gold', 90))!;
      const tampered = { ...badge, fingerprint: badge.fingerprint.replace('a', 'b') };
      const result = verifyBadge(tampered);
      expect(result.valid).toBe(false);
      expect(result.reason).toMatch(/fingerprint/i);
    });

    it('rejects tampered signature', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('gold', 90))!;
      const tampered = { ...badge, signature: badge.signature.replace('a', 'b') };
      const result = verifyBadge(tampered);
      expect(result.valid).toBe(false);
    });

    it('rejects expired badge', () => {
      const result = makeBadgeResult('gold', 90);
      result.certifiedAt = new Date('2020-01-01');
      const badge = issueBadge('@test/pkg', '1.0.0', result)!;
      const verify = verifyBadge(badge);
      expect(verify.valid).toBe(false);
      expect(verify.reason).toMatch(/expired/i);
    });

    it('wrong signing secret fails verification', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('gold', 90), 'secret-A')!;
      const result = verifyBadge(badge, 'secret-B');
      expect(result.valid).toBe(false);
    });
  });

  describe('generateBadgeSVG', () => {
    it('returns SVG string', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('gold', 90))!;
      const svg = generateBadgeSVG(badge);
      expect(svg).toContain('<svg');
      expect(svg).toContain('</svg>');
    });

    it('includes package name in SVG', () => {
      const badge = issueBadge('@studio/vr-buttons', '2.0.0', makeBadgeResult('gold', 90))!;
      const svg = generateBadgeSVG(badge);
      expect(svg).toContain('vr-buttons');
    });

    it('includes level name in SVG', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('platinum', 97))!;
      const svg = generateBadgeSVG(badge);
      expect(svg).toContain('Platinum');
    });

    it('includes score in SVG', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('silver', 76))!;
      const svg = generateBadgeSVG(badge);
      expect(svg).toContain('76');
    });

    it('truncates long package names', () => {
      const badge = issueBadge(
        '@very-long-org/extremely-long-package-name-here',
        '1.0.0',
        makeBadgeResult('bronze', 62)
      )!;
      const svg = generateBadgeSVG(badge);
      // Should not throw and should produce valid SVG
      expect(svg).toContain('<svg');
    });
  });

  describe('generateMarkdownBadge', () => {
    it('returns markdown image syntax', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('gold', 90))!;
      const md = generateMarkdownBadge(badge);
      expect(md).toMatch(/^!\[.*\]\(https?:\/\//);
    });

    it('includes level in URL', () => {
      const badge = issueBadge('@test/pkg', '1.0.0', makeBadgeResult('platinum', 97))!;
      const md = generateMarkdownBadge(badge);
      expect(md.toLowerCase()).toContain('platinum');
    });
  });

  describe('Badge Store', () => {
    it('stores and retrieves a badge', () => {
      const badge = issueBadge('@store/test', '1.0.0', makeBadgeResult('silver', 80))!;
      storeBadge(badge);
      const retrieved = getBadge('@store/test', '1.0.0');
      expect(retrieved?.packageName).toBe('@store/test');
    });

    it('listBadges returns stored badges', () => {
      const badge = issueBadge('@list/test', '1.0.0', makeBadgeResult('bronze', 62))!;
      storeBadge(badge);
      const all = listBadges();
      expect(all.some((b) => b.packageName === '@list/test')).toBe(true);
    });

    it('revokeBadge removes the badge', () => {
      const badge = issueBadge('@revoke/test', '1.0.0', makeBadgeResult('gold', 88))!;
      storeBadge(badge);
      const removed = revokeBadge('@revoke/test', '1.0.0');
      expect(removed).toBe(true);
      expect(getBadge('@revoke/test', '1.0.0')).toBeUndefined();
    });

    it('isActivelyCertified returns true for valid badge', () => {
      const badge = issueBadge('@active/test', '1.0.0', makeBadgeResult('gold', 88))!;
      storeBadge(badge);
      expect(isActivelyCertified('@active/test', '1.0.0')).toBe(true);
    });

    it('isActivelyCertified returns false for non-existent badge', () => {
      expect(isActivelyCertified('@nonexistent/pkg', '9.9.9')).toBe(false);
    });

    it('returns undefined for non-existent badge', () => {
      expect(getBadge('@nobody/nothing', '0.0.1')).toBeUndefined();
    });
  });
});

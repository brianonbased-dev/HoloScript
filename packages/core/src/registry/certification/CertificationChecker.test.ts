/**
 * Tests for CertificationChecker
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  CertificationChecker,
  createCertificationChecker,
  type PackageFiles,
} from './CertificationChecker';

describe('CertificationChecker', () => {
  let checker: CertificationChecker;

  beforeEach(() => {
    checker = createCertificationChecker();
  });

  const createMinimalPackage = (): PackageFiles => ({
    manifest: {
      name: '@test/package',
      version: '1.0.0',
      description: 'A test package for certification testing',
      author: 'Test Author',
      license: 'MIT',
      repository: 'https://github.com/test/package',
    },
    readme: `# Test Package

A comprehensive test package for certification testing in the HoloScript ecosystem.
This package demonstrates best practices for documentation and code quality.

## Installation

\`\`\`bash
npm install @test/package
\`\`\`

## Usage

\`\`\`typescript
import { something } from '@test/package';

// Use the package
const result = something();
console.log(result);
\`\`\`

## Features

- Feature one: Does something useful
- Feature two: Does something else useful
`,
    changelog: `# Changelog

## 1.0.0
- Initial release
`,
    license: 'MIT License...',
    sourceFiles: [
      {
        path: 'src/index.ts',
        content: `
export function greet(name: string): string {
  return \`Hello, \${name}!\`;
}

export function add(a: number, b: number): number {
  return a + b;
}
`,
      },
    ],
    testFiles: [
      {
        path: 'src/index.test.ts',
        content: `
import { greet, add } from './index';

describe('greet', () => {
  it('should greet by name', () => {
    expect(greet('World')).toBe('Hello, World!');
  });
});

describe('add', () => {
  it('should add numbers', () => {
    expect(add(1, 2)).toBe(3);
  });
});
`,
      },
    ],
  });

  describe('certify', () => {
    it('should certify a well-structured package', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      expect(result.packageName).toBe('@test/package');
      expect(result.packageVersion).toBe('1.0.0');
      expect(result.certified).toBe(true);
      expect(result.grade).toMatch(/^[AB]$/);
    });

    it('should include all check categories', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const categories = new Set(result.checks.map((c) => c.category));
      expect(categories.has('code_quality')).toBe(true);
      expect(categories.has('documentation')).toBe(true);
      expect(categories.has('security')).toBe(true);
      expect(categories.has('maintenance')).toBe(true);
    });

    it('should generate certificate ID for certified packages', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      expect(result.certificateId).toBeDefined();
      expect(result.certificateId).toMatch(/^CERT-[A-Z0-9]+$/);
    });

    it('should set expiry date for certified packages', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      expect(result.expiresAt).toBeDefined();
      const expiryDate = new Date(result.expiresAt!);
      const oneYearFromNow = new Date();
      oneYearFromNow.setFullYear(oneYearFromNow.getFullYear() + 1);

      // Should expire roughly 1 year from now
      expect(expiryDate.getFullYear()).toBe(oneYearFromNow.getFullYear());
    });
  });

  describe('code quality checks', () => {
    it('should pass typed check for TypeScript files', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const typedCheck = result.checks.find((c) => c.id === 'code_typed');
      expect(typedCheck?.status).toBe('passed');
    });

    it('should fail typed check for JavaScript-only packages', async () => {
      const files = createMinimalPackage();
      files.sourceFiles = [{ path: 'src/index.js', content: 'export const x = 1;' }];

      const result = await checker.certify(files);

      const typedCheck = result.checks.find((c) => c.id === 'code_typed');
      expect(typedCheck?.status).toBe('failed');
    });

    it('should detect lint issues', async () => {
      const files = createMinimalPackage();
      files.sourceFiles[0].content = 'var x = 1;\nexport { x };';

      const result = await checker.certify(files);

      const lintCheck = result.checks.find((c) => c.id === 'code_linting');
      expect(lintCheck?.status).toBe('failed');
    });

    it('should calculate complexity score', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const complexityCheck = result.checks.find((c) => c.id === 'code_complexity');
      expect(complexityCheck).toBeDefined();
      expect(complexityCheck?.details?.grade).toMatch(/^[ABCD]$/);
    });

    it('should check for test coverage', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const coverageCheck = result.checks.find((c) => c.id === 'code_coverage');
      expect(coverageCheck).toBeDefined();
    });

    it('should warn about console.log statements', async () => {
      const files = createMinimalPackage();
      files.sourceFiles[0].content += '\nconsole.log("debug");';

      const result = await checker.certify(files);

      const consoleCheck = result.checks.find((c) => c.id === 'code_no_console');
      expect(consoleCheck?.status).toBe('warning');
    });
  });

  describe('documentation checks', () => {
    it('should pass README check when present', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const readmeCheck = result.checks.find((c) => c.id === 'doc_readme');
      expect(readmeCheck?.status).toBe('passed');
    });

    it('should fail README check when missing', async () => {
      const files = createMinimalPackage();
      files.readme = undefined;

      const result = await checker.certify(files);

      const readmeCheck = result.checks.find((c) => c.id === 'doc_readme');
      expect(readmeCheck?.status).toBe('failed');
    });

    it('should detect code examples in README', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const examplesCheck = result.checks.find((c) => c.id === 'doc_examples');
      expect(examplesCheck?.status).toBe('passed');
    });

    it('should check license', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const licenseCheck = result.checks.find((c) => c.id === 'doc_license');
      expect(licenseCheck?.status).toBe('passed');
    });

    it('should warn for non-allowed licenses', async () => {
      const files = createMinimalPackage();
      files.manifest.license = 'GPL-3.0';

      const result = await checker.certify(files);

      const licenseCheck = result.checks.find((c) => c.id === 'doc_license');
      expect(licenseCheck?.status).toBe('warning');
    });
  });

  describe('security checks', () => {
    it('should pass when no dangerous patterns found', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const patternsCheck = result.checks.find((c) => c.id === 'security_patterns');
      expect(patternsCheck?.status).toBe('passed');
    });

    it('should fail when eval() is used', async () => {
      const files = createMinimalPackage();
      files.sourceFiles[0].content = 'const result = eval("1 + 1");';

      const result = await checker.certify(files);

      const patternsCheck = result.checks.find((c) => c.id === 'security_patterns');
      expect(patternsCheck?.status).toBe('failed');
    });

    it('should check dependency tree size', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const depsCheck = result.checks.find((c) => c.id === 'security_deps');
      expect(depsCheck).toBeDefined();
    });
  });

  describe('maintenance checks', () => {
    it('should validate semver', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const semverCheck = result.checks.find((c) => c.id === 'maint_semver');
      expect(semverCheck?.status).toBe('passed');
    });

    it('should fail semver check for invalid versions', async () => {
      const files = createMinimalPackage();
      files.manifest.version = 'invalid';

      const result = await checker.certify(files);

      const semverCheck = result.checks.find((c) => c.id === 'maint_semver');
      expect(semverCheck?.status).toBe('failed');
    });

    it('should check for repository link', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      const repoCheck = result.checks.find((c) => c.id === 'maint_repository');
      expect(repoCheck?.status).toBe('passed');
    });
  });

  describe('scoring', () => {
    it('should calculate score and grade', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      expect(result.score).toBeGreaterThan(0);
      expect(result.maxScore).toBeGreaterThan(0);
      expect(result.grade).toMatch(/^[ABCDF]$/);
    });

    it('should not certify packages with grade C or lower', async () => {
      const files = createMinimalPackage();
      // Remove critical elements to lower grade
      files.readme = undefined;
      files.license = undefined;
      files.testFiles = [];

      const result = await checker.certify(files);

      // Should have a low grade and not be certified
      expect(['C', 'D', 'F']).toContain(result.grade);
      expect(result.certified).toBe(false);
    });

    it('should provide summary statistics', async () => {
      const files = createMinimalPackage();
      const result = await checker.certify(files);

      expect(result.summary).toBeDefined();
      expect(result.summary.passed).toBeGreaterThanOrEqual(0);
      expect(result.summary.failed).toBeGreaterThanOrEqual(0);
      expect(result.summary.warnings).toBeGreaterThanOrEqual(0);
    });
  });

  describe('custom configuration', () => {
    it('should allow custom coverage requirements', async () => {
      const customChecker = createCertificationChecker({
        requiredCoverage: 50, // Lower requirement
      });

      const files = createMinimalPackage();
      const result = await customChecker.certify(files);

      expect(result).toBeDefined();
    });

    it('should allow custom allowed licenses', async () => {
      const customChecker = createCertificationChecker({
        allowedLicenses: ['MIT', 'GPL-3.0'],
      });

      const files = createMinimalPackage();
      files.manifest.license = 'GPL-3.0';

      const result = await customChecker.certify(files);

      const licenseCheck = result.checks.find((c) => c.id === 'doc_license');
      expect(licenseCheck?.status).toBe('passed');
    });
  });
});

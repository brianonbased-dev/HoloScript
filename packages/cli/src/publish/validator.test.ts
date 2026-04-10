/**
 * Pre-Publish Validator Tests
 *
 * Sprint 6 Priority 1: holoscript publish command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { PublishValidator, createPublishValidator, validateForPublish } from './validator';

describe('PublishValidator', () => {
  const testDir = join(__dirname, '__test_fixtures__');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  describe('Package.json Validation', () => {
    it('should fail if package.json is missing', async () => {
      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_NO_PACKAGE_JSON')).toBe(true);
    });

    it('should fail if package.json is invalid JSON', async () => {
      writeFileSync(join(testDir, 'package.json'), '{ invalid json }');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.code === 'E_INVALID_PACKAGE_JSON')).toBe(true);
    });

    it('should pass with valid package.json', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-package',
          version: '1.0.0',
          license: 'MIT',
        })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test Package\n\nThis is a test.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT License');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.valid).toBe(true);
    });
  });

  describe('Package Name Validation', () => {
    const createPackageJson = (name: string) => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name, version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');
    };

    it('should fail if name is missing', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_NO_NAME')).toBe(true);
    });

    it('should fail for invalid name format', async () => {
      createPackageJson('INVALID_NAME');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_INVALID_NAME')).toBe(true);
    });

    it('should pass for valid scoped name', async () => {
      createPackageJson('@myorg/my-package');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.filter((e) => e.code.startsWith('E_')).length).toBe(0);
    });

    it('should warn for unscoped name', async () => {
      createPackageJson('my-package');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.warnings.some((w) => w.code === 'W_UNSCOPED_NAME')).toBe(true);
    });

    it('should fail for reserved names', async () => {
      createPackageJson('node_modules');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_RESERVED_NAME')).toBe(true);
    });
  });

  describe('Version Validation', () => {
    const createPackageJson = (version: string) => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version, license: 'MIT' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');
    };

    it('should fail if version is missing', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ name: '@test/pkg' }));
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_NO_VERSION')).toBe(true);
    });

    it('should fail for invalid semver', async () => {
      createPackageJson('1.0');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_INVALID_VERSION')).toBe(true);
    });

    it('should pass for valid semver', async () => {
      createPackageJson('1.0.0');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.filter((e) => e.code === 'E_INVALID_VERSION').length).toBe(0);
    });

    it('should pass for prerelease versions', async () => {
      createPackageJson('1.0.0-beta.1');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.filter((e) => e.code === 'E_INVALID_VERSION').length).toBe(0);
    });

    it('should warn for 0.x versions', async () => {
      createPackageJson('0.1.0');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.warnings.some((w) => w.code === 'W_UNSTABLE_VERSION')).toBe(true);
    });
  });

  describe('README Validation', () => {
    it('should fail if README is missing', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_NO_README')).toBe(true);
    });

    it('should warn for short README', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Title');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.warnings.some((w) => w.code === 'W_SHORT_README')).toBe(true);
    });

    it('should accept different README filenames', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(
        join(testDir, 'readme.md'),
        '# Test Package\n\nThis is a comprehensive description of the package.'
      );
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.filter((e) => e.code === 'E_NO_README').length).toBe(0);
    });
  });

  describe('LICENSE Validation', () => {
    it('should fail if LICENSE is missing and not in package.json', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_NO_LICENSE')).toBe(true);
    });

    it('should warn if license in package.json but no LICENSE file', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.warnings.some((w) => w.code === 'W_NO_LICENSE_FILE')).toBe(true);
    });
  });

  describe('Private Package Check', () => {
    it('should fail for private packages', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', private: true })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_PRIVATE_PACKAGE')).toBe(true);
    });
  });

  describe('Required Fields Warnings', () => {
    const createMinimalPackage = () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');
    };

    it('should warn for missing description', async () => {
      createMinimalPackage();

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.warnings.some((w) => w.code === 'W_NO_DESCRIPTION')).toBe(true);
    });

    it('should warn for missing keywords', async () => {
      createMinimalPackage();

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.warnings.some((w) => w.code === 'W_NO_KEYWORDS')).toBe(true);
    });

    it('should suggest adding holoscript keyword', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: '@test/pkg',
          version: '1.0.0',
          license: 'MIT',
          keywords: ['vr', 'xr'],
        })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.warnings.some((w) => w.code === 'W_MISSING_KEYWORD')).toBe(true);
    });
  });

  describe('Console Statement Check', () => {
    it('should detect console.log in source files', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');
      mkdirSync(join(testDir, 'src'));
      writeFileSync(
        join(testDir, 'src', 'index.ts'),
        'export function hello() {\n  console.log("Hello");\n}'
      );

      const validator = createPublishValidator(testDir, { allowConsole: false });
      const result = await validator.validate();

      expect(result.errors.some((e) => e.code === 'E_CONSOLE_STATEMENT')).toBe(true);
    });

    it('should allow console statements with option', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');
      mkdirSync(join(testDir, 'src'));
      writeFileSync(
        join(testDir, 'src', 'index.ts'),
        'export function hello() {\n  console.log("Hello");\n}'
      );

      const validator = createPublishValidator(testDir, { allowConsole: true });
      const result = await validator.validate();

      expect(result.errors.filter((e) => e.code === 'E_CONSOLE_STATEMENT').length).toBe(0);
    });

    it('should ignore console in test files', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');
      mkdirSync(join(testDir, 'src'));
      writeFileSync(join(testDir, 'src', 'index.test.ts'), 'console.log("test output")');

      const validator = createPublishValidator(testDir);
      const result = await validator.validate();

      expect(result.errors.filter((e) => e.code === 'E_CONSOLE_STATEMENT').length).toBe(0);
    });
  });
});

describe('Factory Functions', () => {
  const testDir = join(__dirname, '__test_fixtures_factory__');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: '@test/pkg', version: '1.0.0', license: 'MIT' })
    );
    writeFileSync(join(testDir, 'README.md'), '# Test\n\nDescription here.');
    writeFileSync(join(testDir, 'LICENSE'), 'MIT');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('createPublishValidator() should create instance', () => {
    const validator = createPublishValidator(testDir);
    expect(validator).toBeInstanceOf(PublishValidator);
  });

  it('validateForPublish() helper should work', async () => {
    const result = await validateForPublish(testDir);
    expect(result).toHaveProperty('valid');
    expect(result).toHaveProperty('errors');
    expect(result).toHaveProperty('warnings');
  });
});

/**
 * Package Bundler Tests
 *
 * Sprint 6 Priority 1: holoscript publish command
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { PackagePackager, createPackager, packPackage, getPackageManifest } from './packager';

describe('PackagePackager', () => {
  const testDir = join(__dirname, '__test_packager_fixtures__');

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

  describe('pack()', () => {
    it('should fail without package.json', async () => {
      const packager = createPackager(testDir);
      const result = await packager.pack();

      expect(result.success).toBe(false);
      expect(result.error).toContain('package.json not found');
    });

    it('should fail with invalid package.json', async () => {
      writeFileSync(join(testDir, 'package.json'), '{ invalid }');

      const packager = createPackager(testDir);
      const result = await packager.pack();

      expect(result.success).toBe(false);
      expect(result.error).toContain('Failed to parse');
    });

    it('should fail without name field', async () => {
      writeFileSync(join(testDir, 'package.json'), JSON.stringify({ version: '1.0.0' }));

      const packager = createPackager(testDir);
      const result = await packager.pack();

      expect(result.success).toBe(false);
      expect(result.error).toContain('must have name and version');
    });

    it('should create tarball with dry run = false', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir, { dryRun: false });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.tarballPath).toBeDefined();
      expect(result.files).toContain('package.json');
      expect(result.files).toContain('README.md');
      expect(existsSync(result.tarballPath!)).toBe(true);
    });

    it('should return file list with dry run', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test');
      writeFileSync(join(testDir, 'LICENSE'), 'MIT');

      const packager = createPackager(testDir, { dryRun: true });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.files).toContain('package.json');
      expect(result.files).toContain('README.md');
      expect(result.files).toContain('LICENSE');
      expect(result.tarballPath).toBeUndefined();
    });

    it('should include files from "files" field', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-pkg',
          version: '1.0.0',
          files: ['src'],
        })
      );
      mkdirSync(join(testDir, 'src'));
      writeFileSync(join(testDir, 'src', 'index.ts'), 'export const x = 1;');
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir, { dryRun: true });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.files).toContain('src/index.ts');
    });

    it('should exclude test files by default', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-pkg',
          version: '1.0.0',
          files: ['src'],
        })
      );
      mkdirSync(join(testDir, 'src'));
      writeFileSync(join(testDir, 'src', 'index.ts'), 'export const x = 1;');
      writeFileSync(join(testDir, 'src', 'index.test.ts'), 'test("x", () => {});');
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir, { dryRun: true });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.files).toContain('src/index.ts');
      expect(result.files).not.toContain('src/index.test.ts');
    });

    it('should exclude node_modules', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
      );
      mkdirSync(join(testDir, 'node_modules', 'lodash'), { recursive: true });
      writeFileSync(join(testDir, 'node_modules', 'lodash', 'index.js'), '');
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir, { dryRun: true });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.files?.some((f) => f.includes('node_modules'))).toBe(false);
    });

    it('should handle scoped package names in tarball', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: '@org/pkg', version: '1.0.0' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir);
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.tarballPath).toContain('org-pkg-1.0.0.tgz');
    });

    it('should include main entry point', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-pkg',
          version: '1.0.0',
          main: 'dist/index.js',
        })
      );
      mkdirSync(join(testDir, 'dist'));
      writeFileSync(join(testDir, 'dist', 'index.js'), 'module.exports = {}');
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir, { dryRun: true });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.files).toContain('dist/index.js');
    });
  });

  describe('getManifest()', () => {
    it('should return null without package.json', () => {
      const packager = createPackager(testDir);
      const manifest = packager.getManifest();

      expect(manifest).toBeNull();
    });

    it('should return manifest with file info', () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir);
      const manifest = packager.getManifest();

      expect(manifest).not.toBeNull();
      expect(manifest?.name).toBe('test-pkg');
      expect(manifest?.version).toBe('1.0.0');
      expect(manifest?.files.length).toBeGreaterThan(0);
      expect(manifest?.totalSize).toBeGreaterThan(0);
    });

    it('should include file sizes in manifest', () => {
      const content = 'x'.repeat(1000);
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
      );
      writeFileSync(join(testDir, 'README.md'), content);

      const packager = createPackager(testDir);
      const manifest = packager.getManifest();

      const readmeEntry = manifest?.files.find((f) => f.path === 'README.md');
      expect(readmeEntry?.size).toBe(1000);
    });
  });

  describe('Custom Options', () => {
    it('should include additional files from options', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test');
      writeFileSync(join(testDir, 'custom.txt'), 'custom file');

      const packager = createPackager(testDir, {
        dryRun: true,
        include: ['custom.txt'],
      });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.files).toContain('custom.txt');
    });

    it('should exclude files from options', async () => {
      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({
          name: 'test-pkg',
          version: '1.0.0',
          files: ['src'],
        })
      );
      mkdirSync(join(testDir, 'src'));
      writeFileSync(join(testDir, 'src', 'index.ts'), '');
      writeFileSync(join(testDir, 'src', 'secret.ts'), '');
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir, {
        dryRun: true,
        exclude: ['**/secret.*'],
      });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.files).toContain('src/index.ts');
      expect(result.files?.some((f) => f.includes('secret'))).toBe(false);
    });

    it('should output to custom directory', async () => {
      const outputDir = join(testDir, 'output');
      mkdirSync(outputDir);

      writeFileSync(
        join(testDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
      );
      writeFileSync(join(testDir, 'README.md'), '# Test');

      const packager = createPackager(testDir, { output: outputDir });
      const result = await packager.pack();

      expect(result.success).toBe(true);
      expect(result.tarballPath).toContain('output');
      expect(existsSync(result.tarballPath!)).toBe(true);
    });
  });
});

describe('Factory Functions', () => {
  const testDir = join(__dirname, '__test_packager_factory__');

  beforeEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
    mkdirSync(testDir, { recursive: true });
    writeFileSync(
      join(testDir, 'package.json'),
      JSON.stringify({ name: 'test-pkg', version: '1.0.0' })
    );
    writeFileSync(join(testDir, 'README.md'), '# Test');
  });

  afterEach(() => {
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true });
    }
  });

  it('createPackager() should create instance', () => {
    const packager = createPackager(testDir);
    expect(packager).toBeInstanceOf(PackagePackager);
  });

  it('packPackage() helper should work', async () => {
    const result = await packPackage(testDir, { dryRun: true });
    expect(result).toHaveProperty('success');
    expect(result).toHaveProperty('files');
  });

  it('getPackageManifest() helper should work', () => {
    const manifest = getPackageManifest(testDir);
    expect(manifest).not.toBeNull();
    expect(manifest?.name).toBe('test-pkg');
  });
});

/**
 * Sprint 6 Acceptance Tests â€“ v3.15.0
 *
 * Feature areas:
 *   1. Publish validation   (PublishValidator)
 *   2. Package bundling     (PackagePackager â€“ dry-run)
 *   3. Publish command      (PublishCommand â€“ dry-run + validation errors)
 *   4. Token management     (TokenManager)
 *   5. Access control       (AccessControl)
 *   6. Access CLI command   (AccessCommand)
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, writeFileSync, rmSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';

// â”€â”€ Feature 1 + 2: Validator & Packager â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { PublishValidator, createPublishValidator } from '../../../cli/src/publish/validator';
import { PackagePackager, createPackager } from '../../../cli/src/publish/packager';

// â”€â”€ Feature 3: Publish command â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { PublishCommand, createPublishCommand } from '../../../cli/src/commands/publish';

// â”€â”€ Feature 4: Token management â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { TokenManager, createTokenManager } from '@holoscript/platform';

// â”€â”€ Feature 5: Access control â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { AccessControl, createAccessControl } from '@holoscript/platform';

// â”€â”€ Feature 6: Access CLI command â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
import { AccessCommand, createAccessCommand } from '../../../cli/src/commands/access';

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Helpers
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function makeTmpDir(): string {
  const dir = join(tmpdir(), 'Sprint6-' + randomBytes(6).toString('hex'));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function writeJson(dir: string, filename: string, obj: unknown) {
  writeFileSync(join(dir, filename), JSON.stringify(obj, null, 2), 'utf-8');
}

function writeFile(dir: string, filename: string, content: string) {
  writeFileSync(join(dir, filename), content, 'utf-8');
}

function makeValidPackage(dir: string) {
  writeJson(dir, 'package.json', {
    name: '@myorg/vr-buttons',
    version: '1.2.3',
    description: 'VR button components for HoloScript',
    main: 'index.js',
    license: 'MIT',
    keywords: ['holoscript', 'vr', 'ui'],
    author: 'Alice <alice@example.com>',
    repository: { type: 'git', url: 'https://github.com/myorg/vr-buttons' },
  });
  writeFile(dir, 'README.md', 'A'.repeat(150));
  writeFile(dir, 'LICENSE', 'MIT License\n');
  writeFile(dir, 'index.js', 'module.exports = {};');
}

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 1: Publish Validation
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 1: Publish Validation', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('passes for a valid package', async () => {
    makeValidPackage(tmpDir);
    const validator = createPublishValidator(tmpDir, { allowConsole: true });
    const result = await validator.validate();
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('errors when package.json is missing', async () => {
    const validator = createPublishValidator(tmpDir);
    const result = await validator.validate();
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.code === 'E_NO_PACKAGE_JSON')).toBe(true);
  });

  it('errors on invalid package name (uppercase)', async () => {
    writeJson(tmpDir, 'package.json', {
      name: 'MyPkg',
      version: '1.0.0',
      license: 'MIT',
    });
    writeFile(tmpDir, 'README.md', 'A'.repeat(150));
    writeFile(tmpDir, 'LICENSE', 'MIT\n');
    const validator = createPublishValidator(tmpDir, { allowConsole: true });
    const result = await validator.validate();
    expect(result.errors.some((e) => e.code === 'E_INVALID_NAME')).toBe(true);
  });

  it('errors on invalid semver version', async () => {
    writeJson(tmpDir, 'package.json', { name: 'mypkg', version: 'not-a-version', license: 'MIT' });
    writeFile(tmpDir, 'README.md', 'A'.repeat(150));
    writeFile(tmpDir, 'LICENSE', 'MIT\n');
    const validator = createPublishValidator(tmpDir, { allowConsole: true });
    const result = await validator.validate();
    expect(result.errors.some((e) => e.code === 'E_INVALID_VERSION')).toBe(true);
  });

  it('errors when package is marked private', async () => {
    writeJson(tmpDir, 'package.json', {
      name: 'mypkg',
      version: '1.0.0',
      private: true,
      license: 'MIT',
    });
    writeFile(tmpDir, 'README.md', 'A'.repeat(150));
    writeFile(tmpDir, 'LICENSE', 'MIT\n');
    const validator = createPublishValidator(tmpDir, { allowConsole: true });
    const result = await validator.validate();
    expect(result.errors.some((e) => e.code === 'E_PRIVATE_PACKAGE')).toBe(true);
  });

  it('errors when README is missing', async () => {
    writeJson(tmpDir, 'package.json', { name: 'mypkg', version: '1.0.0', license: 'MIT' });
    writeFile(tmpDir, 'LICENSE', 'MIT\n');
    const validator = createPublishValidator(tmpDir, { allowConsole: true });
    const result = await validator.validate();
    expect(result.errors.some((e) => e.code === 'E_NO_README')).toBe(true);
  });

  it('errors when LICENSE is missing (and no license field)', async () => {
    writeJson(tmpDir, 'package.json', { name: 'mypkg', version: '1.0.0' });
    writeFile(tmpDir, 'README.md', 'A'.repeat(150));
    const validator = createPublishValidator(tmpDir, { allowConsole: true });
    const result = await validator.validate();
    expect(result.errors.some((e) => e.code === 'E_NO_LICENSE')).toBe(true);
  });

  it('warns when description is missing', async () => {
    makeValidPackage(tmpDir);
    // Remove description
    writeJson(tmpDir, 'package.json', {
      name: '@myorg/vr-buttons',
      version: '1.0.0',
      main: 'index.js',
      license: 'MIT',
      keywords: ['holoscript'],
      author: 'Alice',
      repository: 'https://example.com',
    });
    const validator = createPublishValidator(tmpDir, { allowConsole: true });
    const result = await validator.validate();
    expect(result.warnings.some((w) => w.code === 'W_NO_DESCRIPTION')).toBe(true);
  });

  it('getPackageJson returns the loaded manifest', async () => {
    makeValidPackage(tmpDir);
    const validator = createPublishValidator(tmpDir, { allowConsole: true });
    await validator.validate();
    const pkg = validator.getPackageJson();
    expect(pkg?.name).toBe('@myorg/vr-buttons');
    expect(pkg?.version).toBe('1.2.3');
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 2: Package Bundling (dry-run)
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 2: Package Bundler (dry-run)', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry-run succeeds and returns file list', async () => {
    makeValidPackage(tmpDir);
    mkdirSync(join(tmpDir, 'src'), { recursive: true });
    writeFile(join(tmpDir, 'src'), 'main.ts', 'export const x = 1;');
    const packager = createPackager(tmpDir, { dryRun: true });
    const result = await packager.pack();
    expect(result.success).toBe(true);
    expect(Array.isArray(result.files)).toBe(true);
    expect(result.files!.length).toBeGreaterThan(0);
    expect(result.size).toBeGreaterThan(0);
    // Dry-run should NOT create a .tgz file
    expect(result.tarballPath).toBeUndefined();
  });

  it('dry-run always includes package.json', async () => {
    makeValidPackage(tmpDir);
    const packager = createPackager(tmpDir, { dryRun: true });
    const result = await packager.pack();
    expect(result.files).toContain('package.json');
  });

  it('dry-run always includes README', async () => {
    makeValidPackage(tmpDir);
    const packager = createPackager(tmpDir, { dryRun: true });
    const result = await packager.pack();
    expect(result.files).toContain('README.md');
  });

  it('fails when package.json is missing', async () => {
    const packager = createPackager(tmpDir, { dryRun: true });
    const result = await packager.pack();
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('getManifest returns null when package.json missing', () => {
    const packager = createPackager(tmpDir);
    expect(packager.getManifest()).toBeNull();
  });

  it('getManifest returns manifest with file entries', () => {
    makeValidPackage(tmpDir);
    const packager = createPackager(tmpDir);
    const manifest = packager.getManifest();
    expect(manifest).not.toBeNull();
    expect(manifest!.name).toBe('@myorg/vr-buttons');
    expect(manifest!.version).toBe('1.2.3');
    expect(manifest!.files.length).toBeGreaterThan(0);
    expect(typeof manifest!.totalSize).toBe('number');
    expect(manifest!.createdAt).toBeTruthy();
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 3: Publish Command
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 3: PublishCommand', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });
  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('dry-run returns success + file count for valid package', async () => {
    makeValidPackage(tmpDir);
    const cmd = createPublishCommand({ cwd: tmpDir, dryRun: true, allowConsole: true });
    const result = await cmd.run();
    expect(result.success).toBe(true);
    expect(result.dryRun).toBe(true);
    expect(result.packageName).toBe('@myorg/vr-buttons');
    expect(result.version).toBe('1.2.3');
    expect(typeof result.fileCount).toBe('number');
  });

  it('dry-run fails with errors when validation fails', async () => {
    // No package.json
    const cmd = createPublishCommand({ cwd: tmpDir, dryRun: true });
    const result = await cmd.run();
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('dry-run includes warnings in result', async () => {
    makeValidPackage(tmpDir);
    // Remove description to trigger W_NO_DESCRIPTION
    writeJson(tmpDir, 'package.json', {
      name: '@myorg/vr-buttons',
      version: '1.0.0',
      main: 'index.js',
      license: 'MIT',
      author: 'Alice',
      repository: 'https://example.com',
      keywords: ['holoscript'],
    });
    const cmd = createPublishCommand({ cwd: tmpDir, dryRun: true, allowConsole: true });
    const result = await cmd.run();
    expect(result.success).toBe(true);
    // Should include W_NO_DESCRIPTION warning
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('createPublishCommand factory works', () => {
    const cmd = createPublishCommand({ dryRun: true });
    expect(cmd).toBeInstanceOf(PublishCommand);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 4: Token Management
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 4: Token Management', () => {
  let tm: TokenManager;

  beforeEach(() => {
    tm = createTokenManager();
  });

  it('create returns rawToken and record', () => {
    const { rawToken, record } = tm.create({ name: 'ci-token', orgScope: '@myorg' });
    expect(rawToken).toMatch(/^hls_/);
    expect(record.name).toBe('ci-token');
    expect(record.orgScope).toBe('@myorg');
    expect(record.revoked).toBe(false);
    // Raw token is not stored (only hash)
    expect(record.token).not.toBe(rawToken);
  });

  it('validate succeeds for a fresh token', () => {
    const { rawToken } = tm.create({ name: 't1', orgScope: '@org' });
    const result = tm.validate(rawToken);
    expect(result.valid).toBe(true);
    expect(result.record).toBeDefined();
  });

  it('validate fails for unknown token', () => {
    const result = tm.validate('hls_not_a_real_token');
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('Unknown');
  });

  it('validate fails after revocation', () => {
    const { rawToken, record } = tm.create({ name: 't2', orgScope: '@org' });
    tm.revoke(record.id);
    const result = tm.validate(rawToken);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('revoked');
  });

  it('validate fails for expired token', async () => {
    const { rawToken } = tm.create({ name: 'exp', orgScope: '@org', expiresIn: -1 }); // already expired
    const result = tm.validate(rawToken);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain('expired');
  });

  it('validate updates lastUsedAt', () => {
    const { rawToken, record } = tm.create({ name: 't3', orgScope: '@org' });
    expect(record.lastUsedAt).toBeUndefined();
    tm.validate(rawToken);
    expect(record.lastUsedAt).toBeInstanceOf(Date);
  });

  it('hasPermission: read-only token cannot publish', () => {
    const { rawToken } = tm.create({
      name: 'ro',
      orgScope: '@org',
      readonly: true,
      permissions: ['read'],
    });
    const { record } = tm.validate(rawToken);
    expect(tm.hasPermission(record!, 'read')).toBe(true);
    expect(tm.hasPermission(record!, 'publish')).toBe(false);
  });

  it('hasPermission: admin token has all permissions', () => {
    const { rawToken } = tm.create({ name: 'adm', orgScope: '@org', permissions: ['admin'] });
    const { record } = tm.validate(rawToken);
    expect(tm.hasPermission(record!, 'read')).toBe(true);
    expect(tm.hasPermission(record!, 'publish')).toBe(true);
    expect(tm.hasPermission(record!, 'admin')).toBe(true);
  });

  it('listByScope returns only tokens for that org', () => {
    tm.create({ name: 'a', orgScope: '@orgA' });
    tm.create({ name: 'b', orgScope: '@orgA' });
    tm.create({ name: 'c', orgScope: '@orgB' });
    expect(tm.listByScope('@orgA')).toHaveLength(2);
    expect(tm.listByScope('@orgB')).toHaveLength(1);
    expect(tm.listByScope('@orgC')).toHaveLength(0);
  });

  it('getById returns record', () => {
    const { record } = tm.create({ name: 'x', orgScope: '@org' });
    expect(tm.getById(record.id)).toBe(record);
  });

  it('size tracks token count', () => {
    expect(tm.size).toBe(0);
    tm.create({ name: 'a', orgScope: '@org' });
    tm.create({ name: 'b', orgScope: '@org' });
    expect(tm.size).toBe(2);
  });

  it('clear removes all tokens', () => {
    tm.create({ name: 'a', orgScope: '@org' });
    tm.clear();
    expect(tm.size).toBe(0);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 5: Access Control
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 5: Access Control', () => {
  let ac: AccessControl;

  beforeEach(() => {
    ac = createAccessControl();
  });

  // â”€â”€ Organizations â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('createOrg creates org and adds owner', () => {
    const org = ac.createOrg('@myorg', 'user-1');
    expect(org.name).toBe('@myorg');
    expect(ac.isMember('@myorg', 'user-1')).toBe(true);
    const m = ac.getMembership('@myorg', 'user-1');
    expect(m?.role).toBe('owner');
  });

  it('createOrg throws on duplicate name', () => {
    ac.createOrg('@dup', 'user-1');
    expect(() => ac.createOrg('@dup', 'user-2')).toThrow();
  });

  it('addMember / removeMember', () => {
    ac.createOrg('@o', 'owner');
    ac.addMember('@o', 'dev-1', 'member');
    expect(ac.isMember('@o', 'dev-1')).toBe(true);
    ac.removeMember('@o', 'dev-1');
    expect(ac.isMember('@o', 'dev-1')).toBe(false);
  });

  it('hasOrgRole respects hierarchy', () => {
    ac.createOrg('@h', 'owner-1');
    ac.addMember('@h', 'admin-1', 'admin');
    ac.addMember('@h', 'member-1', 'member');
    // owner >= owner, admin, member
    expect(ac.hasOrgRole('@h', 'owner-1', 'owner')).toBe(true);
    expect(ac.hasOrgRole('@h', 'owner-1', 'member')).toBe(true);
    // admin >= admin, member but not owner
    expect(ac.hasOrgRole('@h', 'admin-1', 'admin')).toBe(true);
    expect(ac.hasOrgRole('@h', 'admin-1', 'owner')).toBe(false);
    // member only >= member
    expect(ac.hasOrgRole('@h', 'member-1', 'member')).toBe(true);
    expect(ac.hasOrgRole('@h', 'member-1', 'admin')).toBe(false);
  });

  // â”€â”€ Package visibility â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('packages are public by default', () => {
    expect(ac.isPublic('@myorg/ui')).toBe(true);
  });

  it('setVisibility to private', () => {
    ac.setVisibility('@myorg/secret', 'private', '@myorg');
    expect(ac.isPublic('@myorg/secret')).toBe(false);
    expect(ac.getVisibility('@myorg/secret').orgScope).toBe('@myorg');
  });

  // â”€â”€ Package permissions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  it('grantAccess / revokeAccess', () => {
    ac.grantAccess('@myorg/pkg', 'alice', 'read', 'admin');
    expect(ac.getUserAccess('@myorg/pkg', 'alice')).toBe('read');
    ac.revokeAccess('@myorg/pkg', 'alice');
    expect(ac.getUserAccess('@myorg/pkg', 'alice')).toBeNull();
  });

  it('canAccess: public package read always true', () => {
    expect(ac.canAccess('@myorg/public', 'anyone', 'read')).toBe(true);
  });

  it('canAccess: private package denied without grant', () => {
    ac.setVisibility('@myorg/secret', 'private');
    expect(ac.canAccess('@myorg/secret', 'stranger', 'read')).toBe(false);
  });

  it('canAccess: org member can read private org package', () => {
    ac.createOrg('@team', 'owner');
    ac.addMember('@team', 'dev-1');
    ac.setVisibility('@team/internal', 'private', '@team');
    expect(ac.canAccess('@team/internal', 'dev-1', 'read')).toBe(true);
  });

  it('canAccess: explicit grant overrides missing org membership', () => {
    ac.setVisibility('@myorg/restricted', 'private');
    ac.grantAccess('@myorg/restricted', 'outsider', 'read', 'admin');
    expect(ac.canAccess('@myorg/restricted', 'outsider', 'read')).toBe(true);
  });

  it('canAccess: respects access hierarchy (write > read)', () => {
    ac.setVisibility('@myorg/pkg', 'private');
    ac.grantAccess('@myorg/pkg', 'alice', 'write', 'admin');
    expect(ac.canAccess('@myorg/pkg', 'alice', 'read')).toBe(true);
    expect(ac.canAccess('@myorg/pkg', 'alice', 'write')).toBe(true);
    expect(ac.canAccess('@myorg/pkg', 'alice', 'admin')).toBe(false);
  });

  it('visiblePackages filters private packages', () => {
    const all = ['@o/public', '@o/private'];
    ac.setVisibility('@o/private', 'private');
    ac.grantAccess('@o/private', 'alice', 'read', 'admin');
    expect(ac.visiblePackages(all, 'alice')).toContain('@o/public');
    expect(ac.visiblePackages(all, 'alice')).toContain('@o/private');
    expect(ac.visiblePackages(all, 'bob')).toContain('@o/public');
    expect(ac.visiblePackages(all, 'bob')).not.toContain('@o/private');
  });

  it('getMembers lists all org members', () => {
    ac.createOrg('@grp', 'owner');
    ac.addMember('@grp', 'a', 'member');
    ac.addMember('@grp', 'b', 'admin');
    const members = ac.getMembers('@grp');
    expect(members.length).toBe(3); // owner + a + b
  });

  it('getPermissions lists package-level grants', () => {
    ac.grantAccess('pkg', 'x', 'read', 'admin');
    ac.grantAccess('pkg', 'y', 'write', 'admin');
    expect(ac.getPermissions('pkg')).toHaveLength(2);
  });

  it('clear removes all data', () => {
    ac.createOrg('@o', 'u');
    ac.grantAccess('pkg', 'u', 'read', 'admin');
    ac.clear();
    expect(ac.listOrgs()).toHaveLength(0);
    expect(ac.getPermissions('pkg')).toHaveLength(0);
  });
});

// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
// Feature 6: Access CLI Command
// â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

describe('Feature 6: AccessCommand (CLI)', () => {
  let ac: AccessControl;
  let cmd: AccessCommand;

  beforeEach(() => {
    ac = createAccessControl();
    cmd = createAccessCommand(ac);
  });

  it('grant subcommand adds access', () => {
    const result = cmd.run({
      subcommand: 'grant',
      packageName: '@o/pkg',
      userId: 'alice',
      access: 'write',
      grantedBy: 'admin',
    });
    expect(result.success).toBe(true);
    expect(result.message).toContain('write');
    expect(result.message).toContain('alice');
    expect(ac.getUserAccess('@o/pkg', 'alice')).toBe('write');
  });

  it('grant subcommand defaults to read access', () => {
    const result = cmd.run({ subcommand: 'grant', packageName: '@o/pkg', userId: 'bob' });
    expect(result.success).toBe(true);
    expect(ac.getUserAccess('@o/pkg', 'bob')).toBe('read');
  });

  it('grant subcommand fails without userId', () => {
    const result = cmd.run({ subcommand: 'grant', packageName: '@o/pkg' });
    expect(result.success).toBe(false);
    expect(result.message).toContain('userId');
  });

  it('revoke subcommand removes access', () => {
    ac.grantAccess('@o/pkg', 'carol', 'read', 'admin');
    const result = cmd.run({ subcommand: 'revoke', packageName: '@o/pkg', userId: 'carol' });
    expect(result.success).toBe(true);
    expect(ac.getUserAccess('@o/pkg', 'carol')).toBeNull();
  });

  it('revoke subcommand returns false for non-existent grant', () => {
    const result = cmd.run({ subcommand: 'revoke', packageName: '@o/pkg', userId: 'nobody' });
    expect(result.success).toBe(false);
  });

  it('revoke subcommand fails without userId', () => {
    const result = cmd.run({ subcommand: 'revoke', packageName: '@o/pkg' });
    expect(result.success).toBe(false);
  });

  it('list subcommand shows all grants', () => {
    ac.grantAccess('@o/pkg', 'x', 'read', 'admin');
    ac.grantAccess('@o/pkg', 'y', 'admin', 'admin');
    const result = cmd.run({ subcommand: 'list', packageName: '@o/pkg' });
    expect(result.success).toBe(true);
    expect(result.permissions).toHaveLength(2);
    expect(result.permissions!.map((p) => p.userId)).toContain('x');
    expect(result.permissions!.map((p) => p.userId)).toContain('y');
  });

  it('list subcommand returns empty list when no grants', () => {
    const result = cmd.run({ subcommand: 'list', packageName: '@o/new' });
    expect(result.success).toBe(true);
    expect(result.permissions).toHaveLength(0);
  });

  it('list message contains package name', () => {
    const result = cmd.run({ subcommand: 'list', packageName: '@o/special' });
    expect(result.message).toContain('@o/special');
  });
});

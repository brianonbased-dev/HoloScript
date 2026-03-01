/**
 * Tests for PackageScopeEnforcer and PackagePermissionManifest
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  PackageTier,
  PACKAGE_PERMISSION_MANIFEST,
  PACKAGE_PERMISSIONS_BY_NAME,
  getPackagesByTier,
  getWritablePackages,
  getSecretHandlingPackages,
  getNetworkAccessPackages,
  getManifestSummary,
} from '../PackagePermissionManifest';
import {
  PackageScopeEnforcer,
  resetScopeEnforcer,
} from '../PackageScopeEnforcer';
import { AgentRole } from '../AgentIdentity';

describe('PackagePermissionManifest', () => {
  it('should contain all expected packages (38+)', () => {
    expect(PACKAGE_PERMISSION_MANIFEST.length).toBeGreaterThanOrEqual(38);
  });

  it('should have unique package names', () => {
    const names = PACKAGE_PERMISSION_MANIFEST.map((p) => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });

  it('should have unique package paths', () => {
    const paths = PACKAGE_PERMISSION_MANIFEST.map((p) => p.path);
    const uniquePaths = new Set(paths);
    expect(uniquePaths.size).toBe(paths.length);
  });

  it('should classify core as CRITICAL tier', () => {
    const core = PACKAGE_PERMISSIONS_BY_NAME.get('core');
    expect(core).toBeDefined();
    expect(core!.tier).toBe(PackageTier.CRITICAL);
  });

  it('should classify security-sandbox as CRITICAL tier', () => {
    const sandbox = PACKAGE_PERMISSIONS_BY_NAME.get('security-sandbox');
    expect(sandbox).toBeDefined();
    expect(sandbox!.tier).toBe(PackageTier.CRITICAL);
  });

  it('should only allow ORCHESTRATOR to write to CRITICAL packages', () => {
    const criticalPkgs = getPackagesByTier(PackageTier.CRITICAL);
    expect(criticalPkgs.length).toBeGreaterThan(0);
    for (const pkg of criticalPkgs) {
      expect(pkg.writeRoles).toEqual([AgentRole.ORCHESTRATOR]);
    }
  });

  it('should allow all roles to read all packages', () => {
    const allRoles = Object.values(AgentRole);
    for (const pkg of PACKAGE_PERMISSION_MANIFEST) {
      for (const role of allRoles) {
        expect(pkg.readRoles).toContain(role);
      }
    }
  });

  it('should identify secret-handling packages', () => {
    const secretPkgs = getSecretHandlingPackages();
    expect(secretPkgs.length).toBeGreaterThan(0);
    const names = secretPkgs.map((p) => p.name);
    expect(names).toContain('mcp-server');
    expect(names).toContain('partner-sdk');
    expect(names).toContain('llm-provider');
  });

  it('should identify network-access packages', () => {
    const networkPkgs = getNetworkAccessPackages();
    expect(networkPkgs.length).toBeGreaterThan(0);
  });

  it('should return correct writable packages for SYNTAX_ANALYZER', () => {
    const writable = getWritablePackages(AgentRole.SYNTAX_ANALYZER);
    // SYNTAX_ANALYZER can only write to LOW tier packages
    for (const pkg of writable) {
      expect(pkg.tier).toBe(PackageTier.LOW);
    }
  });

  it('should return correct writable packages for ORCHESTRATOR', () => {
    const writable = getWritablePackages(AgentRole.ORCHESTRATOR);
    // ORCHESTRATOR can write to ALL packages
    expect(writable.length).toBe(PACKAGE_PERMISSION_MANIFEST.length);
  });

  it('should produce valid manifest summary', () => {
    const summary = getManifestSummary();
    expect(summary.total).toBe(PACKAGE_PERMISSION_MANIFEST.length);
    expect(summary.byTier[PackageTier.CRITICAL]).toBeGreaterThan(0);
    expect(summary.withFsWrites).toBeGreaterThan(0);
    expect(summary.withNetwork).toBeGreaterThan(0);
    expect(summary.withSecrets).toBeGreaterThan(0);
  });

  it('should enforce tier hierarchy (CRITICAL < HIGH < STANDARD < LOW)', () => {
    const criticalWriteRoles = getPackagesByTier(PackageTier.CRITICAL)[0]?.writeRoles.length ?? 0;
    const highWriteRoles = getPackagesByTier(PackageTier.HIGH)[0]?.writeRoles.length ?? 0;
    const standardWriteRoles = getPackagesByTier(PackageTier.STANDARD)[0]?.writeRoles.length ?? 0;
    const lowWriteRoles = getPackagesByTier(PackageTier.LOW)[0]?.writeRoles.length ?? 0;

    expect(criticalWriteRoles).toBeLessThan(highWriteRoles);
    expect(highWriteRoles).toBeLessThan(standardWriteRoles);
    expect(standardWriteRoles).toBeLessThan(lowWriteRoles);
  });
});

describe('PackageScopeEnforcer', () => {
  // Note: Full integration tests require a token issuer setup.
  // These are structural tests that verify the enforcer's resolution logic.

  let enforcer: PackageScopeEnforcer;

  beforeEach(() => {
    resetScopeEnforcer();
    enforcer = new PackageScopeEnforcer({
      repositoryRoot: '/repo/HoloScript',
      enableAudit: true,
    });
  });

  afterEach(() => {
    resetScopeEnforcer();
  });

  it('should resolve core package from file path', () => {
    const pkg = enforcer.resolvePackage('/repo/HoloScript/packages/core/src/parser.ts');
    expect(pkg).toBeDefined();
    expect(pkg!.name).toBe('core');
    expect(pkg!.tier).toBe(PackageTier.CRITICAL);
  });

  it('should resolve security-sandbox package', () => {
    const pkg = enforcer.resolvePackage('/repo/HoloScript/packages/security-sandbox/src/index.ts');
    expect(pkg).toBeDefined();
    expect(pkg!.name).toBe('security-sandbox');
  });

  it('should resolve benchmark package as LOW tier', () => {
    const pkg = enforcer.resolvePackage('/repo/HoloScript/packages/benchmark/src/bench.ts');
    expect(pkg).toBeDefined();
    expect(pkg!.tier).toBe(PackageTier.LOW);
  });

  it('should return null for paths outside repository', () => {
    const pkg = enforcer.resolvePackage('/other/project/src/file.ts');
    expect(pkg).toBeNull();
  });

  it('should return null for paths not matching any package', () => {
    const pkg = enforcer.resolvePackage('/repo/HoloScript/scripts/util.ts');
    expect(pkg).toBeNull();
  });

  it('should return writable packages for SYNTAX_ANALYZER (LOW only)', () => {
    const writable = enforcer.getWritablePackagesForRole(AgentRole.SYNTAX_ANALYZER);
    for (const pkg of writable) {
      expect(pkg.tier).toBe(PackageTier.LOW);
    }
  });

  it('should return all packages as writable for ORCHESTRATOR', () => {
    const writable = enforcer.getWritablePackagesForRole(AgentRole.ORCHESTRATOR);
    expect(writable.length).toBe(PACKAGE_PERMISSION_MANIFEST.length);
  });
});

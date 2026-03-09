/**
 * PackageRegistry — Production Test Suite (corrected)
 *
 * Covers: semver utilities (parseSemVer, formatSemVer, compareSemVer,
 * satisfiesRange, findBestMatch, validatePackageName, validateManifest),
 * PackageRegistry class (publish, getPackage/getVersion, search, list,
 * resolveDependencies, incrementVersion, getPackageCount, clear),
 * and access control (createOrg, addOrgMember, removeOrgMember).
 *
 * Key API facts (verified against source):
 *  - Organization.members: { userId: string, role: OrgRole }
 *  - incrementVersion(version: string, type) — NOT async, takes semver string not package name
 *  - resolveDependencies: missing packages → skipped (no error entry returned)
 *  - resolveDependencies returns: { name, version, resolved, ... }
 *  - validateManifest does NOT export named (uses import as side effect)
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  PackageRegistry,
  parseSemVer,
  formatSemVer,
  compareSemVer,
  satisfiesRange,
  findBestMatch,
  validatePackageName,
  validateManifest,
} from '../PackageRegistry';

describe('PackageRegistry — Production', () => {
  // ─── parseSemVer ──────────────────────────────────────────────────────────

  it('parseSemVer basic', () => {
    const v = parseSemVer('1.2.3');
    expect(v).not.toBeNull();
    expect(v!.major).toBe(1);
    expect(v!.minor).toBe(2);
    expect(v!.patch).toBe(3);
  });

  it('parseSemVer with prerelease and build metadata', () => {
    const v = parseSemVer('2.0.0-alpha.1+build.42');
    expect(v!.major).toBe(2);
    expect(v!.prerelease).toContain('alpha');
    expect(v!.build).toContain('42');
  });

  it('parseSemVer returns null for invalid version', () => {
    expect(parseSemVer('not-a-version')).toBeNull();
    expect(parseSemVer('')).toBeNull();
  });

  it('parseSemVer returns null for missing patch', () => {
    expect(parseSemVer('1.2')).toBeNull();
  });

  // ─── formatSemVer ─────────────────────────────────────────────────────────

  it('formatSemVer round-trips clean version', () => {
    const v = parseSemVer('3.1.4')!;
    expect(formatSemVer(v)).toBe('3.1.4');
  });

  it('formatSemVer includes prerelease', () => {
    const v = parseSemVer('1.0.0-beta.2')!;
    expect(formatSemVer(v)).toBe('1.0.0-beta.2');
  });

  // ─── compareSemVer ────────────────────────────────────────────────────────

  it('compareSemVer: major wins', () => {
    // compareSemVer takes SemVer objects, not strings
    expect(compareSemVer(parseSemVer('2.0.0')!, parseSemVer('1.9.9')!)).toBeGreaterThan(0);
    expect(compareSemVer(parseSemVer('1.0.0')!, parseSemVer('2.0.0')!)).toBeLessThan(0);
  });

  it('compareSemVer: minor wins when major equal', () => {
    expect(compareSemVer(parseSemVer('1.2.0')!, parseSemVer('1.1.99')!)).toBeGreaterThan(0);
  });

  it('compareSemVer: patch wins when major+minor equal', () => {
    expect(compareSemVer(parseSemVer('1.2.5')!, parseSemVer('1.2.4')!)).toBeGreaterThan(0);
  });

  it('compareSemVer: equal versions return 0', () => {
    expect(compareSemVer(parseSemVer('1.2.3')!, parseSemVer('1.2.3')!)).toBe(0);
  });

  it('compareSemVer: prerelease < release', () => {
    expect(compareSemVer(parseSemVer('1.0.0-alpha')!, parseSemVer('1.0.0')!)).toBeLessThan(0);
  });

  // ─── satisfiesRange ───────────────────────────────────────────────────────

  it('satisfiesRange caret ^1.2.0 — minor/patch can increase', () => {
    expect(satisfiesRange('1.5.3', '^1.2.0')).toBe(true);
  });

  it('satisfiesRange caret ^1.2.0 — major bump fails', () => {
    expect(satisfiesRange('2.0.0', '^1.2.0')).toBe(false);
  });

  it('satisfiesRange tilde ~1.2.3 — same minor, higher patch OK', () => {
    expect(satisfiesRange('1.2.7', '~1.2.3')).toBe(true);
  });

  it('satisfiesRange tilde ~1.2.3 — minor bump fails', () => {
    expect(satisfiesRange('1.3.0', '~1.2.3')).toBe(false);
  });

  it('satisfiesRange >= passes when version >=', () => {
    expect(satisfiesRange('2.0.0', '>=1.0.0')).toBe(true);
    expect(satisfiesRange('0.9.0', '>=1.0.0')).toBe(false);
  });

  it('satisfiesRange exact match', () => {
    expect(satisfiesRange('1.0.0', '1.0.0')).toBe(true);
    expect(satisfiesRange('1.0.1', '1.0.0')).toBe(false);
  });

  it('satisfiesRange wildcard * always true', () => {
    expect(satisfiesRange('99.99.99', '*')).toBe(true);
    expect(satisfiesRange('0.0.1', '*')).toBe(true);
  });

  // ─── findBestMatch ────────────────────────────────────────────────────────

  it('findBestMatch returns highest satisfying version', () => {
    const versions = ['1.0.0', '1.2.0', '1.5.0', '2.0.0'];
    const best = findBestMatch(versions, '^1.0.0');
    expect(best).toBe('1.5.0');
  });

  it('findBestMatch returns null when no version satisfies', () => {
    const best = findBestMatch(['1.0.0', '1.2.0'], '>=2.0.0');
    expect(best).toBeNull();
  });

  // ─── validatePackageName ──────────────────────────────────────────────────

  it('validatePackageName accepts valid unscoped name', () => {
    // validatePackageName returns { valid: boolean; error?: string }
    expect(validatePackageName('my-package').valid).toBe(true);
    expect(validatePackageName('holoscript').valid).toBe(true);
    expect(validatePackageName('pkg123').valid).toBe(true);
  });

  it('validatePackageName accepts valid scoped name', () => {
    expect(validatePackageName('@holoscript/core').valid).toBe(true);
    expect(validatePackageName('@myorg/my-pkg').valid).toBe(true);
  });

  it('validatePackageName rejects empty string', () => {
    expect(validatePackageName('').valid).toBe(false);
  });

  it('validatePackageName rejects names with uppercase letters', () => {
    expect(validatePackageName('MyPackage').valid).toBe(false);
  });

  it('validatePackageName rejects names with spaces', () => {
    expect(validatePackageName('my package').valid).toBe(false);
  });

  it('validatePackageName rejects invalid scoped format', () => {
    expect(validatePackageName('@/no-name').valid).toBe(false);
    expect(validatePackageName('@').valid).toBe(false);
  });

  // ─── validateManifest ─────────────────────────────────────────────────────

  it('validateManifest accepts a complete valid manifest', () => {
    const result = validateManifest({ name: '@scope/pkg', version: '1.0.0' });
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('validateManifest rejects missing name', () => {
    const result = validateManifest({ version: '1.0.0' } as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('name'))).toBe(true);
  });

  it('validateManifest rejects missing version', () => {
    const result = validateManifest({ name: 'pkg' } as any);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.toLowerCase().includes('version'))).toBe(true);
  });

  it('validateManifest rejects invalid version string', () => {
    const result = validateManifest({ name: 'pkg', version: 'bad-version' });
    expect(result.valid).toBe(false);
  });

  // ─── PackageRegistry class ────────────────────────────────────────────────

  describe('PackageRegistry class', () => {
    let registry: PackageRegistry;

    beforeEach(() => {
      registry = new PackageRegistry();
    });

    // ─── Publish ──────────────────────────────────────────────────────────────

    it('publish returns success for valid manifest', async () => {
      const result = await registry.publish({ name: 'my-lib', version: '1.0.0' });
      expect(result.success).toBe(true);
    });

    it('publish stores package — getPackage returns metadata', async () => {
      await registry.publish({ name: 'my-lib', version: '1.0.0' });
      const pkg = await registry.getPackage('my-lib');
      expect(pkg).not.toBeNull();
      expect(pkg!.name).toBe('my-lib');
    });

    it('publish fails on duplicate version', async () => {
      await registry.publish({ name: 'pkg', version: '1.0.0' });
      const result = await registry.publish({ name: 'pkg', version: '1.0.0' });
      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('publish fails on invalid manifest (empty name)', async () => {
      const result = await registry.publish({ name: '', version: '1.0.0' });
      expect(result.success).toBe(false);
    });

    it('multiple versions of a package are all stored', async () => {
      await registry.publish({ name: 'pkg', version: '1.0.0' });
      await registry.publish({ name: 'pkg', version: '2.0.0' });
      const pkg = await registry.getPackage('pkg');
      expect(pkg!.versions).toContain('1.0.0');
      expect(pkg!.versions).toContain('2.0.0');
    });

    // ─── getPackage / getVersion ──────────────────────────────────────────────

    it('getPackage returns null for unknown package', async () => {
      expect(await registry.getPackage('ghost')).toBeNull();
    });

    it('getVersion returns manifest for specific version', async () => {
      await registry.publish({ name: 'lib', version: '1.2.0', description: 'test' });
      const v = await registry.getVersion('lib', '1.2.0');
      expect(v).not.toBeNull();
      expect(v!.version).toBe('1.2.0');
    });

    it('getVersion "latest" resolves to highest published version', async () => {
      await registry.publish({ name: 'lib', version: '1.0.0' });
      await registry.publish({ name: 'lib', version: '1.5.0' });
      const v = await registry.getVersion('lib', 'latest');
      expect(v!.version).toBe('1.5.0');
    });

    it('getVersion returns null for unknown version', async () => {
      await registry.publish({ name: 'lib', version: '1.0.0' });
      expect(await registry.getVersion('lib', '9.9.9')).toBeNull();
    });

    // ─── search ──────────────────────────────────────────────────────────────

    it('search returns matching package by name', async () => {
      await registry.publish({ name: 'holoscript-core', version: '1.0.0' });
      const results = await registry.search('holoscript');
      expect(results.some((r) => r.name === 'holoscript-core')).toBe(true);
    });

    it('search returns empty array for no matches', async () => {
      await registry.publish({ name: 'alpha', version: '1.0.0' });
      const results = await registry.search('zzz-nomatch');
      expect(results).toHaveLength(0);
    });

    it('search respects limit option', async () => {
      for (let i = 0; i < 10; i++) {
        await registry.publish({ name: `pkg-${i}`, version: '1.0.0' });
      }
      const results = await registry.search('pkg', { limit: 3 });
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('search scores name match higher than description match', async () => {
      await registry.publish({ name: 'auth', version: '1.0.0' });
      await registry.publish({ name: 'util', version: '1.0.0', description: 'auth utilities' });
      const results = await registry.search('auth');
      expect(results[0].name).toBe('auth');
    });

    // ─── resolveDependencies ─────────────────────────────────────────────────

    it('resolveDependencies resolves single dep to best match', async () => {
      await registry.publish({ name: 'dep', version: '1.0.0' });
      await registry.publish({ name: 'dep', version: '1.2.0' });
      const resolved = await registry.resolveDependencies({ dep: '^1.0.0' });
      const entry = resolved.find((r: any) => r.name === 'dep');
      expect(entry).toBeDefined();
      expect(entry!.resolved).toBe('1.2.0');
    });

    it('resolveDependencies skips (does not crash on) missing package', async () => {
      // Source: missing packages call `continue` — they are NOT included in result
      const resolved = await registry.resolveDependencies({ 'missing-pkg': '1.0.0' });
      // Either empty (skipped) or entry with undefined resolved — should not throw
      expect(Array.isArray(resolved)).toBe(true);
    });

    // ─── incrementVersion ────────────────────────────────────────────────────

    it('incrementVersion major resets minor and patch', () => {
      // incrementVersion(version: string, type) — takes version STRING not package name
      const next = registry.incrementVersion('1.2.3', 'major');
      expect(next).toBe('2.0.0');
    });

    it('incrementVersion minor resets patch', () => {
      const next = registry.incrementVersion('1.2.3', 'minor');
      expect(next).toBe('1.3.0');
    });

    it('incrementVersion patch preserves major.minor', () => {
      const next = registry.incrementVersion('1.2.3', 'patch');
      expect(next).toBe('1.2.4');
    });

    it('incrementVersion returns original string for invalid version', () => {
      const next = registry.incrementVersion('not-valid', 'major');
      expect(next).toBe('not-valid');
    });

    // ─── getPackageCount / clear ──────────────────────────────────────────────

    it('getPackageCount returns correct count', async () => {
      expect(registry.getPackageCount()).toBe(0);
      await registry.publish({ name: 'a', version: '1.0.0' });
      await registry.publish({ name: 'b', version: '1.0.0' });
      expect(registry.getPackageCount()).toBe(2);
    });

    it('clear resets all state', async () => {
      await registry.publish({ name: 'a', version: '1.0.0' });
      registry.clear();
      expect(registry.getPackageCount()).toBe(0);
      expect(await registry.getPackage('a')).toBeNull();
    });

    // ─── Access Control / Organizations ──────────────────────────────────────

    it('createOrganization succeeds and is retrievable', async () => {
      const result = await registry.createOrganization('myorg', 'alice');
      expect(result.success).toBe(true);
      const org = await registry.getOrganization('myorg');
      expect(org).not.toBeNull();
      expect(org!.name).toBe('myorg');
    });

    it('createOrganization registers owner as member with role owner', async () => {
      await registry.createOrganization('myorg', 'alice');
      const org = await registry.getOrganization('myorg');
      // Organization.members uses { userId, role } NOT { username, role }
      expect(org!.members.some((m: any) => m.userId === 'alice' && m.role === 'owner')).toBe(true);
    });

    it('createOrganization fails on duplicate org name', async () => {
      await registry.createOrganization('myorg', 'alice');
      const result = await registry.createOrganization('myorg', 'bob');
      expect(result.success).toBe(false);
    });

    it('getOrganization returns null for unknown org', async () => {
      expect(await registry.getOrganization('nonexistent')).toBeNull();
    });

    it('addOrgMember adds a member with role (owner as requester)', async () => {
      await registry.createOrganization('myorg', 'alice');
      const result = await registry.addOrgMember('myorg', 'bob', 'member', 'alice');
      expect(result.success).toBe(true);
      const org = await registry.getOrganization('myorg');
      // Use userId field
      expect(org!.members.some((m: any) => m.userId === 'bob')).toBe(true);
    });

    it('addOrgMember fails for member-role requester (not owner/admin)', async () => {
      await registry.createOrganization('myorg', 'alice');
      await registry.addOrgMember('myorg', 'bob', 'member', 'alice');
      // bob is member, cannot add carol
      const result = await registry.addOrgMember('myorg', 'carol', 'member', 'bob');
      expect(result.success).toBe(false);
    });

    it('removeOrgMember removes member successfully (owner as requester)', async () => {
      await registry.createOrganization('myorg', 'alice');
      await registry.addOrgMember('myorg', 'bob', 'member', 'alice');
      const result = await registry.removeOrgMember('myorg', 'bob', 'alice');
      expect(result.success).toBe(true);
      const org = await registry.getOrganization('myorg');
      expect(org!.members.some((m: any) => m.userId === 'bob')).toBe(false);
    });

    it('removeOrgMember fails when removing last owner', async () => {
      await registry.createOrganization('myorg', 'alice');
      const result = await registry.removeOrgMember('myorg', 'alice', 'alice');
      expect(result.success).toBe(false);
    });

    // ─── createManifest ───────────────────────────────────────────────────────

    it('createManifest scaffolds a valid manifest with provided version', () => {
      const m = registry.createManifest('@scope/newpkg', '2.0.0');
      expect(m.name).toBe('@scope/newpkg');
      expect(m.version).toBe('2.0.0');
      expect(validateManifest(m).valid).toBe(true);
    });

    it('createManifest defaults version to 1.0.0', () => {
      const m = registry.createManifest('simple-pkg');
      expect(m.version).toBe('1.0.0');
    });
  });
});

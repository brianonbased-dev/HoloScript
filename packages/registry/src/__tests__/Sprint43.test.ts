/**
 * Sprint 43 — @holoscript/registry acceptance tests
 * Covers: LocalRegistry (publish, getPackage, getVersion, list, search,
 *         recordDownload, unpublish, unpublishVersion, size),
 *         PackageResolver (resolve, satisfies, getMatchingVersions),
 *         PackageManifest/PackageVersion type shapes
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { LocalRegistry } from '../LocalRegistry.js';
import { PackageResolver } from '../PackageResolver.js';

// ═══════════════════════════════════════════════
// LocalRegistry — publish
// ═══════════════════════════════════════════════
describe('LocalRegistry — publish', () => {
  let reg: LocalRegistry;

  beforeEach(() => {
    reg = new LocalRegistry();
  });

  it('publishes a new package and returns manifest', () => {
    const m = reg.publish({ name: '@test/pkg', version: '1.0.0', content: 'code' });
    expect(m.name).toBe('@test/pkg');
    expect(m.latest).toBe('1.0.0');
  });

  it('manifest has versions array with one entry', () => {
    const m = reg.publish({ name: 'pkg', version: '0.1.0', content: 'x' });
    expect(m.versions).toHaveLength(1);
    expect(m.versions[0]!.version).toBe('0.1.0');
  });

  it('checksum is a non-empty string', () => {
    const m = reg.publish({ name: 'pkg', version: '1.0.0', content: 'hello' });
    expect(typeof m.versions[0]!.checksum).toBe('string');
    expect(m.versions[0]!.checksum.length).toBeGreaterThan(0);
  });

  it('publishedAt is an ISO timestamp', () => {
    const m = reg.publish({ name: 'pkg', version: '1.0.0', content: 'c' });
    const ts = m.versions[0]!.publishedAt;
    expect(typeof ts).toBe('string');
    expect(new Date(ts).getTime()).toBeGreaterThan(0);
  });

  it('publishes additional version to existing package', () => {
    reg.publish({ name: 'pkg', version: '1.0.0', content: 'v1' });
    const m = reg.publish({ name: 'pkg', version: '1.1.0', content: 'v2' });
    expect(m.versions).toHaveLength(2);
    expect(m.latest).toBe('1.1.0');
  });

  it('throws on duplicate version', () => {
    reg.publish({ name: 'pkg', version: '1.0.0', content: 'a' });
    expect(() => reg.publish({ name: 'pkg', version: '1.0.0', content: 'b' })).toThrow();
  });

  it('stores description and author', () => {
    const m = reg.publish({
      name: 'pkg',
      version: '1.0.0',
      content: 'c',
      description: 'A test package',
      author: 'Alice',
    });
    expect(m.description).toBe('A test package');
    expect(m.author).toBe('Alice');
  });

  it('stores tags', () => {
    const m = reg.publish({ name: 'pkg', version: '1.0.0', content: 'c', tags: ['xr', 'ar'] });
    expect(m.tags).toContain('xr');
    expect(m.tags).toContain('ar');
  });
});

// ═══════════════════════════════════════════════
// LocalRegistry — getPackage / getVersion
// ═══════════════════════════════════════════════
describe('LocalRegistry — getPackage / getVersion', () => {
  let reg: LocalRegistry;

  beforeEach(() => {
    reg = new LocalRegistry();
    reg.publish({ name: 'pkg-a', version: '1.0.0', content: 'v1' });
    reg.publish({ name: 'pkg-a', version: '2.0.0', content: 'v2' });
  });

  it('getPackage returns manifest for existing package', () => {
    const m = reg.getPackage('pkg-a');
    expect(m).toBeDefined();
    expect(m!.name).toBe('pkg-a');
  });

  it('getPackage returns undefined for unknown package', () => {
    expect(reg.getPackage('no-such-pkg')).toBeUndefined();
  });

  it('getVersion returns correct version', () => {
    const v = reg.getVersion('pkg-a', '1.0.0');
    expect(v).toBeDefined();
    expect(v!.version).toBe('1.0.0');
  });

  it('getVersion returns undefined for unknown version', () => {
    expect(reg.getVersion('pkg-a', '9.9.9')).toBeUndefined();
  });

  it('getVersion returns undefined for unknown package', () => {
    expect(reg.getVersion('no-pkg', '1.0.0')).toBeUndefined();
  });
});

// ═══════════════════════════════════════════════
// LocalRegistry — list / search
// ═══════════════════════════════════════════════
describe('LocalRegistry — list / search', () => {
  let reg: LocalRegistry;

  beforeEach(() => {
    reg = new LocalRegistry();
    reg.publish({
      name: 'physics-engine',
      version: '1.0.0',
      content: 'c',
      tags: ['physics'],
      description: 'Physics engine',
    });
    reg.publish({ name: 'audio-fx', version: '2.0.0', content: 'c', tags: ['audio'] });
    reg.publish({ name: 'xr-toolkit', version: '1.5.0', content: 'c', tags: ['xr', 'vr'] });
  });

  it('list returns all packages', () => {
    expect(reg.list()).toHaveLength(3);
  });

  it('list with tag filters by tag', () => {
    const physics = reg.list('physics');
    expect(physics).toHaveLength(1);
    expect(physics[0]!.name).toBe('physics-engine');
  });

  it('list returns SearchResult shape', () => {
    const results = reg.list();
    for (const r of results) {
      expect(r).toHaveProperty('name');
      expect(r).toHaveProperty('latest');
      expect(r).toHaveProperty('downloads');
    }
  });

  it('search finds by name substring', () => {
    const results = reg.search('audio');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('audio-fx');
  });

  it('search finds by description', () => {
    const results = reg.search('Physics engine');
    expect(results.length).toBeGreaterThan(0);
  });

  it('search returns empty for no match', () => {
    expect(reg.search('zzz-no-match')).toHaveLength(0);
  });

  it('search is case-insensitive', () => {
    const results = reg.search('PHYSICS');
    expect(results.length).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════
// LocalRegistry — recordDownload / unpublish
// ═══════════════════════════════════════════════
describe('LocalRegistry — recordDownload / unpublish', () => {
  let reg: LocalRegistry;

  beforeEach(() => {
    reg = new LocalRegistry();
    reg.publish({ name: 'pkg', version: '1.0.0', content: 'c' });
  });

  it('recordDownload increments download count', () => {
    reg.recordDownload('pkg');
    const m = reg.getPackage('pkg');
    expect(m!.downloads).toBe(1);
  });

  it('recordDownload multiple times cumulates', () => {
    reg.recordDownload('pkg');
    reg.recordDownload('pkg');
    reg.recordDownload('pkg');
    expect(reg.getPackage('pkg')!.downloads).toBe(3);
  });

  it('unpublish removes the package', () => {
    expect(reg.unpublish('pkg')).toBe(true);
    expect(reg.getPackage('pkg')).toBeUndefined();
  });

  it('unpublish returns false for unknown package', () => {
    expect(reg.unpublish('no-pkg')).toBe(false);
  });

  it('unpublishVersion removes specific version', () => {
    reg.publish({ name: 'pkg', version: '2.0.0', content: 'v2' });
    expect(reg.unpublishVersion('pkg', '1.0.0')).toBe(true);
    expect(reg.getVersion('pkg', '1.0.0')).toBeUndefined();
    expect(reg.getVersion('pkg', '2.0.0')).toBeDefined();
  });

  it('unpublishVersion returns false for unknown version', () => {
    expect(reg.unpublishVersion('pkg', '9.0.0')).toBe(false);
  });

  it('size returns correct count', () => {
    expect(reg.size).toBe(1);
    reg.publish({ name: 'pkg2', version: '1.0.0', content: 'c' });
    expect(reg.size).toBe(2);
  });
});

// ═══════════════════════════════════════════════
// PackageResolver — satisfies
// ═══════════════════════════════════════════════
describe('PackageResolver — satisfies', () => {
  let reg: LocalRegistry;
  let resolver: PackageResolver;

  beforeEach(() => {
    reg = new LocalRegistry();
    resolver = new PackageResolver(reg);
  });

  it('* matches any version', () => {
    expect(resolver.satisfies('1.0.0', '*')).toBe(true);
    expect(resolver.satisfies('9.9.9', '*')).toBe(true);
  });

  it('exact version matches itself', () => {
    expect(resolver.satisfies('1.2.3', '1.2.3')).toBe(true);
  });

  it('exact version does not match different version', () => {
    expect(resolver.satisfies('1.2.3', '1.2.4')).toBe(false);
  });

  it('^ range matches same major, higher minor', () => {
    expect(resolver.satisfies('1.5.0', '^1.0.0')).toBe(true);
  });

  it('^ range rejects different major', () => {
    expect(resolver.satisfies('2.0.0', '^1.0.0')).toBe(false);
  });

  it('~ range matches same major.minor, higher patch', () => {
    expect(resolver.satisfies('1.2.5', '~1.2.0')).toBe(true);
  });

  it('~ range rejects different minor', () => {
    expect(resolver.satisfies('1.3.0', '~1.2.0')).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// PackageResolver — resolve / getMatchingVersions
// ═══════════════════════════════════════════════
describe('PackageResolver — resolve / getMatchingVersions', () => {
  let reg: LocalRegistry;
  let resolver: PackageResolver;

  beforeEach(() => {
    reg = new LocalRegistry();
    reg.publish({ name: 'pkg', version: '1.0.0', content: 'v1' });
    reg.publish({ name: 'pkg', version: '1.1.0', content: 'v2' });
    reg.publish({ name: 'pkg', version: '2.0.0', content: 'v3' });
    resolver = new PackageResolver(reg);
  });

  it('resolve returns a PackageVersion for existing range', () => {
    const v = resolver.resolve('pkg', '^1.0.0');
    expect(v).not.toBeNull();
    expect(v!.version).toBeDefined();
  });

  it('resolve returns null for unknown package', () => {
    expect(resolver.resolve('no-pkg', '*')).toBeNull();
  });

  it('resolve returns null for unmatched range', () => {
    expect(resolver.resolve('pkg', '3.0.0')).toBeNull();
  });

  it('getMatchingVersions returns all versions matching ^1', () => {
    const versions = resolver.getMatchingVersions('pkg', '^1.0.0');
    expect(versions.length).toBeGreaterThan(0);
    for (const v of versions) {
      expect(v.version.startsWith('1.')).toBe(true);
    }
  });

  it('getMatchingVersions returns empty for unknown package', () => {
    expect(resolver.getMatchingVersions('no-pkg', '*')).toHaveLength(0);
  });

  it('getMatchingVersions with * returns latest', () => {
    const versions = resolver.getMatchingVersions('pkg', '*');
    expect(versions).toHaveLength(1);
    expect(versions[0]!.version).toBe('2.0.0');
  });
});

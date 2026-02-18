import { describe, it, expect, beforeEach } from 'vitest';
import { LocalRegistry } from '../LocalRegistry.js';
import { PackageResolver } from '../PackageResolver.js';

describe('LocalRegistry', () => {
  let registry: LocalRegistry;

  beforeEach(() => {
    registry = new LocalRegistry();
  });

  it('publishes a new package', () => {
    const manifest = registry.publish({ name: 'my-pkg', version: '1.0.0', content: 'hello' });
    expect(manifest.name).toBe('my-pkg');
    expect(manifest.latest).toBe('1.0.0');
    expect(manifest.versions).toHaveLength(1);
    expect(manifest.versions[0]!.version).toBe('1.0.0');
    expect(manifest.versions[0]!.checksum).toBeTruthy();
  });

  it('publishes new version to existing package', () => {
    registry.publish({ name: 'my-pkg', version: '1.0.0', content: 'v1' });
    const manifest = registry.publish({ name: 'my-pkg', version: '1.1.0', content: 'v2' });
    expect(manifest.versions).toHaveLength(2);
    expect(manifest.latest).toBe('1.1.0');
  });

  it('throws if duplicate version published', () => {
    registry.publish({ name: 'my-pkg', version: '1.0.0', content: 'v1' });
    expect(() => registry.publish({ name: 'my-pkg', version: '1.0.0', content: 'dup' })).toThrow('already exists');
  });

  it('getPackage returns manifest when found', () => {
    registry.publish({ name: 'pkg-a', version: '2.0.0', content: 'data' });
    const result = registry.getPackage('pkg-a');
    expect(result).toBeDefined();
    expect(result!.name).toBe('pkg-a');
  });

  it('getPackage returns undefined when not found', () => {
    expect(registry.getPackage('nonexistent')).toBeUndefined();
  });

  it('getVersion returns correct version when found', () => {
    registry.publish({ name: 'pkg-b', version: '1.0.0', content: 'v1' });
    registry.publish({ name: 'pkg-b', version: '2.0.0', content: 'v2' });
    const v = registry.getVersion('pkg-b', '1.0.0');
    expect(v).toBeDefined();
    expect(v!.version).toBe('1.0.0');
  });

  it('getVersion returns undefined when version not found', () => {
    registry.publish({ name: 'pkg-b', version: '1.0.0', content: 'v1' });
    expect(registry.getVersion('pkg-b', '9.9.9')).toBeUndefined();
  });

  it('getVersion returns undefined for unknown package', () => {
    expect(registry.getVersion('unknown', '1.0.0')).toBeUndefined();
  });

  it('list returns all packages', () => {
    registry.publish({ name: 'alpha', version: '1.0.0', content: 'a' });
    registry.publish({ name: 'beta', version: '1.0.0', content: 'b' });
    const results = registry.list();
    expect(results).toHaveLength(2);
    expect(results.map((r) => r.name).sort()).toEqual(['alpha', 'beta']);
  });

  it('list filters by tag', () => {
    registry.publish({ name: 'vr-pkg', version: '1.0.0', tags: ['vr'], content: 'a' });
    registry.publish({ name: 'ui-pkg', version: '1.0.0', tags: ['ui'], content: 'b' });
    const results = registry.list('vr');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('vr-pkg');
  });

  it('search finds by name', () => {
    registry.publish({ name: 'holo-render', version: '1.0.0', content: 'r' });
    registry.publish({ name: 'holo-audio', version: '1.0.0', content: 'a' });
    const results = registry.search('render');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('holo-render');
  });

  it('search finds by description', () => {
    registry.publish({ name: 'pkg-x', version: '1.0.0', description: 'audio engine', content: 'x' });
    registry.publish({ name: 'pkg-y', version: '1.0.0', description: 'shader toolkit', content: 'y' });
    const results = registry.search('audio');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('pkg-x');
  });

  it('search finds by tag', () => {
    registry.publish({ name: 'pkg-z', version: '1.0.0', tags: ['physics'], content: 'z' });
    registry.publish({ name: 'pkg-w', version: '1.0.0', tags: ['rendering'], content: 'w' });
    const results = registry.search('physics');
    expect(results).toHaveLength(1);
    expect(results[0]!.name).toBe('pkg-z');
  });

  it('recordDownload increments download count', () => {
    registry.publish({ name: 'dl-pkg', version: '1.0.0', content: 'data' });
    registry.recordDownload('dl-pkg');
    registry.recordDownload('dl-pkg');
    const manifest = registry.getPackage('dl-pkg');
    expect(manifest!.downloads).toBe(2);
  });

  it('unpublish removes the package entirely', () => {
    registry.publish({ name: 'rm-pkg', version: '1.0.0', content: 'data' });
    expect(registry.unpublish('rm-pkg')).toBe(true);
    expect(registry.getPackage('rm-pkg')).toBeUndefined();
  });

  it('unpublish returns false for nonexistent package', () => {
    expect(registry.unpublish('ghost')).toBe(false);
  });

  it('unpublishVersion removes specific version', () => {
    registry.publish({ name: 'ver-pkg', version: '1.0.0', content: 'v1' });
    registry.publish({ name: 'ver-pkg', version: '1.1.0', content: 'v1.1' });
    expect(registry.unpublishVersion('ver-pkg', '1.0.0')).toBe(true);
    expect(registry.getVersion('ver-pkg', '1.0.0')).toBeUndefined();
    expect(registry.getVersion('ver-pkg', '1.1.0')).toBeDefined();
  });

  it('unpublishVersion returns false for nonexistent package', () => {
    expect(registry.unpublishVersion('ghost', '1.0.0')).toBe(false);
  });

  it('unpublishVersion returns false for nonexistent version', () => {
    registry.publish({ name: 'ver-pkg2', version: '1.0.0', content: 'v1' });
    expect(registry.unpublishVersion('ver-pkg2', '9.9.9')).toBe(false);
  });

  it('size reflects number of packages', () => {
    expect(registry.size).toBe(0);
    registry.publish({ name: 'a', version: '1.0.0', content: 'a' });
    registry.publish({ name: 'b', version: '1.0.0', content: 'b' });
    expect(registry.size).toBe(2);
  });

  it('clear removes all packages', () => {
    registry.publish({ name: 'a', version: '1.0.0', content: 'a' });
    registry.clear();
    expect(registry.size).toBe(0);
    expect(registry.list()).toHaveLength(0);
  });
}); 

describe('PackageResolver', () => {
  let registry: LocalRegistry;
  let resolver: PackageResolver;

  beforeEach(() => {
    registry = new LocalRegistry();
    resolver = new PackageResolver(registry);
    registry.publish({ name: 'test-pkg', version: '1.0.0', content: 'v1' });
    registry.publish({ name: 'test-pkg', version: '1.2.0', content: 'v1.2' });
    registry.publish({ name: 'test-pkg', version: '1.2.3', content: 'v1.2.3' });
    registry.publish({ name: 'test-pkg', version: '2.0.0', content: 'v2' });
  });

  it('resolves exact version', () => {
    const v = resolver.resolve('test-pkg', '1.2.0');
    expect(v).toBeDefined();
    expect(v!.version).toBe('1.2.0');
  });

  it('resolve returns null for nonexistent exact version', () => {
    const v = resolver.resolve('test-pkg', '9.9.9');
    expect(v).toBeNull();
  });

  it('resolve returns latest for * range', () => {
    const v = resolver.resolve('test-pkg', '*');
    expect(v).toBeDefined();
    expect(v!.version).toBe('2.0.0');
  });

  it('resolve returns null for unknown package', () => {
    expect(resolver.resolve('ghost-pkg', '*')).toBeNull();
  });

  it('resolve ^ range returns highest compatible version', () => {
    const v = resolver.resolve('test-pkg', '^1.0.0');
    expect(v).toBeDefined();
    expect(v!.version).toBe('1.2.3');
  });

  it('resolve ~ range matches major+minor', () => {
    const v = resolver.resolve('test-pkg', '~1.2.0');
    expect(v).toBeDefined();
    expect(v!.version).toBe('1.2.3');
  });

  it('satisfies exact version match', () => {
    expect(resolver.satisfies('1.2.3', '1.2.3')).toBe(true);
    expect(resolver.satisfies('1.2.3', '1.2.4')).toBe(false);
  });

  it('satisfies ^ range (compatible major)', () => {
    expect(resolver.satisfies('1.5.0', '^1.0.0')).toBe(true);
    expect(resolver.satisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(resolver.satisfies('1.0.0', '^1.0.0')).toBe(true);
  });

  it('satisfies ~ range (patch updates only)', () => {
    expect(resolver.satisfies('1.2.5', '~1.2.3')).toBe(true);
    expect(resolver.satisfies('1.3.0', '~1.2.3')).toBe(false);
    expect(resolver.satisfies('1.2.2', '~1.2.3')).toBe(false);
  });

  it('satisfies * matches any version', () => {
    expect(resolver.satisfies('99.99.99', '*')).toBe(true);
    expect(resolver.satisfies('0.0.1', '*')).toBe(true);
  });

  it('getMatchingVersions returns correct subset for ^ range', () => {
    const versions = resolver.getMatchingVersions('test-pkg', '^1.0.0');
    const vStrings = versions.map((v) => v.version);
    expect(vStrings).toContain('1.0.0');
    expect(vStrings).toContain('1.2.0');
    expect(vStrings).toContain('1.2.3');
    expect(vStrings).not.toContain('2.0.0');
  });

  it('getMatchingVersions returns empty array for no matches', () => {
    const versions = resolver.getMatchingVersions('test-pkg', '^9.0.0');
    expect(versions).toHaveLength(0);
  });

  it('getMatchingVersions returns empty array for unknown package', () => {
    const versions = resolver.getMatchingVersions('unknown-pkg', '^1.0.0');
    expect(versions).toHaveLength(0);
  });

  it('getMatchingVersions returns sorted newest first', () => {
    const versions = resolver.getMatchingVersions('test-pkg', '^1.0.0');
    expect(versions[0]!.version).toBe('1.2.3');
    expect(versions[versions.length - 1]!.version).toBe('1.0.0');
  });

  it('empty registry resolve returns null', () => {
    const emptyRegistry = new LocalRegistry();
    const emptyResolver = new PackageResolver(emptyRegistry);
    expect(emptyResolver.resolve('any-pkg', '*')).toBeNull();
  });
}); 

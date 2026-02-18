/**
 * LocalRegistry + PackageResolver Production Tests
 *
 * Tests the full package lifecycle: publish, versioning, search,
 * download tracking, unpublish, and semver resolution.
 */

import { describe, it, expect } from 'vitest';
import { LocalRegistry } from '../LocalRegistry';
import { PackageResolver } from '../PackageResolver';

describe('LocalRegistry — Production', () => {
  it('publish creates a manifest', () => {
    const reg = new LocalRegistry();
    const manifest = reg.publish({
      name: 'my-pkg',
      version: '1.0.0',
      description: 'Test package',
      author: 'Alice',
      content: 'hello world',
    });
    expect(manifest.name).toBe('my-pkg');
    expect(manifest.latest).toBe('1.0.0');
    expect(manifest.versions.length).toBe(1);
    expect(manifest.versions[0].checksum).toBeDefined();
  });

  it('publish second version updates latest', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'pkg', version: '1.0.0', content: 'v1' });
    const manifest = reg.publish({ name: 'pkg', version: '1.1.0', content: 'v2' });
    expect(manifest.latest).toBe('1.1.0');
    expect(manifest.versions.length).toBe(2);
  });

  it('publish duplicate version throws', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'dup', version: '1.0.0', content: 'a' });
    expect(() => reg.publish({ name: 'dup', version: '1.0.0', content: 'b' })).toThrow(
      'already exists'
    );
  });

  it('getPackage and getVersion', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'x', version: '2.0.0', content: 'data' });
    expect(reg.getPackage('x')).toBeDefined();
    expect(reg.getVersion('x', '2.0.0')).toBeDefined();
    expect(reg.getVersion('x', '9.9.9')).toBeUndefined();
    expect(reg.getPackage('nonexistent')).toBeUndefined();
  });

  it('list returns all packages', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'a', version: '1.0.0', content: 'a', tags: ['foo'] });
    reg.publish({ name: 'b', version: '1.0.0', content: 'b', tags: ['bar'] });
    expect(reg.list().length).toBe(2);
    expect(reg.list('foo').length).toBe(1);
  });

  it('search by name and description', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'holoscript-ui', version: '1.0.0', description: 'UI widgets', content: '' });
    reg.publish({ name: 'holoscript-ai', version: '1.0.0', description: 'AI stuff', content: '' });
    expect(reg.search('ui').length).toBe(1);
    expect(reg.search('holoscript').length).toBe(2);
  });

  it('recordDownload increments count', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'dl', version: '1.0.0', content: '' });
    reg.recordDownload('dl');
    reg.recordDownload('dl');
    expect(reg.getPackage('dl')!.downloads).toBe(2);
  });

  it('unpublish removes package', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'rm', version: '1.0.0', content: '' });
    expect(reg.unpublish('rm')).toBe(true);
    expect(reg.getPackage('rm')).toBeUndefined();
    expect(reg.unpublish('rm')).toBe(false);
  });

  it('unpublishVersion removes version, updates latest', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'multi', version: '1.0.0', content: 'v1' });
    reg.publish({ name: 'multi', version: '2.0.0', content: 'v2' });
    expect(reg.unpublishVersion('multi', '2.0.0')).toBe(true);
    expect(reg.getPackage('multi')!.latest).toBe('1.0.0');
  });

  it('size and clear', () => {
    const reg = new LocalRegistry();
    reg.publish({ name: 'a', version: '1.0.0', content: '' });
    reg.publish({ name: 'b', version: '1.0.0', content: '' });
    expect(reg.size).toBe(2);
    reg.clear();
    expect(reg.size).toBe(0);
  });
});

describe('PackageResolver — Production', () => {
  function seedRegistry() {
    const reg = new LocalRegistry();
    reg.publish({ name: 'lib', version: '1.0.0', content: '' });
    reg.publish({ name: 'lib', version: '1.1.0', content: '' });
    reg.publish({ name: 'lib', version: '1.2.3', content: '' });
    reg.publish({ name: 'lib', version: '2.0.0', content: '' });
    return reg;
  }

  it('satisfies exact match', () => {
    const resolver = new PackageResolver(seedRegistry());
    expect(resolver.satisfies('1.1.0', '1.1.0')).toBe(true);
    expect(resolver.satisfies('1.1.0', '1.2.0')).toBe(false);
  });

  it('satisfies caret (^) range', () => {
    const resolver = new PackageResolver(seedRegistry());
    expect(resolver.satisfies('1.2.3', '^1.0.0')).toBe(true);
    expect(resolver.satisfies('2.0.0', '^1.0.0')).toBe(false);
    expect(resolver.satisfies('1.0.0', '^1.1.0')).toBe(false);
  });

  it('satisfies tilde (~) range', () => {
    const resolver = new PackageResolver(seedRegistry());
    expect(resolver.satisfies('1.1.0', '~1.1.0')).toBe(true);
    expect(resolver.satisfies('1.2.0', '~1.1.0')).toBe(false);
  });

  it('satisfies wildcard', () => {
    const resolver = new PackageResolver(seedRegistry());
    expect(resolver.satisfies('99.99.99', '*')).toBe(true);
  });

  it('resolve returns latest matching', () => {
    const resolver = new PackageResolver(seedRegistry());
    const result = resolver.resolve('lib', '^1.0.0');
    expect(result).not.toBeNull();
    expect(result!.version).toBe('1.2.3');
  });

  it('resolve wildcard returns latest', () => {
    const resolver = new PackageResolver(seedRegistry());
    const result = resolver.resolve('lib', '*');
    expect(result).not.toBeNull();
    expect(result!.version).toBe('2.0.0');
  });

  it('resolve nonexistent returns null', () => {
    const resolver = new PackageResolver(seedRegistry());
    expect(resolver.resolve('nonexistent', '*')).toBeNull();
  });

  it('getMatchingVersions returns sorted desc', () => {
    const resolver = new PackageResolver(seedRegistry());
    const versions = resolver.getMatchingVersions('lib', '^1.0.0');
    expect(versions.length).toBe(3);
    expect(versions[0].version).toBe('1.2.3');
    expect(versions[2].version).toBe('1.0.0');
  });
});

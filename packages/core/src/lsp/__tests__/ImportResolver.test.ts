/**
 * ImportResolver Tests
 *
 * Tests module resolution for:
 * - Built-in @holoscript/std package and subpaths
 * - Package map overrides
 * - Relative imports
 * - Unknown packages (external)
 * - Cache behavior
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { ImportResolver } from '../ImportResolver';

describe('ImportResolver', () => {
  let r: ImportResolver;

  beforeEach(() => {
    r = new ImportResolver({ rootDir: '/project/src' });
  });

  // ── Built-in packages ──────────────────────────────────────────────

  describe('@holoscript/std', () => {
    it('resolves @holoscript/std', () => {
      const m = r.resolve('@holoscript/std', '/project/src/main.hsplus');
      expect(m).not.toBeNull();
      expect(m!.isPackage).toBe(true);
      expect(m!.packageName).toBe('@holoscript/std');
    });

    it('has known exports', () => {
      const m = r.resolve('@holoscript/std', '/project/src/main.hsplus');
      expect(m!.exports).toBeDefined();
      expect(m!.exports!.length).toBeGreaterThan(10);
      expect(m!.exports).toContain('Vec3');
      expect(m!.exports).toContain('EventBus');
      expect(m!.exports).toContain('createPBRMaterial');
    });

    it('resolves @holoscript/std/spatial subpath', () => {
      const m = r.resolve('@holoscript/std/spatial', '/project/src/main.hsplus');
      expect(m).not.toBeNull();
      expect(m!.packageName).toBe('@holoscript/std/spatial');
      expect(m!.exports).toContain('Vec3');
      expect(m!.exports).toContain('Quaternion');
      expect(m!.exports).toContain('AABB');
    });

    it('resolves @holoscript/std/physics subpath', () => {
      const m = r.resolve('@holoscript/std/physics', '/project/src/main.hsplus');
      expect(m).not.toBeNull();
      expect(m!.exports).toContain('ColliderConfig');
      expect(m!.exports).toContain('createRigidbody');
    });

    it('resolves @holoscript/std/materials subpath', () => {
      const m = r.resolve('@holoscript/std/materials', '/project/src/main.hsplus');
      expect(m).not.toBeNull();
      expect(m!.exports).toContain('PBRMaterial');
      expect(m!.exports).toContain('MATERIAL_PRESETS');
    });

    it('resolves @holoscript/std/events subpath', () => {
      const m = r.resolve('@holoscript/std/events', '/project/src/main.hsplus');
      expect(m).not.toBeNull();
      expect(m!.exports).toContain('EventBus');
    });
  });

  // ── Package map overrides ──────────────────────────────────────────

  describe('package map', () => {
    it('resolves from custom package map', () => {
      const r2 = new ImportResolver({
        rootDir: '/project',
        packageMap: { 'my-lib': '/custom/my-lib/index.ts' },
      });
      const m = r2.resolve('my-lib', '/project/main.ts');
      expect(m).not.toBeNull();
      expect(m!.isPackage).toBe(true);
      expect(m!.path).toBe('/custom/my-lib/index.ts');
    });
  });

  // ── Unknown scoped packages ────────────────────────────────────────

  describe('unknown scoped packages', () => {
    it('marks as external package', () => {
      const m = r.resolve('@three/fiber', '/project/src/main.ts');
      expect(m).not.toBeNull();
      expect(m!.isPackage).toBe(true);
      expect(m!.packageName).toBe('@three/fiber');
    });
  });

  // ── Relative imports ───────────────────────────────────────────────

  describe('relative imports', () => {
    it('resolves relative path', () => {
      const m = r.resolve('./math', '/project/src/main.hsplus');
      expect(m).not.toBeNull();
      expect(m!.isPackage).toBe(false);
      expect(m!.path).toContain('math');
    });

    it('resolves relative path with extension', () => {
      const m = r.resolve('./utils', '/project/src/scene.holo');
      expect(m).not.toBeNull();
      expect(m!.format).toBeDefined();
    });
  });

  // ── Known packages list ────────────────────────────────────────────

  describe('getKnownPackages', () => {
    it('includes @holoscript/std', () => {
      expect(r.getKnownPackages()).toContain('@holoscript/std');
    });

    it('includes subpath packages', () => {
      const pkgs = r.getKnownPackages();
      expect(pkgs).toContain('@holoscript/std/spatial');
      expect(pkgs).toContain('@holoscript/std/physics');
      expect(pkgs).toContain('@holoscript/std/materials');
      expect(pkgs).toContain('@holoscript/std/events');
    });
  });

  describe('getPackageExports', () => {
    it('returns exports for known package', () => {
      const exports = r.getPackageExports('@holoscript/std');
      expect(exports.length).toBeGreaterThan(10);
    });

    it('returns empty for unknown package', () => {
      expect(r.getPackageExports('nonexistent')).toEqual([]);
    });
  });

  // ── Cache behavior ─────────────────────────────────────────────────

  describe('cache', () => {
    it('returns same result on second call', () => {
      const m1 = r.resolve('@holoscript/std', '/a.ts');
      const m2 = r.resolve('@holoscript/std', '/a.ts');
      expect(m1).toEqual(m2);
    });

    it('clearCache forces fresh resolution', () => {
      r.resolve('@holoscript/std', '/a.ts');
      r.clearCache();
      const m = r.resolve('@holoscript/std', '/a.ts');
      expect(m).not.toBeNull();
    });
  });
});

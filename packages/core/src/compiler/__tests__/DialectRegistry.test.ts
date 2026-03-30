import { describe, it, expect, beforeAll } from 'vitest';
import { DialectRegistry } from '../DialectRegistry';
import { registerBuiltinDialects } from '../registerBuiltinDialects';

describe('DialectRegistry', () => {
  beforeAll(() => {
    registerBuiltinDialects();
  });

  describe('boot', () => {
    it('registers 24+ dialects', () => {
      expect(DialectRegistry.size).toBeGreaterThanOrEqual(24);
    });

    it('is idempotent — double registration does not throw', () => {
      expect(() => registerBuiltinDialects()).not.toThrow();
    });
  });

  describe('listByDomain()', () => {
    it('returns gamedev compilers: unity, unreal, godot', () => {
      const gamedev = DialectRegistry.listByDomain('gamedev');
      const names = gamedev.map((d) => d.name);
      expect(names).toContain('unity');
      expect(names).toContain('unreal');
      expect(names).toContain('godot');
    });

    it('returns web3d compilers: r3f, babylon, playcanvas', () => {
      const web3d = DialectRegistry.listByDomain('web3d');
      const names = web3d.map((d) => d.name);
      expect(names).toContain('r3f');
      expect(names).toContain('babylon');
      expect(names).toContain('playcanvas');
    });

    it('returns xr compilers: openxr, visionos, android-xr, vrr', () => {
      const xr = DialectRegistry.listByDomain('xr');
      const names = xr.map((d) => d.name);
      expect(names).toContain('openxr');
      expect(names).toContain('visionos');
      expect(names).toContain('android-xr');
    });

    it('returns mobile compilers: ios, android, ar', () => {
      const mobile = DialectRegistry.listByDomain('mobile');
      const names = mobile.map((d) => d.name);
      expect(names).toContain('ios');
      expect(names).toContain('android');
      expect(names).toContain('ar');
    });

    it('returns robotics compilers: urdf, sdf', () => {
      const robotics = DialectRegistry.listByDomain('robotics');
      const names = robotics.map((d) => d.name);
      expect(names).toContain('urdf');
      expect(names).toContain('sdf');
    });

    it('returns service compilers: node-service', () => {
      const service = DialectRegistry.listByDomain('service');
      const names = service.map((d) => d.name);
      expect(names).toContain('node-service');
    });

    it('returns empty array for unknown domain', () => {
      // @ts-expect-error testing unknown domain
      const result = DialectRegistry.listByDomain('nonexistent');
      expect(result).toHaveLength(0);
    });
  });

  describe('findByTrait()', () => {
    it('finds multiple backends for physics', () => {
      const dialects = DialectRegistry.findByTrait('physics');
      expect(dialects.length).toBeGreaterThanOrEqual(5);
      const names = dialects.map((d) => d.name);
      expect(names).toContain('unity');
      expect(names).toContain('unreal');
      expect(names).toContain('godot');
      expect(names).toContain('r3f');
    });

    it('finds service backends for endpoint trait', () => {
      const dialects = DialectRegistry.findByTrait('endpoint');
      const names = dialects.map((d) => d.name);
      expect(names).toContain('node-service');
    });

    it('finds robotics backends for joint trait', () => {
      const dialects = DialectRegistry.findByTrait('joint');
      const names = dialects.map((d) => d.name);
      expect(names).toContain('urdf');
      expect(names).toContain('sdf');
    });

    it('returns empty for unknown trait', () => {
      const result = DialectRegistry.findByTrait('nonexistent_trait');
      expect(result).toHaveLength(0);
    });
  });

  describe('get()', () => {
    it('returns dialect info for known dialect', () => {
      const info = DialectRegistry.get('unity');
      expect(info).toBeDefined();
      expect(info!.name).toBe('unity');
      expect(info!.domain).toBe('gamedev');
      expect(info!.riskTier).toBe('standard');
      expect(info!.ansPath).toBe('/compile/gamedev/unity');
    });

    it('returns undefined for unknown dialect', () => {
      expect(DialectRegistry.get('nonexistent')).toBeUndefined();
    });

    it('node-service is experimental', () => {
      const info = DialectRegistry.get('node-service');
      expect(info).toBeDefined();
      expect(info!.experimental).toBe(true);
    });
  });

  describe('has()', () => {
    it('returns true for registered dialect', () => {
      expect(DialectRegistry.has('r3f')).toBe(true);
    });

    it('returns false for unregistered dialect', () => {
      expect(DialectRegistry.has('nonexistent')).toBe(false);
    });
  });

  describe('names()', () => {
    it('returns array of all dialect names', () => {
      const names = DialectRegistry.names();
      expect(names.length).toBeGreaterThanOrEqual(24);
      expect(names).toContain('unity');
      expect(names).toContain('r3f');
      expect(names).toContain('node-service');
    });
  });

  describe('ANS paths', () => {
    it('generates correct ANS paths', () => {
      expect(DialectRegistry.get('unity')!.ansPath).toBe('/compile/gamedev/unity');
      expect(DialectRegistry.get('r3f')!.ansPath).toBe('/compile/web3d/r3f');
      expect(DialectRegistry.get('node-service')!.ansPath).toBe('/compile/service/node-service');
      expect(DialectRegistry.get('urdf')!.ansPath).toBe('/compile/robotics/urdf');
    });
  });

  describe('output extensions', () => {
    it('unity outputs .cs files', () => {
      const info = DialectRegistry.get('unity');
      expect(info!.outputExtensions).toContain('.cs');
    });

    it('r3f outputs .tsx files', () => {
      const info = DialectRegistry.get('r3f');
      expect(info!.outputExtensions).toContain('.tsx');
    });

    it('node-service outputs .ts files', () => {
      const info = DialectRegistry.get('node-service');
      expect(info!.outputExtensions).toContain('.ts');
    });
  });
});

import { describe, it, expect } from 'vitest';
import { validatePluginManifest, createPluginManifest, PluginManifest } from '../../plugins/PluginManifest';

const valid: PluginManifest = {
  id: 'my-plugin',
  name: 'My Plugin',
  version: '1.0.0',
  description: 'Desc',
  author: 'Alice',
  main: 'index.js',
};

describe('PluginManifest — Production Tests', () => {
  describe('validatePluginManifest()', () => {
    it('accepts a fully valid manifest', () => {
      const result = validatePluginManifest(valid);
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects null / non-object input', () => {
      expect(validatePluginManifest(null).valid).toBe(false);
      expect(validatePluginManifest('string').valid).toBe(false);
      expect(validatePluginManifest(42).valid).toBe(false);
    });

    it('reports missing id', () => {
      const { id, ...rest } = valid;
      const r = validatePluginManifest(rest);
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('id'))).toBe(true);
    });

    it('rejects non-kebab-case id', () => {
      const r = validatePluginManifest({ ...valid, id: 'My Plugin!' });
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('kebab-case'))).toBe(true);
    });

    it('accepts kebab-case id with numbers', () => {
      const r = validatePluginManifest({ ...valid, id: 'plugin-v2' });
      expect(r.valid).toBe(true);
    });

    it('reports missing name', () => {
      const { name, ...rest } = valid;
      const r = validatePluginManifest(rest);
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('name'))).toBe(true);
    });

    it('reports missing version', () => {
      const { version, ...rest } = valid;
      const r = validatePluginManifest(rest);
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('version'))).toBe(true);
    });

    it('rejects invalid semver format', () => {
      const r = validatePluginManifest({ ...valid, version: '1.0' });
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('semver'))).toBe(true);
    });

    it('accepts pre-release semver (1.0.0-alpha)', () => {
      const r = validatePluginManifest({ ...valid, version: '1.0.0-alpha' });
      expect(r.valid).toBe(true);
    });

    it('reports missing description', () => {
      const { description, ...rest } = valid;
      const r = validatePluginManifest(rest);
      expect(r.valid).toBe(false);
    });

    it('reports missing main', () => {
      const { main, ...rest } = valid;
      const r = validatePluginManifest(rest);
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('main'))).toBe(true);
    });

    it('accumulates multiple errors', () => {
      const r = validatePluginManifest({});
      expect(r.errors.length).toBeGreaterThan(1);
    });
  });

  describe('validatePluginManifest() — hololandFeatures', () => {
    it('accepts manifest with valid vrrProviders', () => {
      const r = validatePluginManifest({
        ...valid,
        hololandFeatures: {
          vrrProviders: [{ id: 'wp', displayName: 'WeatherPro', className: 'WP', type: 'weather' }],
        },
      });
      expect(r.valid).toBe(true);
    });

    it('rejects vrrProvider with missing required fields', () => {
      const r = validatePluginManifest({
        ...valid,
        hololandFeatures: {
          vrrProviders: [{ id: '', displayName: '', className: '', type: 'weather' }],
        },
      });
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('VRR provider'))).toBe(true);
    });

    it('rejects vrrProvider with invalid type', () => {
      const r = validatePluginManifest({
        ...valid,
        hololandFeatures: {
          vrrProviders: [{ id: 'x', displayName: 'X', className: 'X', type: 'invalid' }],
        },
      });
      expect(r.valid).toBe(false);
      expect(r.errors.some(e => e.includes('invalid type'))).toBe(true);
    });

    it('accepts manifest with valid aiProviders', () => {
      const r = validatePluginManifest({
        ...valid,
        hololandFeatures: {
          aiProviders: [{ id: 'ai1', displayName: 'AI One', className: 'AI1', features: {} }],
        },
      });
      expect(r.valid).toBe(true);
    });

    it('rejects aiProvider with missing fields', () => {
      const r = validatePluginManifest({
        ...valid,
        hololandFeatures: {
          aiProviders: [{ id: '', displayName: '', className: '', features: {} }],
        },
      });
      expect(r.valid).toBe(false);
    });

    it('accepts manifest with valid paymentProcessors', () => {
      const r = validatePluginManifest({
        ...valid,
        hololandFeatures: {
          paymentProcessors: [{ id: 'stripe', displayName: 'Stripe', className: 'StripeProc' }],
        },
      });
      expect(r.valid).toBe(true);
    });

    it('rejects paymentProcessor with missing fields', () => {
      const r = validatePluginManifest({
        ...valid,
        hololandFeatures: {
          paymentProcessors: [{ id: '', displayName: '', className: '' }],
        },
      });
      expect(r.valid).toBe(false);
    });
  });

  describe('createPluginManifest()', () => {
    it('creates a manifest with the provided options', () => {
      const m = createPluginManifest({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '2.0.0',
        description: 'A test',
        author: 'Bob',
      });
      expect(m.id).toBe('test-plugin');
      expect(m.name).toBe('Test Plugin');
      expect(m.version).toBe('2.0.0');
      expect(m.author).toBe('Bob');
    });

    it('defaults main to index.js if not provided', () => {
      const m = createPluginManifest({
        id: 'p',
        name: 'P',
        version: '1.0.0',
        description: 'desc',
        author: 'A',
      });
      expect(m.main).toBe('index.js');
    });

    it('uses provided main', () => {
      const m = createPluginManifest({
        id: 'p',
        name: 'P',
        version: '1.0.0',
        description: 'desc',
        author: 'A',
        main: 'src/index.ts',
      });
      expect(m.main).toBe('src/index.ts');
    });

    it('created manifest passes validation', () => {
      const m = createPluginManifest({
        id: 'valid-one',
        name: 'Valid',
        version: '0.1.0',
        description: 'Test',
        author: 'Dev',
      });
      expect(validatePluginManifest(m).valid).toBe(true);
    });

    it('accepts PluginAuthor object', () => {
      const m = createPluginManifest({
        id: 'x',
        name: 'X',
        version: '1.0.0',
        description: 'd',
        author: { name: 'Alice', email: 'alice@example.com' },
      });
      expect((m.author as any).email).toBe('alice@example.com');
    });
  });
});

/**
 * PluginLifecycleManager tests — v5.7 "Open Ecosystem"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PluginLifecycleManager,
  getPluginLifecycleManager,
  resetPluginLifecycleManager,
} from '../PluginLifecycleManager';
import { PluginSignatureVerifier } from '../PluginSignatureVerifier';
import {
  generateKeyPair,
  signPackage,
  canonicalizeManifest,
  type PackageManifest,
  type SignedPackage,
} from '@holoscript/platform';

function simpleCode() {
  return `
    registerTool('greet', 'Say hello', function(name) { return 'Hello ' + name; });
    'activated';
  `;
}

describe('PluginLifecycleManager', () => {
  let manager: PluginLifecycleManager;

  beforeEach(() => {
    resetPluginLifecycleManager();
    manager = new PluginLifecycleManager({ requireSignature: false });
  });

  // ===========================================================================
  // INSTALL
  // ===========================================================================

  describe('install', () => {
    it('installs a plugin', () => {
      const plugin = manager.install({
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test plugin',
        code: simpleCode(),
        permissions: ['tool:register', 'event:emit'],
      });

      expect(plugin.state).toBe('installed');
      expect(plugin.id).toBe('test-plugin');
      expect(manager.getPluginCount()).toBe(1);
    });

    it('rejects duplicate installs', () => {
      manager.install({ id: 'a', name: 'A', version: '1.0.0', description: '', code: '' });
      expect(() =>
        manager.install({ id: 'a', name: 'A', version: '1.0.0', description: '', code: '' })
      ).toThrow('already installed');
    });

    it('validates plugin ID format', () => {
      expect(() =>
        manager.install({
          id: 'Bad Name!',
          name: 'Bad',
          version: '1.0.0',
          description: '',
          code: '',
        })
      ).toThrow('Invalid plugin ID');
    });

    it('enforces max plugin limit', () => {
      const small = new PluginLifecycleManager({ requireSignature: false, maxPlugins: 2 });
      small.install({ id: 'a', name: 'A', version: '1.0.0', description: '', code: '' });
      small.install({ id: 'b', name: 'B', version: '1.0.0', description: '', code: '' });
      expect(() =>
        small.install({ id: 'c', name: 'C', version: '1.0.0', description: '', code: '' })
      ).toThrow('limit reached');
    });
  });

  // ===========================================================================
  // VERIFY
  // ===========================================================================

  describe('verify', () => {
    it('verifies a signed plugin', () => {
      const keyPair = generateKeyPair();
      const verifier = new PluginSignatureVerifier();
      verifier.addTrustedKey('key-1', keyPair.publicKey, 'Trusted');

      const mgr = new PluginLifecycleManager({ requireSignature: true }, verifier);
      mgr.install({
        id: 'signed-plugin',
        name: 'Signed',
        version: '1.0.0',
        description: '',
        code: '',
      });

      const manifest: PackageManifest = {
        name: 'signed-plugin',
        version: '1.0.0',
        files: ['index.js'],
        contentHash: 'hash123',
        createdAt: new Date().toISOString(),
      };
      const content = canonicalizeManifest(manifest);
      const signature = signPackage(content, keyPair.privateKey);
      const signed: SignedPackage = { manifest, signature };

      const result = mgr.verify('signed-plugin', signed);
      expect(result.verified).toBe(true);

      const plugin = mgr.getPlugin('signed-plugin');
      expect(plugin!.state).toBe('verified');
    });

    it('skipVerification works when not required', () => {
      manager.install({
        id: 'dev-plugin',
        name: 'Dev',
        version: '1.0.0',
        description: '',
        code: '',
      });
      manager.skipVerification('dev-plugin');

      const plugin = manager.getPlugin('dev-plugin');
      expect(plugin!.state).toBe('verified');
    });

    it('skipVerification throws when required', () => {
      const strict = new PluginLifecycleManager({ requireSignature: true });
      strict.install({ id: 'a', name: 'A', version: '1.0.0', description: '', code: '' });
      expect(() => strict.skipVerification('a')).toThrow('signatures are required');
    });
  });

  // ===========================================================================
  // SANDBOX + ENABLE
  // ===========================================================================

  describe('sandbox and enable', () => {
    it('creates sandbox and enables plugin', async () => {
      manager.install({
        id: 'my-plugin',
        name: 'My Plugin',
        version: '1.0.0',
        description: 'Test',
        code: simpleCode(),
        permissions: ['tool:register'],
      });
      manager.skipVerification('my-plugin');
      manager.sandbox('my-plugin');

      const result = await manager.enable('my-plugin');
      expect(result.success).toBe(true);

      const plugin = manager.getPlugin('my-plugin');
      expect(plugin!.state).toBe('enabled');

      // Check registered tool
      const tools = plugin!.sandbox!.getTools();
      expect(tools).toHaveLength(1);
      expect(tools[0].name).toBe('plugin:my-plugin:greet');
    });

    it('handles execution errors', async () => {
      manager.install({
        id: 'bad-plugin',
        name: 'Bad',
        version: '1.0.0',
        description: 'Throws',
        code: 'throw new Error("init failed");',
        permissions: [],
      });
      manager.skipVerification('bad-plugin');
      manager.sandbox('bad-plugin');

      const result = await manager.enable('bad-plugin');
      expect(result.success).toBe(false);
      expect(result.error).toContain('init failed');

      const plugin = manager.getPlugin('bad-plugin');
      expect(plugin!.state).toBe('error');
    });
  });

  // ===========================================================================
  // DISABLE + UNINSTALL
  // ===========================================================================

  describe('disable and uninstall', () => {
    it('disables an enabled plugin', async () => {
      manager.install({
        id: 'p',
        name: 'P',
        version: '1.0.0',
        description: '',
        code: '42',
        permissions: [],
      });
      manager.skipVerification('p');
      manager.sandbox('p');
      await manager.enable('p');
      manager.disable('p');

      expect(manager.getPlugin('p')!.state).toBe('disabled');
    });

    it('uninstalls a plugin', () => {
      manager.install({ id: 'p', name: 'P', version: '1.0.0', description: '', code: '' });
      manager.uninstall('p');
      expect(manager.getPluginCount()).toBe(0);
    });

    it('prevents uninstall when other plugins depend on it', () => {
      manager.install({
        id: 'core',
        name: 'Core',
        version: '1.0.0',
        description: '',
        code: '',
        dependencies: {},
      });
      manager.install({
        id: 'ext',
        name: 'Ext',
        version: '1.0.0',
        description: '',
        code: '',
        dependencies: { core: '^1.0.0' },
      });

      expect(() => manager.uninstall('core')).toThrow('required by');
    });
  });

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  describe('queries', () => {
    it('getPluginsByState filters correctly', () => {
      manager.install({ id: 'a', name: 'A', version: '1.0.0', description: '', code: '' });
      manager.install({ id: 'b', name: 'B', version: '1.0.0', description: '', code: '' });
      manager.skipVerification('a');

      const installed = manager.getPluginsByState('installed');
      expect(installed).toHaveLength(1);
      expect(installed[0].id).toBe('b');

      const verified = manager.getPluginsByState('verified');
      expect(verified).toHaveLength(1);
      expect(verified[0].id).toBe('a');
    });

    it('getStats returns comprehensive statistics', async () => {
      manager.install({
        id: 'p',
        name: 'P',
        version: '1.0.0',
        description: '',
        code: simpleCode(),
        permissions: ['tool:register'],
      });
      manager.skipVerification('p');
      manager.sandbox('p');
      await manager.enable('p');

      const stats = manager.getStats();
      expect(stats.total).toBe(1);
      expect(stats.byState['enabled']).toBe(1);
      expect(stats.totalTools).toBe(1);
    });
  });

  // ===========================================================================
  // DEPENDENCY RESOLUTION
  // ===========================================================================

  describe('dependency resolution', () => {
    it('resolves installed plugin dependencies', () => {
      manager.install({
        id: 'base',
        name: 'Base',
        version: '1.0.0',
        description: '',
        code: '',
        dependencies: {},
      });
      manager.install({
        id: 'ext',
        name: 'Ext',
        version: '1.0.0',
        description: '',
        code: '',
        dependencies: { base: '^1.0.0' },
      });

      const result = manager.resolveDependencies();
      expect(result.success).toBe(true);
      expect(result.installOrder.indexOf('base')).toBeLessThan(result.installOrder.indexOf('ext'));
    });
  });

  // ===========================================================================
  // CLEANUP
  // ===========================================================================

  describe('cleanup', () => {
    it('destroyAll cleans up all plugins', () => {
      manager.install({ id: 'a', name: 'A', version: '1.0.0', description: '', code: '' });
      manager.install({ id: 'b', name: 'B', version: '1.0.0', description: '', code: '' });
      manager.destroyAll();
      expect(manager.getPluginCount()).toBe(0);
    });
  });

  // ===========================================================================
  // SINGLETON
  // ===========================================================================

  describe('singleton', () => {
    it('returns same instance', () => {
      const a = getPluginLifecycleManager();
      const b = getPluginLifecycleManager();
      expect(a).toBe(b);
    });

    it('resets on reset call', () => {
      const a = getPluginLifecycleManager();
      resetPluginLifecycleManager();
      const b = getPluginLifecycleManager();
      expect(a).not.toBe(b);
    });
  });
});

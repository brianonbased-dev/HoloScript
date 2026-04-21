/**
 * v5.7 "Open Ecosystem" — End-to-end showcase test
 *
 * Tests the full plugin ecosystem stack:
 * 1. Weather plugin .holo composition parses and validates
 * 2. PluginSandboxRunner executes sandboxed code
 * 3. PluginSignatureVerifier trust chain
 * 4. DependencyResolver topological ordering
 * 5. PluginLifecycleManager full lifecycle
 * 6. MCP plugin management tools (install_plugin, list_plugins, manage_plugin)
 * 7. create-plugin CLI scaffolder
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  PluginSandboxRunner,
  DEFAULT_CAPABILITY_BUDGET,
  PluginSignatureVerifier,
  DependencyResolver,
  PluginLifecycleManager,
  resetPluginLifecycleManager,
  generateKeyPair,
  signPackage,
  canonicalizeManifest,
} from '@holoscript/core';
import type { PackageManifest, SignedPackage } from '@holoscript/core';
import { handlePluginManagementTool } from '../plugin-management-tools';

// =============================================================================
// FIXTURES
// =============================================================================

const EXAMPLES_DIR = resolve(__dirname, '../../../../examples/plugins');

const SIMPLE_PLUGIN_CODE = `
  registerTool('greet', 'Say hello', function(name) { return 'Hello ' + name; });
  registerTool('add', 'Add numbers', function(a, b) { return a + b; });
  'activated';
`;

// =============================================================================
// TESTS
// =============================================================================

describe('v5.7 Showcase — Open Ecosystem', () => {
  beforeEach(() => {
    resetPluginLifecycleManager();
  });

  afterEach(() => {
    resetPluginLifecycleManager();
  });

  // ===========================================================================
  // 1. WEATHER PLUGIN COMPOSITION
  // ===========================================================================

  describe('weather-plugin.holo', () => {
    const code = readFileSync(resolve(EXAMPLES_DIR, 'weather-plugin.holo'), 'utf-8');

    it('is a valid plugin composition', () => {
      expect(code.length).toBeGreaterThan(200);
      expect(code).toContain('@world');
      expect(code).toContain('Weather Plugin Demo');
    });

    it('declares a plugin with permissions', () => {
      expect(code).toContain('plugin "weather-provider"');
      expect(code).toContain('tool:register');
      expect(code).toContain('event:emit');
      expect(code).toContain('network:fetch');
    });

    it('defines plugin tools', () => {
      expect(code).toContain('tool "get_weather"');
      expect(code).toContain('tool "forecast_weather"');
      expect(code).toContain('temperature: number');
    });

    it('defines event-driven objects', () => {
      expect(code).toContain('object WeatherDisplay');
      expect(code).toContain('on_event("weather:updated")');
      expect(code).toContain('object SkyDome');
    });

    it('defines a weather update workflow', () => {
      expect(code).toContain('workflow "WeatherUpdatePipeline"');
      expect(code).toContain('depends_on:');
      expect(code).toContain('ref(');
    });
  });

  // ===========================================================================
  // 2. SANDBOX RUNNER E2E
  // ===========================================================================

  describe('PluginSandboxRunner E2E', () => {
    it('executes plugin code with tool registration', async () => {
      const runner = new PluginSandboxRunner({
        pluginId: 'weather-provider',
        permissions: new Set(['tool:register', 'handler:register', 'event:emit']),
        budget: DEFAULT_CAPABILITY_BUDGET,
      });

      const result = await runner.execute(SIMPLE_PLUGIN_CODE);
      expect(result.success).toBe(true);
      expect(result.result).toBe('activated');

      const tools = runner.getTools();
      expect(tools).toHaveLength(2);
      expect(tools[0].name).toBe('plugin:weather-provider:greet');
      expect(tools[1].name).toBe('plugin:weather-provider:add');
    });

    it('blocks dangerous operations', async () => {
      const runner = new PluginSandboxRunner({
        pluginId: 'malicious',
        permissions: new Set([]),
        budget: DEFAULT_CAPABILITY_BUDGET,
      });

      const result = await runner.execute(
        'typeof process !== "undefined" ? process.exit(1) : "safe"'
      );
      expect(result.success).toBe(true);
      expect(result.result).toBe('safe');
    });
  });

  // ===========================================================================
  // 3. SIGNATURE VERIFICATION E2E
  // ===========================================================================

  describe('PluginSignatureVerifier E2E', () => {
    it('verifies plugin with trusted key chain', () => {
      const verifier = new PluginSignatureVerifier();
      const keyPair = generateKeyPair();

      verifier.addTrustedKey('holoscript-official', keyPair.publicKey, 'HoloScript Official');

      const manifest: PackageManifest = {
        name: 'weather-provider',
        version: '1.0.0',
        files: ['index.js', 'plugin.json'],
        contentHash: 'abc123',
        createdAt: new Date().toISOString(),
      };
      const content = canonicalizeManifest(manifest);
      const signature = signPackage(content, keyPair.privateKey);
      const signed: SignedPackage = { manifest, signature };

      const result = verifier.verifyPlugin(signed);
      expect(result.verified).toBe(true);
      expect(result.keyLabel).toBe('HoloScript Official');
    });
  });

  // ===========================================================================
  // 4. DEPENDENCY RESOLVER E2E
  // ===========================================================================

  describe('DependencyResolver E2E', () => {
    it('resolves plugin ecosystem with parallel groups', () => {
      const resolver = new DependencyResolver();
      resolver.addPlugins([
        { id: 'holoscript-core', version: '5.7.0', dependencies: {} },
        { id: 'weather-provider', version: '1.0.0', dependencies: { 'holoscript-core': '^5.7.0' } },
        { id: 'weather-display', version: '1.0.0', dependencies: { 'weather-provider': '^1.0.0' } },
        { id: 'sky-dome', version: '1.0.0', dependencies: { 'weather-provider': '^1.0.0' } },
      ]);

      const result = resolver.resolve();
      expect(result.success).toBe(true);

      // holoscript-core must be first
      expect(result.installOrder[0]).toBe('holoscript-core');

      // weather-display and sky-dome can be parallel
      expect(result.parallelGroups.length).toBeGreaterThanOrEqual(3);

      // Transitive deps
      const displayDeps = result.transitiveDeps.get('weather-display');
      expect(displayDeps).toBeDefined();
      expect(displayDeps!.has('weather-provider')).toBe(true);
      expect(displayDeps!.has('holoscript-core')).toBe(true);
    });
  });

  // ===========================================================================
  // 5. LIFECYCLE MANAGER E2E
  // ===========================================================================

  describe('PluginLifecycleManager E2E', () => {
    it('full lifecycle: install → verify → sandbox → enable → disable → uninstall', async () => {
      const manager = new PluginLifecycleManager({ requireSignature: false });

      // Install
      const plugin = manager.install({
        id: 'weather-provider',
        name: 'Weather Provider',
        version: '1.0.0',
        description: 'Weather data plugin',
        code: SIMPLE_PLUGIN_CODE,
        permissions: ['tool:register'],
      });
      expect(plugin.state).toBe('installed');

      // Verify (skip for dev)
      manager.skipVerification('weather-provider');
      expect(manager.getPlugin('weather-provider')!.state).toBe('verified');

      // Sandbox
      manager.sandbox('weather-provider');
      expect(manager.getPlugin('weather-provider')!.state).toBe('sandboxed');

      // Enable
      const enableResult = await manager.enable('weather-provider');
      expect(enableResult.success).toBe(true);
      expect(manager.getPlugin('weather-provider')!.state).toBe('enabled');

      // Check tools
      const tools = manager.getPlugin('weather-provider')!.sandbox!.getTools();
      expect(tools).toHaveLength(2);

      // Disable
      manager.disable('weather-provider');
      expect(manager.getPlugin('weather-provider')!.state).toBe('disabled');

      // Uninstall
      manager.uninstall('weather-provider');
      expect(manager.getPluginCount()).toBe(0);
    });
  });

  // ===========================================================================
  // 6. MCP PLUGIN MANAGEMENT TOOLS
  // ===========================================================================

  describe('MCP plugin management tools', () => {
    it('install_plugin installs and enables a plugin', async () => {
      const result = (await handlePluginManagementTool('install_plugin', {
        id: 'test-plugin',
        name: 'Test Plugin',
        version: '1.0.0',
        description: 'A test',
        code: SIMPLE_PLUGIN_CODE,
        permissions: ['tool:register', 'event:emit'],
      })) as { success: boolean; pluginId: string; state: string; tools: string[] };

      expect(result.success).toBe(true);
      expect(result.pluginId).toBe('test-plugin');
      expect(result.state).toBe('enabled');
      expect(result.tools).toHaveLength(2);
    });

    it('list_plugins returns installed plugins', async () => {
      // Install a plugin first
      await handlePluginManagementTool('install_plugin', {
        id: 'listed-plugin',
        name: 'Listed',
        version: '1.0.0',
        code: '42',
        permissions: [],
      });

      const result = (await handlePluginManagementTool('list_plugins', {})) as {
        plugins: Array<{ id: string; state: string }>;
        total: number;
      };

      expect(result.total).toBeGreaterThanOrEqual(1);
      const found = result.plugins.find((p) => p.id === 'listed-plugin');
      expect(found).toBeDefined();
      expect(found!.state).toBe('enabled');
    });

    it('manage_plugin can disable and uninstall', async () => {
      await handlePluginManagementTool('install_plugin', {
        id: 'managed-plugin',
        name: 'Managed',
        version: '1.0.0',
        code: '42',
        permissions: [],
      });

      // Disable
      const disableResult = (await handlePluginManagementTool('manage_plugin', {
        pluginId: 'managed-plugin',
        action: 'disable',
      })) as { success: boolean; state: string };
      expect(disableResult.success).toBe(true);
      expect(disableResult.state).toBe('disabled');

      // Uninstall
      const uninstallResult = (await handlePluginManagementTool('manage_plugin', {
        pluginId: 'managed-plugin',
        action: 'uninstall',
      })) as { success: boolean; state: string };
      expect(uninstallResult.success).toBe(true);
    });
  });

  // ===========================================================================
  // 7. CREATE-PLUGIN CLI SCAFFOLDER
  // ===========================================================================

  describe('create-plugin scaffolder', () => {
    it(
      'generates valid plugin manifest template',
      async () => {
      const { createPlugin } = await import(
        resolve(__dirname, '../../../../packages/cli/src/commands/create-plugin')
      );
      const os = await import('os');
      const fs = await import('fs');
      const path = await import('path');

      const tmpDir = path.join(os.tmpdir(), `holoscript-test-plugin-${Date.now()}`);

      try {
        const result = createPlugin({
          name: 'test-weather',
          description: 'Weather plugin test',
          author: 'Test Author',
          outDir: tmpDir,
          permissions: ['tool:register', 'network:fetch'],
        });

        expect(result.success).toBe(true);
        expect(result.files).toContain('plugin.json');
        expect(result.files).toContain('package.json');
        expect(result.files).toContain('src/index.ts');
        expect(result.files).toContain('tsconfig.json');

        // Verify plugin.json content
        const manifest = JSON.parse(fs.readFileSync(path.join(tmpDir, 'plugin.json'), 'utf-8'));
        expect(manifest.id).toBe('test-weather');
        expect(manifest.permissions).toContain('tool:register');
        expect(manifest.permissions).toContain('network:fetch');

        // Verify package.json
        const pkg = JSON.parse(fs.readFileSync(path.join(tmpDir, 'package.json'), 'utf-8'));
        expect(pkg.name).toBe('@holoscript-plugin/test-weather');
        expect(pkg.peerDependencies['@holoscript/core']).toBe('>=5.7.0');
      } finally {
        // Cleanup
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    },
    30_000,
    );

    it('validates plugin name format', async () => {
      const { createPlugin } = await import(
        resolve(__dirname, '../../../../packages/cli/src/commands/create-plugin')
      );
      const result = createPlugin({ name: 'Bad Name!', outDir: '/tmp/nope' });
      expect(result.success).toBe(false);
      expect(result.error).toContain('kebab-case');
    });
  });
});

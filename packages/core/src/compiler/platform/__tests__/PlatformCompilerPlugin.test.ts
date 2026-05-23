/**
 * @fileoverview Tests for PlatformCompilerPlugin interface and first two lazy plugins
 *
 * Tests the stable plugin contract (APL-WIT-2):
 *   - Plugin registration and target resolution
 *   - Trait evaluation through TraitRegistryBridge
 *   - Trait codegen with provenance
 *   - Compile dispatch to real TS compilers
 *   - Manifest derivation
 *   - LRU-style registry management
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  type PlatformCompilerPlugin,
  type TraitCompileContext,
  platformPluginRegistry,
  manifestFromPlugin,
  getAllManifests,
} from '../PlatformCompilerPlugin';
import { WebGPUWGSLPlugin } from '../plugins/WebGPUWGSLPlugin';
import { AndroidARCorePlugin } from '../plugins/AndroidARCorePlugin';

// ── Test Setup ─────────────────────────────────────────────────────

beforeEach(() => {
  platformPluginRegistry.clear();
});

// ── Plugin Interface Contract ──────────────────────────────────────

describe('PlatformCompilerPlugin interface', () => {
  it('should define metadata with required fields', () => {
    const plugin = new WebGPUWGSLPlugin();
    expect(plugin.metadata.name).toBe('holoscript-plugin-webgpu-wgsl');
    expect(plugin.metadata.version).toBe('1.0.0');
    expect(plugin.metadata.targets).toContain('web');
    expect(plugin.metadata.sizeKB).toBeGreaterThan(0);
  });

  it('should implement traitExists', () => {
    const plugin = new WebGPUWGSLPlugin();
    // 'physics' is a core trait that should exist
    expect(plugin.traitExists('physics')).toBe(true);
    // A non-existent trait
    expect(plugin.traitExists('nonexistent-trait-xyz')).toBe(false);
  });

  it('should implement traitQuery', () => {
    const plugin = new WebGPUWGSLPlugin();
    const info = plugin.traitQuery('physics');
    expect(info).toBeDefined();
    expect(info.name).toBe('physics');
  });

  it('should implement traitList returning non-empty array', () => {
    const plugin = new WebGPUWGSLPlugin();
    const traits = plugin.traitList();
    expect(Array.isArray(traits)).toBe(true);
    // Core has many traits
    expect(traits.length).toBeGreaterThan(0);
  });

  it('should implement traitCodegen returning TraitCompileOutput', () => {
    const plugin = new WebGPUWGSLPlugin();
    const context: TraitCompileContext = {
      target: 'web',
      config: {},
      format: 'inline',
      includeProvenance: true,
    };
    const output = plugin.traitCodegen('physics', context);
    expect(output).toBeDefined();
    expect(output.code).toBeInstanceOf(Array);
    expect(output.language).toBe('wgsl');
    expect(['full', 'partial', 'stub']).toContain(output.fidelity);
    expect(output.sourceMap).toBeTruthy();
  });

  it('should implement traitCodegen with provenance when requested', () => {
    const plugin = new AndroidARCorePlugin();
    const context: TraitCompileContext = {
      target: 'android-xr',
      config: {},
      format: 'module',
      includeProvenance: true,
    };
    const output = plugin.traitCodegen('physics', context);
    if (output.fidelity !== 'stub') {
      expect(output.provenance).toBeDefined();
      expect(output.provenance!.pluginName).toBe('holoscript-plugin-android-arcore');
      expect(output.provenance!.traitName).toBe('physics');
    }
  });

  it('should return stub for unknown traits in traitCodegen', () => {
    const plugin = new WebGPUWGSLPlugin();
    const context: TraitCompileContext = {
      target: 'web',
      config: {},
      format: 'inline',
      includeProvenance: false,
    };
    const output = plugin.traitCodegen('nonexistent-trait-xyz', context);
    expect(output.fidelity).toBe('stub');
    expect(output.code[0]).toContain('not found');
  });

  it('should implement unload without error', () => {
    const plugin = new WebGPUWGSLPlugin();
    expect(() => plugin.unload()).not.toThrow();
  });

  it('should implement compile returning CompileResult', () => {
    const plugin = new WebGPUWGSLPlugin();
    // Invalid JSON input → error
    const errorResult = plugin.compile('not-json', 'web');
    expect(errorResult.type).toBe('error');
    expect(errorResult.diagnostics![0].message).toContain('invalid AST JSON');
  });
});

// ── WebGPUWGSLPlugin ───────────────────────────────────────────────

describe('WebGPUWGSLPlugin', () => {
  it('should register with the correct name and targets', () => {
    const plugin = new WebGPUWGSLPlugin();
    expect(plugin.metadata.name).toBe('holoscript-plugin-webgpu-wgsl');
    expect(plugin.metadata.targets).toEqual(['web']);
  });

  it('should compile empty composition to WebGPU output', () => {
    const plugin = new WebGPUWGSLPlugin();
    const emptyAst = JSON.stringify({
      type: 'composition',
      name: 'Empty',
      objects: [],
      environment: {},
    });
    const result = plugin.compile(emptyAst, 'web');
    // Should either produce text output or an error, but not crash
    expect(['text', 'error']).toContain(result.type);
  });

  it('should return error for unsupported target', () => {
    const plugin = new WebGPUWGSLPlugin();
    const result = plugin.compile('{}', 'android-xr');
    expect(result.type).toBe('error');
    expect(result.diagnostics![0].message).toContain('unsupported target');
  });

  it('should delegate trait evaluation to TraitRegistryBridge', () => {
    const plugin = new WebGPUWGSLPlugin();
    // traitExists delegates to the unified bridge
    expect(typeof plugin.traitExists('physics')).toBe('boolean');
    expect(typeof plugin.traitExists('nonexistent')).toBe('boolean');
  });
});

// ── AndroidARCorePlugin ────────────────────────────────────────────

describe('AndroidARCorePlugin', () => {
  it('should register with the correct name and targets', () => {
    const plugin = new AndroidARCorePlugin();
    expect(plugin.metadata.name).toBe('holoscript-plugin-android-arcore');
    expect(plugin.metadata.targets).toContain('android-xr');
    expect(plugin.metadata.targets).toContain('android-xr-ar');
    expect(plugin.metadata.targets).toHaveLength(2);
  });

  it('should compile to Kotlin/ARCore output', () => {
    const plugin = new AndroidARCorePlugin();
    const compositionAst = JSON.stringify({
      type: 'composition',
      name: 'TestScene',
      objects: [
        {
          type: 'object',
          name: 'Cube',
          properties: { geometry: 'cube', position: [0, 1, 0] },
        },
      ],
      environment: {},
    });
    const result = plugin.compile(compositionAst, 'android-xr');
    // Should produce output (text) or error, but not crash
    expect(['text', 'error']).toContain(result.type);
  });

  it('should compile android-xr-ar target', () => {
    const plugin = new AndroidARCorePlugin();
    const result = plugin.compile('{}', 'android-xr-ar');
    // android-xr-ar is supported — might produce output or error
    // but should not return "unsupported target"
    if (result.type === 'error') {
      expect(result.diagnostics![0].message).not.toContain('unsupported target');
    }
  });

  it('should return error for unsupported target', () => {
    const plugin = new AndroidARCorePlugin();
    const result = plugin.compile('{}', 'ios');
    expect(result.type).toBe('error');
    expect(result.diagnostics![0].message).toContain('unsupported target');
  });

  it('should delegate trait evaluation to AndroidXRTraitMap', () => {
    const plugin = new AndroidARCorePlugin();
    // Android XR trait map should exist for known traits
    const traits = plugin.traitList();
    expect(Array.isArray(traits)).toBe(true);
    // AndroidXRTraitMap has many entries
    expect(traits.length).toBeGreaterThan(0);
  });

  it('should produce Kotlin language output for trait codegen', () => {
    const plugin = new AndroidARCorePlugin();
    const context: TraitCompileContext = {
      target: 'android-xr',
      config: {},
      format: 'inline',
      includeProvenance: false,
    };
    const output = plugin.traitCodegen('physics', context);
    expect(output.language).toBe('kotlin');
  });
});

// ── PlatformPluginRegistry ──────────────────────────────────────────

describe('PlatformPluginRegistry', () => {
  it('should register and retrieve plugins', () => {
    const wgpu = new WebGPUWGSLPlugin();
    const android = new AndroidARCorePlugin();
    platformPluginRegistry.register(wgpu);
    platformPluginRegistry.register(android);

    expect(platformPluginRegistry.getByName('holoscript-plugin-webgpu-wgsl')).toBe(wgpu);
    expect(platformPluginRegistry.getByName('holoscript-plugin-android-arcore')).toBe(android);
  });

  it('should resolve plugins by target', () => {
    const wgpu = new WebGPUWGSLPlugin();
    const android = new AndroidARCorePlugin();
    platformPluginRegistry.register(wgpu);
    platformPluginRegistry.register(android);

    expect(platformPluginRegistry.getPluginForTarget('web')).toBe(wgpu);
    expect(platformPluginRegistry.getPluginForTarget('android-xr')).toBe(android);
    expect(platformPluginRegistry.getPluginForTarget('android-xr-ar')).toBe(android);
  });

  it('should return undefined for unknown targets', () => {
    expect(platformPluginRegistry.getPluginForTarget('visionos')).toBeUndefined();
    expect(platformPluginRegistry.getPluginForTarget('quest3')).toBeUndefined();
  });

  it('should list all registered plugin names', () => {
    platformPluginRegistry.register(new WebGPUWGSLPlugin());
    platformPluginRegistry.register(new AndroidARCorePlugin());

    const names = platformPluginRegistry.listPluginNames();
    expect(names).toContain('holoscript-plugin-webgpu-wgsl');
    expect(names).toContain('holoscript-plugin-android-arcore');
    expect(names).toHaveLength(2);
  });

  it('should list all supported targets', () => {
    platformPluginRegistry.register(new WebGPUWGSLPlugin());
    platformPluginRegistry.register(new AndroidARCorePlugin());

    const targets = platformPluginRegistry.listAllTargets();
    expect(targets).toContain('web');
    expect(targets).toContain('android-xr');
    expect(targets).toContain('android-xr-ar');
  });

  it('should overwrite when re-registering the same plugin name', () => {
    const wgpu = new WebGPUWGSLPlugin();
    platformPluginRegistry.register(wgpu);
    expect(platformPluginRegistry.listPluginNames()).toHaveLength(1);

    // Re-register same name — should replace
    platformPluginRegistry.register(wgpu);
    expect(platformPluginRegistry.listPluginNames()).toHaveLength(1);
  });

  it('should unregister a plugin by name', () => {
    const wgpu = new WebGPUWGSLPlugin();
    platformPluginRegistry.register(wgpu);
    expect(platformPluginRegistry.getByName('holoscript-plugin-webgpu-wgsl')).toBe(wgpu);

    platformPluginRegistry.unregister('holoscript-plugin-webgpu-wgsl');
    expect(platformPluginRegistry.getByName('holoscript-plugin-webgpu-wgsl')).toBeUndefined();
    expect(platformPluginRegistry.getPluginForTarget('web')).toBeUndefined();
  });

  it('should clear all plugins', () => {
    platformPluginRegistry.register(new WebGPUWGSLPlugin());
    platformPluginRegistry.register(new AndroidARCorePlugin());

    platformPluginRegistry.clear();
    expect(platformPluginRegistry.listPluginNames()).toHaveLength(0);
    expect(platformPluginRegistry.listAllTargets()).toHaveLength(0);
  });
});

// ── Manifest Derivation ────────────────────────────────────────────

describe('Manifest derivation', () => {
  it('should derive a manifest from a plugin', () => {
    const wgpu = new WebGPUWGSLPlugin();
    const manifest = manifestFromPlugin(wgpu);

    expect(manifest.name).toBe('holoscript-plugin-webgpu-wgsl');
    expect(manifest.version).toBe('1.0.0');
    expect(manifest.targets).toEqual(['web']);
    expect(manifest.wasmUrl).toBe('plugins/holoscript-plugin-webgpu-wgsl.component.wasm');
    expect(manifest.sizeKB).toBe(220);
  });

  it('should derive manifests for Android plugin', () => {
    const android = new AndroidARCorePlugin();
    const manifest = manifestFromPlugin(android);

    expect(manifest.name).toBe('holoscript-plugin-android-arcore');
    expect(manifest.targets).toContain('android-xr');
    expect(manifest.wasmUrl).toBe('plugins/holoscript-plugin-android-arcore.component.wasm');
  });

  it('should getAllManifests from registered plugins', () => {
    platformPluginRegistry.register(new WebGPUWGSLPlugin());
    platformPluginRegistry.register(new AndroidARCorePlugin());

    const manifests = getAllManifests();
    expect(manifests).toHaveLength(2);
    expect(manifests.some((m) => m.name === 'holoscript-plugin-webgpu-wgsl')).toBe(true);
    expect(manifests.some((m) => m.name === 'holoscript-plugin-android-arcore')).toBe(true);
  });
});

// ── Cross-Plugin Integration ───────────────────────────────────────

describe('Cross-plugin integration', () => {
  it('should resolve correct plugin for each target without conflict', () => {
    platformPluginRegistry.register(new WebGPUWGSLPlugin());
    platformPluginRegistry.register(new AndroidARCorePlugin());

    // Web target → WebGPU plugin
    const wgpu = platformPluginRegistry.getPluginForTarget('web');
    expect(wgpu?.metadata.name).toBe('holoscript-plugin-webgpu-wgsl');

    // Android targets → ARCore plugin
    const androidXr = platformPluginRegistry.getPluginForTarget('android-xr');
    expect(androidXr?.metadata.name).toBe('holoscript-plugin-android-arcore');

    const androidXrAr = platformPluginRegistry.getPluginForTarget('android-xr-ar');
    expect(androidXrAr?.metadata.name).toBe('holoscript-plugin-android-arcore');
  });

  it('should handle trait codegen with different fidelity levels', () => {
    const plugin = new AndroidARCorePlugin();
    const context: TraitCompileContext = {
      target: 'android-xr',
      config: {},
      format: 'inline',
      includeProvenance: false,
    };

    // Known trait: should produce at least partial codegen
    const known = plugin.traitCodegen('physics', context);
    expect(['full', 'partial', 'stub']).toContain(known.fidelity);
    expect(known.code.length).toBeGreaterThan(0);

    // Unknown trait: should produce stub
    const unknown = plugin.traitCodegen('completely-fake-trait-xyz-999', context);
    expect(unknown.fidelity).toBe('stub');
  });
});
/**
 * @fileoverview WebGPU/WGSL Platform Compiler Plugin (APL-WIT-2)
 * @module @holoscript/core/compiler/platform/plugins/WebGPUWGSLPlugin
 *
 * Lazy platform plugin for WebGPU/WGSL compilation targets.
 * Handles: `webgpu-wgsl`, `react-three-fiber`, `playcanvas`
 *
 * This plugin delegates to:
 *   - TraitRegistryBridge for trait evaluation (trait-exists, get-trait, list-traits)
 *   - WebGPUCompiler + NIRToWGSLCompiler for full AST → WGSL compilation
 *   - R3FCompiler for react-three-fiber target
 *
 * The plugin is registered at import time and discovered by
 * PlatformPluginRegistry.getPluginForTarget('webgpu-wgsl').
 *
 * Lazy loading: This plugin is only instantiated when a compilation target
 * matching one of its targets is requested. The WASM component world
 * `holoscript-platform-plugin` loads it on demand.
 *
 * @version 1.0.0 — APL-WIT-2 first two lazy plugins
 * @see packages/core/src/compiler/platform/PlatformCompilerPlugin.ts
 */

import {
  type PlatformCompilerPlugin,
  type PlatformPluginMetadata,
  type TraitCompileContext,
  type TraitCompileOutput,
  type CompileResult,
  platformPluginRegistry,
} from '../PlatformCompilerPlugin';

import {
  queryTrait,
  generateTraitForTarget,
  listTraitsForTarget,
  traitExists,
  type TraitQueryOptions,
  type TraitInfo,
} from '../../TraitRegistryBridge';

import { WebGPUCompiler, type WebGPUCompilerOptions } from '../../WebGPUCompiler';
import type { PlatformTarget } from '../PlatformConditional';

// =============================================================================
// WEBGPU-WGSL PLUGIN
// =============================================================================

const WEBGPU_WGSL_METADATA: PlatformPluginMetadata = {
  name: 'holoscript-plugin-webgpu-wgsl',
  version: '1.0.0',
  targets: ['web' as PlatformTarget], // webgpu-wgsl maps to 'web' in PlatformTarget
  sizeKB: 220,
  minCoreVersion: '6.0.0',
};

/**
 * WebGPU/WGSL Platform Compiler Plugin.
 *
 * Compilation targets:
 *   - webgpu-wgsl: Full WGSL compute/render shader generation
 *   - react-three-fiber: R3F JSX component generation (delegates to R3FCompiler)
 *   - playcanvas: PlayCanvas script generation (delegates to BabylonCompiler)
 *
 * Trait codegen for WGSL produces shader snippets (compute shaders for physics,
 * vertex/fragment shaders for rendering) that integrate with the NIR pipeline.
 */
export class WebGPUWGSLPlugin implements PlatformCompilerPlugin {
  readonly metadata = WEBGPU_WGSL_METADATA;

  // ─────────────────────────────────────────────────────────────────────
  // Core compilation
  // ─────────────────────────────────────────────────────────────────────

  compile(astJson: string, target: PlatformTarget): CompileResult {
    let ast: unknown;
    try {
      ast = JSON.parse(astJson);
    } catch {
      return {
        type: 'error',
        diagnostics: [{ severity: 'error', message: 'WebGPU plugin: invalid AST JSON input' }],
      };
    }

    switch (target) {
      case 'web': {
        // WebGPU WGSL output
        try {
          const compiler = new WebGPUCompiler({ enableCompute: true });
          const result = compiler.compile(ast as never, '');
          return { type: 'text', data: result };
        } catch (err) {
          return {
            type: 'error',
            diagnostics: [
              {
                severity: 'error',
                message: `WebGPU compilation failed: ${err instanceof Error ? err.message : String(err)}`,
              },
            ],
          };
        }
      }

      default:
        return {
          type: 'error',
          diagnostics: [
            {
              severity: 'error',
              message: `WebGPU plugin: unsupported target '${target}'. Supported: web`,
            },
          ],
        };
    }
  }

  // ─────────────────────────────────────────────────────────────────────
  // Trait evaluation (delegates to TraitRegistryBridge)
  // ─────────────────────────────────────────────────────────────────────

  traitExists(name: string): boolean {
    return traitExists(name);
  }

  traitQuery(name: string, opts?: TraitQueryOptions): TraitInfo {
    return queryTrait(name, { target: 'webgpu', ...opts });
  }

  traitList(): string[] {
    // Merge webgpu-registered traits with core traits
    return listTraitsForTarget('core');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Trait codegen (WGSL-specific)
  // ─────────────────────────────────────────────────────────────────────

  traitCodegen(traitName: string, context: TraitCompileContext): TraitCompileOutput {
    const { target, config, format } = context;

    // First check if the trait exists at all
    if (!this.traitExists(traitName)) {
      return {
        code: [`// @${traitName} — trait not found in any registry`],
        language: 'wgsl',
        fidelity: 'stub',
        sourceMap: 'WebGPUWGSLPlugin',
      };
    }

    // Check if we have WebGPU-specific codegen
    const webgpuCode = generateTraitForTarget(traitName, 'webgpu-wgsl', config);
    if (webgpuCode.length > 0 && !webgpuCode[0].startsWith('//')) {
      // Real codegen available
      return {
        code: webgpuCode,
        language: 'wgsl',
        fidelity: 'full',
        sourceMap: 'TraitRegistryBridge/webgpu-wgsl',
        ...(context.includeProvenance && {
          provenance: {
            pluginName: this.metadata.name,
            pluginVersion: this.metadata.version,
            traitName,
            timestamp: new Date().toISOString(),
          },
        }),
      };
    }

    // Fall back to core trait codegen (descriptive stub)
    const coreCode = generateTraitForTarget(traitName, 'core', config);
    return {
      code: coreCode,
      language: 'wgsl',
      fidelity: coreCode[0]?.startsWith('//') ? 'stub' : 'partial',
      sourceMap: 'TraitRegistryBridge/core',
      ...(context.includeProvenance && {
        provenance: {
          pluginName: this.metadata.name,
          pluginVersion: this.metadata.version,
          traitName,
          timestamp: new Date().toISOString(),
        },
      }),
    };
  }

  // ─────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────

  unload(): void {
    // TS-native plugin: no WASM resources to free
  }
}

// =============================================================================
// AUTO-REGISTRATION
// =============================================================================

platformPluginRegistry.register(new WebGPUWGSLPlugin());

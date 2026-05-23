/**
 * @fileoverview Android/ARCore Platform Compiler Plugin (APL-WIT-2)
 * @module @holoscript/core/compiler/platform/plugins/AndroidARCorePlugin
 *
 * Lazy platform plugin for Android XR / ARCore compilation targets.
 * Handles: `android-xr`, `android-xr-ar`
 *
 * This plugin delegates to:
 *   - TraitRegistryBridge for trait evaluation
 *   - AndroidXRCompiler for full AST → Kotlin/ARCore compilation
 *   - AndroidXRTraitMap for per-trait code generation
 *
 * The plugin is registered at import time and discovered by
 * PlatformPluginRegistry.getPluginForTarget('android-xr').
 *
 * This is the first concrete realization of the `holoscript-platform-plugin`
 * WIT world calling back into the TS dispatch for codegen.
 *
 * @version 1.0.0 — APL-WIT-2 first two lazy plugins
 * @see packages/core/src/compiler/platform/PlatformCompilerPlugin.ts
 * @see packages/core/src/compiler/AndroidXRTraitMap.ts
 */

import {
  type PlatformCompilerPlugin,
  type PlatformPluginMetadata,
  type TraitCompileContext,
  type TraitCompileOutput,
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

import { AndroidXRCompiler } from '../../AndroidXRCompiler';
import type { CompileResult, Diagnostic } from '../../CompilerBase';
import type { PlatformTarget } from '../PlatformConditional';

// =============================================================================
// ANDROID/ARCORE PLUGIN
// =============================================================================

const ANDROID_ARCORE_METADATA: PlatformPluginMetadata = {
  name: 'holoscript-plugin-android-arcore',
  version: '1.0.0',
  targets: ['android-xr' as PlatformTarget, 'android-xr-ar' as PlatformTarget],
  sizeKB: 300,
  minCoreVersion: '6.0.0',
};

/**
 * Android/ARCore Platform Compiler Plugin.
 *
 * Compilation targets:
 *   - android-xr: Full Kotlin/Jetpack XR output with ARCore Session
 *   - android-xr-ar: AR-specific Kotlin output with ARCore depth traits
 *
 * Trait codegen for Android XR produces Kotlin/ARCore integration snippets
 * (SceneCoreEntity composables, ARCore session setup, hand tracking, etc.)
 * that integrate with the AndroidXRCompiler output.
 */
export class AndroidARCorePlugin implements PlatformCompilerPlugin {
  readonly metadata = ANDROID_ARCORE_METADATA;

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
        diagnostics: [
          { severity: 'error', message: 'Android/ARCore plugin: invalid AST JSON input' },
        ],
      };
    }

    switch (target) {
      case 'android-xr':
      case 'android-xr-ar': {
        try {
          const compiler = new AndroidXRCompiler({
            formFactor: target === 'android-xr-ar' ? 'glasses' : 'headset',
          });
          const result = compiler.compile(ast as never, 'apl-plugin-token');
          // AndroidXRCompiler returns AndroidXRCompileResult, extract text
          const output =
            typeof result === 'string'
              ? result
              : JSON.stringify(result, null, 2);
          return { type: 'text', data: output };
        } catch (err) {
          return {
            type: 'error',
            diagnostics: [
              {
                severity: 'error',
                message: `Android/ARCore compilation failed: ${err instanceof Error ? err.message : String(err)}`,
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
              message: `Android/ARCore plugin: unsupported target '${target}'. Supported: android-xr, android-xr-ar`,
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
    return queryTrait(name, { target: 'android-xr', ...opts });
  }

  traitList(): string[] {
    // Android XR has its own rich trait map
    return listTraitsForTarget('android-xr');
  }

  // ─────────────────────────────────────────────────────────────────────
  // Trait codegen (Kotlin/ARCore-specific)
  // ─────────────────────────────────────────────────────────────────────

  traitCodegen(traitName: string, context: TraitCompileContext): TraitCompileOutput {
    const { target, config, format } = context;

    // First check if the trait exists at all
    if (!this.traitExists(traitName)) {
      return {
        code: [`// @${traitName} — trait not found in any registry`],
        language: 'kotlin',
        fidelity: 'stub',
        sourceMap: 'AndroidARCorePlugin',
      };
    }

    // Check if we have Android XR-specific codegen via the trait map
    const androidCode = generateTraitForTarget(traitName, 'android-xr', config);
    if (androidCode.length > 0 && !androidCode[0].startsWith('//')) {
      // Real codegen available from AndroidXRTraitMap
      return {
        code: androidCode,
        language: 'kotlin',
        fidelity: 'full',
        sourceMap: 'AndroidXRTraitMap',
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
      language: 'kotlin',
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

platformPluginRegistry.register(new AndroidARCorePlugin());
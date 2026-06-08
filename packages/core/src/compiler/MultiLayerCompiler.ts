/**
 * @fileoverview Multi-Layer Compiler
 * @module @holoscript/core/compiler
 *
 * PURPOSE:
 * Orchestrates the compilation of a single .holo composition into multiple target
 * outputs (VR, VRR, AR) based on trait awareness and layer targets.
 *
 * RATCHET: The VR slice passes the FULL un-filtered composition to BabylonCompiler.
 * AR and VRR slices use their own compilers but do not strip foreign-trait nodes
 * before passing them. Per-layer AST filtering is not yet implemented.
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes.js';
import { VRRCompiler, type VRRCompilationResult } from './VRRCompiler.js';
import { ARCompiler, type ARCompilationResult } from './ARCompiler.js';
import { BabylonCompiler } from './BabylonCompiler.js'; // Assuming standard VR target
import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';

export interface MultiLayerCompilerOptions {
  targets: Array<'vr' | 'vrr' | 'ar'>;
  minify: boolean;
  source_maps: boolean;
}

export interface MultiLayerCompilationResult {
  vr?: string;
  vrr?: VRRCompilationResult;
  ar?: ARCompilationResult;
  success: boolean;
  warnings: string[];
  errors: string[];
}

export class MultiLayerCompiler extends CompilerBase {
  protected readonly compilerName = 'MultiLayerCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.MULTI_LAYER;
  }

  private options: MultiLayerCompilerOptions;

  constructor(options: MultiLayerCompilerOptions) {
    super();
    this.options = options;
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): MultiLayerCompilationResult {
    this.validateCompilerAccess(agentToken, outputPath);
    const result: MultiLayerCompilationResult = {
      success: true,
      warnings: [],
      errors: [],
    };

    if (this.options.targets.includes('ar')) {
      const arCompiler = new ARCompiler({
        target: 'webxr',
        minify: this.options.minify,
        source_maps: this.options.source_maps,
        features: { hit_test: true, image_tracking: true },
      });
      const arResult = arCompiler.compile(composition, agentToken);
      result.ar = arResult;
      if (!arResult.success) result.success = false;
    }

    if (this.options.targets.includes('vrr')) {
      const vrrCompiler = new VRRCompiler({
        target: 'threejs',
        minify: this.options.minify,
        source_maps: this.options.source_maps,
        performance: { target_fps: 60, max_players: 1000, lazy_loading: true },
        api_integrations: {}, // Configured upstream based on @reality_mirror traits
      });
      const vrrResult = vrrCompiler.compile(composition, agentToken);
      result.vrr = vrrResult;
      if (!vrrResult.success) result.success = false;
    }

    if (this.options.targets.includes('vr')) {
      const vrCompiler = new BabylonCompiler({});
      // The BabylonCompiler handles standard VR.
      // RATCHET: No AST pre-filter for VR layer — AR/VRR-only nodes leak into Babylon output.
      // filterCompositionForPlatform(composition, 'vr') should be called before compile.
      try {
        const vrResult = vrCompiler.compile(composition, agentToken);
        result.vr = vrResult;
      } catch (err: unknown) {
        result.success = false;
        result.errors.push(
          `VR Compilation Error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return result;
  }
}

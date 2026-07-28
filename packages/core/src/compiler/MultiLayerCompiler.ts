/**
 * @fileoverview Multi-Layer Compiler (RETIRED)
 *
 * MultiLayerCompiler was retired 2026-06-17 along with the apex-poison web compilers
 * it depended on (BabylonCompiler, VRRCompiler, ARCompiler). The 'multi-layer' export
 * target is no longer dispatched from ExportManager.
 *
 * Preserved as a type-stub so legacy imports compile without hard errors during
 * the transition window. Remove after all callers have been updated.
 *
 * Idea seed: see docs/handbooks/idea-seeds.md
 * "Resurrect Apex-Poison Compilers as Fire-and-Forget Export Targets"
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';

export interface MultiLayerCompilerOptions {
  targets: Array<'vr' | 'vrr' | 'ar'>;
  minify: boolean;
  source_maps: boolean;
}

export interface MultiLayerCompilationResult {
  vr?: string;
  vrr?: Record<string, unknown>;
  ar?: Record<string, unknown>;
  success: boolean;
  warnings: string[];
  errors: string[];
}

/** @deprecated Retired 2026-06-17 — apex-poison compiler dependencies removed. */
export class MultiLayerCompiler extends CompilerBase {
  protected readonly compilerName = 'MultiLayerCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.MULTI_LAYER;
  }

  constructor(_options: MultiLayerCompilerOptions) {
    super();
  }

  compile(_composition: unknown, _agentToken: string, _outputPath?: string): never {
    throw new Error(
      'MultiLayerCompiler has been retired. Its dependencies (BabylonCompiler, VRRCompiler, ARCompiler) ' +
        'were apex-poison web compilers removed in 2026-06-17. ' +
        'Use the native BrowserRuntime path for VR/AR delivery. ' +
        'See docs/handbooks/idea-seeds.md for the planned fire-and-forget export revival.'
    );
  }
}

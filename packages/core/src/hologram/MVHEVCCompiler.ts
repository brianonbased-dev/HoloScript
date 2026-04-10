/**
 * MVHEVCCompiler -- Core wrapper with RBAC enforcement.
 *
 * Delegates actual compilation to @holoscript/engine's MVHEVCCompiler
 * but enforces agent identity validation via CompilerBase.
 *
 * Re-exports all engine types for downstream consumers.
 */
import { CompilerBase } from '../compiler/CompilerBase';
import {
  MVHEVCCompiler as EngineMVHEVCCompiler, // @ts-ignore
} from '../../../engine/src/hologram/MVHEVCCompiler';

import type {
  MVHEVCConfig,
  MVHEVCStereoView,
  MVHEVCCompilationResult,
  HoloComposition,
  // @ts-ignore
} from '../../../engine/src/hologram/MVHEVCCompiler';

export type { MVHEVCConfig, MVHEVCStereoView, MVHEVCCompilationResult, HoloComposition };

/**
 * MVHEVCCompiler with RBAC gate.
 *
 * - `compile(composition, agentToken)` validates the token then returns Swift code.
 * - `compileMVHEVC(composition, overrides?)` skips RBAC (internal use).
 */
export class MVHEVCCompiler extends CompilerBase {
  protected readonly compilerName = 'MVHEVCCompiler';
  private engine = new EngineMVHEVCCompiler();

  /**
   * Compile with RBAC enforcement -- validates agentToken before delegating.
   */
  compile(composition: unknown, agentToken: string, outputPath?: string): string {
    // CompilerBase RBAC: falsy tokens bypass, truthy tokens are validated as JWT
    this.validateCompilerAccess(agentToken, outputPath);
    return this.engine.compile(composition as HoloComposition, agentToken, outputPath);
  }

  /**
   * Full MV-HEVC compilation (no RBAC -- for internal/direct use).
   */
  compileMVHEVC(
    composition: HoloComposition,
    overrides?: Partial<MVHEVCConfig>
  ): MVHEVCCompilationResult {
    return this.engine.compileMVHEVC(composition, overrides);
  }
}

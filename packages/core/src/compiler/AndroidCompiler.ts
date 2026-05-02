/**
 * HoloScript → Android Kotlin ARCore Compiler
 *
 * Translates a HoloComposition AST into Kotlin code targeting
 * ARCore for Android augmented reality experiences.
 *
 * Emits:
 *   - Kotlin Activity with ARCore Session
 *   - SceneForm / Filament rendering
 *   - Plane detection and hit testing
 *   - Touch gesture handling
 *   - Spatial audio integration
 *
 * @version 2.0.0 — Extracted shared helpers to AndroidKotlinHelpers
 */

import type { HoloComposition, HoloObjectDecl, HoloValue } from '../parser/HoloCompositionTypes';
import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type { AndroidCompileResult } from './CompilerTypes';
export type { AndroidCompileResult } from './CompilerTypes';
import {
  generateActivityFile,
  generateStateFile,
  generateNodeFactoryFile,
  generateManifestFile,
  generateBuildGradle,
} from './AndroidARGenerators';
import {
  hasNPUSceneTraits,
  emitNPUSceneSetup,
  hasAuthoringTraits,
  emitAuthoringSetup,
} from './AndroidFeatureGenerators';
import {
  hasHapticTraits,
  emitHapticSetup,
  hasNearbyTraits,
  emitNearbySetup,
  hasFoldableTraits,
  emitFoldableSetup,
  hasDexTraits,
  emitDexSetup,
  hasLensTraits,
  emitLensSetup,
  hasWebXRTraits,
  emitWebXRSetup,
} from './AndroidPeripheralGenerators';
import {
  toKotlinType as _toKotlinType,
  toKotlinValue as _toKotlinValue,
  sanitizeNameCapitalized,
  toAndroidColor as _toAndroidColor,
  getSceneformGeometry as _getSceneformGeometry,
  findObjProp as _findObjProp,
  compositionHasTrait as _compositionHasTrait,
} from './AndroidKotlinHelpers';

export interface AndroidCompilerOptions {
  packageName?: string;
  className?: string;
  indent?: string;
  minSdk?: number;
  targetSdk?: number;
  useJetpackCompose?: boolean;
  useSceneform?: boolean; // Deprecated but simpler
  useFilament?: boolean; // Modern but complex
}

export class AndroidCompiler extends CompilerBase {
  protected readonly compilerName = 'AndroidCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.ANDROID;
  }

  public options: Required<AndroidCompilerOptions>;
  public lines: string[] = [];
  public indentLevel: number = 0;

  constructor(options: AndroidCompilerOptions = {}) {
    super();
    this.options = {
      packageName: options.packageName || 'com.holoscript.generated',
      className: options.className || 'GeneratedARScene',
      indent: options.indent || '    ',
      minSdk: options.minSdk || 26,
      targetSdk: options.targetSdk || 34,
      useJetpackCompose: options.useJetpackCompose ?? true,
      useSceneform: options.useSceneform ?? true,
      useFilament: options.useFilament ?? false,
    };
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): AndroidCompileResult {
    this.validateCompilerAccess(agentToken, outputPath);
    const result: AndroidCompileResult = {
      activityFile: generateActivityFile(this, composition),
      stateFile: generateStateFile(this, composition),
      nodeFactoryFile: generateNodeFactoryFile(this, composition),
      manifestFile: generateManifestFile(this, composition),
      buildGradle: generateBuildGradle(this, composition),
    };

    if (hasNPUSceneTraits(composition)) {
      result.npuSceneSetup = emitNPUSceneSetup(this, composition);
    }

    if (hasAuthoringTraits(composition)) {
      result.authoringSetup = emitAuthoringSetup(this, composition);
    }

    if (hasHapticTraits(composition)) {
      result.hapticSetup = emitHapticSetup(this, composition);
    }

    if (hasNearbyTraits(composition)) {
      result.nearbySetup = emitNearbySetup(this, composition);
    }

    if (hasFoldableTraits(composition)) {
      result.foldableSetup = emitFoldableSetup(this, composition);
    }

    if (hasDexTraits(composition)) {
      result.dexSetup = emitDexSetup(this, composition);
    }

    if (hasLensTraits(composition)) {
      result.lensSetup = emitLensSetup(this, composition);
    }

    if (hasWebXRTraits(composition)) {
      result.webxrSetup = emitWebXRSetup(this, composition);
    }

    return result;
  }

  public emit(line: string): void {
    const indent = this.options.indent.repeat(this.indentLevel);
    this.lines.push(indent + line);
  }

  /** @deprecated Use sanitizeNameCapitalized from AndroidKotlinHelpers */
  public sanitizeName(name: string): string {
    return sanitizeNameCapitalized(name);
  }

  /** @deprecated Use getSceneformGeometry from AndroidKotlinHelpers */
  public getSceneformGeometry(meshType: string): string {
    return _getSceneformGeometry(meshType);
  }

  /** @deprecated Use findObjProp from AndroidKotlinHelpers */
  public findObjProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return _findObjProp(obj, key);
  }

  /** @deprecated Use toKotlinType from AndroidKotlinHelpers */
  public toKotlinType(value: HoloValue): string {
    return _toKotlinType(value);
  }

  /** @deprecated Use toKotlinValue from AndroidKotlinHelpers */
  public toKotlinValue(value: HoloValue): string {
    return _toKotlinValue(value, (s, t) => this.escapeStringValue(s, t));
  }

  /** @deprecated Use toAndroidColor from AndroidKotlinHelpers */
  public toAndroidColor(value: HoloValue | undefined): string {
    return _toAndroidColor(value);
  }

  /** @deprecated Use compositionHasTrait from AndroidKotlinHelpers */
  public compositionHasTrait(composition: HoloComposition, traitName: string): boolean {
    return _compositionHasTrait(composition, traitName);
  }
}

export function compileToAndroid(
  composition: HoloComposition,
  options?: AndroidCompilerOptions
): Promise<AndroidCompileResult> {
  const compiler = new AndroidCompiler(options);
  return Promise.resolve(compiler.compile(composition, 'test-token', undefined));
}

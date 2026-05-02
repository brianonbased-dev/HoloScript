/**
 * HoloScript -> Android XR Compiler
 *
 * Translates a HoloComposition AST into Kotlin code targeting Android XR
 * (Jetpack XR / ARCore extensions).
 *
 * Updated for Android XR SDK Developer Preview 3:
 *   - SceneCoreEntity composable for placing entities in Subspace layouts
 *   - URI-based GltfModel loading (GltfModel.create with Uri/Path)
 *   - Face tracking with 68 blendshapes (FaceTrackingMode.BLEND_SHAPES)
 *   - UserSubspace follow-behavior for head-following UI
 *   - SurfaceEntity with DRM (SurfaceProtection.PROTECTED + Widevine)
 *
 * AI Glasses Mode (formFactor: 'glasses'):
 *   - Jetpack Compose Glimmer UI toolkit (GlimmerTheme, Card, Button, Text)
 *   - Jetpack Projected API (ProjectedContext, ProjectedDeviceController)
 *   - Lightweight AR overlay output vs immersive XR
 *   - xr_projected display category in manifest
 *   - Glasses-specific Gradle dependencies (glimmer, projected)
 *   - Touchpad + voice input modality
 *   - Optimized for optical see-through displays
 *
 * Emits:
 *   - Activity class with Jetpack Compose for XR (headset) or Glimmer (glasses)
 *   - ARCore Session setup
 *   - SceneCore entity hierarchy via SceneCoreEntity composable
 *   - Spatial panel and orb placement
 *   - GltfModelEntity with URI-based model loading
 *   - Passthrough and plane detection
 *   - Hand tracking and face tracking integration
 *   - Spatial audio with Oboe
 *   - SurfaceEntity with DRM-protected video playback
 *
 * @version 3.1.0 — Extracted shared helpers to AndroidKotlinHelpers
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloSpatialGroup,
  HoloLight,
  HoloEnvironment,
  HoloCamera,
  HoloTimeline,
  HoloAudio,
  HoloZone,
  HoloUI,
  HoloTransition,
  HoloValue,
  HoloEffects,
} from '../parser/HoloCompositionTypes';
import {
  compileDomainBlocks,
  compileMaterialBlock,
  compilePhysicsBlock,
  compileParticleBlock,
  compilePostProcessingBlock,
  compileAudioSourceBlock,
  compileWeatherBlock,
  materialToAndroidXR,
  physicsToAndroidXR,
  particlesToAndroidXR,
  audioSourceToAndroidXR,
  weatherToAndroidXR,
} from './DomainBlockCompilerMixin';
import type { CompiledPostProcessing } from './DomainBlockCompilerMixin';
import {
  toKotlinType as _toKotlinType,
  toKotlinValue as _toKotlinValue,
  sanitizeName as _sanitizeName,
  toKotlinColor as _toKotlinColor,
  mapShapeToFilament as _mapShapeToFilament,
  findObjProp as _findProp,
  compositionUsesArCoreDepthTraits as _compositionUsesArCoreDepthTraits,
  toKotlinFloat3 as _toKotlinFloat3,
} from './AndroidKotlinHelpers';

import type { AndroidXRCompileResult } from './CompilerTypes';
export type { AndroidXRCompileResult } from './CompilerTypes';

export type AndroidXRFormFactor = 'headset' | 'glasses';

export interface AndroidXRCompilerOptions {
  packageName?: string;
  activityName?: string;
  useFilament?: boolean;
  useARCore?: boolean;
  indent?: string;
  minSdk?: number;
  targetSdk?: number;
  arCameraHardwareRequired?: boolean;
  formFactor?: AndroidXRFormFactor;
  provenanceHash?: string;
}

export class AndroidXRCompiler extends CompilerBase {
  protected readonly compilerName = 'AndroidXRCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.ANDROID_XR;
  }

  public options: Required<AndroidXRCompilerOptions>;
  public lines: string[] = [];
  public indentLevel: number = 0;

  constructor(options: AndroidXRCompilerOptions = {}) {
    super();
    this.options = {
      packageName: options.packageName || 'com.holoscript.generated',
      activityName: options.activityName || 'GeneratedXRActivity',
      useFilament: options.useFilament ?? true,
      useARCore: options.useARCore ?? true,
      arCameraHardwareRequired: options.arCameraHardwareRequired ?? false,
      indent: options.indent || '    ',
      minSdk: options.minSdk || 30,
      targetSdk: options.targetSdk || 35,
      formFactor: options.formFactor || 'headset',
      provenanceHash: options.provenanceHash ?? '',
    };
  }

  get isGlassesMode(): boolean {
    return this.options.formFactor === 'glasses';
  }

  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): AndroidXRCompileResult {
    this.validateCompilerAccess(agentToken, outputPath);

    if (this.isGlassesMode) {
      return {
        activityFile: generateGlassesActivityFile(this, composition),
        stateFile: generateStateFile(this, composition),
        nodeFactoryFile: generateNodeFactoryFile(this, composition),
        manifestFile: generateGlassesManifestFile(this, composition),
        buildGradle: generateGlassesBuildGradle(this, composition),
        glimmerComponentsFile: generateGlimmerComponentsFile(this, composition),
      };
    }

    return {
      activityFile: generateActivityFile(this, composition),
      stateFile: generateStateFile(this, composition),
      nodeFactoryFile: generateNodeFactoryFile(this, composition),
      manifestFile: generateManifestFile(this, composition),
      buildGradle: generateBuildGradle(this, composition),
    };
  }

  public emit(line: string): void {
    this.lines.push(this.options.indent.repeat(this.indentLevel) + line);
  }

  public indent(): void {
    this.indentLevel++;
  }
  public dedent(): void {
    if (this.indentLevel > 0) this.indentLevel--;
  }

  /** @deprecated Use sanitizeName from AndroidKotlinHelpers */
  public sanitizeName(name: string): string {
    return _sanitizeName(name);
  }

  /** @deprecated Use toKotlinFloat3 from AndroidKotlinHelpers */
  public toKotlinFloat3(arr: number[]): string {
    return _toKotlinFloat3(arr);
  }

  /** @deprecated Use toKotlinColor from AndroidKotlinHelpers */
  public toKotlinColor(hex: string): string {
    return _toKotlinColor(hex);
  }

  /** @deprecated Use mapShapeToFilament from AndroidKotlinHelpers */
  public mapShapeToFilament(type: string): string {
    return _mapShapeToFilament(type);
  }

  /** @deprecated Use toKotlinType from AndroidKotlinHelpers */
  public toKotlinType(value: HoloValue): string {
    return _toKotlinType(value);
  }

  /** @deprecated Use toKotlinValue from AndroidKotlinHelpers */
  public toKotlinValue(value: HoloValue): string {
    return _toKotlinValue(value, (s, t) => this.escapeStringValue(s, t));
  }

  /** @deprecated Use findObjProp from AndroidKotlinHelpers (note: XR uses 'findProp' alias) */
  public findProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return _findProp(obj, key);
  }

  /** @deprecated Use compositionUsesArCoreDepthTraits from AndroidKotlinHelpers */
  public compositionUsesArCoreDepthTraits(composition: HoloComposition): boolean {
    return _compositionUsesArCoreDepthTraits(composition);
  }
}

import {
  generateActivityFile,
  generateStateFile,
  generateNodeFactoryFile,
  generateManifestFile,
  generateBuildGradle,
} from './AndroidXRGenerators';
import {
  generateGlassesActivityFile,
  generateGlassesManifestFile,
  generateGlassesBuildGradle,
  generateGlimmerComponentsFile,
} from './AndroidXRGlassesGenerators';

export function compileToAndroidXR(
  composition: HoloComposition,
  options?: AndroidXRCompilerOptions
): AndroidXRCompileResult {
  const compiler = new AndroidXRCompiler(options);
  return compiler.compile(composition, '');
}

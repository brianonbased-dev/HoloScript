/**
 * HoloScript → Android Kotlin ARCore Compiler
 *
 * Translates a HoloComposition AST into Kotlin code targeting
 * ARCore for Android augmented reality experiences.
 *
 * Emits (SceneView 4.18.0, Apache 2.0 — the maintained successor to the EOL Sceneform fork):
 *   - Jetpack-Compose ComponentActivity hosting a declarative SceneView ARScene { }
 *   - One node composable (CubeNode / SphereNode / CylinderNode) per HoloScript object
 *   - Filament rendering + ARCore plane detection via SceneView
 *   - SceneView-floor gradle (compileSdk 36, Kotlin 2.3.21, compose-compiler plugin)
 *
 * @version 3.0.0 — Retargeted Sceneform → SceneView (compile_to_android base render path)
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
  hasGeoAnchorTraits,
  emitGeoAnchorSetup,
  hasGeospatialVPSTraits,
  emitGeospatialVPSSetup,
  hasDepthScanTraits,
  emitDepthScanSetup,
  hasPortalARTraits,
  emitPortalARSetup,
  hasHandTrackingTraits,
  emitHandTrackingSetup,
} from './AndroidSceneViewFeatureGenerators';
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
  versionCode?: number;
  versionName?: string;
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
      versionCode: options.versionCode ?? 1,
      versionName: options.versionName || '1.0',
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

    if (hasGeoAnchorTraits(composition)) {
      result.geoAnchorSetup = emitGeoAnchorSetup(this, composition);
    }

    if (hasGeospatialVPSTraits(composition)) {
      result.geospatialVPSSetup = emitGeospatialVPSSetup(this, composition);
    }

    if (hasDepthScanTraits(composition)) {
      result.depthScanSetup = emitDepthScanSetup(this, composition);
    }

    if (hasPortalARTraits(composition)) {
      result.portalARSetup = emitPortalARSetup(this, composition);
    }

    if (hasHandTrackingTraits(composition)) {
      result.handTrackingSetup = emitHandTrackingSetup(this, composition);
    }

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

  /**
   * Compile to a path-keyed map of reference-relative files (Android project layout).
   *
   * Mirrors AndroidXRCompiler.compileToFiles(): the native return is named fields
   * (AndroidCompileResult), so this adapter maps those fields onto the on-disk Android
   * project layout, letting the SAME byte-diff golden gate + committed-reference-app pattern
   * (QuestCompiler / AndroidXRCompiler) apply to the legacy plain-Android (ARCore) target.
   * Keys are POSIX-relative to the app project root (the dir holding settings.gradle.kts).
   *
   * Optional feature-setup fields (npuSceneSetup, hapticSetup, …) are emitted as extra
   * Kotlin files under the same package dir, keyed off the field name, so the gate covers
   * them when a trait pulls them in. The field→filename map is fixed so output is stable.
   */
  public compileToFiles(composition: HoloComposition, agentToken = ''): Record<string, string> {
    const r = this.compile(composition, agentToken);
    const pkgPath = this.options.packageName.replace(/\./g, '/');
    const javaRel = `app/src/main/java/${pkgPath}`;
    // The activity class emitted by AndroidARGenerators is `${className}Activity` and the
    // manifest references `.${className}Activity`, so the file follows Kotlin's one-public-
    // class-per-file convention and is named after the class.
    // SceneView's declarative ARScene { } dissolves the Sceneform SceneState
    // ViewModel + NodeFactory (generateStateFile / generateNodeFactoryFile now
    // emit ''), so only the Compose activity, manifest, and app gradle are written.
    const files: Record<string, string> = {
      [`${javaRel}/${this.options.className}Activity.kt`]: r.activityFile,
      'app/src/main/AndroidManifest.xml': r.manifestFile,
      'app/build.gradle.kts': r.buildGradle,
    };
    // Optional feature setups → stable per-field Kotlin filenames (only when present).
    const featureFiles: Record<string, string> = {
      geoAnchorSetup: 'GeoAnchorSetup.kt',
      geospatialVPSSetup: 'GeospatialVPSSetup.kt',
      depthScanSetup: 'DepthScanSetup.kt',
      portalARSetup: 'PortalARSetup.kt',
      handTrackingSetup: 'HandTrackingSetup.kt',
      npuSceneSetup: 'NPUSceneSetup.kt',
      authoringSetup: 'AuthoringSetup.kt',
      hapticSetup: 'HapticSetup.kt',
      nearbySetup: 'NearbySetup.kt',
      foldableSetup: 'FoldableSetup.kt',
      dexSetup: 'DexSetup.kt',
      lensSetup: 'LensSetup.kt',
      webxrSetup: 'WebXRSetup.kt',
    };
    for (const [field, fileName] of Object.entries(featureFiles)) {
      const content = r[field];
      if (typeof content === 'string' && content.length > 0) {
        files[`${javaRel}/${fileName}`] = content;
      }
    }
    return files;
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

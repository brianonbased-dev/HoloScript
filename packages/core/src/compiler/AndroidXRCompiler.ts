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
import {
  filterCompositionForPlatform,
  filterSceneObjectsForPlatform,
} from './PlatformConditionalCompilerMixin';
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

/** The names of the `val`s and `var`s that written Kotlin lines declare (one declaration per line). */
function valuesIn(lines: string[]): string[] {
  return lines
    .join('\n')
    .split('\n')
    .flatMap((line) => /^\s*(?:val|var)\s+(\w+)/.exec(line)?.[1] ?? []);
}

/** The names of the functions that written Kotlin lines declare (after any modifiers). */
function methodsIn(lines: string[]): string[] {
  return lines
    .join('\n')
    .split('\n')
    .flatMap(
      (line) => /^\s*(?:(?:private|internal|suspend|override)\s+)*fun\s+(\w+)/.exec(line)?.[1] ?? []
    );
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
      // alpha15 Jetpack XR libs (compose/scenecore) require compileSdk 36 + AGP 8.9.1 (AAR metadata gate).
      targetSdk: options.targetSdk || 36,
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
    composition = filterCompositionForPlatform(composition, 'android-xr');
    // Objects (and an environment) written inside `scene` blocks are built the same way as
    // top-level ones: the activity, the node factory, the manifest and the gradle file, and the
    // glasses screen all read the composition returned here. Objects are named in two places.
    // The activity's Subspace is one scope, where objects, lights, groups, sounds and zones
    // declare `val`s, with the `val`s an object derives from its name and the activity's own
    // `xrSession`; XRNodeFactory has one `create...` method per top-level object. A scene
    // object that would declare a name already declared in either is left out and named in a
    // WARNING comment. Everything beyond an object's own name is read off what the compiler
    // writes, so none is guessed. The glasses screen declares no `val` for an object, so only
    // the headset takes an object's own name as one.
    // The scenes' objects go through the @platform() filter first, so only an object this
    // platform keeps is built, and only it takes a name.
    composition = filterSceneObjectsForPlatform(composition, 'android-xr');
    const scenes = this.flattenScenes(
      composition,
      this.isGlassesMode ? undefined : (name) => this.sanitizeName(name),
      {
        reserved: (content) => this.declaredNames(content),
        of: (obj) => this.namesDeclaredBy(obj),
      }
    );
    composition = scenes.composition;
    // The glasses screen draws no environment, so there is no environment to say is not applied.
    const warnings = this.sceneWarnings(
      this.isGlassesMode ? { ...scenes, unappliedEnvironments: [] } : scenes,
      'Kotlin'
    );

    if (this.isGlassesMode) {
      return {
        activityFile: generateGlassesActivityFile(this, composition, warnings),
        stateFile: generateStateFile(this, composition),
        nodeFactoryFile: generateNodeFactoryFile(this, composition),
        manifestFile: generateGlassesManifestFile(this, composition),
        buildGradle: generateGlassesBuildGradle(this, composition),
        glimmerComponentsFile: generateGlimmerComponentsFile(this, composition),
      };
    }

    return {
      activityFile: generateActivityFile(this, composition, warnings),
      stateFile: generateStateFile(this, composition),
      nodeFactoryFile: generateNodeFactoryFile(this, composition),
      manifestFile: generateManifestFile(this, composition),
      buildGradle: generateBuildGradle(this, composition),
    };
  }

  /**
   * Every name building `content` declares, in the two places this compiler names objects,
   * each with plain words for the part that declares it: the methods of XRNodeFactory (both
   * form factors) and, for the headset, the `val`s of the activity's Subspace scope. The glasses
   * screen declares nothing per object. Read off what the generators write.
   */
  private declaredNames(content: HoloComposition): Map<string, string> {
    const names = new Map<string, string>();
    const add = (name: string, by: string) => {
      if (!names.has(name)) names.set(name, by);
    };

    // XRNodeFactory: one method per top-level object, then the ones every factory has.
    for (const obj of content.objects ?? []) {
      for (const name of this.methodsDeclaredBy(() => compileObjectFactory(this, obj))) {
        add(name, 'another object');
      }
    }
    for (const name of this.methodsDeclaredBy(() => generateNodeFactoryFile(this, content))) {
      add(name, 'the node factory');
    }
    if (this.isGlassesMode) return names;

    // The Subspace scope. The activity's own `xrSession` is read by every entity written in it
    // (and `soundPool` by every sound), so a `val` with that name would replace it.
    add('xrSession', 'the XR session');
    if (content.audio?.length) add('soundPool', 'the sound pool');
    const { lines, indentLevel } = this;
    this.lines = [];
    try {
      emitSceneParts(this, content, (by, emit) => {
        const from = this.lines.length;
        emit();
        for (const name of valuesIn(this.lines.slice(from))) add(name, by);
      });
    } finally {
      this.lines = lines;
      this.indentLevel = indentLevel;
    }
    return names;
  }

  /** Every name building `obj` (and the objects inside it) declares, in the same two places. */
  private namesDeclaredBy(obj: HoloObjectDecl): string[] {
    return [
      ...this.methodsDeclaredBy(() => compileObjectFactory(this, obj)),
      ...(this.isGlassesMode ? [] : this.valuesDeclaredBy(() => emitObject(this, obj))),
    ];
  }

  private methodsDeclaredBy(write: () => void): string[] {
    return this.declaredBy(write, methodsIn);
  }

  private valuesDeclaredBy(write: () => void): string[] {
    return this.declaredBy(write, valuesIn);
  }

  /** What `read` finds among the lines `write` writes; those lines are dropped. */
  private declaredBy(write: () => void, read: (lines: string[]) => string[]): string[] {
    const { lines, indentLevel } = this;
    this.lines = [];
    try {
      write();
      return read(this.lines);
    } finally {
      this.lines = lines;
      this.indentLevel = indentLevel;
    }
  }

  /**
   * Compile to a path-keyed map of reference-relative files (Android project layout).
   *
   * The Quest golden-diff gate iterates a `Record<path, content>`; AndroidXRCompiler's
   * native return is named fields (AndroidXRCompileResult), so this adapter maps those
   * fields onto the on-disk Android project layout. That lets the SAME byte-diff gate +
   * committed-reference-app pattern (QuestCompiler) apply to Android XR. Keys are
   * POSIX-relative to the app project root (the dir holding settings.gradle.kts).
   */
  public compileToFiles(composition: HoloComposition, agentToken = ''): Record<string, string> {
    const r = this.compile(composition, agentToken);
    const pkgPath = this.options.packageName.replace(/\./g, '/');
    const javaRel = `app/src/main/java/${pkgPath}`;
    const files: Record<string, string> = {
      [`${javaRel}/${this.options.activityName}.kt`]: r.activityFile,
      [`${javaRel}/XRSceneState.kt`]: r.stateFile,
      [`${javaRel}/XRNodeFactory.kt`]: r.nodeFactoryFile,
      'app/src/main/AndroidManifest.xml': r.manifestFile,
      'app/build.gradle.kts': r.buildGradle,
    };
    if (r.glimmerComponentsFile) {
      files[`${javaRel}/GlimmerComponents.kt`] = r.glimmerComponentsFile;
    }
    return files;
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
  compileObjectFactory,
  emitObject,
  emitSceneParts,
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

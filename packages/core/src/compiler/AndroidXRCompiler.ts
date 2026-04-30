import type { Vector3 } from '../types';
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
 * @version 3.0.0 — Android XR SDK Developer Preview 3 + AI Glasses
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

  public sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  public toKotlinFloat3(arr: number[]): string {
    if (Array.isArray(arr) && arr.length >= 3) return `Float3(${arr[0]}f, ${arr[1]}f, ${arr[2]}f)`;
    if (Array.isArray(arr) && arr.length >= 1) return `Float3(${arr[0]}f, ${arr[0]}f, ${arr[0]}f)`;
    const v = typeof arr === 'number' ? arr : 0;
    return `Float3(${v}f, ${v}f, ${v}f)`;
  }

  public toKotlinColor(hex: string): string {
    if (typeof hex === 'string' && hex.startsWith('#')) {
      const raw = hex.slice(1);
      if (raw.length === 6) return `Color(0xFF${raw.toUpperCase()})`;
      if (raw.length === 8) {
        const [rr, gg, bb, aa] = [
          raw.substring(0, 2),
          raw.substring(2, 4),
          raw.substring(4, 6),
          raw.substring(6, 8),
        ];
        return `Color(0x${aa.toUpperCase()}${rr.toUpperCase()}${gg.toUpperCase()}${bb.toUpperCase()})`;
      }
    }
    return 'Color.White';
  }

  public mapShapeToFilament(type: string): string {
    const map: Record<string, string> = {
      cube: 'BoxShape',
      box: 'BoxShape',
      sphere: 'IcoSphereShape',
      cylinder: 'CylinderShape',
      cone: 'ConeShape',
      plane: 'QuadShape',
      torus: 'CustomRingGeometry',
      capsule: 'CapsuleShape',
    };
    return map[type] ?? `Unknown("${type}")`;
  }

  public toKotlinType(value: HoloValue): string {
    if (value === null) return 'Any?';
    if (typeof value === 'boolean') return 'Boolean';
    if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Float';
    if (typeof value === 'string') return 'String';
    if (Array.isArray(value)) {
      if (value.length === 3 && value.every((v) => typeof v === 'number')) return 'Vector3';
      return 'List<Any>';
    }
    return 'Any';
  }

  public toKotlinValue(value: HoloValue): string {
    if (typeof value === 'number') return Number.isInteger(value) ? `${value}` : `${value}f`;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'string') return `"${this.escapeStringValue(value, 'Kotlin')}"`;
    if (value === null) return 'null';
    if (Array.isArray(value))
      return `listOf(${value.map((v) => this.toKotlinValue(v)).join(', ')})`;
    return 'null';
  }

  public findProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return obj.properties?.find((p) => p.key === key)?.value;
  }

  public compositionUsesArCoreDepthTraits(composition: HoloComposition): boolean {
    const depthTraits = new Set(['occlusion_mesh', 'environment_probe', 'spatial_awareness']);
    return (
      composition.objects?.some((o) => o.traits?.some((t) => depthTraits.has(t.name))) ?? false
    );
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

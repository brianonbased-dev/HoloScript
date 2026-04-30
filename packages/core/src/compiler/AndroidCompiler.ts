import type { Vector3 } from '../types';
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
 * @version 1.0.0
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

  public sanitizeName(name: string): string {
    const result = name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^[0-9]/, '_$&');
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  public getSceneformGeometry(meshType: string): string {
    const geometries: Record<string, string> = {
      cube: 'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)',
      box: 'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)',
      sphere: 'ShapeFactory.makeSphere(0.05f, Vector3.zero(), material)',
      cylinder: 'ShapeFactory.makeCylinder(0.05f, 0.1f, Vector3.zero(), material)',
    };
    return (
      geometries[meshType] ||
      'ShapeFactory.makeCube(Vector3(0.1f, 0.1f, 0.1f), Vector3.zero(), material)'
    );
  }

  public findObjProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return obj.properties?.find((p) => p.key === key)?.value;
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
    if (value === null) return 'null';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') {
      return Number.isInteger(value) ? `${value}` : `${value}f`;
    }
    if (typeof value === 'string') return `"${this.escapeStringValue(value, 'Kotlin')}"`;
    if (Array.isArray(value)) {
      if (value.length === 3 && value.every((v) => typeof v === 'number')) {
        return `Vector3(${value[0]}f, ${value[1]}f, ${value[2]}f)`;
      }
      return `listOf(${value.map((v) => this.toKotlinValue(v)).join(', ')})`;
    }
    return 'null';
  }

  public toAndroidColor(value: HoloValue | undefined): string {
    if (!value) return 'android.graphics.Color.BLUE';

    if (typeof value === 'string') {
      if (value.startsWith('#')) {
        return `android.graphics.Color.parseColor("${value}")`;
      }
      const colors: Record<string, string> = {
        red: 'android.graphics.Color.RED',
        green: 'android.graphics.Color.GREEN',
        blue: 'android.graphics.Color.BLUE',
        white: 'android.graphics.Color.WHITE',
        black: 'android.graphics.Color.BLACK',
        yellow: 'android.graphics.Color.YELLOW',
        cyan: 'android.graphics.Color.CYAN',
        magenta: 'android.graphics.Color.MAGENTA',
      };
      return colors[value.toLowerCase()] || 'android.graphics.Color.BLUE';
    }
    if (Array.isArray(value) && value.length >= 3) {
      const [r, g, b, a = 1] = value as number[];
      return `android.graphics.Color.argb(${Math.round(a * 255)}, ${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
    }
    return 'android.graphics.Color.BLUE';
  }

  public compositionHasTrait(composition: HoloComposition, traitName: string): boolean {
    for (const obj of composition.objects || []) {
      for (const trait of obj.traits || []) {
        const name = typeof trait === 'string' ? trait : trait.name;
        if (name === traitName) return true;
      }
    }
    return false;
  }
}

export function compileToAndroid(
  composition: HoloComposition,
  options?: AndroidCompilerOptions
): Promise<AndroidCompileResult> {
  const compiler = new AndroidCompiler(options);
  return Promise.resolve(compiler.compile(composition, 'test-token', undefined));
}

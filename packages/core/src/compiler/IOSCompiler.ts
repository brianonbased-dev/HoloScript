import type { Vector3 } from '../types';
/**
 * HoloScript → iOS Swift ARKit Compiler
 *
 * Translates a HoloComposition AST into Swift code targeting
 * ARKit for iPhone and iPad augmented reality experiences.
 *
 * Emits:
 *   - SwiftUI + ARKit integration
 *   - ARSCNView with SceneKit nodes
 *   - Plane detection and hit testing
 *   - World tracking configuration
 *   - Gesture recognizers for interaction
 *   - Spatial audio with SceneKit
 *
 * @version 1.0.0
 */

import { CompilerBase, type CompilerToken } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloLight,
  HoloAudio,
  HoloValue,
} from '../parser/HoloCompositionTypes';
import type { IOSCompileResult } from './CompilerTypes';
export type { IOSCompileResult } from './CompilerTypes';

import {
  generateViewFile,
  generateSceneFile,
  generateStateFile,
  generateInfoPlist,
} from './IOSARGenerators';
import {
  hasRoomPlanTraits,
  generateRoomPlanFile,
  hasLiDARTraits,
  generateLiDARScannerFile,
  hasNPUSceneTraits,
  generateNPUSceneFile,
  hasPortalARTraits,
  generatePortalARFile,
} from './IOSSpatialGenerators';
import {
  hasHandTrackingTraits,
  generateHandTrackingFile,
  hasObjectCaptureTraits,
  generateObjectCaptureFile,
  hasFaceTrackingTraits,
  generateFaceTrackingFile,
  hasSharePlayTraits,
  generateSharePlayFile,
  hasUWBPositioningTraits,
  generateUWBPositioningFile,
  hasSpatialAudioTraits,
  generateSpatialAudioFile,
} from './IOSPeripheralGenerators';

export interface IOSCompilerOptions {
  className?: string;
  indent?: string;
  iosVersion?: '15.0' | '16.0' | '17.0' | '18.0';
  useSwiftUI?: boolean;
  useCombine?: boolean;
  useRealityKit?: boolean; // For newer iOS, RealityKit is preferred
}

export class IOSCompiler extends CompilerBase {
  protected readonly compilerName = 'IOSCompiler';

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    return ANSCapabilityPath.IOS;
  }

  public options: Required<IOSCompilerOptions>;
  public lines: string[] = [];
  public indentLevel: number = 0;

  constructor(options: IOSCompilerOptions = {}) {
    super();
    this.options = {
      className: options.className || 'GeneratedARScene',
      indent: options.indent || '    ',
      iosVersion: options.iosVersion || '17.0',
      useSwiftUI: options.useSwiftUI ?? true,
      useCombine: options.useCombine ?? true,
      useRealityKit: options.useRealityKit ?? false,
    };
  }

  compile(
    composition: HoloComposition,
    agentToken: CompilerToken,
    outputPath?: string
  ): IOSCompileResult {
    this.validateCompilerAccess(agentToken, outputPath);
    const result: IOSCompileResult = {
      viewFile: generateViewFile(this, composition),
      sceneFile: generateSceneFile(this, composition),
      stateFile: generateStateFile(this, composition),
      infoPlist: generateInfoPlist(this, composition),
    };

    if (hasRoomPlanTraits(composition)) {
      result.roomPlanFile = generateRoomPlanFile(this, composition);
    }

    if (hasLiDARTraits(composition)) {
      result.lidarScannerFile = generateLiDARScannerFile(this, composition);
    }

    if (hasNPUSceneTraits(composition)) {
      result.npuSceneFile = generateNPUSceneFile(this, composition);
    }

    if (hasPortalARTraits(composition)) {
      result.portalARFile = generatePortalARFile(this, composition);
    }

    if (hasHandTrackingTraits(composition)) {
      result.handTrackingFile = generateHandTrackingFile(this, composition);
    }

    if (hasObjectCaptureTraits(composition)) {
      result.objectCaptureFile = generateObjectCaptureFile(this, composition);
    }

    if (hasFaceTrackingTraits(composition)) {
      result.faceTrackingFile = generateFaceTrackingFile(this, composition);
    }

    if (hasSharePlayTraits(composition)) {
      result.sharePlayFile = generateSharePlayFile(this, composition);
    }

    if (hasUWBPositioningTraits(composition)) {
      result.uwbPositioningFile = generateUWBPositioningFile(this, composition);
    }

    if (hasSpatialAudioTraits(composition)) {
      result.spatialAudioFile = generateSpatialAudioFile(this, composition);
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

  public getSceneKitGeometry(meshType: string): string {
    const geometries: Record<string, string> = {
      cube: 'SCNBox(width: 0.1, height: 0.1, length: 0.1, chamferRadius: 0)',
      box: 'SCNBox(width: 0.1, height: 0.1, length: 0.1, chamferRadius: 0)',
      sphere: 'SCNSphere(radius: 0.05)',
      cylinder: 'SCNCylinder(radius: 0.05, height: 0.1)',
      cone: 'SCNCone(topRadius: 0, bottomRadius: 0.05, height: 0.1)',
      capsule: 'SCNCapsule(capRadius: 0.025, height: 0.1)',
      plane: 'SCNPlane(width: 0.2, height: 0.2)',
      torus: 'SCNTorus(ringRadius: 0.05, pipeRadius: 0.02)',
    };
    return geometries[meshType] || 'SCNBox(width: 0.1, height: 0.1, length: 0.1, chamferRadius: 0)';
  }

  public findObjProp(obj: HoloObjectDecl, key: string): HoloValue | undefined {
    return obj.properties?.find((p) => p.key === key)?.value;
  }

  public toSwiftType(value: HoloValue): string {
    if (value === null) return 'Any?';
    if (typeof value === 'boolean') return 'Bool';
    if (typeof value === 'number') return Number.isInteger(value) ? 'Int' : 'Double';
    if (typeof value === 'string') return 'String';
    if (Array.isArray(value)) {
      if (value.length === 3 && value.every((v) => typeof v === 'number')) return 'SCNVector3';
      return '[Any]';
    }
    return 'Any';
  }

  public toSwiftValue(value: HoloValue): string {
    if (value === null) return 'nil';
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'number') return `${value}`;
    if (typeof value === 'string') return `"${this.escapeStringValue(value, 'Swift')}"`;
    if (Array.isArray(value)) {
      if (value.length === 3 && value.every((v) => typeof v === 'number')) {
        return `SCNVector3(${value[0]}, ${value[1]}, ${value[2]})`;
      }
      return `[${value.map((v) => this.toSwiftValue(v)).join(', ')}]`;
    }
    return 'nil';
  }

  public toUIColor(value: HoloValue): string {
    if (typeof value === 'string') {
      if (value.startsWith('#')) {
        const hex = value.slice(1);
        if (hex.length === 6) {
          const r = parseInt(hex.slice(0, 2), 16) / 255;
          const g = parseInt(hex.slice(2, 4), 16) / 255;
          const b = parseInt(hex.slice(4, 6), 16) / 255;
          return `UIColor(red: ${r}, green: ${g}, blue: ${b}, alpha: 1.0)`;
        }
      }
      const colors: Record<string, string> = {
        red: 'UIColor.systemRed',
        green: 'UIColor.systemGreen',
        blue: 'UIColor.systemBlue',
        white: 'UIColor.white',
        black: 'UIColor.black',
        yellow: 'UIColor.systemYellow',
        cyan: 'UIColor.systemCyan',
        magenta: 'UIColor.systemPink',
      };
      return colors[value.toLowerCase()] || 'UIColor.systemBlue';
    }
    if (Array.isArray(value) && value.length >= 3) {
      const [r, g, b, a = 1] = value as number[];
      return `UIColor(red: ${r}, green: ${g}, blue: ${b}, alpha: ${a})`;
    }
    return 'UIColor.systemBlue';
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

export function compileToIOS(
  composition: HoloComposition,
  options?: IOSCompilerOptions
): IOSCompileResult {
  const compiler = new IOSCompiler(options);
  return compiler.compile(composition, 'test-token');
}

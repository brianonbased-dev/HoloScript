/**
 * Reference/Fallback Exporter Implementations
 *
 * Provides stable, proven baseline implementations for all HoloScript export targets.
 * Used as fallback when circuit breaker opens due to failures.
 *
 * These are intentionally simplified, battle-tested implementations that prioritize
 * stability over features. They provide graceful degradation when optimized exporters fail.
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes';
import type { ExportTarget } from './CircuitBreaker';
import { CodeEditorCompiler } from './CodeEditorCompiler';

// =============================================================================
// TYPES
// =============================================================================

export interface ExportResult {
  target: ExportTarget;
  output: string;
  format: 'xml' | 'json' | 'typescript' | 'glsl' | 'wgsl' | 'csharp' | 'gdscript' | 'text';
  warnings: string[];
  usedFallback: boolean;
}

export interface ExporterOptions {
  pretty?: boolean;
  includeComments?: boolean;
  strict?: boolean;
}

// =============================================================================
// BASE REFERENCE EXPORTER
// =============================================================================

/**
 * Base class for all reference exporters
 */
abstract class ReferenceExporter {
  protected options: Required<ExporterOptions>;

  constructor(options: ExporterOptions = {}) {
    this.options = {
      pretty: options.pretty ?? true,
      includeComments: options.includeComments ?? true,
      strict: options.strict ?? false,
    };
  }

  abstract export(composition: HoloComposition): ExportResult;

  protected getCompositionName(composition: HoloComposition): string {
    return composition.name || 'untitled';
  }

  protected getObjectCount(composition: HoloComposition): number {
    return (composition.objects?.length ?? 0) + (composition.spatialGroups?.length ?? 0);
  }
}

// =============================================================================
// ROBOTICS REFERENCE EXPORTERS
// =============================================================================

/**
 * URDF Reference Exporter (ROS 2 / Gazebo)
 */
class URDFReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const lines: string[] = [];

    lines.push('<?xml version="1.0"?>');
    lines.push('<!-- HoloScript URDF Reference Export (Fallback Mode) -->');
    lines.push(`<robot name="${this.getCompositionName(composition)}">`);
    lines.push('  <link name="base_link">');
    lines.push('    <inertial>');
    lines.push('      <mass value="0.001"/>');
    lines.push('      <inertia ixx="0.001" ixy="0" ixz="0" iyy="0.001" iyz="0" izz="0.001"/>');
    lines.push('    </inertial>');
    lines.push('  </link>');

    // Simple object export (minimal features)
    const objectCount = this.getObjectCount(composition);
    if (objectCount > 0) {
      warnings.push(`Simplified export: ${objectCount} objects exported with default properties`);
    }

    lines.push('</robot>');

    return {
      target: 'urdf',
      output: lines.join('\n'),
      format: 'xml',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * SDF Reference Exporter (Gazebo Simulation)
 */
class SDFReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const lines: string[] = [];

    lines.push('<?xml version="1.0"?>');
    lines.push('<!-- HoloScript SDF Reference Export (Fallback Mode) -->');
    lines.push('<sdf version="1.8">');
    lines.push(`  <world name="${this.getCompositionName(composition)}">`);
    lines.push('    <physics name="default_physics" type="ode">');
    lines.push('      <real_time_factor>1.0</real_time_factor>');
    lines.push('    </physics>');
    lines.push('    <light name="sun" type="directional">');
    lines.push('      <cast_shadows>1</cast_shadows>');
    lines.push('    </light>');
    lines.push('  </world>');
    lines.push('</sdf>');

    warnings.push('Simplified SDF export with default physics and lighting');

    return {
      target: 'sdf',
      output: lines.join('\n'),
      format: 'xml',
      warnings,
      usedFallback: true,
    };
  }
}

// =============================================================================
// GAME ENGINE REFERENCE EXPORTERS
// =============================================================================

/**
 * Unity Reference Exporter (C# MonoBehaviour)
 */
class UnityReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);
    const className = name.replace(/[^a-zA-Z0-9]/g, '_');

    const lines: string[] = [];
    lines.push('// HoloScript Unity Reference Export (Fallback Mode)');
    lines.push('using UnityEngine;');
    lines.push('');
    lines.push(`public class ${className} : MonoBehaviour`);
    lines.push('{');
    lines.push('    void Start()');
    lines.push('    {');
    lines.push(`        Debug.Log("HoloScript composition: ${name}");`);
    lines.push('        // Simplified Unity export - implement scene setup here');
    lines.push('    }');
    lines.push('}');

    warnings.push('Simplified Unity export - manual scene setup required');

    return {
      target: 'unity',
      output: lines.join('\n'),
      format: 'csharp',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * Unreal Reference Exporter (Blueprint/C++)
 */
class UnrealReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('// HoloScript Unreal Reference Export (Fallback Mode)');
    lines.push('#include "CoreMinimal.h"');
    lines.push('');
    lines.push(`// Composition: ${name}`);
    lines.push('// Simplified Unreal export - implement actor setup manually');

    warnings.push('Simplified Unreal export - manual Blueprint/C++ implementation required');

    return {
      target: 'unreal',
      output: lines.join('\n'),
      format: 'text',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * Godot Reference Exporter (GDScript)
 */
class GodotReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('# HoloScript Godot Reference Export (Fallback Mode)');
    lines.push('extends Node3D');
    lines.push('');
    lines.push('func _ready():');
    lines.push(`    print("HoloScript composition: ${name}")`);
    lines.push('    # Simplified Godot export - implement scene setup here');

    warnings.push('Simplified Godot export - manual scene node setup required');

    return {
      target: 'godot',
      output: lines.join('\n'),
      format: 'gdscript',
      warnings,
      usedFallback: true,
    };
  }
}

// =============================================================================
// WEB PLATFORM REFERENCE EXPORTERS
// =============================================================================

/**
 * WebGPU Reference Exporter
 */
class WebGPUReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('// HoloScript WebGPU Reference Export (Fallback Mode)');
    lines.push('async function init() {');
    lines.push('  const adapter = await navigator.gpu?.requestAdapter();');
    lines.push('  if (!adapter) throw new Error("WebGPU not supported");');
    lines.push('  const device = await adapter.requestDevice();');
    lines.push(`  console.log("HoloScript composition: ${name}");`);
    lines.push('  // Simplified WebGPU export - implement rendering pipeline manually');
    lines.push('}');
    lines.push('init();');

    warnings.push('Simplified WebGPU export - manual pipeline and shader setup required');

    return {
      target: 'webgpu',
      output: lines.join('\n'),
      format: 'typescript',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * React Three Fiber Reference Exporter
 */
// React Three Fiber and Babylon.js fallback exporters retired with apex-poison web targets.

// =============================================================================
// VR PLATFORM REFERENCE EXPORTERS
// =============================================================================

/**
 * OpenXR Reference Exporter
 */
class OpenXRReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('// HoloScript OpenXR Reference Export (Fallback Mode)');
    lines.push('// Initialize OpenXR session');
    lines.push(`console.log("HoloScript OpenXR composition: ${name}");`);
    lines.push('// Simplified OpenXR export - implement XR session setup manually');

    warnings.push('Simplified OpenXR export - manual XR runtime setup required');

    return {
      target: 'openxr',
      output: lines.join('\n'),
      format: 'typescript',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * VRChat Reference Exporter
 */
class VRChatReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('// HoloScript VRChat Reference Export (Fallback Mode)');
    lines.push('using UnityEngine;');
    lines.push('using VRC.SDK3.Components;');
    lines.push('');
    lines.push(`// Composition: ${name}`);
    lines.push('// Simplified VRChat export - implement VRC components manually');

    warnings.push('Simplified VRChat export - manual VRC SDK component setup required');

    return {
      target: 'vrchat',
      output: lines.join('\n'),
      format: 'csharp',
      warnings,
      usedFallback: true,
    };
  }
}

// =============================================================================
// MOBILE PLATFORM REFERENCE EXPORTERS
// =============================================================================

/**
 * iOS/ARKit Reference Exporter
 */
class IOSReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('// HoloScript iOS/ARKit Reference Export (Fallback Mode)');
    lines.push('import ARKit');
    lines.push('import SceneKit');
    lines.push('');
    lines.push(`// Composition: ${name}`);
    lines.push('// Simplified iOS export - implement ARSCNView setup manually');

    warnings.push('Simplified iOS export - manual ARKit/SceneKit setup required');

    return {
      target: 'ios',
      output: lines.join('\n'),
      format: 'text',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * Android XR Reference Exporter
 */
class AndroidReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('// HoloScript Android XR Reference Export (Fallback Mode)');
    lines.push('package com.holoscript.ar;');
    lines.push('');
    lines.push('import com.google.ar.core.ArCoreApk;');
    lines.push('');
    lines.push(`// Composition: ${name}`);
    lines.push('// Simplified Android export - implement ARCore setup manually');

    warnings.push('Simplified Android export - manual ARCore setup required');

    return {
      target: 'android',
      output: lines.join('\n'),
      format: 'text',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * Apple Vision Pro Reference Exporter
 */
class VisionOSReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('// HoloScript visionOS Reference Export (Fallback Mode)');
    lines.push('import SwiftUI');
    lines.push('import RealityKit');
    lines.push('');
    lines.push(`// Composition: ${name}`);
    lines.push('// Simplified visionOS export - implement RealityView setup manually');

    warnings.push('Simplified visionOS export - manual RealityKit setup required');

    return {
      target: 'visionos',
      output: lines.join('\n'),
      format: 'text',
      warnings,
      usedFallback: true,
    };
  }
}

// =============================================================================
// OTHER FORMAT REFERENCE EXPORTERS
// =============================================================================

/**
 * Sanitize an arbitrary name into a valid USD prim identifier.
 * USD prim names must be C-style identifiers (alnum + underscore, not leading digit).
 */
function toUsdPrimName(name: string, index: number): string {
  const cleaned = (name || '').replace(/[^A-Za-z0-9_]/g, '_');
  if (!cleaned || /^[0-9]/.test(cleaned)) {
    return `Prim_${index}`;
  }
  return cleaned;
}

/**
 * USD (Pixar Universal Scene Description) Reference Exporter.
 *
 * Emits a `#usda` stage whose `Root` Xform contains one child Xform per
 * composition object/spatial group. This is intentionally minimal (no meshes,
 * materials, or transforms) but is NOT empty when the composition has geometry —
 * an empty stage (zero child prims) is never a valid substitute for a real
 * compile and is rejected fail-closed by the ExportManager (see
 * `usdStageHasGeometry`). The shared `target` is parameterized so the same
 * implementation backs both `usd` and `usdz`.
 */
class USDReferenceExporter extends ReferenceExporter {
  constructor(
    private readonly usdTarget: ExportTarget = 'usd',
    options: ExporterOptions = {}
  ) {
    super(options);
  }

  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const objects = composition.objects ?? [];
    const groups = composition.spatialGroups ?? [];

    const lines: string[] = [];
    lines.push('#usda 1.0');
    lines.push('(');
    lines.push(`    doc = "HoloScript USD Reference Export (Fallback Mode) - ${name}"`);
    lines.push(')');
    lines.push('');
    lines.push('def Xform "Root"');
    lines.push('{');

    let childIndex = 0;
    for (const obj of objects) {
      const primName = toUsdPrimName(obj.name, childIndex++);
      lines.push(`    def Xform "${primName}"`);
      lines.push('    {');
      lines.push('    }');
    }
    for (const group of groups) {
      const primName = toUsdPrimName((group as { name?: string }).name ?? '', childIndex++);
      lines.push(`    def Xform "${primName}"`);
      lines.push('    {');
      lines.push('    }');
    }

    lines.push('}');

    warnings.push('Simplified USD export with minimal scene hierarchy');

    return {
      target: this.usdTarget,
      output: lines.join('\n'),
      format: 'text',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * Returns true if a `#usda` stage string contains at least one child geometry
 * prim under Root. The reference USD exporter emits one `def Xform "<name>"`
 * per object; the Root Xform itself is excluded. A stage with only the Root
 * (zero children) is geometry-less and must NOT be shipped as a successful
 * compile — callers fail closed on `false`.
 */
export function usdStageHasGeometry(output: string): boolean {
  if (!output) return false;
  // Count `def Xform "<name>"` occurrences, excluding the single Root Xform.
  const matches = output.match(/def\s+\w+\s+"([^"]+)"/g) ?? [];
  const nonRoot = matches.filter((m) => !/"Root"\s*$/.test(m));
  return nonRoot.length > 0;
}

/**
 * DTDL (Azure Digital Twins) Reference Exporter
 */
class DTDLReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const dtdl = {
      '@context': 'dtmi:dtdl:context;2',
      '@id': `dtmi:holoscript:${name.toLowerCase().replace(/[^a-z0-9]/g, '_')};1`,
      '@type': 'Interface',
      displayName: name,
      contents: [],
      comment: 'HoloScript DTDL Reference Export (Fallback Mode)',
    };

    warnings.push('Simplified DTDL export - add properties, telemetry, and commands manually');

    return {
      target: 'dtdl',
      output: JSON.stringify(dtdl, null, 2),
      format: 'json',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * WASM Reference Exporter
 */
class WASMReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const warnings: string[] = [];
    const name = this.getCompositionName(composition);

    const lines: string[] = [];
    lines.push('// HoloScript WASM Reference Export (Fallback Mode)');
    lines.push('(module');
    lines.push(`  ;; Composition: ${name}`);
    lines.push('  ;; Simplified WASM export - implement WebAssembly module manually');
    lines.push(')');

    warnings.push('Simplified WASM export - manual WebAssembly implementation required');

    return {
      target: 'wasm',
      output: lines.join('\n'),
      format: 'text',
      warnings,
      usedFallback: true,
    };
  }
}

/**
 * Code Editor Reference Exporter — wraps CodeEditorCompiler to emit a CM6 config bundle.
 */
class CodeEditorReferenceExporter extends ReferenceExporter {
  export(composition: HoloComposition): ExportResult {
    const output = new CodeEditorCompiler().compile(composition);
    return {
      target: 'code-editor',
      output,
      format: 'json',
      warnings: [],
      usedFallback: true,
    };
  }
}

/**
 * Native 2D Reference Exporter — wraps Native2DCompiler to emit a hydration-free
 * HTML page. This is the fallback that makes getExportManager().export('native-2d')
 * succeed (the MCP compile_to_native_2d tool path), fixing the observed
 * "No reference exporter available for target: native-2d" error. Defaults to the
 * HTML target (format label 'text' — ExportResult.format has no 'html'; .output is
 * the HTML string consumers read).
 */
// Native2DCompiler remains an internal UI generator, but the native-2d export target is retired.

// =============================================================================
// REGISTRY
// =============================================================================

/**
 * Registry of all reference exporters
 */
export class ReferenceExporterRegistry {
  private exporters: Map<ExportTarget, ReferenceExporter> = new Map();

  constructor() {
    // Robotics
    this.exporters.set('urdf', new URDFReferenceExporter());
    this.exporters.set('sdf', new SDFReferenceExporter());

    // Game Engines
    this.exporters.set('unity', new UnityReferenceExporter());
    this.exporters.set('unreal', new UnrealReferenceExporter());
    this.exporters.set('godot', new GodotReferenceExporter());

    // Web Platforms
    this.exporters.set('webgpu', new WebGPUReferenceExporter());
    this.exporters.set('code-editor', new CodeEditorReferenceExporter());

    // VR Platforms
    this.exporters.set('openxr', new OpenXRReferenceExporter());
    this.exporters.set('vrchat', new VRChatReferenceExporter());

    // Mobile Platforms
    this.exporters.set('ios', new IOSReferenceExporter());
    this.exporters.set('android', new AndroidReferenceExporter());
    this.exporters.set('android-xr', new AndroidReferenceExporter());
    this.exporters.set('visionos', new VisionOSReferenceExporter());

    // Other Formats
    this.exporters.set('usd', new USDReferenceExporter('usd'));
    this.exporters.set('usdz', new USDReferenceExporter('usdz')); // Same impl, correct target tag
    this.exporters.set('dtdl', new DTDLReferenceExporter());
    this.exporters.set('wasm', new WASMReferenceExporter());

    // Note: Some targets (multi-layer, incremental, state, trait-composition)
    // use generic fallbacks until specific implementations are needed
  }

  /**
   * Get reference exporter for target
   */
  getExporter(target: ExportTarget): ReferenceExporter | undefined {
    return this.exporters.get(target);
  }

  /**
   * Export composition using reference exporter
   */
  export(target: ExportTarget, composition: HoloComposition): ExportResult | null {
    const exporter = this.exporters.get(target);
    if (!exporter) {
      return null;
    }
    return exporter.export(composition);
  }

  /**
   * Check if reference exporter exists for target
   */
  hasExporter(target: ExportTarget): boolean {
    return this.exporters.has(target);
  }
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ReferenceExporterRegistry;

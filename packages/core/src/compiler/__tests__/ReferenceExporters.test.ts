import { describe, it, expect } from 'vitest';
import { ReferenceExporterRegistry } from '../ReferenceExporters';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

function makeComposition(name: string = 'TestScene'): HoloComposition {
  return {
    name,
    objects: [
      { type: 'Object', name: 'Cube', traits: [], properties: {} },
      { type: 'Object', name: 'Sphere', traits: [], properties: {} },
    ],
  } as unknown as HoloComposition;
}

describe('ReferenceExporterRegistry', () => {
  const registry = new ReferenceExporterRegistry();

  // ─── Registry ──────────────────────────────────────────────────────

  it('has exporters for all registered targets', () => {
    const targets = [
      'urdf',
      'sdf',
      'unity',
      'unreal',
      'godot',
      'webgpu',
      'r3f',
      'babylon',
      'openxr',
      'vrchat',
      'ios',
      'android',
      'android-xr',
      'visionos',
      'usd',
      'usdz',
      'dtdl',
      'wasm',
    ];
    for (const target of targets) {
      expect(registry.hasExporter(target as any)).toBe(true);
    }
  });

  it('returns null for unknown target', () => {
    const result = registry.export('unknown-target' as any, makeComposition());
    expect(result).toBeNull();
  });

  it('hasExporter returns false for unknown target', () => {
    expect(registry.hasExporter('fake' as any)).toBe(false);
  });

  // ─── URDF Exporter ────────────────────────────────────────────────

  describe('URDF exporter', () => {
    it('generates XML with robot element', () => {
      const result = registry.export('urdf' as any, makeComposition('MyRobot'));
      expect(result).not.toBeNull();
      expect(result!.target).toBe('urdf');
      expect(result!.format).toBe('xml');
      expect(result!.output).toContain('<robot name="MyRobot">');
      expect(result!.output).toContain('base_link');
      expect(result!.usedFallback).toBe(true);
    });
  });

  // ─── SDF Exporter ─────────────────────────────────────────────────

  describe('SDF exporter', () => {
    it('generates SDF with world and physics', () => {
      const result = registry.export('sdf' as any, makeComposition('SimWorld'));
      expect(result!.output).toContain('<sdf version="1.8">');
      expect(result!.output).toContain('SimWorld');
      expect(result!.output).toContain('physics');
      expect(result!.format).toBe('xml');
    });
  });

  // ─── Unity Exporter ───────────────────────────────────────────────

  describe('Unity exporter', () => {
    it('generates C# MonoBehaviour', () => {
      const result = registry.export('unity' as any, makeComposition('GameLevel'));
      expect(result!.output).toContain('using UnityEngine;');
      expect(result!.output).toContain('class GameLevel');
      expect(result!.output).toContain('MonoBehaviour');
      expect(result!.format).toBe('csharp');
    });

    it('sanitizes class name', () => {
      const result = registry.export('unity' as any, makeComposition('My-Cool Scene!'));
      expect(result!.output).toContain('class My_Cool_Scene_');
    });
  });

  // ─── Unreal Exporter ──────────────────────────────────────────────

  describe('Unreal exporter', () => {
    it('generates C++ header', () => {
      const result = registry.export('unreal' as any, makeComposition('Level1'));
      expect(result!.output).toContain('#include "CoreMinimal.h"');
      expect(result!.output).toContain('Level1');
      expect(result!.format).toBe('text');
    });
  });

  // ─── Godot Exporter ───────────────────────────────────────────────

  describe('Godot exporter', () => {
    it('generates GDScript', () => {
      const result = registry.export('godot' as any, makeComposition('World'));
      expect(result!.output).toContain('extends Node3D');
      expect(result!.output).toContain('func _ready():');
      expect(result!.output).toContain('World');
      expect(result!.format).toBe('gdscript');
    });
  });

  // ─── WebGPU Exporter ──────────────────────────────────────────────

  describe('WebGPU exporter', () => {
    it('generates WebGPU initialization code', () => {
      const result = registry.export('webgpu' as any, makeComposition('GPUScene'));
      expect(result!.output).toContain('navigator.gpu');
      expect(result!.output).toContain('requestAdapter');
      expect(result!.output).toContain('GPUScene');
      expect(result!.format).toBe('typescript');
    });
  });

  // ─── R3F Exporter ─────────────────────────────────────────────────

  describe('R3F exporter', () => {
    it('generates React component with Canvas', () => {
      const result = registry.export('r3f' as any, makeComposition('WebScene'));
      expect(result!.output).toContain('@react-three/fiber');
      expect(result!.output).toContain('Canvas');
      expect(result!.output).toContain('ambientLight');
      expect(result!.format).toBe('typescript');
    });
  });

  // ─── Babylon Exporter ─────────────────────────────────────────────

  describe('Babylon exporter', () => {
    it('generates Babylon.js setup', () => {
      const result = registry.export('babylon' as any, makeComposition('BabScene'));
      expect(result!.output).toContain('@babylonjs/core');
      expect(result!.output).toContain('Engine');
      expect(result!.output).toContain('BabScene');
      expect(result!.format).toBe('typescript');
    });
  });

  // ─── VRChat Exporter ──────────────────────────────────────────────

  describe('VRChat exporter', () => {
    it('generates VRC SDK C# code', () => {
      const result = registry.export('vrchat' as any, makeComposition('VRWorld'));
      expect(result!.output).toContain('VRC.SDK3');
      expect(result!.output).toContain('VRWorld');
      expect(result!.format).toBe('csharp');
    });
  });

  // ─── OpenXR Exporter ──────────────────────────────────────────────

  describe('OpenXR exporter', () => {
    it('generates OpenXR initialization', () => {
      const result = registry.export('openxr' as any, makeComposition('XRScene'));
      expect(result!.output).toContain('OpenXR');
      expect(result!.output).toContain('XRScene');
      expect(result!.format).toBe('typescript');
    });
  });

  // ─── iOS Exporter ─────────────────────────────────────────────────

  describe('iOS exporter', () => {
    it('generates ARKit/SceneKit imports', () => {
      const result = registry.export('ios' as any, makeComposition('IOSApp'));
      expect(result!.output).toContain('import ARKit');
      expect(result!.output).toContain('import SceneKit');
      expect(result!.output).toContain('IOSApp');
    });
  });

  // ─── Android Exporter ─────────────────────────────────────────────

  describe('Android exporter', () => {
    it('generates ARCore imports', () => {
      const result = registry.export('android' as any, makeComposition('DroidApp'));
      expect(result!.output).toContain('com.google.ar.core');
      expect(result!.output).toContain('DroidApp');
    });
  });

  // ─── visionOS Exporter ────────────────────────────────────────────

  describe('visionOS exporter', () => {
    it('generates SwiftUI/RealityKit imports', () => {
      const result = registry.export('visionos' as any, makeComposition('AVPScene'));
      expect(result!.output).toContain('import SwiftUI');
      expect(result!.output).toContain('import RealityKit');
      expect(result!.output).toContain('AVPScene');
    });
  });

  // ─── USD Exporter ─────────────────────────────────────────────────

  describe('USD exporter', () => {
    it('generates USDA format', () => {
      const result = registry.export('usd' as any, makeComposition('USDScene'));
      expect(result!.output).toContain('#usda 1.0');
      expect(result!.output).toContain('def Xform "Root"');
      expect(result!.output).toContain('USDScene');
    });

    it('USDZ uses same exporter as USD', () => {
      const usd = registry.export('usd' as any, makeComposition('Test'));
      const usdz = registry.export('usdz' as any, makeComposition('Test'));
      // Both should produce similar output structure
      expect(usd!.output).toContain('#usda 1.0');
      expect(usdz!.output).toContain('#usda 1.0');
    });
  });

  // ─── DTDL Exporter ────────────────────────────────────────────────

  describe('DTDL exporter', () => {
    it('generates valid DTDL JSON', () => {
      const result = registry.export('dtdl' as any, makeComposition('DigitalTwin'));
      expect(result!.format).toBe('json');
      const parsed = JSON.parse(result!.output);
      expect(parsed['@context']).toBe('dtmi:dtdl:context;2');
      expect(parsed['@type']).toBe('Interface');
      expect(parsed.displayName).toBe('DigitalTwin');
    });
  });

  // ─── WASM Exporter ────────────────────────────────────────────────

  describe('WASM exporter', () => {
    it('generates WAT module', () => {
      const result = registry.export('wasm' as any, makeComposition('WasmApp'));
      expect(result!.output).toContain('(module');
      expect(result!.output).toContain('WasmApp');
    });
  });

  // ─── Common properties ────────────────────────────────────────────

  describe('common export properties', () => {
    it('all exports set usedFallback to true', () => {
      const targets = ['urdf', 'sdf', 'unity', 'godot', 'r3f', 'babylon', 'dtdl', 'wasm'];
      for (const target of targets) {
        const result = registry.export(target as any, makeComposition());
        expect(result!.usedFallback).toBe(true);
      }
    });

    it('all exports include at least one warning', () => {
      const targets = ['urdf', 'unity', 'godot', 'webgpu', 'r3f', 'dtdl', 'wasm'];
      for (const target of targets) {
        const result = registry.export(target as any, makeComposition());
        expect(result!.warnings.length).toBeGreaterThan(0);
      }
    });

    it('handles composition with no name', () => {
      const comp = { objects: [] } as unknown as HoloComposition;
      const result = registry.export('unity' as any, comp);
      expect(result!.output).toContain('untitled');
    });
  });
});

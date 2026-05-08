/**
 * VisionOSCompiler — Smoke Suite
 *
 * End-to-end validation of the visionos-app.holo example through both
 * the VisionOSCompiler (Swift/RealityKit) and USDZExportCompiler pipelines.
 *
 * Records fidelity gaps between the declarative .holo source and what the
 * compiler currently emits, producing structured evidence for the
 * competitor-gap-matrix (CG-005).
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { parseHoloStrict } from '../../parser/HoloCompositionParser';
import { VisionOSCompiler } from '../VisionOSCompiler';
import { USDZExportCompiler } from '../USDZExportCompiler';
import { getTraitMapping, generateTraitCode } from '../VisionOSTraitMap';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

const EXAMPLE_PATH = path.resolve(
  __dirname,
  '../../../../../examples/platforms/visionos-app.holo'
);

describe('VisionOSCompiler — Smoke Suite (CG-005)', () => {
  let source: string;
  let ast: HoloComposition;
  let swiftOutput: string;
  let usdzOutput: string;

  beforeAll(() => {
    source = fs.readFileSync(EXAMPLE_PATH, 'utf-8');
    ast = parseHoloStrict(source);

    const visionCompiler = new VisionOSCompiler({
      structName: 'VisionOSProductivitySpace',
      useRealityComposerPro: true,
    });
    swiftOutput = visionCompiler.compile(ast, 'test-token');

    const usdzCompiler = new USDZExportCompiler();
    usdzOutput = usdzCompiler.compile(ast);
  });

  // ─── Source ingestion ──────────────────────────────────────────────
  it('ingests visionos-app.holo without parse errors', () => {
    expect(ast).toBeDefined();
    expect(ast.name).toBe('visionOS Productivity Space');
    expect(ast.objects?.length).toBeGreaterThan(0);
  });

  // ─── Swift/RealityKit output structural checks ──────────────────────
  it('emits Swift source with required imports', () => {
    expect(swiftOutput).toContain('import SwiftUI');
    expect(swiftOutput).toContain('import RealityKit');
    expect(swiftOutput).toContain('import RealityKitContent');
  });

  it('emits a struct matching the configured name', () => {
    expect(swiftOutput).toContain('struct VisionOSProductivitySpace');
  });

  it('uses RealityView as the root container', () => {
    expect(swiftOutput).toContain('RealityView');
  });

  it('creates a root Entity', () => {
    expect(swiftOutput).toContain('let root = Entity()');
  });

  it('places objects under root', () => {
    expect(swiftOutput).toContain('root.addChild');
  });

  // ─── USDZ output structural checks ─────────────────────────────────
  it('produces a non-empty USDZ/base64 artifact', () => {
    expect(usdzOutput).toBeDefined();
    expect(usdzOutput.length).toBeGreaterThan(100);
  });

  // ─── Partially-supported traits (baseline) ──────────────────────────
  describe('Partially-supported traits', () => {
    it('@hand_tracked maps to InputTargetComponent + CollisionComponent', () => {
      expect(swiftOutput).toContain('InputTargetComponent');
      expect(swiftOutput).toContain('CollisionComponent');
    });

    it('@portal maps to PortalComponent + WorldComponent', () => {
      expect(swiftOutput).toContain('PortalComponent');
      expect(swiftOutput).toContain('WorldComponent');
    });

    it('@ornament maps to InputTargetComponent + HoverEffectComponent', () => {
      expect(swiftOutput).toContain('HoverEffectComponent');
    });

    it('@eye_tracked emits a gaze-response comment', () => {
      expect(swiftOutput).toContain('Eye tracking: entity responds to gaze');
    });

    it('@rotatable emits a RotateGesture3D comment', () => {
      expect(swiftOutput).toContain('RotateGesture3D');
    });

    it('@scalable emits a MagnifyGesture comment', () => {
      expect(swiftOutput).toContain('MagnifyGesture');
    });
  });

  // ─── Fidelity gap assertions ───────────────────────────────────────
  describe('Fidelity Gaps vs Reality Composer Pro', () => {
    it('GAP: environment.style (mixed/full/progressive) is not emitted to Swift', () => {
      expect(swiftOutput).not.toContain('mixed');
      expect(swiftOutput).not.toContain('ImmersionStyle');
    });

    it('GAP: hand_tracking and eye_tracking flags are not wired to Swift', () => {
      expect(swiftOutput).not.toContain('hand_tracking');
      expect(swiftOutput).not.toContain('ARKit');
    });

    it('GAP: window-specific volumetric properties are absent', () => {
      expect(swiftOutput).not.toContain('VolumetricWindow');
      expect(swiftOutput).not.toContain('WindowGroup');
      expect(swiftOutput).not.toContain('corner_radius');
      expect(swiftOutput).not.toContain('min_size');
      expect(swiftOutput).not.toContain('max_size');
      expect(swiftOutput).not.toContain('glass_background');
      expect(swiftOutput).not.toContain('opacity');
    });

    it('GAP: webview, swiftui view, and AVPlayer content types are not generated', () => {
      expect(swiftOutput).not.toContain('WKWebView');
      expect(swiftOutput).not.toContain('AVPlayer');
      expect(swiftOutput).not.toContain('NotesEditorView');
      expect(swiftOutput).not.toContain('spatial_video.mov');
    });

    it('GAP: ornament attach_to, position, and offset are not compiled', () => {
      expect(swiftOutput).not.toContain('attachmentAnchor');
      expect(swiftOutput).not.toContain('ornament(');
    });

    it('GAP: toolbar and button UI inside ornaments are not generated', () => {
      expect(swiftOutput).not.toContain('ToolbarItem');
      expect(swiftOutput).not.toContain('Button(');
    });

    it('GAP: portal destination, preview, transition, and duration are ignored', () => {
      expect(swiftOutput).not.toContain('ImmersiveSpace');
      expect(swiftOutput).not.toContain('preview');
      expect(swiftOutput).not.toContain('transition: zoom');
    });

    it('GAP: @palm_menu has no mapping', () => {
      expect(swiftOutput).toMatch(/@palm_menu\s*—\s*no mapping defined/);
    });

    it('GAP: visible_when, radial layout, and menu items are not generated', () => {
      expect(swiftOutput).not.toContain('visible_when');
      expect(swiftOutput).not.toContain('radial');
      expect(swiftOutput).not.toContain('plus');
      expect(swiftOutput).not.toContain('folder');
    });

    it('GAP: inline animation blocks are not emitted as RealityKit animations', () => {
      expect(swiftOutput).not.toContain('rotation.y');
      expect(swiftOutput).not.toContain('from: 0');
      expect(swiftOutput).not.toContain('to: 360');
    });

    it('GAP: on_pinch / on_release / on_gaze_tap are not wired to gesture recognisers', () => {
      expect(swiftOutput).not.toContain('on_pinch');
      expect(swiftOutput).not.toContain('on_release');
      expect(swiftOutput).not.toContain('on_gaze_tap');
      expect(swiftOutput).not.toContain('close_window');
    });

    it('GAP: shareplay block is completely absent from output', () => {
      expect(swiftOutput).not.toContain('SharePlay');
      expect(swiftOutput).not.toContain('GroupActivity');
      expect(swiftOutput).not.toContain('activity_type');
      expect(swiftOutput).not.toContain('sync');
    });

    it('GAP: head_tracked and trigger_on audio properties are ignored', () => {
      expect(swiftOutput).not.toContain('head_tracked');
      expect(swiftOutput).not.toContain('trigger_on');
    });

    it('GAP: .usdz geometry references are emitted as generic boxes, not loaded', () => {
      expect(swiftOutput).not.toContain('data_visualization.usdz');
      expect(swiftOutput).not.toContain('earth_globe.usdz');
    });
  });

  // ─── Supported features ──────────────────────────────────────────────
  describe('Supported features (baseline coverage)', () => {
    it('compiles spatial groups', () => {
      expect(swiftOutput).toContain('WorkspaceWindows');
      expect(swiftOutput).toContain('VolumetricObjects');
    });

    it('compiles basic 3D objects', () => {
      expect(swiftOutput).toContain('3DChart');
      expect(swiftOutput).toContain('GlobeModel');
    });

    it('compiles ambient audio', () => {
      expect(swiftOutput).toContain('AmbientMusic');
      expect(swiftOutput).toContain('AmbientAudioComponent');
    });

    it('compiles spatial audio when flagged', () => {
      expect(swiftOutput).toContain('NotificationSound');
      expect(swiftOutput).toContain('SpatialAudioComponent');
    });
  });
});

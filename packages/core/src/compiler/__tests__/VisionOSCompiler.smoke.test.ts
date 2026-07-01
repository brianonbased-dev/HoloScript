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

const EXAMPLE_PATH = path.resolve(__dirname, '../../../../../examples/platforms/visionos-app.holo');

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
    it('environment.style emits a real ImmersionStyleComponent (gap CLOSED)', () => {
      // Was a documented gap; the compiler now emits a real
      // ImmersionStyleComponent(style: .mixed/.full/.progressive) — verified
      // output contains `root.components.set(ImmersionStyleComponent(style: .mixed))`.
      expect(swiftOutput).toContain('ImmersionStyleComponent');
      expect(swiftOutput).toContain('.mixed');
    });

    it('GAP: hand_tracking and eye_tracking flags are not wired to Swift', () => {
      expect(swiftOutput).not.toContain('hand_tracking');
      expect(swiftOutput).not.toContain('ARKit');
    });

    it('@window volumetric properties emit WindowGroup scene declarations (gap CLOSED)', () => {
      expect(swiftOutput).toContain('struct VolumetricWindowDescriptor');
      expect(swiftOutput).toContain('static func windowScenes() -> some Scene');
      expect(swiftOutput).toContain('WindowGroup(id: "BrowserWindow")');
      expect(swiftOutput).toContain('.windowStyle(.volumetric)');
      expect(swiftOutput).toContain(
        '.defaultSize(width: 0.8, height: 0.5, depth: 0.01, in: .meters)'
      );
      expect(swiftOutput).toContain('minSize: CGSize(width: 400, height: 300), // min_size');
      expect(swiftOutput).toContain('maxSize: CGSize(width: 1200, height: 800), // max_size');
      expect(swiftOutput).toContain('cornerRadius: 20, // corner_radius');
      expect(swiftOutput).toContain('glassBackground: true, // glass_background');
      expect(swiftOutput).toContain('opacity: 0.95 // opacity');
      expect(swiftOutput).toContain('NotesWindow.components.set(OpacityComponent(opacity: 0.95))');
      expect(swiftOutput).toContain('.glassBackgroundEffect()');
    });

    it('GAP: webview, swiftui view, and AVPlayer content types are not generated', () => {
      expect(swiftOutput).not.toContain('WKWebView');
      expect(swiftOutput).not.toContain('AVPlayer');
      expect(swiftOutput).not.toContain('NotesEditorView');
      expect(swiftOutput).not.toContain('spatial_video.mov');
    });

    it('@ornament attach_to, position, and offset emit SwiftUI ornament modifiers (gap CLOSED)', () => {
      expect(swiftOutput).toContain('.ornament(');
      expect(swiftOutput).toContain('attachmentAnchor: .scene(.topLeading)');
      expect(swiftOutput).toContain('contentAlignment: .topLeading');
      expect(swiftOutput).toContain('.offset(x: -20, y: 10)');
    });

    it('ornament toolbar and button UI emit SwiftUI controls (gap CLOSED)', () => {
      expect(swiftOutput).toContain('Button { } label: { Image(systemName: "xmark.circle.fill") }');
      expect(swiftOutput).toContain('HStack {');
      expect(swiftOutput).toContain('Button { } label: { Image(systemName: "pencil") }');
    });

    it('GAP: portal destination, preview, transition, and duration are ignored', () => {
      expect(swiftOutput).not.toContain('ImmersiveSpace');
      expect(swiftOutput).not.toContain('preview');
      expect(swiftOutput).not.toContain('transition: zoom');
    });

    it('@palm_menu emits anchoring + palm menu comment (partial support)', () => {
      expect(swiftOutput).toContain('@palm_menu — palm-attached radial menu');
    });

    it('GAP: palm_menu radial MENU ITEMS not yet rendered (documented-partial stub)', () => {
      // palm_menu now emits a real AnchoringComponent + a documented-partial
      // comment that NAMES visible_when/radial as pending (VisionOSTraitMap
      // level:'partial'). Assert the REAL menu-item rendering is still absent —
      // checking the documentation keywords would be a false positive.
      expect(swiftOutput).not.toContain('plus');
      expect(swiftOutput).not.toContain('folder');
    });

    it('inline animation blocks emit RealityKit animation resources (gap CLOSED)', () => {
      expect(swiftOutput).toContain('FromToByAnimation<Transform>');
      expect(swiftOutput).toContain('AnimationResource.generate');
      expect(swiftOutput).toContain('rotation.y from: 0');
      expect(swiftOutput).toContain('to: 360');
    });

    it('object event handlers emit targeted gesture wiring receipts (gap CLOSED)', () => {
      expect(swiftOutput).toContain('let GlobeModelEventHandlers = ["on_pinch", "on_release"]');
      expect(swiftOutput).toContain('let CloseButtonEventHandlers = ["on_gaze_tap"]');
      expect(swiftOutput).toContain('close_window("BrowserWindow")');
      expect(swiftOutput).toContain('dismissWindow(id: "BrowserWindow")');
    });

    it('shareplay block emits GroupActivity and messenger support (gap CLOSED)', () => {
      expect(swiftOutput).toContain('import GroupActivities');
      expect(swiftOutput).toContain('struct VisionOSProductivitySpaceGroupActivity: GroupActivity');
      expect(swiftOutput).toContain('collaborative_workspace');
      expect(swiftOutput).toContain('GroupSessionMessenger');
      expect(swiftOutput).toContain('sharePlaySyncKeys');
      expect(swiftOutput).toContain('window_positions');
    });

    it('GAP: head_tracked and trigger_on audio properties are ignored', () => {
      expect(swiftOutput).not.toContain('head_tracked');
      expect(swiftOutput).not.toContain('trigger_on');
    });

    it('.usdz geometry references load through RealityKit content bundle (gap CLOSED)', () => {
      expect(swiftOutput).toContain(
        'ModelEntity(named: "model/data_visualization.usdz", in: realityKitContentBundle)'
      );
      expect(swiftOutput).toContain(
        'ModelEntity(named: "model/earth_globe.usdz", in: realityKitContentBundle)'
      );
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

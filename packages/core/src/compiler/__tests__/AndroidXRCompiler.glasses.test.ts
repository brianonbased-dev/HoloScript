/**
 * AndroidXRCompiler -- AI Glasses Mode Test Suite
 *
 * Covers: Form factor switching (headset vs glasses), Jetpack Compose Glimmer
 * output, Jetpack Projected API integration, GlimmerTheme, Glimmer composables
 * (Card, Button, Text, ListItem, TitleChip), glasses-specific manifest
 * (xr_projected display category), glasses-specific Gradle dependencies
 * (glimmer, projected), and the Glimmer components file generation.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AndroidXRCompiler } from '../AndroidXRCompiler';
import type { AndroidXRCompileResult, AndroidXRFormFactor } from '../AndroidXRCompiler';
import type { HoloComposition, HoloObjectDecl } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return {
    name: 'TestScene',
    objects: [],
    lights: [],
    timelines: [],
    transitions: [],
    ...overrides,
  } as HoloComposition;
}

function makeObj(
  name: string,
  props: Array<{ key: string; value: unknown }> = [],
  traits: any[] = []
): HoloObjectDecl {
  return {
    name,
    properties: props.map(({ key, value }) => ({ key, value })),
    traits,
    children: [],
  } as any;
}

describe('AndroidXRCompiler -- AI Glasses Mode', () => {
  let glassesCompiler: AndroidXRCompiler;
  let headsetCompiler: AndroidXRCompiler;

  beforeEach(() => {
    glassesCompiler = new AndroidXRCompiler({
      packageName: 'com.test.glasses',
      activityName: 'GlassesActivity',
      formFactor: 'glasses',
    });
    headsetCompiler = new AndroidXRCompiler({
      packageName: 'com.test.headset',
      activityName: 'HeadsetActivity',
      formFactor: 'headset',
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // FORM FACTOR CONFIGURATION
  // ═══════════════════════════════════════════════════════════════════════

  describe('Form Factor Configuration', () => {
    it('defaults to headset form factor when not specified', () => {
      const defaultCompiler = new AndroidXRCompiler();
      expect(defaultCompiler.isGlassesMode).toBe(false);
    });

    it('sets glasses form factor from options', () => {
      expect(glassesCompiler.isGlassesMode).toBe(true);
    });

    it('sets headset form factor from options', () => {
      expect(headsetCompiler.isGlassesMode).toBe(false);
    });

    it('headset mode does NOT return glimmerComponentsFile', () => {
      const result = headsetCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toBeUndefined();
    });

    it('glasses mode DOES return glimmerComponentsFile', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toBeDefined();
      expect(typeof result.glimmerComponentsFile).toBe('string');
      expect(result.glimmerComponentsFile!.length).toBeGreaterThan(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // COMPILE RESULT STRUCTURE
  // ═══════════════════════════════════════════════════════════════════════

  describe('Compile Result Structure', () => {
    it('glasses mode returns all standard files plus glimmerComponentsFile', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result).toHaveProperty('activityFile');
      expect(result).toHaveProperty('stateFile');
      expect(result).toHaveProperty('nodeFactoryFile');
      expect(result).toHaveProperty('manifestFile');
      expect(result).toHaveProperty('buildGradle');
      expect(result).toHaveProperty('glimmerComponentsFile');
    });

    it('all glasses output files are non-empty', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile.length).toBeGreaterThan(0);
      expect(result.stateFile.length).toBeGreaterThan(0);
      expect(result.nodeFactoryFile.length).toBeGreaterThan(0);
      expect(result.manifestFile.length).toBeGreaterThan(0);
      expect(result.buildGradle.length).toBeGreaterThan(0);
      expect(result.glimmerComponentsFile!.length).toBeGreaterThan(0);
    });

    it('empty composition compiles in glasses mode without error', () => {
      expect(() => glassesCompiler.compile(makeComp(), 'test-token')).not.toThrow();
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GLASSES ACTIVITY FILE — GLIMMER INTEGRATION
  // ═══════════════════════════════════════════════════════════════════════

  describe('Glasses Activity File', () => {
    it('contains AI Glasses mode header comment', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('AI Glasses mode');
    });

    it('contains form factor comment', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('Jetpack Compose Glimmer');
      expect(result.activityFile).toContain('Jetpack Projected');
    });

    it('contains package declaration', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('package com.test.glasses');
    });

    it('imports GlimmerTheme', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('import androidx.xr.glimmer.GlimmerTheme');
    });

    it('imports Glimmer composables (Card, Button, Text, ListItem, TitleChip)', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('import androidx.xr.glimmer.Card');
      expect(result.activityFile).toContain('import androidx.xr.glimmer.Button');
      expect(result.activityFile).toContain('import androidx.xr.glimmer.Text');
      expect(result.activityFile).toContain('import androidx.xr.glimmer.ListItem');
      expect(result.activityFile).toContain('import androidx.xr.glimmer.TitleChip');
    });

    it('imports Glimmer surface modifier', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('import androidx.xr.glimmer.surface');
    });

    it('imports ProjectedContext', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('import androidx.xr.projected.ProjectedContext');
    });

    it('imports ProjectedDeviceController', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain(
        'import androidx.xr.projected.ProjectedDeviceController'
      );
    });

    it('imports ProjectedDisplayController', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain(
        'import androidx.xr.projected.ProjectedDisplayController'
      );
    });

    it('imports CAPABILITY_VISUAL_UI', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('CAPABILITY_VISUAL_UI');
    });

    it('emits @OptIn(ExperimentalProjectedApi::class)', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('@OptIn(ExperimentalProjectedApi::class)');
    });

    it('emits Activity class extending ComponentActivity', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('class GlassesActivity : ComponentActivity()');
    });

    it('emits ProjectedDisplayController field', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain(
        'private var displayController: ProjectedDisplayController?'
      );
    });

    it('emits isVisualUiSupported state', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('isVisualUiSupported');
    });

    it('emits areVisualsOn state', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('areVisualsOn');
    });

    it('wraps content in GlimmerTheme', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('GlimmerTheme {');
    });

    it('uses Glimmer surface modifier on root Box', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('.surface(focusable = false)');
    });

    it('emits GlassesScreen composable function', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('TestSceneGlassesScreen(');
    });

    it('emits audio fallback for non-display glasses', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('Audio Guidance Mode Active');
    });

    it('does NOT contain SceneCore or Subspace references', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).not.toContain('Subspace {');
      expect(result.activityFile).not.toContain('import androidx.xr.scenecore');
      expect(result.activityFile).not.toContain('SpatialPanel');
    });

    it('does NOT contain Material3 references', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).not.toContain('import androidx.compose.material3');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GLASSES MODE — OBJECT COMPILATION (GLIMMER COMPOSABLES)
  // ═══════════════════════════════════════════════════════════════════════

  describe('Glasses Object Compilation', () => {
    it('compiles 3D model object as Glimmer Card', () => {
      const obj = makeObj('Robot', [
        { key: 'model', value: 'models/robot.glb' },
        { key: 'position', value: [0, 1, -2] },
      ]);
      const result = glassesCompiler.compile(makeComp({ objects: [obj] }), 'test-token');
      expect(result.activityFile).toContain('Card(');
      expect(result.activityFile).toContain('Robot');
      expect(result.activityFile).toContain('3D Model: models/robot.glb');
    });

    it('compiles text object as Glimmer Text', () => {
      const obj = makeObj('Title', [
        { key: 'mesh', value: 'text' },
        { key: 'text', value: 'Hello Glasses' },
      ]);
      const result = glassesCompiler.compile(makeComp({ objects: [obj] }), 'test-token');
      expect(result.activityFile).toContain('Text("Hello Glasses"');
    });

    it('compiles primitive object as Glimmer ListItem', () => {
      const obj = makeObj('MyCube', [{ key: 'mesh', value: 'cube' }]);
      const result = glassesCompiler.compile(makeComp({ objects: [obj] }), 'test-token');
      expect(result.activityFile).toContain('ListItem(');
      expect(result.activityFile).toContain('MyCube');
    });

    it('emits TitleChip with composition name', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('TitleChip(title = "TestScene")');
    });

    it('emits Close button', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('Button(onClick = onClose)');
      expect(result.activityFile).toContain('Text("Close")');
    });

    it('compiles UI button elements as Glimmer Buttons', () => {
      const comp = makeComp({
        ui: {
          elements: [
            {
              name: 'StartBtn',
              properties: [
                { key: 'type', value: 'button' },
                { key: 'label', value: 'Start' },
              ],
            },
          ],
        },
      } as any);
      const result = glassesCompiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('Button(onClick');
      expect(result.activityFile).toContain('Text("Start")');
    });

    it('compiles UI text elements', () => {
      const comp = makeComp({
        ui: {
          elements: [{ name: 'InfoText', properties: [{ key: 'text', value: 'Welcome' }] }],
        },
      } as any);
      const result = glassesCompiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('Text("Welcome"');
    });

    it('compiles state properties as mutableStateOf', () => {
      const comp = makeComp({
        state: {
          properties: [
            { key: 'count', value: 0 },
            { key: 'label', value: 'hello' },
          ],
        },
      });
      const result = glassesCompiler.compile(comp, 'test-token');
      expect(result.activityFile).toContain('mutableStateOf(0)');
      expect(result.activityFile).toContain('mutableStateOf("hello")');
    });

    it('compiles multiple objects into Glimmer layout', () => {
      const objs = [
        makeObj('Obj1', [{ key: 'mesh', value: 'cube' }]),
        makeObj('Obj2', [{ key: 'model', value: 'model.glb' }]),
      ];
      const result = glassesCompiler.compile(makeComp({ objects: objs }), 'test-token');
      expect(result.activityFile).toContain('Obj1');
      expect(result.activityFile).toContain('Obj2');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GLASSES MANIFEST FILE
  // ═══════════════════════════════════════════════════════════════════════

  describe('Glasses Manifest File', () => {
    it('contains xr_projected display category', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).toContain('android:requiredDisplayCategory="xr_projected"');
    });

    it('does NOT contain xr.headtracking hardware requirement', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).not.toContain('android.hardware.xr.headtracking');
    });

    it('does NOT contain com.google.intent.category.XR', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).not.toContain('com.google.intent.category.XR');
    });

    it('contains CAMERA permission', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).toContain('android.permission.CAMERA');
    });

    it('contains RECORD_AUDIO permission', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).toContain('android.permission.RECORD_AUDIO');
    });

    it('contains BLUETOOTH_CONNECT permission', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).toContain('android.permission.BLUETOOTH_CONNECT');
    });

    it('contains AI Glasses mode header comment', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).toContain('AI Glasses mode');
    });

    it('contains activity name', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).toContain('.GlassesActivity');
    });

    it('contains package name', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).toContain('com.test.glasses');
    });

    it('uses optional ARCore value', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.manifestFile).toContain('android:value="optional"');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GLASSES BUILD GRADLE
  // ═══════════════════════════════════════════════════════════════════════

  describe('Glasses Build Gradle', () => {
    it('contains Glimmer dependency', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('androidx.xr.glimmer:glimmer');
    });

    it('contains Projected dependency', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('androidx.xr.projected:projected');
    });

    it('contains XR Runtime dependency', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('androidx.xr.runtime:runtime');
    });

    it('contains CameraX dependencies for glasses camera', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('androidx.camera:camera-core');
      expect(result.buildGradle).toContain('androidx.camera:camera-lifecycle');
    });

    it('contains ARCore dependency', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('androidx.xr.arcore:arcore');
    });

    it('contains Compose dependencies', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('compose = true');
      expect(result.buildGradle).toContain('androidx.compose');
    });

    it('contains Kotlin DSL syntax', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('id("com.android.application")');
      expect(result.buildGradle).toContain('implementation(');
    });

    it('contains package name', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('com.test.glasses');
    });

    it('does NOT contain Filament dependencies in glasses mode', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).not.toContain('filament-android');
      expect(result.buildGradle).not.toContain('gltfio-android');
    });

    it('does NOT contain SceneCore dependency in glasses mode', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).not.toContain('scenecore:scenecore');
    });

    it('contains AI Glasses mode header comment', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('AI Glasses mode');
    });

    it('contains coroutines dependency', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.buildGradle).toContain('kotlinx-coroutines-android');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // GLIMMER COMPONENTS FILE
  // ═══════════════════════════════════════════════════════════════════════

  describe('Glimmer Components File', () => {
    it('contains package declaration', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('package com.test.glasses');
    });

    it('contains GlimmerOverlay composable', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('TestSceneGlimmerOverlay(');
      expect(result.glimmerComponentsFile).toContain('GlimmerTheme');
    });

    it('contains GlimmerInfoCard composable', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('fun GlimmerInfoCard(');
      expect(result.glimmerComponentsFile).toContain('Card(');
    });

    it('contains GlimmerActionButton composable', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('fun GlimmerActionButton(');
      expect(result.glimmerComponentsFile).toContain('Button(');
    });

    it('contains getGlassesCameraContext helper', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('fun getGlassesCameraContext(');
      expect(result.glimmerComponentsFile).toContain(
        'ProjectedContext.createProjectedDeviceContext'
      );
    });

    it('contains rememberGlassesConnectionState composable', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('fun rememberGlassesConnectionState(');
      expect(result.glimmerComponentsFile).toContain('isProjectedDeviceConnected');
    });

    it('imports Glimmer components', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('import androidx.xr.glimmer.GlimmerTheme');
      expect(result.glimmerComponentsFile).toContain('import androidx.xr.glimmer.Card');
      expect(result.glimmerComponentsFile).toContain('import androidx.xr.glimmer.Button');
    });

    it('imports ProjectedContext', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain(
        'import androidx.xr.projected.ProjectedContext'
      );
    });

    it('has audio fallback text', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('Audio Guidance Mode Active');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // MODE SWITCHING — HEADSET VS GLASSES OUTPUT DIFFERENCES
  // ═══════════════════════════════════════════════════════════════════════

  describe('Mode Switching', () => {
    it('headset mode uses Subspace, glasses mode does not', () => {
      const headsetResult = headsetCompiler.compile(makeComp(), 'test-token');
      const glassesResult = glassesCompiler.compile(makeComp(), 'test-token');
      expect(headsetResult.activityFile).toContain('Subspace {');
      expect(glassesResult.activityFile).not.toContain('Subspace {');
    });

    it('headset mode uses Material3, glasses mode uses Glimmer', () => {
      const headsetResult = headsetCompiler.compile(makeComp(), 'test-token');
      const glassesResult = glassesCompiler.compile(makeComp(), 'test-token');
      expect(headsetResult.activityFile).toContain('material3');
      expect(glassesResult.activityFile).toContain('GlimmerTheme');
      expect(glassesResult.activityFile).not.toContain('material3');
    });

    it('headset mode has xr.headtracking requirement, glasses mode has xr_projected', () => {
      const headsetResult = headsetCompiler.compile(makeComp(), 'test-token');
      const glassesResult = glassesCompiler.compile(makeComp(), 'test-token');
      expect(headsetResult.manifestFile).toContain('android.hardware.xr.headtracking');
      expect(glassesResult.manifestFile).toContain('xr_projected');
      expect(glassesResult.manifestFile).not.toContain('android.hardware.xr.headtracking');
    });

    it('headset mode includes SceneCore deps, glasses mode includes Glimmer+Projected', () => {
      const headsetResult = headsetCompiler.compile(makeComp(), 'test-token');
      const glassesResult = glassesCompiler.compile(makeComp(), 'test-token');
      expect(headsetResult.buildGradle).toContain('scenecore');
      expect(glassesResult.buildGradle).toContain('glimmer');
      expect(glassesResult.buildGradle).toContain('projected');
      expect(glassesResult.buildGradle).not.toContain('scenecore');
    });

    it('headset mode uses XRSession, glasses mode uses ProjectedDeviceController', () => {
      const headsetResult = headsetCompiler.compile(makeComp(), 'test-token');
      const glassesResult = glassesCompiler.compile(makeComp(), 'test-token');
      expect(headsetResult.activityFile).toContain('XRSession');
      expect(glassesResult.activityFile).toContain('ProjectedDeviceController');
      expect(glassesResult.activityFile).not.toContain('XRSession');
    });

    it('both modes share the same state file format', () => {
      const comp = makeComp({
        state: { properties: [{ key: 'score', value: 0 }] },
      });
      const headsetResult = headsetCompiler.compile(comp, 'test-token');
      const glassesResult = glassesCompiler.compile(comp, 'test-token');
      // Both should contain XRSceneState and the score property
      expect(headsetResult.stateFile).toContain('class XRSceneState');
      expect(glassesResult.stateFile).toContain('class XRSceneState');
      expect(headsetResult.stateFile).toContain('score');
      expect(glassesResult.stateFile).toContain('score');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // CUSTOM PACKAGE NAME PROPAGATION
  // ═══════════════════════════════════════════════════════════════════════

  describe('Custom Package Name', () => {
    it('custom package name appears in all glasses output files', () => {
      const c = new AndroidXRCompiler({
        packageName: 'com.mygame.glasses',
        formFactor: 'glasses',
      });
      const result = c.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('com.mygame.glasses');
      expect(result.stateFile).toContain('com.mygame.glasses');
      expect(result.nodeFactoryFile).toContain('com.mygame.glasses');
      expect(result.manifestFile).toContain('com.mygame.glasses');
      expect(result.buildGradle).toContain('com.mygame.glasses');
      expect(result.glimmerComponentsFile).toContain('com.mygame.glasses');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════
  // PROJECTED API DETECTION
  // ═══════════════════════════════════════════════════════════════════════

  describe('Projected API Detection', () => {
    it('glasses activity detects display capability', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.activityFile).toContain('ProjectedDeviceController.create');
      expect(result.activityFile).toContain('CAPABILITY_VISUAL_UI');
    });

    it('Glimmer components file includes connection monitoring', () => {
      const result = glassesCompiler.compile(makeComp(), 'test-token');
      expect(result.glimmerComponentsFile).toContain('isProjectedDeviceConnected');
    });
  });
});

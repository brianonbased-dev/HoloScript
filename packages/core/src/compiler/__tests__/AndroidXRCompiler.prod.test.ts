/**
 * AndroidXRCompiler -- Production Test Suite
 *
 * Covers: Multi-file output (activityFile, stateFile, nodeFactoryFile, manifestFile, buildGradle),
 * Kotlin output, Jetpack Compose XR, Activity class, ARCore session,
 * objects, lights, camera, timelines, audio, UI, zones, effects, transitions.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AndroidXRCompiler } from '../AndroidXRCompiler';
import type { AndroidXRCompileResult } from '../AndroidXRCompiler';
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

describe('AndroidXRCompiler -- Production', () => {
  let compiler: AndroidXRCompiler;

  beforeEach(() => {
    compiler = new AndroidXRCompiler();
  });

  // ─── Construction ────────────────────────────────────────────────────
  it('constructs with default options', () => {
    expect(compiler).toBeDefined();
  });

  it('constructs with custom options', () => {
    const c = new AndroidXRCompiler({
      packageName: 'com.example.app',
      activityName: 'MainActivity',
      useARCore: true,
    });
    expect(c).toBeDefined();
  });

  // ─── compile() returns multi-file result ─────────────────────────────
  it('compile returns AndroidXRCompileResult with all expected files', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result).toHaveProperty('activityFile');
    expect(result).toHaveProperty('stateFile');
    expect(result).toHaveProperty('nodeFactoryFile');
    expect(result).toHaveProperty('manifestFile');
    expect(result).toHaveProperty('buildGradle');
    expect(typeof result.activityFile).toBe('string');
    expect(typeof result.stateFile).toBe('string');
    expect(typeof result.nodeFactoryFile).toBe('string');
    expect(typeof result.manifestFile).toBe('string');
    expect(typeof result.buildGradle).toBe('string');
  });

  it('all output files are non-empty', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.activityFile.length).toBeGreaterThan(0);
    expect(result.stateFile.length).toBeGreaterThan(0);
    expect(result.nodeFactoryFile.length).toBeGreaterThan(0);
    expect(result.manifestFile.length).toBeGreaterThan(0);
    expect(result.buildGradle.length).toBeGreaterThan(0);
  });

  it('empty composition compiles without error', () => {
    expect(() => compiler.compile(makeComp(), 'test-token')).not.toThrow();
  });

  // ─── Activity file: Kotlin structure ──────────────────────────────────
  it('activity file contains package declaration', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.activityFile).toContain('package');
  });

  it('activity file contains import statements', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.activityFile).toContain('import');
  });

  it('activity file contains Activity class', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.activityFile).toContain('Activity');
  });

  it('activity file contains Composable annotation', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.activityFile).toContain('@Composable');
  });

  // ─── ARCore session ───────────────────────────────────────────────────
  it('useARCore generates AR session setup', () => {
    const c = new AndroidXRCompiler({ useARCore: true });
    const result = c.compile(makeComp(), 'test-token');
    expect(result.activityFile.toLowerCase()).toContain('session');
  });

  // ─── Objects ─────────────────────────────────────────────────────────
  it('compiles a cube object', () => {
    const obj = makeObj('MyCube', [{ key: 'mesh', value: 'cube' }]);
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.activityFile).toContain('MyCube');
  });

  it('compiles a sphere object', () => {
    const obj = makeObj('Ball', [{ key: 'mesh', value: 'sphere' }]);
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.activityFile).toContain('Ball');
  });

  it('compiles object with position', () => {
    const obj = makeObj('Box', [
      { key: 'mesh', value: 'box' },
      { key: 'position', value: [0, 1, -2] },
    ]);
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.activityFile).toBeDefined();
  });

  // ─── Lights ──────────────────────────────────────────────────────────
  it('compiles a point light', () => {
    const result = compiler.compile(
      makeComp({
        lights: [
          {
            name: 'KeyLight',
            lightType: 'point',
            properties: [
              { key: 'intensity', value: 1000 },
              { key: 'color', value: '#ffffff' },
            ],
          },
        ] as any,
      }),
      'test-token'
    );
    expect(result.activityFile).toContain('KeyLight');
  });

  it('compiles a directional light', () => {
    const result = compiler.compile(
      makeComp({
        lights: [
          {
            name: 'Sun',
            lightType: 'directional',
            properties: [
              { key: 'intensity', value: 5 },
              { key: 'color', value: '#fff8e7' },
            ],
          },
        ] as any,
      }),
      'test-token'
    );
    expect(result.activityFile).toBeDefined();
  });

  // ─── Camera ───────────────────────────────────────────────────────────
  it('compiles camera configuration', () => {
    const result = compiler.compile(
      makeComp({
        camera: {
          cameraType: 'perspective',
          properties: [
            { key: 'fov', value: 75 },
            { key: 'near', value: 0.1 },
            { key: 'far', value: 500 },
          ],
        },
      } as any),
      'test-token'
    );
    expect(result.activityFile).toBeDefined();
  });

  // ─── Timelines ───────────────────────────────────────────────────────
  it('compiles a timeline', () => {
    const result = compiler.compile(
      makeComp({
        timelines: [{ name: 'FadeIn', duration: 1.5, entries: [] }] as any,
      }),
      'test-token'
    );
    expect(result.activityFile).toContain('FadeIn');
  });

  // ─── Audio ───────────────────────────────────────────────────────────
  it('compiles audio', () => {
    const result = compiler.compile(
      makeComp({
        audio: [
          {
            name: 'BgMusic',
            properties: [
              { key: 'src', value: 'music.mp3' },
              { key: 'loop', value: true },
              { key: 'volume', value: 0.7 },
            ],
          },
        ],
      } as any),
      'test-token'
    );
    expect(result.activityFile).toBeDefined();
  });

  // ─── UI ──────────────────────────────────────────────────────────────
  it('compiles UI elements', () => {
    const result = compiler.compile(
      makeComp({
        ui: { elements: [{ name: 'HUD', properties: [{ key: 'type', value: 'panel' }] }] },
      } as any),
      'test-token'
    );
    expect(result.activityFile).toBeDefined();
  });

  // ─── Zones ───────────────────────────────────────────────────────────
  it('compiles trigger zones', () => {
    const result = compiler.compile(
      makeComp({
        zones: [
          {
            name: 'SafeZone',
            properties: [
              { key: 'shape', value: 'sphere' },
              { key: 'radius', value: 3 },
            ],
          },
        ],
      } as any),
      'test-token'
    );
    expect(result.activityFile).toBeDefined();
  });

  // ─── Transitions ─────────────────────────────────────────────────────
  it('compiles transitions', () => {
    const result = compiler.compile(
      makeComp({
        transitions: [
          {
            name: 'FadeOut',
            properties: [
              { key: 'target', value: 'B' },
              { key: 'duration', value: 0.8 },
            ],
          },
        ],
      } as any),
      'test-token'
    );
    expect(result.activityFile).toContain('FadeOut');
  });

  // ─── Multiple objects ─────────────────────────────────────────────────
  it('compiles multiple objects', () => {
    const objs = [makeObj('Obj1'), makeObj('Obj2'), makeObj('Obj3')];
    const result = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(result.activityFile).toContain('Obj1');
    expect(result.activityFile).toContain('Obj2');
  });

  // ─── Package name ─────────────────────────────────────────────────────
  it('custom package name appears in output', () => {
    const c = new AndroidXRCompiler({ packageName: 'com.mygame.xr' });
    const result = c.compile(makeComp(), 'test-token');
    expect(result.activityFile).toContain('com.mygame.xr');
  });

  // ─── DP3: URI-Based 3D Model Loading ──────────────────────────────
  it('DP3: uses GltfModel.create with Uri.parse for model objects', () => {
    const obj = makeObj('Robot', [
      { key: 'model', value: 'models/robot.glb' },
      { key: 'position', value: [0, 0, -2] },
    ]);
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.activityFile).toContain('GltfModel.create');
    expect(result.activityFile).toContain('Uri.parse');
    expect(result.activityFile).toContain('GltfModelEntity.create');
    expect(result.activityFile).not.toContain('ArModelNode');
  });

  it('DP3: imports GltfModel and GltfModelEntity', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.activityFile).toContain('import androidx.xr.scenecore.GltfModel');
    expect(result.activityFile).toContain('import androidx.xr.scenecore.GltfModelEntity');
  });

  // ─── DP3: Face Tracking ──────────────────────────────────────────
  it('DP3: compiles face tracking with blendshapes', () => {
    const obj = makeObj('FaceAvatar', [], [{ name: 'face_tracking', config: {} }]);
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.activityFile).toContain('FaceTrackingMode.BLEND_SHAPES');
    expect(result.activityFile).toContain('Face.getUserFace');
    expect(result.activityFile).toContain('blendShapes');
  });

  // ─── DP3: UserSubspace Head-Following UI ──────────────────────────
  it('DP3: wraps follows_head objects in UserSubspace', () => {
    const obj = makeObj(
      'HUD',
      [{ key: 'width', value: 400 }],
      [{ name: 'follows_head', config: { distance: 1.5 } }]
    );
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.activityFile).toContain('UserSubspace {');
    expect(result.activityFile).toContain('head-following');
  });

  // ─── DP3: SurfaceEntity with DRM ──────────────────────────────────
  it('DP3: emits SurfaceEntity with DRM protection', () => {
    const obj = makeObj(
      'DrmPlayer',
      [],
      [
        {
          name: 'drm_video',
          config: {
            uri: 'https://cdn.example.com/movie.mpd',
            license_uri: 'https://drm.example.com/license',
            shape: 'quad',
          },
        },
      ]
    );
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.activityFile).toContain('SurfaceEntity.SurfaceProtection.PROTECTED');
    expect(result.activityFile).toContain('ExoPlayer');
    expect(result.activityFile).toContain('WIDEVINE_UUID');
  });

  it('DP3: supports hemisphere shape for 180 video', () => {
    const obj = makeObj(
      'Video180',
      [],
      [
        {
          name: 'drm_video',
          config: { shape: 'hemisphere', radius: 8 },
        },
      ]
    );
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.activityFile).toContain('SurfaceEntity.Shape.Hemisphere(8f)');
  });

  // ─── DP3: SurfaceEntity import ────────────────────────────────────
  it('DP3: imports SurfaceEntity and SpatialCapability', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.activityFile).toContain('import androidx.xr.scenecore.SurfaceEntity');
    expect(result.activityFile).toContain('import androidx.xr.scenecore.SpatialCapability');
  });

  // ─── State file ───────────────────────────────────────────────────
  it('state file contains ViewModel class', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.stateFile).toContain('class XRSceneState : ViewModel()');
  });

  it('state file includes state properties from composition', () => {
    const comp = makeComp({
      state: {
        properties: [
          { key: 'health', value: 100 },
          { key: 'playerName', value: 'Player1' },
        ],
      },
    });
    const result = compiler.compile(comp, 'test-token');
    expect(result.stateFile).toContain('health');
    expect(result.stateFile).toContain('playerName');
    expect(result.stateFile).toContain('MutableLiveData');
  });

  it('state file includes XR-specific state management', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.stateFile).toContain('spatialCapabilities');
    expect(result.stateFile).toContain('onEntitySelected');
    expect(result.stateFile).toContain('reset');
  });

  // ─── Node Factory file ────────────────────────────────────────────
  it('node factory contains XRNodeFactory object', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.nodeFactoryFile).toContain('object XRNodeFactory');
  });

  it('node factory contains loadGltfModel helper', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.nodeFactoryFile).toContain('fun loadGltfModel');
    expect(result.nodeFactoryFile).toContain('GltfModel.create');
    expect(result.nodeFactoryFile).toContain('GltfModelEntity.create');
  });

  it('node factory generates per-object factory methods', () => {
    const objs = [
      makeObj('Robot', [{ key: 'model', value: 'models/robot.glb' }]),
      makeObj('Chair', [{ key: 'model', value: 'models/chair.glb' }]),
    ];
    const result = compiler.compile(makeComp({ objects: objs }), 'test-token');
    expect(result.nodeFactoryFile).toContain('createRobot');
    expect(result.nodeFactoryFile).toContain('createChair');
  });

  // ─── Manifest file ────────────────────────────────────────────────
  it('manifest contains XR-specific features', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.manifestFile).toContain('android.hardware.xr.headtracking');
    expect(result.manifestFile).toContain('com.google.intent.category.XR');
  });

  it('manifest declares CAMERA permission', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.manifestFile).toContain('android.permission.CAMERA');
  });

  it('manifest includes HAND_TRACKING permission when needed', () => {
    const obj = makeObj('HandController', [], [{ name: 'hand_tracking' }]);
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.manifestFile).toContain('android.permission.HAND_TRACKING');
  });

  it('manifest includes FACE_TRACKING permission when needed', () => {
    const obj = makeObj('Avatar', [], [{ name: 'face_tracking', config: {} }]);
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.manifestFile).toContain('android.permission.FACE_TRACKING');
  });

  // ─── Build Gradle file ────────────────────────────────────────────
  it('build.gradle contains Android XR dependencies', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.buildGradle).toContain('androidx.xr.scenecore');
    expect(result.buildGradle).toContain('androidx.xr.arcore');
    expect(result.buildGradle).toContain('filament');
  });

  it('build.gradle contains Compose configuration', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.buildGradle).toContain('compose = true');
    expect(result.buildGradle).toContain('androidx.compose');
  });

  it('build.gradle includes Media3 when DRM video is used', () => {
    const obj = makeObj(
      'DrmPlayer',
      [],
      [
        {
          name: 'drm_video',
          config: { uri: 'test.mpd' },
        },
      ]
    );
    const result = compiler.compile(makeComp({ objects: [obj] }), 'test-token');
    expect(result.buildGradle).toContain('media3-exoplayer');
    expect(result.buildGradle).toContain('media3-common');
  });

  it('build.gradle uses Kotlin DSL (.kts style)', () => {
    const result = compiler.compile(makeComp(), 'test-token');
    expect(result.buildGradle).toContain('id("com.android.application")');
    expect(result.buildGradle).toContain('implementation(');
  });

  // ─── Custom package name in all files ─────────────────────────────
  it('custom package name appears in all relevant files', () => {
    const c = new AndroidXRCompiler({ packageName: 'com.mygame.xr' });
    const result = c.compile(makeComp(), 'test-token');
    expect(result.activityFile).toContain('com.mygame.xr');
    expect(result.stateFile).toContain('com.mygame.xr');
    expect(result.nodeFactoryFile).toContain('com.mygame.xr');
    expect(result.manifestFile).toContain('com.mygame.xr');
    expect(result.buildGradle).toContain('com.mygame.xr');
  });
});

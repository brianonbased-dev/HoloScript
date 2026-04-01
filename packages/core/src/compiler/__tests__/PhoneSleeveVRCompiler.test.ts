import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PhoneSleeveVRCompiler } from '../PhoneSleeveVRCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

describe('PhoneSleeveVRCompiler', () => {
  let compiler: PhoneSleeveVRCompiler;

  beforeEach(() => {
    compiler = new PhoneSleeveVRCompiler();
  });

  // =========== HTML structure ===========

  it('compiles minimal composition to HTML page', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('<!DOCTYPE html>');
    expect(html).toContain('</html>');
  });

  it('includes Three.js import map', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('importmap');
    expect(html).toContain('three');
  });

  it('includes StereoEffect import', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('StereoEffect');
  });

  it('includes DeviceOrientationControls import', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('DeviceOrientationControls');
  });

  it('includes composition name as title', () => {
    const html = compiler.compile(makeComposition({ name: 'My VR World' }), 'test-token');
    expect(html).toContain('<title>My VR World</title>');
  });

  // =========== Stereoscopic rendering ===========

  it('configures stereo eye separation from IPD', () => {
    const c = new PhoneSleeveVRCompiler({ ipd: 68 });
    const html = c.compile(makeComposition(), 'test-token');
    expect(html).toContain('currentIPD = 68');
    expect(html).toContain('setEyeSeparation');
  });

  it('uses default IPD of 64mm', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('currentIPD = 64');
  });

  // =========== Barrel distortion ===========

  it('includes barrel distortion coefficients', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('DISTORTION_K1');
    expect(html).toContain('DISTORTION_K2');
  });

  it('respects custom distortion coefficients', () => {
    const c = new PhoneSleeveVRCompiler({ distortionK1: 0.5, distortionK2: 0.2 });
    const html = c.compile(makeComposition(), 'test-token');
    expect(html).toContain('0.5');
    expect(html).toContain('0.2');
  });

  // =========== Gaze cursor ===========

  it('includes gaze cursor reticle', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('reticle');
    expect(html).toContain('gazeTarget');
    expect(html).toContain('GAZE_DWELL_MS');
  });

  it('includes dwell-to-select logic', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('onGazeSelect');
  });

  // =========== Comfort features ===========

  it('includes comfort vignette', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('vignette');
    expect(html).toContain('VIGNETTE_ENABLED');
  });

  it('can disable comfort vignette', () => {
    const c = new PhoneSleeveVRCompiler({ comfortVignette: false });
    const html = c.compile(makeComposition(), 'test-token');
    expect(html).toContain('VIGNETTE_ENABLED = false');
  });

  // =========== Session timer ===========

  it('includes session timer', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('SESSION_TIMER_MS');
    expect(html).toContain('session-warning');
  });

  it('respects custom session timer', () => {
    const c = new PhoneSleeveVRCompiler({ sessionTimerMinutes: 10 });
    const html = c.compile(makeComposition(), 'test-token');
    // 10 minutes * 60 * 1000 = 600000
    expect(html).toContain('600000');
  });

  // =========== IPD adjustment ===========

  it('includes IPD adjustment touch handler', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('touchstart');
    expect(html).toContain('ipd-display');
  });

  // =========== Battery & thermal ===========

  it('includes battery awareness', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('BATTERY_ENABLED');
    expect(html).toContain('getBattery');
  });

  it('includes thermal throttle config', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('THERMAL_ENABLED');
  });

  // =========== Objects ===========

  it('compiles objects with positions and colors', () => {
    const comp = makeComposition({
      objects: [
        {
          name: 'RedCube',
          shape: 'cube',
          position: [1, 2, -3],
          color: '#ff0000',
          traits: [],
        },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('RedCube');
    expect(html).toContain('BoxGeometry');
    expect(html).toContain('1, 2, -3');
    expect(html).toContain('0xff0000');
  });

  it('compiles sphere shapes', () => {
    const comp = makeComposition({
      objects: [
        { name: 'Ball', shape: 'sphere', position: [0, 0, 0], traits: [] },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('SphereGeometry');
  });

  it('compiles torus shapes', () => {
    const comp = makeComposition({
      objects: [
        { name: 'Ring', shape: 'torus', position: [0, 0, 0], traits: [] },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('TorusGeometry');
  });

  it('handles transparent objects', () => {
    const comp = makeComposition({
      objects: [
        { name: 'Ghost', shape: 'sphere', position: [0, 0, 0], opacity: 0.5, traits: [] },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('transparent: true');
    expect(html).toContain('opacity: 0.5');
  });

  it('defaults to box geometry for unknown shapes', () => {
    const comp = makeComposition({
      objects: [
        { name: 'Unknown', shape: 'dodecahedron', position: [0, 0, 0], traits: [] },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('BoxGeometry');
  });

  // =========== Spatial groups ===========

  it('compiles spatial groups as THREE.Group', () => {
    const comp = makeComposition({
      spatialGroups: [
        {
          name: 'Gallery',
          objects: [
            { name: 'Cube1', shape: 'cube', position: [0, 0, 0], traits: [] },
          ],
        },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('THREE.Group');
    expect(html).toContain('Gallery');
  });

  // =========== Lights ===========

  it('compiles point lights', () => {
    const comp = makeComposition({
      lights: [
        { name: 'Lamp', lightType: 'point', color: '#ff8800', intensity: 0.5, position: [0, 3, 0] },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('PointLight');
    expect(html).toContain('0xff8800');
  });

  it('compiles directional lights', () => {
    const comp = makeComposition({
      lights: [
        { name: 'Sun', lightType: 'directional', intensity: 1, position: [5, 10, 7] },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('DirectionalLight');
  });

  it('compiles ambient lights', () => {
    const comp = makeComposition({
      lights: [
        { name: 'Fill', lightType: 'ambient', color: '#404040', intensity: 0.5 },
      ] as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('AmbientLight');
  });

  it('provides default lighting when none specified', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('AmbientLight');
    expect(html).toContain('DirectionalLight');
  });

  // =========== Enter VR flow ===========

  it('includes splash screen with enter VR button', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('enter-vr');
    expect(html).toContain('Enter VR');
    expect(html).toContain('Slide your phone into the sleeve');
  });

  it('requests fullscreen on enter', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('requestFullscreen');
  });

  it('requests landscape orientation lock', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain("orientation.lock('landscape')");
  });

  it('handles iOS DeviceOrientation permission', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('DeviceOrientationEvent.requestPermission');
  });

  // =========== Floor grid ===========

  it('includes floor grid for spatial reference', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain('GridHelper');
  });

  // =========== Environment ===========

  it('compiles environment sky color', () => {
    const comp = makeComposition({
      environment: { skyColor: '#1a1a2e' } as any,
    });
    const html = compiler.compile(comp, 'test-token');
    expect(html).toContain('0x1a1a2e');
  });

  // =========== Resize handler ===========

  it('includes window resize handler', () => {
    const html = compiler.compile(makeComposition(), 'test-token');
    expect(html).toContain("addEventListener('resize'");
  });

  // =========== Target FPS ===========

  it('respects custom target FPS', () => {
    const c = new PhoneSleeveVRCompiler({ targetFPS: 72 });
    const html = c.compile(makeComposition(), 'test-token');
    expect(html).toContain('TARGET_FPS = 72');
  });
});

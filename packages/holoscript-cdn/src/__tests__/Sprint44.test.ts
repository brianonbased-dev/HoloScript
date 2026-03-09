/**
 * Sprint 44 — @holoscript/holoscript-cdn acceptance tests
 * Covers: defaultCDNConfig, detectOptimalTarget, checkXRSupport,
 *         HoloSceneRenderer constructor/render, HoloCDNConfig shape,
 *         type exports (HoloSceneTarget, HoloSceneFallback, HoloSceneLoadingState)
 *
 * Environment: jsdom (browser APIs available)
 * NOTE: HoloSceneElement.ts is an empty stub; HoloSceneElement/registerHoloScene
 *       are not tested here.
 */
import { describe, it, expect } from 'vitest';
import { defaultCDNConfig, HoloSceneRenderer } from '../index';
import { detectOptimalTarget, checkXRSupport, type HoloCDNConfig } from '../config';

// ═══════════════════════════════════════════════
// defaultCDNConfig
// ═══════════════════════════════════════════════
describe('defaultCDNConfig', () => {
  it('is defined', () => {
    expect(defaultCDNConfig).toBeDefined();
  });

  it('cdnBase is a valid URL string', () => {
    expect(typeof defaultCDNConfig.cdnBase).toBe('string');
    expect(defaultCDNConfig.cdnBase).toContain('holoscript');
  });

  it('defaultTarget is a string', () => {
    expect(typeof defaultCDNConfig.defaultTarget).toBe('string');
    expect(defaultCDNConfig.defaultTarget.length).toBeGreaterThan(0);
  });

  it('debug defaults to false', () => {
    expect(defaultCDNConfig.debug).toBe(false);
  });

  it('loadTimeoutMs is a positive number', () => {
    expect(typeof defaultCDNConfig.loadTimeoutMs).toBe('number');
    expect(defaultCDNConfig.loadTimeoutMs).toBeGreaterThan(0);
  });

  it('has all HoloCDNConfig required fields', () => {
    const config: HoloCDNConfig = defaultCDNConfig;
    expect(config).toHaveProperty('cdnBase');
    expect(config).toHaveProperty('defaultTarget');
    expect(config).toHaveProperty('debug');
    expect(config).toHaveProperty('loadTimeoutMs');
  });
});

// ═══════════════════════════════════════════════
// detectOptimalTarget
// ═══════════════════════════════════════════════
describe('detectOptimalTarget', () => {
  it('is a function', () => {
    expect(typeof detectOptimalTarget).toBe('function');
  });

  it('returns a string', () => {
    const target = detectOptimalTarget();
    expect(typeof target).toBe('string');
    expect(target.length).toBeGreaterThan(0);
  });

  it('returns a valid HoloSceneTarget value', () => {
    const valid = [
      'webxr',
      'threejs',
      'babylon',
      'unity',
      'godot',
      'visionos',
      'android-xr',
      'auto',
      'webgpu',
    ];
    const target = detectOptimalTarget();
    expect(valid).toContain(target);
  });

  it('returns "threejs" in jsdom (no WebXR or WebGPU)', () => {
    // jsdom has no navigator.xr or navigator.gpu
    const target = detectOptimalTarget();
    expect(target).toBe('threejs');
  });
});

// ═══════════════════════════════════════════════
// checkXRSupport
// ═══════════════════════════════════════════════
describe('checkXRSupport', () => {
  it('is a function', () => {
    expect(typeof checkXRSupport).toBe('function');
  });

  it('returns a Promise', () => {
    const result = checkXRSupport('immersive-vr');
    expect(result).toBeInstanceOf(Promise);
  });

  it('resolves to false in jsdom (no XR)', async () => {
    const result = await checkXRSupport('immersive-vr');
    expect(result).toBe(false);
  });

  it('resolves to false for immersive-ar in jsdom', async () => {
    const result = await checkXRSupport('immersive-ar');
    expect(result).toBe(false);
  });
});

// ═══════════════════════════════════════════════
// HoloSceneRenderer
// ═══════════════════════════════════════════════
describe('HoloSceneRenderer', () => {
  it('constructs with a DOM container', () => {
    const container = document.createElement('div');
    const renderer = new HoloSceneRenderer(container);
    expect(renderer).toBeDefined();
  });

  it('render() returns a Promise', () => {
    const container = document.createElement('div');
    const renderer = new HoloSceneRenderer(container);
    const result = renderer.render('cube { @color(red) }', {
      target: 'threejs',
      width: 640,
      height: 480,
      enableVR: false,
      enableAR: false,
    });
    expect(result).toBeInstanceOf(Promise);
    return result; // let it resolve
  });

  it('render() resolves without throwing for threejs target', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const renderer = new HoloSceneRenderer(container);
    await expect(
      renderer.render('cube { @color(red) }', {
        target: 'threejs',
        width: 320,
        height: 240,
        enableVR: false,
        enableAR: false,
      })
    ).resolves.not.toThrow();
    document.body.removeChild(container);
  });

  it('render() resolves for "auto" target', async () => {
    const container = document.createElement('div');
    const renderer = new HoloSceneRenderer(container);
    await expect(
      renderer.render('sphere { @color(blue) }', {
        target: 'auto',
        width: 100,
        height: 100,
        enableVR: false,
        enableAR: false,
      })
    ).resolves.not.toThrow();
  });

  it('render() resolves for static target (unity)', async () => {
    const container = document.createElement('div');
    const renderer = new HoloSceneRenderer(container);
    await expect(
      renderer.render('cube {}', {
        target: 'unity',
        width: 100,
        height: 100,
        enableVR: false,
        enableAR: false,
      })
    ).resolves.not.toThrow();
  });

  it('creates two renderers independently', () => {
    const c1 = document.createElement('div');
    const c2 = document.createElement('div');
    const r1 = new HoloSceneRenderer(c1);
    const r2 = new HoloSceneRenderer(c2);
    expect(r1).toBeDefined();
    expect(r2).toBeDefined();
  });
});

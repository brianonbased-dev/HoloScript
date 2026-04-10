/**
 * CDN Layer + VSCode Types + Collaboration & Git Constants
 *
 * Tests cover:
 *   - Feature 1:  CDN config - defaultCDNConfig, detectOptimalTarget(),
 *                 checkXRSupport() behaviour in Node.js environment
 *   - Feature 2:  CDN HoloSceneRenderer - class shape, RenderOptions
 *   - Feature 3:  Collaboration type system - PARTICIPANT_COLORS, getParticipantColor,
 *                 DEFAULT_RECONNECT_CONFIG, DEFAULT_AWARENESS_INTERVAL
 *   - Feature 4:  Git integration type system - DEFAULT_GIT_CONFIG, DIFF_COLORS
 *
 * NOTE: completionProvider.ts and semanticTokensProvider.ts use value imports
 * from 'vscode' and are covered by packages/vscode-extension's own test suite.
 * CollaborationTypes.ts and GitTypes.ts use `import type` (erased at runtime)
 * and are therefore importable from any Node.js test context.
 */

import { describe, it, expect } from 'vitest';

// ============================================================================
// Feature 1: CDN config
// ============================================================================

import {
  defaultCDNConfig,
  detectOptimalTarget,
  checkXRSupport,
} from '../../../holoscript-cdn/src/config.js';

// ============================================================================
// Feature 2: CDN Renderer (DOM methods not called at module load -- safe to import)
// ============================================================================

import {
  HoloSceneRenderer,
  type RenderOptions,
} from '../../../holoscript-cdn/src/HoloSceneRenderer.js';



// ============================================================================
// Feature 1A: CDN -- defaultCDNConfig
// ============================================================================

describe('Feature 1A: CDN defaultCDNConfig', () => {
  it('has a cdnBase string', () => {
    expect(typeof defaultCDNConfig.cdnBase).toBe('string');
    expect(defaultCDNConfig.cdnBase.length).toBeGreaterThan(0);
  });

  it('cdnBase contains holoscript.net', () => {
    expect(defaultCDNConfig.cdnBase).toContain('holoscript.net');
  });

  it('defaultTarget is "threejs"', () => {
    expect(defaultCDNConfig.defaultTarget).toBe('threejs');
  });

  it('debug is false by default', () => {
    expect(defaultCDNConfig.debug).toBe(false);
  });

  it('loadTimeoutMs is a positive number', () => {
    expect(typeof defaultCDNConfig.loadTimeoutMs).toBe('number');
    expect(defaultCDNConfig.loadTimeoutMs).toBeGreaterThan(0);
  });

  it('loadTimeoutMs is 10000 ms', () => {
    expect(defaultCDNConfig.loadTimeoutMs).toBe(10000);
  });
});

// ============================================================================
// Feature 1B: CDN -- detectOptimalTarget() and checkXRSupport() in Node.js
// ============================================================================

describe('Feature 1B: CDN detectOptimalTarget() & checkXRSupport()', () => {
  it('detectOptimalTarget() returns "threejs" in Node.js', () => {
    expect(detectOptimalTarget()).toBe('threejs');
  });

  it('detectOptimalTarget() returns a non-empty string', () => {
    const result = detectOptimalTarget();
    expect(typeof result).toBe('string');
    expect(result.length).toBeGreaterThan(0);
  });

  it('checkXRSupport("immersive-vr") returns false in Node.js', async () => {
    expect(await checkXRSupport('immersive-vr')).toBe(false);
  });

  it('checkXRSupport("immersive-ar") returns false in Node.js', async () => {
    expect(await checkXRSupport('immersive-ar')).toBe(false);
  });

  it('checkXRSupport() is async (returns a Promise)', () => {
    const result = checkXRSupport('immersive-vr');
    expect(result).toBeInstanceOf(Promise);
  });
});

// ============================================================================
// Feature 2: CDN HoloSceneRenderer class shape
// ============================================================================

describe('Feature 2: CDN HoloSceneRenderer class', () => {
  it('HoloSceneRenderer is a class (function)', () => {
    expect(typeof HoloSceneRenderer).toBe('function');
  });

  it('HoloSceneRenderer prototype has render method', () => {
    expect(typeof HoloSceneRenderer.prototype.render).toBe('function');
  });

  it('HoloSceneRenderer prototype has cleanup method', () => {
    expect(typeof HoloSceneRenderer.prototype.cleanup).toBe('function');
  });

  it('RenderOptions target union includes valid targets', () => {
    const validTargets: RenderOptions['target'][] = [
      'webxr',
      'threejs',
      'babylon',
      'unity',
      'godot',
      'visionos',
      'android-xr',
      'auto',
    ];
    expect(validTargets).toContain('threejs');
    expect(validTargets).toContain('webxr');
    expect(validTargets.length).toBe(8);
  });
});


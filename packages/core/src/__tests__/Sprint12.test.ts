/**
 * Sprint 12: CDN Layer, VSCode Extension Type System, Collaboration & Git Constants
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
// Feature 3: Collaboration types (uses `import type` from vscode -- safe in Node)
// ============================================================================

import {
  PARTICIPANT_COLORS,
  getParticipantColor,
  DEFAULT_RECONNECT_CONFIG,
  DEFAULT_AWARENESS_INTERVAL,
} from '../../../vscode-extension/src/collaboration/CollaborationTypes.js';

// ============================================================================
// Feature 4: Git integration types (uses `import type` from SDK -- safe in Node)
// ============================================================================

import { DEFAULT_GIT_CONFIG, DIFF_COLORS } from '../../../vscode-extension/src/git/GitTypes.js';

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

// ============================================================================
// Feature 3A: Collaboration -- PARTICIPANT_COLORS
// ============================================================================

describe('Feature 3A: Collaboration PARTICIPANT_COLORS', () => {
  it('is an array', () => {
    expect(Array.isArray(PARTICIPANT_COLORS)).toBe(true);
  });

  it('has exactly 10 colors', () => {
    expect(PARTICIPANT_COLORS.length).toBe(10);
  });

  it('all colors are hex strings starting with "#"', () => {
    for (const color of PARTICIPANT_COLORS) {
      expect(color.startsWith('#')).toBe(true);
      expect(color.length).toBe(7);
    }
  });

  it('all colors are unique', () => {
    const unique = new Set(PARTICIPANT_COLORS);
    expect(unique.size).toBe(10);
  });

  it('first color is a valid hex', () => {
    expect(PARTICIPANT_COLORS[0]).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });
});

// ============================================================================
// Feature 3B: Collaboration -- getParticipantColor()
// ============================================================================

describe('Feature 3B: Collaboration getParticipantColor()', () => {
  it('index 0 returns first PARTICIPANT_COLOR', () => {
    expect(getParticipantColor(0)).toBe(PARTICIPANT_COLORS[0]);
  });

  it('index 9 returns last PARTICIPANT_COLOR', () => {
    expect(getParticipantColor(9)).toBe(PARTICIPANT_COLORS[9]);
  });

  it('index 10 cycles back to index 0', () => {
    expect(getParticipantColor(10)).toBe(PARTICIPANT_COLORS[0]);
  });

  it('index 15 maps to PARTICIPANT_COLORS[5]', () => {
    expect(getParticipantColor(15)).toBe(PARTICIPANT_COLORS[5]);
  });

  it('returns a hex string', () => {
    expect(getParticipantColor(3)).toMatch(/^#[0-9A-Fa-f]{6}$/);
  });

  it('is deterministic for same index', () => {
    expect(getParticipantColor(7)).toBe(getParticipantColor(7));
  });
});

// ============================================================================
// Feature 3C: Collaboration -- DEFAULT_RECONNECT_CONFIG & DEFAULT_AWARENESS_INTERVAL
// ============================================================================

describe('Feature 3C: Collaboration reconnect config & awareness interval', () => {
  it('maxAttempts is 10', () => {
    expect(DEFAULT_RECONNECT_CONFIG.maxAttempts).toBe(10);
  });

  it('baseDelay is 1000 ms', () => {
    expect(DEFAULT_RECONNECT_CONFIG.baseDelay).toBe(1000);
  });

  it('maxDelay is 30000 ms', () => {
    expect(DEFAULT_RECONNECT_CONFIG.maxDelay).toBe(30000);
  });

  it('backoffFactor is 1.5', () => {
    expect(DEFAULT_RECONNECT_CONFIG.backoffFactor).toBe(1.5);
  });

  it('maxDelay is greater than baseDelay', () => {
    expect(DEFAULT_RECONNECT_CONFIG.maxDelay).toBeGreaterThan(DEFAULT_RECONNECT_CONFIG.baseDelay);
  });

  it('DEFAULT_AWARENESS_INTERVAL is 100 ms', () => {
    expect(DEFAULT_AWARENESS_INTERVAL).toBe(100);
  });

  it('DEFAULT_AWARENESS_INTERVAL is a positive number', () => {
    expect(DEFAULT_AWARENESS_INTERVAL).toBeGreaterThan(0);
  });
});

// ============================================================================
// Feature 4A: Git -- DEFAULT_GIT_CONFIG
// ============================================================================

describe('Feature 4A: Git DEFAULT_GIT_CONFIG', () => {
  it('enableSemanticDiff is true', () => {
    expect(DEFAULT_GIT_CONFIG.enableSemanticDiff).toBe(true);
  });

  it('enable3DPreview is true', () => {
    expect(DEFAULT_GIT_CONFIG.enable3DPreview).toBe(true);
  });

  it('formatOnCommit is true', () => {
    expect(DEFAULT_GIT_CONFIG.formatOnCommit).toBe(true);
  });

  it('validateOnCommit is true', () => {
    expect(DEFAULT_GIT_CONFIG.validateOnCommit).toBe(true);
  });

  it('ignorePatterns is an array', () => {
    expect(Array.isArray(DEFAULT_GIT_CONFIG.ignorePatterns)).toBe(true);
  });

  it('ignorePatterns contains "*.holo.bak"', () => {
    expect(DEFAULT_GIT_CONFIG.ignorePatterns).toContain('*.holo.bak');
  });

  it('ignorePatterns contains "*.holo.tmp"', () => {
    expect(DEFAULT_GIT_CONFIG.ignorePatterns).toContain('*.holo.tmp');
  });

  it('ignorePatterns has at least 2 entries', () => {
    expect(DEFAULT_GIT_CONFIG.ignorePatterns.length).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// Feature 4B: Git -- DIFF_COLORS
// ============================================================================

describe('Feature 4B: Git DIFF_COLORS', () => {
  it('has all six expected keys', () => {
    expect(typeof DIFF_COLORS.added).toBe('string');
    expect(typeof DIFF_COLORS.removed).toBe('string');
    expect(typeof DIFF_COLORS.modified).toBe('string');
    expect(typeof DIFF_COLORS.moved).toBe('string');
    expect(typeof DIFF_COLORS.renamed).toBe('string');
    expect(typeof DIFF_COLORS.unchanged).toBe('string');
  });

  it('added color is green (#4CAF50)', () => {
    expect(DIFF_COLORS.added).toBe('#4CAF50');
  });

  it('removed color is red (#F44336)', () => {
    expect(DIFF_COLORS.removed).toBe('#F44336');
  });

  it('all colors are valid hex strings', () => {
    for (const color of Object.values(DIFF_COLORS)) {
      expect(color).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it('added and removed are different colors', () => {
    expect(DIFF_COLORS.added).not.toBe(DIFF_COLORS.removed);
  });

  it('all 6 colors are unique', () => {
    const values = Object.values(DIFF_COLORS);
    expect(new Set(values).size).toBe(values.length);
  });

  it('has exactly 6 color entries', () => {
    expect(Object.keys(DIFF_COLORS).length).toBe(6);
  });
});

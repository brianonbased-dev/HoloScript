import { describe, it, expect } from 'vitest';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  SOVEREIGN_TARGETS,
  BRIDGE_TARGETS,
  NATIVE_COMPILE_MODES,
  SOVEREIGN_ENGINES,
  isSovereignTarget,
  isBridgeTarget,
  targetSovereignty,
} from '../sovereign-targets';

// Repo root from packages/core/src/compiler/__tests__ → up 5.
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..', '..');

describe('sovereign-targets registry', () => {
  it('classifies every target into exactly one bucket (no overlap)', () => {
    const all = [...SOVEREIGN_TARGETS, ...BRIDGE_TARGETS, ...NATIVE_COMPILE_MODES];
    expect(new Set(all).size).toBe(all.length); // no target in two buckets
  });

  it('classifies the canonical sovereign compile targets', () => {
    // native-2d is now tracked as an engine, not an ExportTarget.
    for (const t of ['webgpu', 'canvas2d-game', 'nir', 'gaussian-train', 'svg', 'holob'] as const) {
      expect(isSovereignTarget(t)).toBe(true);
      expect(isBridgeTarget(t)).toBe(false);
      expect(targetSovereignty(t)).toBe('sovereign');
    }
  });

  it('keeps third-party engine/runtime targets classified as bridges (not sovereign)', () => {
    for (const t of ['unity', 'unreal', 'godot', 'vrchat', 'quest'] as const) {
      expect(isBridgeTarget(t)).toBe(true);
      expect(isSovereignTarget(t)).toBe(false);
      expect(targetSovereignty(t)).toBe('bridge');
    }
  });

  it('classifies llama-server as a native authoring mode', () => {
    expect(NATIVE_COMPILE_MODES).toContain('llama-server');
    expect(isBridgeTarget('llama-server')).toBe(false);
    expect(isSovereignTarget('llama-server')).toBe(false);
    expect(targetSovereignty('llama-server')).toBe('mode');
  });

  it('tracks at least one native renderer and the SNN runtime', () => {
    const ids = SOVEREIGN_ENGINES.map((e) => e.id);
    expect(ids).toContain('webgpu-renderer'); // the sovereign GPU renderer
    expect(ids).toContain('snn-webgpu');
    expect(SOVEREIGN_ENGINES.some((e) => e.kind === 'renderer')).toBe(true);
  });

  it('every registered engine file exists on disk (registry stays honest as files move)', () => {
    for (const e of SOVEREIGN_ENGINES) {
      const abs = resolve(REPO_ROOT, e.file);
      expect(
        existsSync(abs),
        `${e.name}: ${e.file} not found — reconcile sovereign-targets.ts`
      ).toBe(true);
    }
  });

  it('records honest maturity/test state (no aspirational "real+tested" for the untested 2D emitters)', () => {
    const native2d = SOVEREIGN_ENGINES.find((e) => e.id === 'native-2d');
    const canvas = SOVEREIGN_ENGINES.find((e) => e.id === 'canvas2d-game');
    // I.017 COMPLETE (2026-05-30): both 2D compilers now have real tests.
    // native-2d (Native2DCompiler) and canvas2d-game (Canvas2DGameCompiler) are
    // marked tests:true in the registry reflecting the actual test coverage shipped.
    expect(native2d?.tests).toBe(true);
    expect(canvas?.tests).toBe(true);
  });
});

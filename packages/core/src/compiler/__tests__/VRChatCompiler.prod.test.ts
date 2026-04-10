/**
 * VRChatCompiler — Production Test Suite
 *
 * Covers: VRChatCompileResult shape (mainScript, udonScripts, prefabHierarchy,
 * worldDescriptor), UdonSharp script generation, class/world name options,
 * SDK version options, state → fields, objects → prefab, grabbable traits → Udon
 * scripts, timelines, transitions, environment, world descriptor UUID,
 * and compileToVRChat() convenience function.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { VRChatCompiler, compileToVRChat } from '../VRChatCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeComp(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestWorld', objects: [], ...overrides } as HoloComposition;
}

function makeObj(name: string, geometry = 'box', traits: any[] = []) {
  return { name, properties: [{ key: 'geometry', value: geometry }], traits } as any;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('VRChatCompiler — Production', () => {
  let compiler: VRChatCompiler;

  beforeEach(() => {
    compiler = new VRChatCompiler();
  });

  // ─── Constructor ───────────────────────────────────────────────────────────
  describe('constructor', () => {
    it('constructs with default options', () => {
      expect(compiler).toBeDefined();
    });

    it('constructs with custom options', () => {
      const c = new VRChatCompiler({
        className: 'MyWorld',
        worldName: 'CoolWorld',
        sdkVersion: '3.3',
        useUdonSharp: true,
      });
      expect(c).toBeDefined();
    });
  });

  // ─── Result shape ──────────────────────────────────────────────────────────
  describe('compile() — result shape', () => {
    it('returns all four VRChatCompileResult fields', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result).toHaveProperty('mainScript');
      expect(result).toHaveProperty('udonScripts');
      expect(result).toHaveProperty('prefabHierarchy');
      expect(result).toHaveProperty('worldDescriptor');
    });

    it('mainScript is a string', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(typeof result.mainScript).toBe('string');
    });

    it('udonScripts is a Map', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.udonScripts).toBeInstanceOf(Map);
    });

    it('prefabHierarchy is a string', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(typeof result.prefabHierarchy).toBe('string');
    });

    it('worldDescriptor is a non-empty string', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.worldDescriptor.length).toBeGreaterThan(0);
    });
  });

  // ─── Main script content ───────────────────────────────────────────────────
  describe('compile() — mainScript content', () => {
    it('contains UdonSharp reference', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.mainScript).toContain('UdonSharp');
    });

    it('contains class declaration', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.mainScript).toContain('class');
    });

    it('contains VRC SDK import', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.mainScript).toContain('VRC');
    });

    it('respects custom class name in mainScript', () => {
      const c = new VRChatCompiler({ className: 'MyGallery' });
      const result = c.compile(makeComp(), 'test-token');
      expect(result.mainScript).toContain('MyGallery');
    });

    it('respects sdkVersion in mainScript', () => {
      const c = new VRChatCompiler({ sdkVersion: '3.5' });
      const result = c.compile(makeComp(), 'test-token');
      expect(result.mainScript).toBeDefined();
    });
  });

  // ─── World descriptor ──────────────────────────────────────────────────────
  describe('compile() — worldDescriptor', () => {
    it('contains custom world name', () => {
      const c = new VRChatCompiler({ worldName: 'CoolWorld' });
      const result = c.compile(makeComp(), 'test-token');
      expect(result.worldDescriptor).toContain('CoolWorld');
    });

    it('contains a world ID (wrld_...)', () => {
      const result = compiler.compile(makeComp(), 'test-token');
      expect(result.worldDescriptor).toContain('wrld_');
    });

    it('world IDs differ across compiler instances', () => {
      const r1 = new VRChatCompiler().compile(makeComp(), 'test-token');
      const r2 = new VRChatCompiler().compile(makeComp(), 'test-token');
      // worldDescriptor IDs should differ (UUID randomness)
      expect(r1.worldDescriptor).not.toBe(r2.worldDescriptor);
    });
  });

  // ─── Prefab hierarchy ─────────────────────────────────────────────────────
  describe('compile() — prefabHierarchy', () => {
    it('contains compiled object names', () => {
      const result = compiler.compile(makeComp({ objects: [makeObj('cube')] }), 'test-token');
      expect(result.prefabHierarchy).toContain('cube');
    });

    it('contains all object names for multi-object scene', () => {
      const result = compiler.compile(
        makeComp({ objects: [makeObj('obj_a'), makeObj('obj_b')] }),
        'test-token'
      );
      expect(result.prefabHierarchy).toContain('obj_a');
      expect(result.prefabHierarchy).toContain('obj_b');
    });
  });

  // ─── State → fields ────────────────────────────────────────────────────────
  describe('compile() — state', () => {
    it('includes state keys in mainScript', () => {
      const result = compiler.compile(
        makeComp({ state: { properties: [{ key: 'score', value: 0 }] } as any }),
        'test-token'
      );
      expect(result.mainScript).toContain('score');
    });

    it('includes string state in mainScript', () => {
      const result = compiler.compile(
        makeComp({ state: { properties: [{ key: 'playerName', value: 'Alice' }] } as any }),
        'test-token'
      );
      expect(result.mainScript).toContain('playerName');
    });
  });

  // ─── Udon scripts for interactable traits ──────────────────────────────────
  describe('compile() — Udon scripts', () => {
    it('generates Udon script for grabbable object', () => {
      const result = compiler.compile(
        makeComp({ objects: [makeObj('coin', 'sphere', [{ name: 'grabbable' }])] }),
        'test-token'
      );
      expect(result.udonScripts.size).toBeGreaterThan(0);
    });

    it('non-interactable objects produce no Udon scripts', () => {
      const result = compiler.compile(makeComp({ objects: [makeObj('wall')] }), 'test-token');
      expect(result.udonScripts.size).toBe(0);
    });

    it('pointable trait generates Udon script', () => {
      const result = compiler.compile(
        makeComp({ objects: [makeObj('button', 'box', [{ name: 'pointable' }])] }),
        'test-token'
      );
      expect(result.udonScripts.size).toBeGreaterThan(0);
    });
  });

  // ─── Environment ──────────────────────────────────────────────────────────
  describe('compile() — environment', () => {
    it('compiles with environment node', () => {
      const result = compiler.compile(
        makeComp({ environment: { properties: [{ key: 'skybox', value: 'sunset' }] } as any }),
        'test-token'
      );
      expect(result.mainScript).toBeDefined();
    });
  });

  // ─── Timelines ────────────────────────────────────────────────────────────
  describe('compile() — timelines', () => {
    it('compiles with timeline', () => {
      const result = compiler.compile(
        makeComp({
          timelines: [
            {
              name: 'anim1',
              duration: 2.0,
              entries: [
                { time: 0, action: { kind: 'emit', event: 'start' } },
                { time: 1, action: { kind: 'emit', event: 'end' } },
              ],
            } as any,
          ],
        }),
        'test-token'
      );
      expect(result.mainScript).toBeDefined();
      expect(result.mainScript).toContain('anim1');
    });
  });

  // ─── Transitions ──────────────────────────────────────────────────────────
  describe('compile() — transitions', () => {
    it('compiles with transition', () => {
      const result = compiler.compile(
        makeComp({
          transitions: [
            {
              name: 'fade',
              from: 'stateA',
              to: 'stateB',
              duration: 0.5,
              properties: [{ key: 'destination', value: 'stateB' }],
            } as any,
          ],
        }),
        'test-token'
      );
      expect(result.mainScript).toBeDefined();
    });
  });

  // ─── compileToVRChat() convenience ────────────────────────────────────────
  describe('compileToVRChat()', () => {
    it('is a function', () => {
      expect(typeof compileToVRChat).toBe('function');
    });

    it('compiles a composition and returns result', async () => {
      const result = await compileToVRChat(makeComp());
      expect(result).toHaveProperty('mainScript');
      expect(result).toHaveProperty('udonScripts');
    });

    it('passes options correctly', async () => {
      const result = await compileToVRChat(makeComp(), { className: 'ConvWorld' });
      expect(result.mainScript).toContain('ConvWorld');
    });
  });
});

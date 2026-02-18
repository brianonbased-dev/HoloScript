/**
 * HoloScriptPlusRuntime Production Tests
 *
 * The runtime engine for HoloScript+ AST execution. Tests cover:
 * - Construction with minimal AST
 * - State management (getState, getVariable, setVariable)
 * - setCopilot
 * - vrContext initialization
 * - Mount/unmount lifecycle
 * - getNode lookup
 * - Private helpers via prototype: quaternionToEuler, generateHoloId,
 *   parseDurationToMs, findAllTemplates
 * - Reset
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HoloScriptPlusRuntimeImpl, type Renderer } from '../HoloScriptPlusRuntime';

// Minimal mock AST that satisfies the constructor
function makeAST(overrides: any = {}): any {
  return {
    root: {
      type: 'scene',
      id: 'root',
      children: [],
      directives: [],
      traits: null,
      properties: {},
      ...overrides.root,
    },
    imports: [],
    ...overrides,
  };
}

// Minimal mock renderer
function makeRenderer(): Renderer {
  return {
    createElement: vi.fn(() => ({})),
    updateElement: vi.fn(),
    appendChild: vi.fn(),
    removeChild: vi.fn(),
    destroy: vi.fn(),
  };
}

describe('HoloScriptPlusRuntime — Production', () => {
  let runtime: HoloScriptPlusRuntimeImpl;
  let renderer: Renderer;

  beforeEach(() => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderer = makeRenderer();
    runtime = new HoloScriptPlusRuntimeImpl(makeAST(), { renderer });
  });

  describe('construction', () => {
    it('creates without error', () => {
      expect(runtime).toBeDefined();
    });

    it('creates without renderer', () => {
      const rt = new HoloScriptPlusRuntimeImpl(makeAST());
      expect(rt).toBeDefined();
    });
  });

  describe('vrContext', () => {
    it('initializes with neutral headset pose', () => {
      expect(runtime.vrContext.headset.position).toEqual([0, 1.6, 0]);
      expect(runtime.vrContext.headset.rotation).toEqual([0, 0, 0]);
    });

    it('initializes with null hands', () => {
      expect(runtime.vrContext.hands.left).toBeNull();
      expect(runtime.vrContext.hands.right).toBeNull();
    });
  });

  describe('setCopilot', () => {
    it('sets copilot reference', () => {
      const copilot = { generate: vi.fn() };
      runtime.setCopilot(copilot);
      // Access internal — verify no crash
      expect((runtime as any)._copilot).toBe(copilot);
    });
  });

  describe('state management', () => {
    it('getState returns snapshot', () => {
      const state = runtime.getState();
      expect(state).toBeDefined();
    });

    it('setVariable and getVariable round-trip', () => {
      runtime.setVariable('score', 42);
      expect(runtime.getVariable('score')).toBe(42);
    });

    it('setVariable overwrites', () => {
      runtime.setVariable('name', 'Alice');
      runtime.setVariable('name', 'Bob');
      expect(runtime.getVariable('name')).toBe('Bob');
    });
  });

  describe('mount/unmount', () => {
    it('mounts to container', () => {
      const container = {};
      runtime.mount(container);
      expect(renderer.createElement).toHaveBeenCalled();
      expect(renderer.appendChild).toHaveBeenCalledWith(container, expect.anything());
    });

    it('warns on double mount', () => {
      runtime.mount({});
      runtime.mount({}); // second mount
      expect(console.warn).toHaveBeenCalledWith('Runtime already mounted');
    });

    it('unmount after mount', () => {
      runtime.mount({});
      runtime.unmount();
      // No crash, and destroy should be called
      expect(renderer.destroy).toHaveBeenCalled();
    });

    it('unmount without mount is no-op', () => {
      runtime.unmount(); // should not throw
    });
  });

  describe('mountObject', () => {
    it('mounts child node into scene', () => {
      runtime.mount({});
      const childNode = { type: 'box', id: 'box1', children: [], directives: [], traits: null, properties: {} };
      const instance = runtime.mountObject(childNode as any);
      expect(instance.__holo_id).toContain('box');
      expect(instance.destroyed).toBe(false);
    });
  });

  describe('unmountObject', () => {
    it('unmounts by string ID', () => {
      runtime.mount({});
      const childNode = { type: 'sphere', id: 'sph1', children: [], directives: [], traits: null, properties: {} };
      const instance = runtime.mountObject(childNode as any);
      runtime.unmountObject(instance.__holo_id);
      expect(renderer.destroy).toHaveBeenCalled();
    });

    it('no-ops for missing ID', () => {
      runtime.mount({});
      runtime.unmountObject('nope'); // should not throw
    });
  });

  describe('getNode', () => {
    it('returns undefined before mount', () => {
      expect(runtime.getNode('root')).toBeUndefined();
    });

    it('finds root node after mount', () => {
      runtime.mount({});
      const node = runtime.getNode('root');
      expect(node).toBeDefined();
      expect(node?.type).toBe('scene');
    });
  });

  describe('quaternionToEuler (private)', () => {
    it('identity quaternion → zero euler', () => {
      const euler = (runtime as any).quaternionToEuler([0, 0, 0, 1]);
      expect(euler[0]).toBeCloseTo(0, 5);
      expect(euler[1]).toBeCloseTo(0, 5);
      expect(euler[2]).toBeCloseTo(0, 5);
    });

    it('90° Y rotation', () => {
      const q = [0, Math.sin(Math.PI / 4), 0, Math.cos(Math.PI / 4)]; // 90° around Y
      const euler = (runtime as any).quaternionToEuler(q);
      expect(euler[1]).toBeCloseTo(Math.PI / 2, 3);
    });
  });

  describe('generateHoloId (private)', () => {
    it('produces unique IDs', () => {
      const id1 = (runtime as any).generateHoloId({ type: 'box', name: null });
      const id2 = (runtime as any).generateHoloId({ type: 'box', name: null });
      expect(id1).not.toBe(id2);
    });

    it('includes node name if available', () => {
      const id = (runtime as any).generateHoloId({ type: 'mesh', name: 'hero' });
      expect(id).toContain('hero');
    });

    it('falls back to type', () => {
      const id = (runtime as any).generateHoloId({ type: 'light' });
      expect(id).toContain('light');
    });
  });

  describe('parseDurationToMs (private)', () => {
    it('parses milliseconds', () => {
      expect((runtime as any).parseDurationToMs('500ms')).toBe(500);
    });

    it('parses seconds', () => {
      expect((runtime as any).parseDurationToMs('3s')).toBe(3000);
    });

    it('parses minutes', () => {
      expect((runtime as any).parseDurationToMs('2m')).toBe(120000);
    });

    it('returns 0 for invalid', () => {
      expect((runtime as any).parseDurationToMs('abc')).toBe(0);
    });
  });

  describe('findAllTemplates (private)', () => {
    it('finds template nodes', () => {
      const ast = {
        type: 'scene',
        children: [
          { type: 'template', name: 'Card', version: 1, children: [] },
          { type: 'box', children: [
            { type: 'template', name: 'Button', version: 1, children: [] },
          ]},
        ],
      };
      const templates = (runtime as any).findAllTemplates(ast);
      expect(templates.size).toBe(2);
      expect(templates.has('Card')).toBe(true);
      expect(templates.has('Button')).toBe(true);
    });

    it('returns empty for no templates', () => {
      const templates = (runtime as any).findAllTemplates({ type: 'scene', children: [] });
      expect(templates.size).toBe(0);
    });
  });

  describe('reset', () => {
    it('resets state and unmounts', () => {
      runtime.mount({});
      runtime.setVariable('x', 1);
      runtime.reset();
      expect(runtime.getVariable('x')).toBeUndefined();
    });
  });

  describe('enterVR guards', () => {
    it('warns when VR not enabled', async () => {
      await runtime.enterVR();
      expect(console.warn).toHaveBeenCalledWith('VR is not enabled in runtime options');
    });
  });

  describe('exitVR', () => {
    it('no-ops without webXrManager', async () => {
      await runtime.exitVR(); // should not throw
    });
  });

  describe('togglePhysicsDebug', () => {
    it('does not throw when no debug drawer', () => {
      runtime.togglePhysicsDebug(true); // should not crash
    });
  });
});

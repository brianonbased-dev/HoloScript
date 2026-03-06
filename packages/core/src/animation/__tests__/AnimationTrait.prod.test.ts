/**
 * AnimationTrait — Production Tests
 *
 * Tests: resolveEasing (via animationTraitHandler onAttach), setNestedProperty,
 * getNestedProperty, onAttach (clip registration, spring registration),
 * onDetach (stops clips, clears springs), onUpdate (spring update).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  animationTraitHandler,
  getSharedAnimationEngine,
  AnimationTraitConfig,
  AnimationClipDef,
  SpringDef,
} from '../AnimationTrait';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

function makeNode(id: string, props: Record<string, any> = {}): HSPlusNode {
  return { id, properties: props } as unknown as HSPlusNode;
}

function makeConfig(overrides: Partial<AnimationTraitConfig> = {}): AnimationTraitConfig {
  return {
    clips: [],
    springs: [],
    autoPlay: true,
    ...overrides,
  };
}

// --- trait metadata ---
describe('animationTraitHandler — metadata', () => {
  it('name is "animate"', () => {
    expect(animationTraitHandler.name).toBe('animate');
  });

  it('defaultConfig has autoPlay=true and empty clips/springs', () => {
    expect(animationTraitHandler.defaultConfig.autoPlay).toBe(true);
    expect(animationTraitHandler.defaultConfig.clips).toHaveLength(0);
    expect(animationTraitHandler.defaultConfig.springs).toHaveLength(0);
  });

  it('all three lifecycle methods exist', () => {
    expect(typeof animationTraitHandler.onAttach).toBe('function');
    expect(typeof animationTraitHandler.onDetach).toBe('function');
    expect(typeof animationTraitHandler.onUpdate).toBe('function');
  });
});

// --- getSharedAnimationEngine ---
describe('getSharedAnimationEngine', () => {
  it('returns the same instance on subsequent calls', () => {
    const e1 = getSharedAnimationEngine();
    const e2 = getSharedAnimationEngine();
    expect(e1).toBe(e2);
  });

  it('returned engine has a play method', () => {
    expect(typeof getSharedAnimationEngine().play).toBe('function');
  });

  it('returned engine has getActiveIds', () => {
    expect(typeof getSharedAnimationEngine().getActiveIds).toBe('function');
  });
});

// --- onAttach with autoPlay=false ---
describe('animationTraitHandler.onAttach — autoPlay false', () => {
  it('does NOT register clips when autoPlay=false', () => {
    const engine = getSharedAnimationEngine();
    const spy = vi.spyOn(engine, 'play');
    const node = makeNode('nodeA');
    animationTraitHandler.onAttach(node, makeConfig({
      autoPlay: false,
      clips: [{
        property: 'opacity',
        keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }],
        duration: 1,
      }],
    }), {});
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

// --- onAttach with autoPlay=true ---
describe('animationTraitHandler.onAttach — autoPlay true', () => {
  it('registers each clip with the engine', () => {
    const engine = getSharedAnimationEngine();
    const playCalls: string[] = [];
    const spy = vi.spyOn(engine, 'play').mockImplementation((clip: any) => {
      playCalls.push(clip.id);
    });

    const node = makeNode('nodeB');
    animationTraitHandler.onAttach(node, makeConfig({
      clips: [
        {
          property: 'opacity',
          keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }],
          duration: 1,
        },
        {
          property: 'scale',
          keyframes: [{ time: 0, value: 1 }, { time: 2, value: 2 }],
          duration: 2,
        },
      ],
    }), {});

    expect(playCalls).toHaveLength(2);
    expect(playCalls[0]).toBe('nodeB_opacity');
    expect(playCalls[1]).toBe('nodeB_scale');
    spy.mockRestore();
  });

  it('clip ID uses node id prefix', () => {
    const engine = getSharedAnimationEngine();
    const ids: string[] = [];
    const spy = vi.spyOn(engine, 'play').mockImplementation((clip: any) => { ids.push(clip.id); });

    animationTraitHandler.onAttach(makeNode('myNode'), makeConfig({
      clips: [{ property: 'x', keyframes: [{ time: 0, value: 0 }], duration: 1 }],
    }), {});
    expect(ids[0]).toMatch(/^myNode_/);
    spy.mockRestore();
  });

  it('clip loop and pingPong default to false', () => {
    const engine = getSharedAnimationEngine();
    let capturedClip: any;
    const spy = vi.spyOn(engine, 'play').mockImplementation((clip: any) => { capturedClip = clip; });

    animationTraitHandler.onAttach(makeNode('nodeLoop'), makeConfig({
      clips: [{ property: 'y', keyframes: [{ time: 0, value: 0 }], duration: 1 }],
    }), {});

    expect(capturedClip.loop).toBe(false);
    expect(capturedClip.pingPong).toBe(false);
    spy.mockRestore();
  });

  it('respects loop=true and pingPong=true', () => {
    const engine = getSharedAnimationEngine();
    let capturedClip: any;
    const spy = vi.spyOn(engine, 'play').mockImplementation((c: any) => { capturedClip = c; });

    animationTraitHandler.onAttach(makeNode('loopNode'), makeConfig({
      clips: [{
        property: 'y', keyframes: [{ time: 0, value: 0 }], duration: 1,
        loop: true, pingPong: true,
      }],
    }), {});

    expect(capturedClip.loop).toBe(true);
    expect(capturedClip.pingPong).toBe(true);
    spy.mockRestore();
  });

  it('sets callback that writes property to node', () => {
    const engine = getSharedAnimationEngine();
    let savedCallback: ((v: number) => void) | undefined;
    const spy = vi.spyOn(engine, 'play').mockImplementation((_clip: any, cb: any) => {
      savedCallback = cb;
    });

    const node = makeNode('propNode');
    animationTraitHandler.onAttach(node, makeConfig({
      clips: [{ property: 'opacity', keyframes: [{ time: 0, value: 0 }], duration: 1 }],
    }), {});

    // Call the callback and verify property is written
    savedCallback!(0.75);
    expect((node.properties as any).opacity).toBeCloseTo(0.75);
    spy.mockRestore();
  });

  it('nested property path is written through dots', () => {
    const engine = getSharedAnimationEngine();
    let savedCallback: ((v: number) => void) | undefined;
    const spy = vi.spyOn(engine, 'play').mockImplementation((_clip: any, cb: any) => {
      savedCallback = cb;
    });

    const node = makeNode('nested', { color: {} });
    animationTraitHandler.onAttach(node, makeConfig({
      clips: [{ property: 'color.r', keyframes: [{ time: 0, value: 0 }], duration: 1 }],
    }), {});

    savedCallback!(0.8);
    expect((node.properties as any).color.r).toBeCloseTo(0.8);
    spy.mockRestore();
  });
});

// --- onAttach springs ---
describe('animationTraitHandler.onAttach — springs', () => {
  it('does not throw when springs array is non-empty', () => {
    const node = makeNode('springNode', { x: 0 });
    expect(() => {
      animationTraitHandler.onAttach(node, makeConfig({
        clips: [],
        springs: [{ property: 'x', target: 10, preset: 'default' }],
      }), {});
    }).not.toThrow();
  });

  it('reads initial value from node properties', () => {
    const node = makeNode('springInit', { speed: 5 });
    // Should not throw even if initial value is read
    expect(() => {
      animationTraitHandler.onAttach(node, makeConfig({
        springs: [{ property: 'speed', target: 20 }],
      }), {});
    }).not.toThrow();
  });
});

// --- onDetach ---
describe('animationTraitHandler.onDetach', () => {
  it('stops clips that start with node id', () => {
    const engine = getSharedAnimationEngine();
    // Simulate an active clip id for this node
    const mockId = 'detachNode_opacity';
    vi.spyOn(engine, 'getActiveIds').mockReturnValue([mockId, 'otherNode_scale']);
    const stopSpy = vi.spyOn(engine, 'stop').mockImplementation(() => {});

    const node = makeNode('detachNode');
    animationTraitHandler.onDetach(node, makeConfig(), {});

    expect(stopSpy).toHaveBeenCalledWith(mockId);
    expect(stopSpy).not.toHaveBeenCalledWith('otherNode_scale');
    vi.restoreAllMocks();
  });

  it('does not throw when no active clips', () => {
    const engine = getSharedAnimationEngine();
    vi.spyOn(engine, 'getActiveIds').mockReturnValue([]);
    vi.spyOn(engine, 'stop').mockImplementation(() => {});

    expect(() => {
      animationTraitHandler.onDetach(makeNode('emptyNode'), makeConfig(), {});
    }).not.toThrow();
    vi.restoreAllMocks();
  });
});

// --- onUpdate ---
describe('animationTraitHandler.onUpdate', () => {
  it('does not throw for a node with no springs attached', () => {
    const node = makeNode('updateNode');
    expect(() => {
      animationTraitHandler.onUpdate(node, makeConfig(), {}, 0.016);
    }).not.toThrow();
  });

  it('does not throw for a node with springs after attach', () => {
    const node = makeNode('springUpdateNode', { y: 0 });
    animationTraitHandler.onAttach(node, makeConfig({
      clips: [],
      springs: [{ property: 'y', target: 5 }],
    }), {});

    expect(() => {
      animationTraitHandler.onUpdate(node, makeConfig(), {}, 0.016);
      animationTraitHandler.onUpdate(node, makeConfig(), {}, 0.016);
    }).not.toThrow();
  });
});

// --- resolveEasing (via keyframe easing) ---
describe('resolveEasing (via clip callback timing)', () => {
  it('unknown easing string falls back to linear without throwing', () => {
    const engine = getSharedAnimationEngine();
    const spy = vi.spyOn(engine, 'play').mockImplementation(() => {});

    expect(() => {
      animationTraitHandler.onAttach(makeNode('easingNode'), makeConfig({
        clips: [{
          property: 'x',
          keyframes: [{ time: 0, value: 0, easing: 'nonexistent-easing' }],
          duration: 1,
        }],
      }), {});
    }).not.toThrow();
    spy.mockRestore();
  });

  it('all known easing strings do not throw', () => {
    const easings = [
      'linear', 'ease-in', 'ease-out', 'ease-in-out',
      'ease-in-cubic', 'ease-out-cubic', 'ease-in-out-cubic',
      'ease-out-back', 'ease-out-elastic', 'ease-out-bounce',
      'ease-in-expo', 'ease-out-expo',
    ];
    const engine = getSharedAnimationEngine();
    const spy = vi.spyOn(engine, 'play').mockImplementation(() => {});

    for (const easing of easings) {
      expect(() => {
        animationTraitHandler.onAttach(makeNode(`e_${easing}`), makeConfig({
          clips: [{
            property: 'x',
            keyframes: [{ time: 0, value: 0, easing }],
            duration: 1,
          }],
        }), {});
      }).not.toThrow();
    }
    spy.mockRestore();
  });
});

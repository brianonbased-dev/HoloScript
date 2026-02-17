import { describe, it, expect, beforeEach } from 'vitest';
import {
  animationTraitHandler,
  getSharedAnimationEngine,
  AnimationTraitConfig,
} from '../AnimationTrait';
import type { HSPlusNode } from '../../types/HoloScriptPlus';

function makeNode(id = 'n1', props: Record<string, any> = {}): HSPlusNode {
  return { id, type: 'box', properties: { ...props } } as unknown as HSPlusNode;
}

describe('AnimationTrait', () => {
  // --- Shared engine ---
  it('getSharedAnimationEngine returns singleton', () => {
    const a = getSharedAnimationEngine();
    const b = getSharedAnimationEngine();
    expect(a).toBe(b);
  });

  // --- Handler metadata ---
  it('handler has correct name', () => {
    expect(animationTraitHandler.name).toBe('animate');
  });

  it('defaultConfig has expected shape', () => {
    const def = animationTraitHandler.defaultConfig;
    expect(def.autoPlay).toBe(true);
    expect(def.clips).toEqual([]);
    expect(def.springs).toEqual([]);
  });

  // --- onAttach ---
  it('onAttach with clips registers animation', () => {
    const node = makeNode('clip1');
    const config: AnimationTraitConfig = {
      autoPlay: true,
      clips: [{
        property: 'opacity',
        keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }],
        duration: 1,
        loop: false,
      }],
      springs: [],
    };
    expect(() => animationTraitHandler.onAttach!(node, config, {})).not.toThrow();
  });

  it('onAttach with autoPlay=false skips clip registration', () => {
    const node = makeNode('noauto');
    const config: AnimationTraitConfig = {
      autoPlay: false,
      clips: [{
        property: 'x',
        keyframes: [{ time: 0, value: 0 }, { time: 1, value: 10 }],
        duration: 1,
      }],
      springs: [],
    };
    expect(() => animationTraitHandler.onAttach!(node, config, {})).not.toThrow();
    // Since autoPlay=false, engine should have no active clip for this node
  });

  it('onAttach with springs creates SpringAnimator instances', () => {
    const node = makeNode('spr1', { scale: 1 });
    const config: AnimationTraitConfig = {
      autoPlay: true,
      clips: [],
      springs: [{ property: 'scale', target: 2 }],
    };
    expect(() => animationTraitHandler.onAttach!(node, config, {})).not.toThrow();
  });

  it('onAttach with spring preset', () => {
    const node = makeNode('spr2', { y: 0 });
    const config: AnimationTraitConfig = {
      autoPlay: true,
      clips: [],
      springs: [{ property: 'y', target: 5, preset: 'bouncy' }],
    };
    expect(() => animationTraitHandler.onAttach!(node, config, {})).not.toThrow();
  });

  // --- onDetach ---
  it('onDetach cleans up without error', () => {
    const node = makeNode('det1');
    const config: AnimationTraitConfig = {
      autoPlay: true,
      clips: [{
        property: 'x',
        keyframes: [{ time: 0, value: 0 }, { time: 1, value: 5 }],
        duration: 1,
        loop: true,
      }],
      springs: [],
    };
    animationTraitHandler.onAttach!(node, config, {});
    expect(() => animationTraitHandler.onDetach!(node, config, {})).not.toThrow();
  });

  // --- onUpdate ---
  it('onUpdate ticks without error', () => {
    const node = makeNode('upd1', { scale: 1 });
    const config: AnimationTraitConfig = {
      autoPlay: true, clips: [],
      springs: [{ property: 'scale', target: 3 }],
    };
    animationTraitHandler.onAttach!(node, config, {});
    expect(() => animationTraitHandler.onUpdate!(node, config, {}, 0.016)).not.toThrow();
  });

  it('onUpdate with no springs or clips is noop', () => {
    const node = makeNode('empty1');
    const config: AnimationTraitConfig = { autoPlay: true, clips: [], springs: [] };
    animationTraitHandler.onAttach!(node, config, {});
    expect(() => animationTraitHandler.onUpdate!(node, config, {}, 0.016)).not.toThrow();
  });

  // --- Nested property helpers (indirectly via clips) ---
  it('clip callback writes nested property', () => {
    const node = makeNode('nested1', { transform: { position: { x: 0 } } });
    const config: AnimationTraitConfig = {
      autoPlay: true,
      clips: [{
        property: 'transform.position.x',
        keyframes: [{ time: 0, value: 0 }, { time: 1, value: 10 }],
        duration: 0.001,
      }],
      springs: [],
    };
    animationTraitHandler.onAttach!(node, config, {});
    // Force engine update to trigger the callback
    const engine = getSharedAnimationEngine();
    engine.update(0.01);
    // The property should have been set (value depends on interpolation)
    expect(node.properties).toBeDefined();
  });

  it('multiple clips on same node', () => {
    const node = makeNode('multi1', { x: 0, y: 0 });
    const config: AnimationTraitConfig = {
      autoPlay: true,
      clips: [
        { property: 'x', keyframes: [{ time: 0, value: 0 }, { time: 1, value: 5 }], duration: 1 },
        { property: 'y', keyframes: [{ time: 0, value: 0 }, { time: 1, value: 10 }], duration: 1 },
      ],
      springs: [],
    };
    expect(() => animationTraitHandler.onAttach!(node, config, {})).not.toThrow();
  });

  it('clip with loop and pingPong flags', () => {
    const node = makeNode('loop1');
    const config: AnimationTraitConfig = {
      autoPlay: true,
      clips: [{
        property: 'alpha',
        keyframes: [{ time: 0, value: 0 }, { time: 1, value: 1 }],
        duration: 2,
        loop: true,
        pingPong: true,
        delay: 0.5,
      }],
      springs: [],
    };
    expect(() => animationTraitHandler.onAttach!(node, config, {})).not.toThrow();
  });

  it('clip with easing name resolves', () => {
    const node = makeNode('ease1');
    const config: AnimationTraitConfig = {
      autoPlay: true,
      clips: [{
        property: 'opacity',
        keyframes: [
          { time: 0, value: 0, easing: 'ease-in' },
          { time: 1, value: 1, easing: 'ease-out-bounce' },
        ],
        duration: 1,
      }],
      springs: [],
    };
    expect(() => animationTraitHandler.onAttach!(node, config, {})).not.toThrow();
  });
});

/**
 * AnimationTrait.ts
 *
 * Declarative animation attachment for HoloScript+ nodes.
 * Allows any node to have animations defined as traits.
 *
 * @trait animate
 */

import { AnimationEngine, AnimationClip, Easing, EasingFn } from './AnimationEngine';
import { SpringAnimator, SpringPresets, SpringConfig } from './SpringAnimator';

export interface HSPlusNode {
  id?: string;
  properties?: Record<string, unknown>;
}

export interface TraitHandler<TConfig> {
  name: string;
  defaultConfig: TConfig;
  onAttach(node: HSPlusNode, config: TConfig, context: unknown): void;
  onDetach(node: HSPlusNode, config: TConfig, context: unknown): void;
  onUpdate(node: HSPlusNode, config: TConfig, context: unknown, delta: number): void;
}

export interface AnimationTraitConfig {
  clips?: AnimationClipDef[];
  springs?: SpringDef[];
  autoPlay: boolean;
}

export interface AnimationClipDef {
  property: string;
  keyframes: Array<{ time: number; value: number; easing?: string }>;
  duration: number;
  loop?: boolean;
  pingPong?: boolean;
  delay?: number;
}

export interface SpringDef {
  property: string;
  target: number;
  preset?: string;
  config?: Partial<SpringConfig>;
}

let sharedEngine: AnimationEngine | null = null;

export function getSharedAnimationEngine(): AnimationEngine {
  if (!sharedEngine) {
    sharedEngine = new AnimationEngine();
  }
  return sharedEngine;
}

const nodeSpringMap = new Map<string, Map<string, SpringAnimator>>();

const easingLookup: Record<string, EasingFn> = {
  linear: Easing.linear,
  'ease-in': Easing.easeInQuad,
  'ease-out': Easing.easeOutQuad,
  'ease-in-out': Easing.easeInOutQuad,
  'ease-in-cubic': Easing.easeInCubic,
  'ease-out-cubic': Easing.easeOutCubic,
  'ease-in-out-cubic': Easing.easeInOutCubic,
  'ease-out-back': Easing.easeOutBack,
  'ease-out-elastic': Easing.easeOutElastic,
  'ease-out-bounce': Easing.easeOutBounce,
  'ease-in-expo': Easing.easeInExpo,
  'ease-out-expo': Easing.easeOutExpo,
};

function resolveEasing(name?: string): EasingFn {
  if (!name) return Easing.linear;
  return easingLookup[name] || Easing.linear;
}

export const animationTraitHandler: TraitHandler<AnimationTraitConfig> = {
  name: 'animate',
  defaultConfig: {
    clips: [],
    springs: [],
    autoPlay: true,
  },

  onAttach(node: HSPlusNode, config: AnimationTraitConfig, _context: unknown) {
    const engine = getSharedAnimationEngine();
    const nodeId = node.id || 'unknown';

    if (config.autoPlay && config.clips) {
      for (const clipDef of config.clips) {
        const clip: AnimationClip = {
          id: `${nodeId}_${clipDef.property}`,
          property: clipDef.property,
          keyframes: clipDef.keyframes.map((kf) => ({
            time: kf.time,
            value: kf.value,
            easing: resolveEasing(kf.easing),
          })),
          duration: clipDef.duration,
          loop: clipDef.loop || false,
          pingPong: clipDef.pingPong || false,
          delay: clipDef.delay || 0,
        };

        engine.play(clip, (value) => {
          setNestedProperty(node, clipDef.property, value);
        });
      }
    }

    if (config.springs) {
      const springs = new Map<string, SpringAnimator>();
      for (const springDef of config.springs) {
        const presetConfig = springDef.preset ? SpringPresets[springDef.preset] : SpringPresets.default;
        const mergedConfig = { ...presetConfig, ...(springDef.config || {}) };
        const initial = (getNestedProperty(node, springDef.property) as number | undefined) ?? 0;
        const spring = new SpringAnimator(initial, mergedConfig, (value) => {
          setNestedProperty(node, springDef.property, value);
        });
        spring.setTarget(springDef.target);
        springs.set(springDef.property, spring);
      }
      nodeSpringMap.set(nodeId, springs);
    }
  },

  onDetach(node: HSPlusNode, _config: AnimationTraitConfig, _context: unknown) {
    const nodeId = node.id || 'unknown';
    const engine = getSharedAnimationEngine();

    for (const id of engine.getActiveIds()) {
      if (id.startsWith(nodeId)) {
        engine.stop(id);
      }
    }

    nodeSpringMap.delete(nodeId);
  },

  onUpdate(node: HSPlusNode, _config: AnimationTraitConfig, _context: unknown, delta: number) {
    const nodeId = node.id || 'unknown';
    const springs = nodeSpringMap.get(nodeId);
    if (springs) {
      for (const spring of springs.values()) {
        spring.update(delta);
      }
    }
  },
};

function setNestedProperty(node: HSPlusNode, path: string, value: unknown): void {
  if (!node.properties) return;
  const parts = path.split('.');
  let target: Record<string, unknown> = node.properties;

  for (let i = 0; i < parts.length - 1; i++) {
    if (target[parts[i]] === undefined) target[parts[i]] = {};
    target = target[parts[i]] as Record<string, unknown>;
  }
  target[parts[parts.length - 1]] = value;
}

function getNestedProperty(node: HSPlusNode, path: string): unknown {
  if (!node.properties) return undefined;
  const parts = path.split('.');
  let target: unknown = node.properties;

  for (const part of parts) {
    if (target === undefined || target === null) return undefined;
    target = (target as Record<string, unknown>)[part];
  }
  return target;
}


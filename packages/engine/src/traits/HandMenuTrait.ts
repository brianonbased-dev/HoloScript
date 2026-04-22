/**
 * HandMenuTrait.ts
 *
 * Trait for UI panels attached to the user's hand/wrist.
 * Uses SpringAnimator for smooth show/hide transitions.
 */

import { Vector3 } from '@holoscript/core';
import type { TraitHandler, TraitContext, VRContext } from '@holoscript/core';
import { UIHandMenuTrait } from './UITraits';
import { SpringAnimator, SpringPresets } from '@holoscript/engine/animation/SpringAnimator';

const getCoord = (v: Vector3, idx: 0 | 1 | 2, key: 'x' | 'y' | 'z') =>
  (Array.isArray(v) ? v[idx] : v[key]) ?? 0;
const add = (v1: Vector3, v2: Vector3): [number, number, number] => [
  getCoord(v1, 0, 'x') + getCoord(v2, 0, 'x'),
  getCoord(v1, 1, 'y') + getCoord(v2, 1, 'y'),
  getCoord(v1, 2, 'z') + getCoord(v2, 2, 'z'),
];

// Per-node spring state
const menuSprings = new Map<string, SpringAnimator>();

export const handMenuHandler: TraitHandler<UIHandMenuTrait> = {
  name: 'ui_hand_menu',
  defaultValue: {
    hand: 'left',
    trigger: 'palm_up',
    offset: [0, 0.2, 0 ],
    scale: 1,
  },

  onAttach(node, config, context) {
    const spring = new SpringAnimator(0, SpringPresets.gentle);
    menuSprings.set(node.id!, spring);
    if (node.properties) {
      node.properties.scale = [0, 0, 0 ];
      node.properties!.opacity = 0;
    }
  },

  onDetach(node, config, context) {
    menuSprings.delete(node.id!);
  },

  onUpdate(node, config, context, delta) {
    const vrContext = context.vr as VRContext;
    if (!vrContext || !vrContext.hands) return;

    const spring = menuSprings.get(node.id!);
    if (!spring) return;

    const handName = config.hand || 'left';
    const hand = vrContext.hands[handName as keyof typeof vrContext.hands];
    const shouldShow = !!hand;

    // Drive spring toward target visibility
    spring.setTarget(shouldShow ? 1 : 0);
    const visibility = spring.update(delta);

    if (!hand) {
      if (node.properties) {
        const s = visibility * (config.scale || 1);
        node.properties.scale = [s, s, s ];
        node.properties!.opacity = visibility;
      }
      return;
    }

    // Position: Smooth follow via lerp
const targetPos = add(hand.position, config.offset || [0, 0.2, 0 ]);
    const currentPos = (node.properties?.position as Vector3 | undefined) || targetPos;
    const lerpFactor = Math.min(1, 10 * delta);
    const newPos: [number, number, number] = [
      getCoord(currentPos, 0, 'x') + (getCoord(targetPos, 0, 'x') - getCoord(currentPos, 0, 'x')) * lerpFactor,
      getCoord(currentPos, 1, 'y') + (getCoord(targetPos, 1, 'y') - getCoord(currentPos, 1, 'y')) * lerpFactor,
      getCoord(currentPos, 2, 'z') + (getCoord(targetPos, 2, 'z') - getCoord(currentPos, 2, 'z')) * lerpFactor,
    ];

    if (node.properties) {
      node.properties.position = newPos;
      const s = visibility * (config.scale || 1);
      node.properties.scale = [s, s, s ];
      node.properties!.opacity = visibility;
    }
  },
};

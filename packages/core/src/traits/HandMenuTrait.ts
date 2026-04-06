/**
 * HandMenuTrait.ts
 *
 * Trait for UI panels attached to the user's hand/wrist.
 * Uses SpringAnimator for smooth show/hide transitions.
 */

import { Vector3 } from '../types/HoloScriptPlus';
import type { TraitHandler, TraitContext, VRContext } from './TraitTypes';
import { UIHandMenuTrait } from './UITraits';
// @ts-expect-error During migration
import { SpringAnimator, SpringPresets } from '@holoscript/engine/animation/SpringAnimator';

const getCoord = (v: Vector3, idx: 0 | 1 | 2, key: 'x' | 'y' | 'z') =>
  (Array.isArray(v) ? v[idx] : v[key]) ?? 0;
const add = (v1: Vector3, v2: Vector3) => ({
  x: getCoord(v1, 0, 'x') + getCoord(v2, 0, 'x'),
  y: getCoord(v1, 1, 'y') + getCoord(v2, 1, 'y'),
  z: getCoord(v1, 2, 'z') + getCoord(v2, 2, 'z'),
});

// Per-node spring state
const menuSprings = new Map<string, SpringAnimator>();

export const handMenuHandler: TraitHandler<UIHandMenuTrait> = {
  name: 'ui_hand_menu',
  defaultValue: {
    hand: 'left',
    trigger: 'palm_up',
    offset: { x: 0, y: 0.2, z: 0 },
    scale: 1,
  },

  onAttach(node, config, context) {
    const spring = new SpringAnimator(0, SpringPresets.gentle);
    menuSprings.set(node.id!, spring);
    if (node.properties) {
      node.properties.scale = { x: 0, y: 0, z: 0 };
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
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const hand = vrContext.hands[handName];
    const shouldShow = !!hand;

    // Drive spring toward target visibility
    spring.setTarget(shouldShow ? 1 : 0);
    const visibility = spring.update(delta);

    if (!hand) {
      if (node.properties) {
        const s = visibility * (config.scale || 1);
        node.properties.scale = { x: s, y: s, z: s };
        node.properties!.opacity = visibility;
      }
      return;
    }

    // Position: Smooth follow via lerp
    const targetPos = add(hand.position, config.offset || { x: 0, y: 0.2, z: 0 });
    const currentPos: any = node.properties?.position || targetPos;
    const lerpFactor = Math.min(1, 10 * delta);
    const newPos = {
      x: (currentPos.x ?? 0) + ((targetPos.x ?? 0) - (currentPos.x ?? 0)) * lerpFactor,
      y: (currentPos.y ?? 0) + ((targetPos.y ?? 0) - (currentPos.y ?? 0)) * lerpFactor,
      z: (currentPos.z ?? 0) + ((targetPos.z ?? 0) - (currentPos.z ?? 0)) * lerpFactor,
    };

    if (node.properties) {
      node.properties.position = newPos;
      const s = visibility * (config.scale || 1);
      node.properties.scale = { x: s, y: s, z: s };
      node.properties!.opacity = visibility;
    }
  },
};

/**
 * TransitionSystem.ts
 *
 * Pre-built UI transition patterns using the AnimationEngine.
 * Provides fade, scale, slide, and combined transitions.
 */

import { AnimationEngine, AnimationClip, Easing, Keyframe, EasingFn } from './AnimationEngine';
import { SpringAnimator, SpringPresets, SpringConfig } from './SpringAnimator';

// =============================================================================
// TRANSITION TYPES
// =============================================================================

export type TransitionDirection = 'in' | 'out';

export interface TransitionOptions {
  duration?: number;
  easing?: EasingFn;
  delay?: number;
  onComplete?: () => void;
}

// =============================================================================
// TRANSITION SYSTEM
// =============================================================================

export class TransitionSystem {
  private engine: AnimationEngine;

  constructor(engine?: AnimationEngine) {
    this.engine = engine || new AnimationEngine();
  }

  getEngine(): AnimationEngine {
    return this.engine;
  }

  /**
   * Fade in/out (opacity 0 <-> 1)
   */
  fade(
    nodeId: string,
    direction: TransitionDirection,
    setter: (opacity: number) => void,
    options: TransitionOptions = {}
  ): void {
    const { duration = 0.3, easing = Easing.easeOutQuad, delay = 0, onComplete } = options;
    const from = direction === 'in' ? 0 : 1;
    const to = direction === 'in' ? 1 : 0;

    this.engine.play(
      {
        id: `${nodeId}_fade`,
        property: 'opacity',
        keyframes: [
          { time: 0, value: from },
          { time: 1, value: to, easing },
        ],
        duration,
        loop: false,
        pingPong: false,
        delay,
        onComplete,
      },
      setter
    );
  }

  /**
   * Scale in/out (scale 0 <-> 1)
   */
  scale(
    nodeId: string,
    direction: TransitionDirection,
    setter: (scale: number) => void,
    options: TransitionOptions = {}
  ): void {
    const { duration = 0.35, easing = Easing.easeOutBack, delay = 0, onComplete } = options;
    const from = direction === 'in' ? 0 : 1;
    const to = direction === 'in' ? 1 : 0;

    this.engine.play(
      {
        id: `${nodeId}_scale`,
        property: 'scale',
        keyframes: [
          { time: 0, value: from },
          { time: 1, value: to, easing },
        ],
        duration,
        loop: false,
        pingPong: false,
        delay,
        onComplete,
      },
      setter
    );
  }

  /**
   * Slide from a direction (e.g., slide up from below)
   */
  slide(
    nodeId: string,
    direction: TransitionDirection,
    axis: 'x' | 'y' | 'z',
    distance: number,
    setter: (offset: number) => void,
    options: TransitionOptions = {}
  ): void {
    const { duration = 0.4, easing = Easing.easeOutCubic, delay = 0, onComplete } = options;
    const from = direction === 'in' ? distance : 0;
    const to = direction === 'in' ? 0 : distance;

    this.engine.play(
      {
        id: `${nodeId}_slide_${axis}`,
        property: `slide_${axis}`,
        keyframes: [
          { time: 0, value: from },
          { time: 1, value: to, easing },
        ],
        duration,
        loop: false,
        pingPong: false,
        delay,
        onComplete,
      },
      setter
    );
  }

  /**
   * Combined: Scale + Fade (common for dialogs/menus)
   */
  popIn(
    nodeId: string,
    scaleSetter: (s: number) => void,
    opacitySetter: (o: number) => void,
    options: TransitionOptions = {}
  ): void {
    const { duration = 0.35, delay = 0, onComplete } = options;
    this.scale(nodeId, 'in', scaleSetter, { duration, delay, easing: Easing.easeOutBack });
    this.fade(nodeId, 'in', opacitySetter, { duration: duration * 0.6, delay, onComplete });
  }

  /**
   * Combined: Scale + Fade out
   */
  popOut(
    nodeId: string,
    scaleSetter: (s: number) => void,
    opacitySetter: (o: number) => void,
    options: TransitionOptions = {}
  ): void {
    const { duration = 0.25, delay = 0, onComplete } = options;
    this.scale(nodeId, 'out', scaleSetter, { duration, delay, easing: Easing.easeInQuad });
    this.fade(nodeId, 'out', opacitySetter, { duration, delay, onComplete });
  }

  /**
   * Update all transitions. Must be called every frame.
   */
  update(delta: number): void {
    this.engine.update(delta);
  }
}


import type { Vector3 } from '@holoscript/core';

/** Config shape for @ui_hand_menu (engine-local; mirrors HS+ trait schema). */
export interface UIHandMenuTrait {
  hand?: 'left' | 'right';
  trigger?: string;
  offset?: Vector3 | [number, number, number];
  scale?: number;
}

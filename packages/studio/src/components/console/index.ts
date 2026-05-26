/**
 * Console design system — the interaction-first primitives every Front surface
 * inherits (D.066). Tokens + the 5 interaction primitives (Tap/Click via
 * TapTarget; Swipe/Talk/Type expressed by the components) + the 4 components.
 *
 * No command or file primitive exists here — by design.
 */
export { tokens, tapTargetStyle } from './tokens';
export { TapTarget } from './primitives';
export type { Interaction, TapTargetProps } from './primitives';
export { ActionTile } from './ActionTile';
export type { ActionTileProps } from './ActionTile';
export { ActionChip } from './ActionChip';
export type { ActionChipProps } from './ActionChip';
export { StatusStrip } from './StatusStrip';
export type { StatusStripProps, StatusCell } from './StatusStrip';
export { SayOrType } from './SayOrType';
export type { SayOrTypeProps } from './SayOrType';

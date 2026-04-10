/**
 * Foldable Display Traits (M.010.17)
 *
 * Split-screen AR for Galaxy Fold/Flip via Jetpack WindowManager.
 * Fold: large panel AR + small panel controls.
 * Flip: flex mode AR + tabletop mode.
 */
export const FOLDABLE_DISPLAY_TRAITS = [
  'foldable_detect', // detect foldable device and fold state
  'foldable_split_view', // AR viewfinder on one panel, controls on other
  'foldable_flex_mode', // Flip flex mode: top AR, bottom controls
  'foldable_tabletop', // tabletop mode: phone stands up, AR projects forward
  'foldable_hinge_angle', // expose hinge angle as input parameter
  'foldable_continuity', // seamless transition between fold states
] as const;

export type FoldableDisplayTraitName = (typeof FOLDABLE_DISPLAY_TRAITS)[number];

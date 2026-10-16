/**
 * Parser Core & UI Traits
 */
export const PARSER_CORE_UI_TRAITS = [
  'physics',
  'draggable',
  'static',
  'kinematic',
  'local_only',
  'visible',
  'invisible',
  'audio',
  'portal',
  'vr_only',
  'ar_only',
  'desktop_only',
  'ui_floating',
  'ui_anchored',
  'ui_hand_menu',
  'ui_billboard',
  'ui_curved',
  'ui_docked',
  // Runtime handlers registered by packages/runtime/src/browser/BrowserRuntime.ts, used in examples/
  'ui_panel', // packages/runtime/src/traits/AdvancedTraits.ts UIPanelTrait
] as const;

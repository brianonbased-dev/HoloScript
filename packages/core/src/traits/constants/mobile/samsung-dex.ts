/**
 * Samsung DeX Traits (M.010.18)
 *
 * Seamless phone-to-desktop holographic handoff.
 * Detect DeX mode, transition from mobile AR to desktop 3D editor.
 */
export const SAMSUNG_DEX_TRAITS = [
  'dex_detect', // detect Samsung DeX connection
  'dex_handoff', // hand off .holo scene from mobile AR to desktop view
  'dex_desktop_controls', // enable mouse/keyboard controls in DeX mode
  'dex_multi_window', // support multi-window layout in DeX
  'dex_resolution_adapt', // adapt rendering resolution to external display
] as const;

export type SamsungDeXTraitName = (typeof SAMSUNG_DEX_TRAITS)[number];

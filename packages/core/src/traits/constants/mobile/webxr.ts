/**
 * WebXR Traits (M.010.19)
 *
 * Browser-native XR on Android Chrome — no app install needed.
 * Share a URL, recipient sees holograms in their space.
 * Lowest friction entry point to HoloScript.
 *
 * Categories:
 *   - Session (immersive AR/VR, inline)
 *   - Features (hit test, anchors, light estimation, DOM overlay)
 *   - Rendering (layers, framebuffer, reference space)
 */
export const WEBXR_TRAITS = [
  // --- Session ---
  'webxr_session', // request immersive-ar or immersive-vr session
  'webxr_inline', // inline XR (non-immersive, preview mode)

  // --- Features ---
  'webxr_hit_test', // ray-surface hit testing for placement
  'webxr_anchors', // persistent anchors across frames
  'webxr_light_estimation', // real-world lighting probe for hologram shading
  'webxr_dom_overlay', // HTML DOM overlay on top of XR scene
  'webxr_depth_sensing', // depth buffer access for occlusion
  'webxr_hand_tracking', // WebXR hand tracking API (where supported)

  // --- Rendering ---
  'webxr_layers', // XR composition layers (projection, quad, cylinder)
  'webxr_framebuffer', // direct framebuffer access for custom rendering
  'webxr_reference_space', // reference space type (local, local-floor, bounded-floor)
] as const;

export type WebXRTraitName = (typeof WEBXR_TRAITS)[number];

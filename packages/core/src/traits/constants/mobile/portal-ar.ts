/**
 * Portal AR Traits (M.010.06)
 *
 * Phone-as-Portal: the screen becomes a magic window into a parallel
 * holographic layer overlaid on reality. Different from standard AR
 * (isolated placed objects) — the ENTIRE environment has a holographic
 * twin visible through the phone.
 *
 * Categories:
 *   - Mode (enable portal, configure behavior)
 *   - Occlusion (real objects block holograms, people occlusion)
 *   - Rendering (parallax, depth fade, environment blending)
 *   - Boundary (portal edges, transition effects)
 *   - World Mesh (scene mesh integration for realistic portal)
 */
export const PORTAL_AR_TRAITS = [
  // --- Mode ---
  'portal_mode', // enable portal AR rendering mode
  'portal_peek_through', // tilt phone to reveal holographic layer
  'portal_toggle', // tap to switch between real and holographic view

  // --- Occlusion ---
  'portal_occlusion', // real-world objects occlude holograms (depth buffer)
  'portal_people_occlusion', // people occlude holograms (ARKit matting / ML segmentation)
  'portal_reverse_occlusion', // holograms occlude real objects (inverted portal)

  // --- Rendering ---
  'portal_parallax', // depth-correct parallax as phone moves
  'portal_depth_fade', // holograms fade at distance for realism
  'portal_environment_twin', // whole-room holographic twin layer
  'portal_lighting_match', // match hologram lighting to real environment

  // --- Boundary ---
  'portal_boundary', // define portal edges (circle, rectangle, freeform)
  'portal_transition', // visual effect when crossing portal boundary
  'portal_edge_glow', // glow effect at portal boundary edges

  // --- World Mesh ---
  'portal_world_mesh', // use ARKit/ARCore scene mesh for portal integration
  'portal_mesh_occlusion', // scene mesh provides occlusion geometry
] as const;

export type PortalARTraitName = (typeof PORTAL_AR_TRAITS)[number];

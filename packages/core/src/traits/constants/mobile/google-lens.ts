/**
 * Google Lens Integration Traits (M.010.20)
 *
 * Point-and-understand semantic pipe into .holo scene graph.
 * Google ML Kit capabilities. Point at anything — recognized entities
 * become holographic overlays.
 */
export const GOOGLE_LENS_TRAITS = [
  'lens_recognize',            // enable object/scene recognition
  'lens_text_overlay',         // OCR text as holographic overlay
  'lens_product_id',           // product identification and info overlay
  'lens_translate',            // real-time text translation overlay
  'lens_entity_pipe',          // pipe recognized entities into .holo scene graph
  'lens_plant_animal_id',      // plant/animal species identification
  'lens_landmark_info',        // landmark/building information overlay
] as const;

export type GoogleLensTraitName = (typeof GOOGLE_LENS_TRAITS)[number];

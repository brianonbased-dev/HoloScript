/**
 * Core VR Interaction Traits + Timeline & Choreography
 */
export const CORE_VR_INTERACTION_TRAITS = [
  'grabbable',
  'throwable',
  'pointable',
  'hoverable',
  'scalable',
  'rotatable',
  'stackable',
  'snappable',
  'breakable',
  'stretchable',
  'moldable',
  'timeline',
  'choreography',
  // Composite grab-feedback profile: haptic + spatial-audio + bloom in one declaration (A-009)
  'grab_feedback_profile',
] as const;

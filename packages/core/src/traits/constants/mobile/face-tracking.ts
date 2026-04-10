/**
 * TrueDepth Face Tracking Traits (M.010.14)
 *
 * 52-blendshape avatar mirroring from iPhone TrueDepth front camera.
 * ARKit ARFaceAnchor at 60fps.
 *
 * Categories:
 *   - Tracking (enable, blendshapes, mesh)
 *   - Avatar (face drive, expression mirroring)
 *   - Analysis (emotion detection, gaze direction)
 */
export const FACE_TRACKING_TRAITS = [
  // --- Tracking ---
  'face_track_truedepth', // enable TrueDepth face tracking (ARFaceAnchor)
  'face_blendshapes', // 52 ARKit blendshape coefficients
  'face_mesh', // face topology mesh (1220 vertices)
  'face_transform', // head position and orientation in world space

  // --- Avatar ---
  'face_avatar_drive', // drive .holo avatar with face blendshapes
  'face_blendshape_mirror', // mirror blendshapes to avatar (1:1 mapping)
  'face_puppet', // face-driven holographic puppet mode
  'face_retarget', // retarget blendshapes to non-human avatar topology

  // --- Analysis ---
  'face_emotion_detect', // derive emotion from blendshape combinations
  'face_gaze_direction', // eye gaze vector from lookAtPoint
  'face_tongue_detect', // tongue out detection (blendshape tongueOut)
] as const;

export type FaceTrackingTraitName = (typeof FACE_TRACKING_TRAITS)[number];

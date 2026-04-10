/**
 * Camera Hand Tracking Traits (M.010.04)
 *
 * Vision-based hand tracking using the front camera — no headset needed.
 * MediaPipe Hands on Android, Vision framework on iOS.
 * 21-joint hand skeleton per hand, mapped to HoloScript spatial_input events.
 *
 * Categories:
 *   - Core (enable tracking, skeleton data)
 *   - Gestures (pinch, point, palm, fist — mapped to spatial_input)
 *   - Configuration (confidence, two-hand, bridge to spatial traits)
 */
export const CAMERA_HAND_TRACKING_TRAITS = [
  // --- Core ---
  'camera_hand_track', // enable camera-based hand tracking
  'camera_hand_skeleton', // 21-joint skeleton data per hand (wrist, thumb[4], index[4], middle[4], ring[4], pinky[4])

  // --- Gestures ---
  'camera_hand_gesture_pinch', // pinch-to-grab (thumb + index tip proximity)
  'camera_hand_gesture_point', // point-to-select (index extended, others curled)
  'camera_hand_gesture_palm', // open-palm-to-dismiss (all fingers extended)
  'camera_hand_gesture_fist', // fist-to-grip (all fingers curled)

  // --- Configuration ---
  'camera_hand_two_hands', // track both hands simultaneously
  'camera_hand_confidence', // per-joint confidence threshold (filter noisy joints)
  'camera_hand_to_spatial', // bridge to existing spatial_input trait system
] as const;

export type CameraHandTrackingTraitName = (typeof CAMERA_HAND_TRACKING_TRAITS)[number];

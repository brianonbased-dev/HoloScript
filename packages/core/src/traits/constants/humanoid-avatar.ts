/**
 * Humanoid / Avatar Traits
 */
export const HUMANOID_AVATAR_TRAITS = [
  'skeleton',
  'body',
  'face',
  'expressive',
  'hair',
  'clothing',
  'hands',
  'character_voice',
  'locomotion',
  'poseable',
  'morph',
  // V43 Tier 1: Perception
  'eye_tracked',
  'hand_tracking',
  // V43 Tier 3: Pose & Animation
  'pose_estimation',
  'hand_mesh_ai',
  'neural_animation',
  // Embodied-motion seam: declares where body motion comes from and routes it
  // into @animation / @avatar_embodiment (see MotionSourceTrait).
  'motion_source',
] as const;

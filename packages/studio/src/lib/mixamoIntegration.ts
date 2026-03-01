/**
 * mixamoIntegration.ts — Mixamo Animation Integration
 *
 * Import, remap, and apply Mixamo animations to HoloScript characters.
 */

export interface MixamoAnimation {
  id: string;
  name: string;
  category: MixamoCategory;
  duration: number;        // seconds
  frameCount: number;
  inPlace: boolean;        // Root motion removed
  thumbnailUrl: string;
  downloadUrl?: string;
}

export type MixamoCategory =
  | 'idle' | 'walk' | 'run' | 'jump' | 'dance'
  | 'combat' | 'emote' | 'interact' | 'sit' | 'climb';

export interface BoneMapping {
  source: string;          // Mixamo bone name
  target: string;          // HoloScript skeleton bone name
}

export interface RetargetConfig {
  mappings: BoneMapping[];
  scaleMultiplier: number;
  rootBone: string;
  preserveFootContact: boolean;
}

/**
 * Default Mixamo → HoloScript bone mapping.
 */
export function defaultBoneMapping(): BoneMapping[] {
  return [
    { source: 'mixamorig:Hips', target: 'hips' },
    { source: 'mixamorig:Spine', target: 'spine' },
    { source: 'mixamorig:Spine1', target: 'spine1' },
    { source: 'mixamorig:Spine2', target: 'spine2' },
    { source: 'mixamorig:Neck', target: 'neck' },
    { source: 'mixamorig:Head', target: 'head' },
    { source: 'mixamorig:LeftShoulder', target: 'shoulder.L' },
    { source: 'mixamorig:LeftArm', target: 'upper_arm.L' },
    { source: 'mixamorig:LeftForeArm', target: 'forearm.L' },
    { source: 'mixamorig:LeftHand', target: 'hand.L' },
    { source: 'mixamorig:RightShoulder', target: 'shoulder.R' },
    { source: 'mixamorig:RightArm', target: 'upper_arm.R' },
    { source: 'mixamorig:RightForeArm', target: 'forearm.R' },
    { source: 'mixamorig:RightHand', target: 'hand.R' },
    { source: 'mixamorig:LeftUpLeg', target: 'upper_leg.L' },
    { source: 'mixamorig:LeftLeg', target: 'lower_leg.L' },
    { source: 'mixamorig:LeftFoot', target: 'foot.L' },
    { source: 'mixamorig:RightUpLeg', target: 'upper_leg.R' },
    { source: 'mixamorig:RightLeg', target: 'lower_leg.R' },
    { source: 'mixamorig:RightFoot', target: 'foot.R' },
  ];
}

/**
 * Create a retarget configuration.
 */
export function createRetargetConfig(
  customMappings?: BoneMapping[],
  scale: number = 1
): RetargetConfig {
  return {
    mappings: customMappings ?? defaultBoneMapping(),
    scaleMultiplier: scale,
    rootBone: 'hips',
    preserveFootContact: true,
  };
}

/**
 * Validate that all required bones are mapped.
 */
export function validateMapping(config: RetargetConfig): { valid: boolean; missing: string[] } {
  const required = ['hips', 'spine', 'head', 'upper_arm.L', 'upper_arm.R', 'upper_leg.L', 'upper_leg.R'];
  const mapped = new Set(config.mappings.map(m => m.target));
  const missing = required.filter(r => !mapped.has(r));
  return { valid: missing.length === 0, missing };
}

/**
 * Estimate retarget quality based on mapping coverage.
 */
export function retargetQuality(config: RetargetConfig): 'high' | 'medium' | 'low' {
  const count = config.mappings.length;
  if (count >= 18) return 'high';
  if (count >= 10) return 'medium';
  return 'low';
}

/**
 * Common Mixamo animation catalog (sample entries).
 */
export const MIXAMO_CATALOG: MixamoAnimation[] = [
  { id: 'idle', name: 'Idle', category: 'idle', duration: 3.0, frameCount: 90, inPlace: true, thumbnailUrl: '/anims/idle.png' },
  { id: 'walk', name: 'Walking', category: 'walk', duration: 1.0, frameCount: 30, inPlace: true, thumbnailUrl: '/anims/walk.png' },
  { id: 'run', name: 'Running', category: 'run', duration: 0.8, frameCount: 24, inPlace: true, thumbnailUrl: '/anims/run.png' },
  { id: 'jump', name: 'Jump', category: 'jump', duration: 1.5, frameCount: 45, inPlace: false, thumbnailUrl: '/anims/jump.png' },
  { id: 'dance-hip-hop', name: 'Hip Hop Dance', category: 'dance', duration: 4.0, frameCount: 120, inPlace: true, thumbnailUrl: '/anims/dance.png' },
  { id: 'punch', name: 'Punch', category: 'combat', duration: 0.6, frameCount: 18, inPlace: true, thumbnailUrl: '/anims/punch.png' },
  { id: 'wave', name: 'Wave', category: 'emote', duration: 2.0, frameCount: 60, inPlace: true, thumbnailUrl: '/anims/wave.png' },
  { id: 'sit', name: 'Sitting Down', category: 'sit', duration: 2.5, frameCount: 75, inPlace: false, thumbnailUrl: '/anims/sit.png' },
];

/**
 * Search Mixamo catalog by category.
 */
export function animationsByCategory(category: MixamoCategory): MixamoAnimation[] {
  return MIXAMO_CATALOG.filter(a => a.category === category);
}

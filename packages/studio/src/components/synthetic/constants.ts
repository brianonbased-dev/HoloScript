import type { 
  AnnotationFormat, 
  CameraPlacement, 
  LightingMode, 
  CameraConfig, 
  LightingConfig, 
  AugmentationConfig, 
  BatchConfig 
} from './types';

export const FORMAT_INFO: Record<AnnotationFormat, { label: string; icon: string; desc: string }> = {
  coco: { label: 'COCO', icon: '🎯', desc: 'JSON annotations, instance segmentation' },
  yolo: { label: 'YOLO', icon: '⚡', desc: 'TXT labels, bounding boxes per image' },
  'pascal-voc': { label: 'Pascal VOC', icon: '📋', desc: 'XML annotations, per-image files' },
};

export const PLACEMENT_INFO: Record<CameraPlacement, { label: string; icon: string }> = {
  grid: { label: 'Grid', icon: '▦' },
  random: { label: 'Random', icon: '🎲' },
  hemisphere: { label: 'Hemisphere', icon: '🌐' },
  orbital: { label: 'Orbital', icon: '🔄' },
  custom: { label: 'Custom', icon: '📐' },
};

export const LIGHTING_INFO: Record<LightingMode, { label: string; icon: string }> = {
  fixed: { label: 'Fixed', icon: '💡' },
  randomized: { label: 'Randomized', icon: '🎲' },
  'hdri-sweep': { label: 'HDRI Sweep', icon: '🌅' },
  'time-of-day': { label: 'Time of Day', icon: '🕐' },
};

export const DEFAULT_CAMERA: CameraConfig = {
  placement: 'hemisphere',
  count: 50,
  minDistance: 2,
  maxDistance: 8,
  minHeight: 0.5,
  maxHeight: 4,
  fovRange: [40, 70],
  lookAtJitter: 0.2,
};

export const DEFAULT_LIGHTING: LightingConfig = {
  mode: 'randomized',
  intensityRange: [0.5, 2.0],
  colorTemperatureRange: [3500, 6500],
  directionalCount: 2,
  ambientRange: [0.1, 0.5],
  shadowsEnabled: true,
};

export const DEFAULT_AUGMENTATION: AugmentationConfig = {
  enabled: true,
  types: ['noise', 'colorJitter'],
  noiseStddev: 0.02,
  blurRadius: 0,
  occlusionProbability: 0,
  colorJitterRange: 0.15,
  randomCropScale: [0.85, 1.0],
};

export const DEFAULT_BATCH: BatchConfig = {
  totalImages: 1000,
  resolution: [1024, 1024],
  trainSplit: 0.8,
  valSplit: 0.1,
  testSplit: 0.1,
  seed: 42,
  format: 'coco',
  outputDir: './synthetic-data',
  includeDepth: false,
  includeNormals: false,
  includeSegmentation: true,
};

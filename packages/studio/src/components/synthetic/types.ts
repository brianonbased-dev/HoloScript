export type AnnotationFormat = 'coco' | 'yolo' | 'pascal-voc';
export type CameraPlacement = 'grid' | 'random' | 'hemisphere' | 'orbital' | 'custom';
export type LightingMode = 'fixed' | 'randomized' | 'hdri-sweep' | 'time-of-day';
export type AugmentationType = 'noise' | 'blur' | 'occlusion' | 'colorJitter' | 'cropResize';

export interface CameraConfig {
  placement: CameraPlacement;
  count: number;
  minDistance: number;
  maxDistance: number;
  minHeight: number;
  maxHeight: number;
  fovRange: [number, number];
  lookAtJitter: number; // randomized offset from center (meters)
}

export interface LightingConfig {
  mode: LightingMode;
  intensityRange: [number, number];
  colorTemperatureRange: [number, number]; // Kelvin
  directionalCount: number;
  ambientRange: [number, number];
  shadowsEnabled: boolean;
  hdriPaths?: string[];
}

export interface AugmentationConfig {
  enabled: boolean;
  types: AugmentationType[];
  noiseStddev: number; // 0-0.1
  blurRadius: number; // 0-5
  occlusionProbability: number; // 0-1
  colorJitterRange: number; // 0-0.5
  randomCropScale: [number, number]; // e.g. [0.8, 1.0]
}

export interface BatchConfig {
  totalImages: number;
  resolution: [number, number];
  trainSplit: number; // 0-1
  valSplit: number;
  testSplit: number;
  seed: number;
  format: AnnotationFormat;
  outputDir: string;
  includeDepth: boolean;
  includeNormals: boolean;
  includeSegmentation: boolean;
}

export interface GenerationProgress {
  status: 'idle' | 'generating' | 'complete' | 'error';
  current: number;
  total: number;
  elapsedMs: number;
  estimatedRemainingMs: number;
  errors: string[];
}

export interface SyntheticDataConfig {
  camera: CameraConfig;
  lighting: LightingConfig;
  augmentation: AugmentationConfig;
  batch: BatchConfig;
}

/**
 * NPU Scene Understanding Traits (M.010.03)
 *
 * On-device neural processing unit traits for real-time scene
 * understanding via CoreML (iOS) and NNAPI/ML Kit (Android).
 * Phone camera feed goes through on-device ML models — recognized
 * objects become interactive .holo entities with no cloud round-trip.
 *
 * Categories:
 *   - Classification (image-level labels via NPU)
 *   - Detection (bounding-box object detection)
 *   - Segmentation (pixel-level semantic masks)
 *   - Depth (monocular depth estimation from single camera)
 *   - Entity Pipeline (map ML results into .holo scene graph)
 *   - Realtime (continuous inference on live camera feed)
 *   - Custom Models (load user-provided CoreML / TFLite models)
 *   - Label Overlay (holographic labels floating above recognized objects)
 */
export const NPU_SCENE_TRAITS = [
  // --- Classification ---
  'npu_classify', // whole-image classification (VNClassifyImageRequest / ImageLabeler)

  // --- Detection ---
  'npu_detect', // bounding-box object detection (VNRecognizeAnimalsRequest / ObjectDetector)

  // --- Segmentation ---
  'npu_segment', // semantic segmentation mask (VNGeneratePersonSegmentationRequest / Segmenter)

  // --- Depth ---
  'npu_depth', // monocular depth estimation (ARFrame.sceneDepth / DepthEstimation ML Kit)

  // --- Entity Pipeline ---
  'npu_entity_pipe', // pipe recognized objects into .holo scene graph as interactive entities

  // --- Realtime ---
  'npu_realtime', // continuous inference on every camera frame (throttled to target FPS)

  // --- Custom Models ---
  'npu_model_custom', // load user-provided CoreML (.mlmodelc) or TFLite (.tflite) model

  // --- Label Overlay ---
  'npu_label_overlay', // holographic labels floating above recognized objects in AR space
] as const;

export type NPUSceneTraitName = (typeof NPU_SCENE_TRAITS)[number];

/**
 * Default configuration values for NPU scene understanding.
 */
export const NPU_SCENE_DEFAULTS = {
  /** Target inference FPS for npu_realtime */
  targetFPS: 15,
  /** Minimum confidence threshold for detection/classification (0-1) */
  confidenceThreshold: 0.6,
  /** Maximum number of detected objects to track simultaneously */
  maxDetections: 20,
  /** Default entity scale factor when mapping detections to .holo entities */
  entityScale: 0.1,
  /** Label overlay offset above detected object (meters) */
  labelOffsetY: 0.15,
  /** Default segmentation classes of interest */
  segmentationClasses: ['person', 'furniture', 'vehicle', 'animal', 'food'],
} as const;

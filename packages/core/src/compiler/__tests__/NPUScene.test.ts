import { describe, it, expect, vi } from 'vitest';
import { IOSCompiler } from '../IOSCompiler';
import { AndroidCompiler } from '../AndroidCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

vi.mock('../identity/AgentRBAC', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getRBAC: () => ({ checkAccess: () => ({ allowed: true }) }),
  };
});

function makeComposition(overrides: Partial<HoloComposition> = {}): HoloComposition {
  return { name: 'TestScene', objects: [], ...overrides } as HoloComposition;
}

function makeNPUComposition(traitNames: string[]): HoloComposition {
  return makeComposition({
    objects: [
      {
        name: 'ai_camera',
        properties: [],
        traits: traitNames.map((name) => ({ name, config: {} })),
      },
    ] as any,
  });
}

// =================== iOS Compiler ===================

describe('IOSCompiler — NPU Scene Understanding', () => {
  // =========== Detection ===========

  it('does NOT emit npuSceneFile when no npu traits present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.npuSceneFile).toBeUndefined();
  });

  it('emits npuSceneFile when npu_classify trait is present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toBeDefined();
    expect(typeof result.npuSceneFile).toBe('string');
    expect(result.npuSceneFile!.length).toBeGreaterThan(0);
  });

  it('emits npuSceneFile when npu_detect trait is present', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneFile).toBeDefined();
  });

  // =========== Framework imports ===========

  it('imports Vision framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toContain('import Vision');
  });

  it('imports CoreML framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toContain('import CoreML');
  });

  it('imports ARKit framework', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toContain('import ARKit');
  });

  // =========== NPUDetection model ===========

  it('generates NPUDetection struct', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toContain('struct NPUDetection');
    expect(result.npuSceneFile).toContain('let label: String');
    expect(result.npuSceneFile).toContain('let confidence: Float');
  });

  // =========== Classification (npu_classify) ===========

  it('generates VNClassifyImageRequest for npu_classify', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toContain('VNClassifyImageRequest');
    expect(result.npuSceneFile).toContain('classifyImage');
  });

  // =========== Detection (npu_detect) ===========

  it('generates detection handler for npu_detect', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneFile).toContain('detectObjects');
    expect(result.npuSceneFile).toContain('VNRecognizedObjectObservation');
  });

  // =========== Segmentation (npu_segment) ===========

  it('generates VNGeneratePersonSegmentationRequest for npu_segment', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_segment']), 'test-token');
    expect(result.npuSceneFile).toContain('VNGeneratePersonSegmentationRequest');
    expect(result.npuSceneFile).toContain('segmentScene');
  });

  // =========== Depth (npu_depth) ===========

  it('generates depth estimation for npu_depth', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_depth']), 'test-token');
    expect(result.npuSceneFile).toContain('estimateDepth');
    expect(result.npuSceneFile).toContain('sceneDepth');
  });

  // =========== Entity Pipeline (npu_entity_pipe) ===========

  it('generates entity mapping for npu_entity_pipe', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_entity_pipe']), 'test-token');
    expect(result.npuSceneFile).toContain('mapDetectionsToEntities');
    expect(result.npuSceneFile).toContain('raycastQuery');
  });

  // =========== Realtime (npu_realtime) ===========

  it('generates frame processor for npu_realtime', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeNPUComposition(['npu_realtime', 'npu_classify']),
      'test-token'
    );
    expect(result.npuSceneFile).toContain('processFrame');
    expect(result.npuSceneFile).toContain('targetFPS');
  });

  // =========== Custom Model (npu_model_custom) ===========

  it('generates MLModel loader for npu_model_custom', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_model_custom']), 'test-token');
    expect(result.npuSceneFile).toContain('loadCustomModel');
    expect(result.npuSceneFile).toContain('MLModel(contentsOf:');
    expect(result.npuSceneFile).toContain('VNCoreMLModel');
  });

  // =========== Label Overlay (npu_label_overlay) ===========

  it('generates label nodes for npu_label_overlay', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_label_overlay']), 'test-token');
    expect(result.npuSceneFile).toContain('createLabelNode');
    expect(result.npuSceneFile).toContain('SCNText');
    expect(result.npuSceneFile).toContain('SCNBillboardConstraint');
  });

  // =========== NPUSceneManager class ===========

  it('generates NPUSceneManager class with custom className', () => {
    const compiler = new IOSCompiler({ className: 'MyAR' });
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toContain('class MyARNPUSceneManager');
  });

  // =========== SwiftUI overlay ===========

  it('generates SwiftUI overlay view', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toContain('NPUOverlayView: View');
    expect(result.npuSceneFile).toContain('detections.count');
  });

  // =========== Multiple traits ===========

  it('includes all requested trait handlers', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(
      makeNPUComposition(['npu_classify', 'npu_detect', 'npu_segment', 'npu_label_overlay']),
      'test-token'
    );
    expect(result.npuSceneFile).toContain('classifyImage');
    expect(result.npuSceneFile).toContain('detectObjects');
    expect(result.npuSceneFile).toContain('segmentScene');
    expect(result.npuSceneFile).toContain('createLabelNode');
  });

  // =========== Does not include unused traits ===========

  it('does not include unused trait handlers', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).not.toContain('detectObjects');
    expect(result.npuSceneFile).not.toContain('segmentScene');
    expect(result.npuSceneFile).not.toContain('estimateDepth');
  });

  // =========== Default config values ===========

  it('uses NPU_SCENE_DEFAULTS for configuration', () => {
    const compiler = new IOSCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneFile).toContain('confidenceThreshold');
    expect(result.npuSceneFile).toContain('maxDetections');
    expect(result.npuSceneFile).toContain('0.6'); // default confidence
  });
});

// =================== Android Compiler ===================

describe('AndroidCompiler — NPU Scene Understanding', () => {
  // =========== Detection ===========

  it('does NOT emit npuSceneSetup when no npu traits present', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeComposition(), 'test-token');
    expect(result.npuSceneSetup).toBeUndefined();
  });

  it('emits npuSceneSetup when npu_detect trait is present', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneSetup).toBeDefined();
    expect(typeof result.npuSceneSetup).toBe('string');
    expect(result.npuSceneSetup!.length).toBeGreaterThan(0);
  });

  it('emits npuSceneSetup when npu_classify trait is present', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneSetup).toBeDefined();
  });

  // =========== ML Kit imports ===========

  it('imports ML Kit object detection for npu_detect', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneSetup).toContain('com.google.mlkit.vision.objects.ObjectDetection');
    expect(result.npuSceneSetup).toContain('ObjectDetectorOptions');
  });

  it('imports ML Kit image labeling for npu_classify', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneSetup).toContain('com.google.mlkit.vision.label.ImageLabeling');
    expect(result.npuSceneSetup).toContain('ImageLabelerOptions');
  });

  // =========== NPUDetection data class ===========

  it('generates NPUDetection data class', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneSetup).toContain('data class NPUDetection');
    expect(result.npuSceneSetup).toContain('val label: String');
    expect(result.npuSceneSetup).toContain('val confidence: Float');
  });

  // =========== Object Detection (npu_detect) ===========

  it('generates ObjectDetection client for npu_detect', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneSetup).toContain('ObjectDetection.getClient');
    expect(result.npuSceneSetup).toContain('detectObjects');
    expect(result.npuSceneSetup).toContain('STREAM_MODE');
  });

  // =========== Classification (npu_classify) ===========

  it('generates ImageLabeling client for npu_classify', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_classify']), 'test-token');
    expect(result.npuSceneSetup).toContain('ImageLabeling.getClient');
    expect(result.npuSceneSetup).toContain('classifyImage');
  });

  // =========== Segmentation (npu_segment) ===========

  it('generates segmenter for npu_segment', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_segment']), 'test-token');
    expect(result.npuSceneSetup).toContain('Segmentation.getClient');
    expect(result.npuSceneSetup).toContain('SelfieSegmenterOptions');
    expect(result.npuSceneSetup).toContain('segmentScene');
  });

  // =========== Entity Pipeline (npu_entity_pipe) ===========

  it('generates entity mapping for npu_entity_pipe', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_entity_pipe']), 'test-token');
    expect(result.npuSceneSetup).toContain('mapDetectionsToEntities');
    expect(result.npuSceneSetup).toContain('hitTest');
    expect(result.npuSceneSetup).toContain('AnchorNode');
  });

  // =========== Realtime (npu_realtime) ===========

  it('generates ImageAnalysis.Analyzer for npu_realtime', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(
      makeNPUComposition(['npu_realtime', 'npu_detect']),
      'test-token'
    );
    expect(result.npuSceneSetup).toContain('ImageAnalysis.Analyzer');
    expect(result.npuSceneSetup).toContain('createImageAnalyzer');
    expect(result.npuSceneSetup).toContain('targetFPS');
  });

  // =========== Custom Model (npu_model_custom) ===========

  it('generates NNAPI-accelerated TFLite loader for npu_model_custom', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_model_custom']), 'test-token');
    expect(result.npuSceneSetup).toContain('NnApiDelegate');
    expect(result.npuSceneSetup).toContain('Interpreter');
    expect(result.npuSceneSetup).toContain('loadCustomModel');
    expect(result.npuSceneSetup).toContain('LocalModel.Builder');
  });

  // =========== Label Overlay (npu_label_overlay) ===========

  it('generates ViewRenderable label overlay for npu_label_overlay', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_label_overlay']), 'test-token');
    expect(result.npuSceneSetup).toContain('createLabelOverlay');
    expect(result.npuSceneSetup).toContain('ViewRenderable');
    expect(result.npuSceneSetup).toContain('TextView');
  });

  // =========== NPUSceneManager class ===========

  it('generates NPUSceneManager ViewModel with custom className', () => {
    const compiler = new AndroidCompiler({ className: 'MyAR' });
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneSetup).toContain('class MyARNPUSceneManager');
    expect(result.npuSceneSetup).toContain('ViewModel()');
  });

  // =========== Package name ===========

  it('uses custom package name', () => {
    const compiler = new AndroidCompiler({ packageName: 'com.example.myapp' });
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneSetup).toContain('package com.example.myapp');
  });

  // =========== Multiple traits ===========

  it('includes all requested trait handlers', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(
      makeNPUComposition(['npu_detect', 'npu_classify', 'npu_segment', 'npu_label_overlay']),
      'test-token'
    );
    expect(result.npuSceneSetup).toContain('detectObjects');
    expect(result.npuSceneSetup).toContain('classifyImage');
    expect(result.npuSceneSetup).toContain('segmentScene');
    expect(result.npuSceneSetup).toContain('createLabelOverlay');
  });

  // =========== Does not include unused traits ===========

  it('does not include unused trait handlers', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneSetup).not.toContain('classifyImage');
    expect(result.npuSceneSetup).not.toContain('segmentScene');
    expect(result.npuSceneSetup).not.toContain('loadCustomModel');
  });

  // =========== Default config values ===========

  it('uses NPU_SCENE_DEFAULTS for configuration', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(makeNPUComposition(['npu_detect']), 'test-token');
    expect(result.npuSceneSetup).toContain('confidenceThreshold');
    expect(result.npuSceneSetup).toContain('maxDetections');
    expect(result.npuSceneSetup).toContain('0.6f'); // default confidence
  });

  // =========== Realtime dispatches to active traits ===========

  it('realtime analyzer calls only active processing methods', () => {
    const compiler = new AndroidCompiler();
    const result = compiler.compile(
      makeNPUComposition(['npu_realtime', 'npu_classify']),
      'test-token'
    );
    expect(result.npuSceneSetup).toContain('classifyImage(image)');
    expect(result.npuSceneSetup).not.toContain('detectObjects(image)');
  });
});

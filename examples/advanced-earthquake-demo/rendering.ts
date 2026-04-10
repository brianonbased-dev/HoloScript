import {
  InstancedMeshManager,
  PostProcessingManager,
  ShaderOptimizationManager,
  SceneInspector,
} from '@holoscript/core';
import * as THREE from 'three';

export interface RenderingSystems {
  instancing: InstancedMeshManager;
  postProcessing: PostProcessingManager;
  shaders: ShaderOptimizationManager;
  inspector: SceneInspector;
}

export function initializeAdvancedSystems(
  webglRenderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera
): RenderingSystems {
  // GPU Instancing for massive debris counts
  const instancing = new InstancedMeshManager();

  // Post-processing with high-quality effects
  const postProcessing = new PostProcessingManager({
    quality: 'high',
    ssao: {
      enabled: true,
      radius: 8,
      intensity: 1.5,
    },
    bloom: {
      enabled: true,
      strength: 1.2,
      threshold: 0.8,
    },
    taa: {
      enabled: true,
      sampleLevel: 2,
    },
    vignette: {
      enabled: true,
      darkness: 1.3,
    },
  });

  postProcessing.initialize(webglRenderer, scene, camera);

  // Custom optimized shaders
  const shaders = new ShaderOptimizationManager({
    useOptimizedParticles: true,
    useOptimizedDebris: true,
  });

  // Scene inspector for debugging
  const inspector = new SceneInspector({
    showFPS: true,
    showMemory: true,
    showAxes: true,
    showGrid: true,
    showBoundingBoxes: false, // Toggle with 'B' key
  });

  inspector.attach(scene, camera, webglRenderer);

  console.log('✅ Advanced rendering systems initialized');

  return { instancing, postProcessing, shaders, inspector };
}

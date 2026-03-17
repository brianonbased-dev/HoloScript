/**
 * Photogrammetry Trait
 *
 * Photo-derived 3D model integration with capture and processing support.
 * Handles photogrammetry pipeline from images to textured mesh.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type SourceType = 'images' | 'video' | 'depth_images' | 'lidar';
type QualityLevel = 'preview' | 'low' | 'medium' | 'high' | 'ultra';
type ProcessingStage =
  | 'idle'
  | 'uploading'
  | 'aligning'
  | 'dense_cloud'
  | 'meshing'
  | 'texturing'
  | 'complete';

interface PhotogrammetryState {
  isProcessing: boolean;
  stage: ProcessingStage;
  progress: number;
  imageCount: number;
  meshHandle: unknown;
  boundingBox: { min: [number, number, number]; max: [number, number, number] } | null;
  textureResolution: number;
}

interface PhotogrammetryConfig {
  source_type: SourceType;
  quality: QualityLevel;
  mesh_simplification: number; // 0-1
  texture_resolution: number;
  auto_align: boolean;
  geo_reference: boolean;
  coordinate_system: string;
  mask_background: boolean;
  feature_matching: 'sift' | 'orb' | 'superpoint';
}

// =============================================================================
// HANDLER
// =============================================================================

export const photogrammetryHandler: TraitHandler<PhotogrammetryConfig> = {
  name: 'photogrammetry',

  defaultConfig: {
    source_type: 'images',
    quality: 'medium',
    mesh_simplification: 0.5,
    texture_resolution: 2048,
    auto_align: true,
    geo_reference: false,
    coordinate_system: 'local',
    mask_background: true,
    feature_matching: 'sift',
  },

  onAttach(node, config, context) {
    const state: PhotogrammetryState = {
      isProcessing: false,
      stage: 'idle',
      progress: 0,
      imageCount: 0,
      meshHandle: null,
      boundingBox: null,
      textureResolution: config.texture_resolution,
    };
    node.__photogrammetryState = state;

    // Initialize photogrammetry processor
    context.emit?.('photogrammetry_init', {
      node,
      quality: config.quality,
      featureMatching: config.feature_matching,
      autoAlign: config.auto_align,
      geoReference: config.geo_reference,
    });
  },

  onDetach(node, config, context) {
    const state = node.__photogrammetryState as PhotogrammetryState;
    if (state?.meshHandle) {
      context.emit?.('photogrammetry_destroy', { node });
    }
    delete node.__photogrammetryState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Processing happens asynchronously via events
  },

  onEvent(node, config, context, event) {
    const state = node.__photogrammetryState as PhotogrammetryState;
    if (!state) return;

    if (event.type === 'photogrammetry_add_images') {
      const images = event.images as Array<string | ArrayBuffer>;
      state.imageCount += images.length;

      context.emit?.('photogrammetry_upload', {
        node,
        images,
        sourceType: config.source_type,
      });
    } else if (event.type === 'photogrammetry_start') {
      if (state.imageCount > 0) {
        state.isProcessing = true;
        state.stage = 'uploading';
        state.progress = 0;

        context.emit?.('photogrammetry_process', {
          node,
          quality: config.quality,
          meshSimplification: config.mesh_simplification,
          textureResolution: config.texture_resolution,
          maskBackground: config.mask_background,
        });
      }
    } else if (event.type === 'photogrammetry_progress') {
      state.stage = event.stage as ProcessingStage;
      state.progress = event.progress as number;

      context.emit?.('on_photogrammetry_progress', {
        node,
        stage: state.stage,
        progress: state.progress,
      });
    } else if (event.type === 'photogrammetry_complete') {
      state.isProcessing = false;
      state.stage = 'complete';
      state.progress = 100;
      state.meshHandle = event.mesh;
      state.boundingBox = event.boundingBox as typeof state.boundingBox;

      // Apply mesh to node
      context.emit?.('photogrammetry_apply_mesh', {
        node,
        mesh: event.mesh,
      });

      context.emit?.('on_capture_complete', {
        node,
        vertexCount: event.vertexCount as number,
        textureResolution: state.textureResolution,
      });
    } else if (event.type === 'photogrammetry_error') {
      state.isProcessing = false;
      context.emit?.('on_photogrammetry_error', {
        node,
        error: event.error,
        stage: state.stage,
      });
    } else if (event.type === 'photogrammetry_cancel') {
      state.isProcessing = false;
      state.stage = 'idle';
      state.progress = 0;

      context.emit?.('photogrammetry_abort', { node });
    } else if (event.type === 'photogrammetry_export') {
      const format = (event.format as string) || 'glb';

      context.emit?.('photogrammetry_export_mesh', {
        node,
        format,
        includeTexture: (event.includeTexture as boolean) ?? true,
      });
    } else if (event.type === 'photogrammetry_clear') {
      state.imageCount = 0;
      state.stage = 'idle';
      state.progress = 0;
      if (state.meshHandle) {
        context.emit?.('photogrammetry_clear_mesh', { node });
        state.meshHandle = null;
      }
    } else if (event.type === 'photogrammetry_query') {
      context.emit?.('photogrammetry_info', {
        queryId: event.queryId,
        node,
        isProcessing: state.isProcessing,
        stage: state.stage,
        progress: state.progress,
        imageCount: state.imageCount,
        hasMesh: state.meshHandle !== null,
        boundingBox: state.boundingBox,
      });
    }
  },
};

export default photogrammetryHandler;

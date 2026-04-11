import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface SceneReconstructionConfig {
  sceneId: string;
  referenceFrame: string;
  confidence: number;
  annotationCount: number;
}

const reconstructionState = new Map<string, { confidence: number; annotations: number }>();

export const sceneReconstructionHandler: TraitHandler<SceneReconstructionConfig> = {
  name: 'scene_reconstruction',
  defaultConfig: {
    sceneId: '',
    referenceFrame: 'world',
    confidence: 0,
    annotationCount: 0,
  },
  onAttach(node: HSPlusNode, config: SceneReconstructionConfig, ctx: TraitContext): void {
    const id = node.id ?? config.sceneId ?? 'unknown';
    reconstructionState.set(id, { confidence: config.confidence, annotations: config.annotationCount });
    ctx.emit?.('scene_reconstruction:attached', { nodeId: id, sceneId: config.sceneId });
  },
  onEvent(node: HSPlusNode, config: SceneReconstructionConfig, ctx: TraitContext, event: TraitEvent): void {
    const id = node.id ?? config.sceneId ?? 'unknown';
    const state = reconstructionState.get(id) ?? { confidence: 0, annotations: 0 };

    if (event.type === 'scene_reconstruction:add_annotation') {
      state.annotations += 1;
      config.annotationCount = state.annotations;
      reconstructionState.set(id, state);
      ctx.emit?.('scene_reconstruction:annotation_added', {
        nodeId: id,
        sceneId: config.sceneId,
        annotationCount: state.annotations,
      });
    }

    if (event.type === 'scene_reconstruction:update_confidence') {
      const value = Number(event.payload?.confidence ?? state.confidence);
      state.confidence = Math.max(0, Math.min(100, value));
      config.confidence = state.confidence;
      reconstructionState.set(id, state);
      ctx.emit?.('scene_reconstruction:confidence_updated', {
        nodeId: id,
        sceneId: config.sceneId,
        confidence: state.confidence,
      });
    }
  },
};

export const SCENE_RECONSTRUCTION_TRAIT = {
  name: 'scene_reconstruction',
  category: 'forensics',
  description: 'Scene timeline/spatial reconstruction with annotations and confidence tracking.',
};

/**
 * MaterialX Trait
 *
 * MaterialX material description support for cross-platform material authoring.
 * Parses .mtlx files and applies to geometry.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ShadingModel = 'standard_surface' | 'gltf_pbr' | 'usd_preview_surface' | 'open_pbr';
type ColorSpace = 'srgb' | 'linear' | 'raw' | 'acescg';

interface MaterialXState {
  isLoaded: boolean;
  isLoading: boolean;
  materialId: string | null;
  nodeGraph: Map<string, unknown>;
  inputs: Map<string, unknown>;
  compiledShader: unknown;
}

interface MaterialXConfig {
  source: string; // URL to .mtlx file
  material_name: string; // Material to use from file
  node_graph: string; // Node graph to use
  color_space: ColorSpace;
  shading_model: ShadingModel;
  texture_path: string; // Base path for textures
  compile_to_glsl: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const materialXHandler: TraitHandler<MaterialXConfig> = {
  name: 'material_x',

  defaultConfig: {
    source: '',
    material_name: '',
    node_graph: '',
    color_space: 'srgb',
    shading_model: 'standard_surface',
    texture_path: '',
    compile_to_glsl: true,
  },

  onAttach(node, config, context) {
    const state: MaterialXState = {
      isLoaded: false,
      isLoading: false,
      materialId: null,
      nodeGraph: new Map(),
      inputs: new Map(),
      compiledShader: null,
    };
    node.__materialXState = state;

    if (config.source) {
      loadMaterialX(node, state, config, context);
    }
  },

  onDetach(node, config, context) {
    const state = node.__materialXState as MaterialXState;
    if (state?.materialId) {
      context.emit?.('materialx_destroy', { node });
    }
    delete node.__materialXState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // MaterialX is mostly static, no per-frame updates needed
  },

  onEvent(node, config, context, event) {
    const state = node.__materialXState as MaterialXState;
    if (!state) return;

    if (event.type === 'materialx_loaded') {
      state.isLoading = false;
      state.isLoaded = true;
      state.materialId = event.materialId as string;
      state.compiledShader = event.shader;

      // Apply material to geometry
      context.emit?.('materialx_apply', {
        node,
        materialId: state.materialId,
      });

      context.emit?.('on_format_converted', {
        node,
        materialId: state.materialId,
      });
    } else if (event.type === 'materialx_error') {
      state.isLoading = false;
      context.emit?.('on_materialx_error', {
        node,
        error: event.error,
      });
    } else if (event.type === 'materialx_set_input') {
      const inputName = event.name as string;
      const value = event.value;

      state.inputs.set(inputName, value);

      context.emit?.('materialx_update_input', {
        node,
        materialId: state.materialId,
        inputName,
        value,
      });
    } else if (event.type === 'materialx_get_inputs') {
      context.emit?.('materialx_inputs', {
        node,
        inputs: Object.fromEntries(state.inputs),
      });
    } else if (event.type === 'materialx_reload') {
      if (config.source) {
        loadMaterialX(node, state, config, context);
      }
    } else if (event.type === 'materialx_set_source') {
      const newSource = event.source as string;
      if (state.materialId) {
        context.emit?.('materialx_destroy', { node });
      }
      state.isLoaded = false;
      state.materialId = null;

      loadMaterialX(node, state, { ...config, source: newSource }, context);
    } else if (event.type === 'materialx_query') {
      context.emit?.('materialx_info', {
        queryId: event.queryId,
        node,
        isLoaded: state.isLoaded,
        materialId: state.materialId,
        inputCount: state.inputs.size,
        nodeGraphSize: state.nodeGraph.size,
      });
    }
  },
};

function loadMaterialX(
  node: unknown,
  state: MaterialXState,
  config: MaterialXConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  state.isLoading = true;

  context.emit?.('materialx_load', {
    node,
    source: config.source,
    materialName: config.material_name,
    nodeGraph: config.node_graph,
    colorSpace: config.color_space,
    shadingModel: config.shading_model,
    texturePath: config.texture_path,
    compileToGlsl: config.compile_to_glsl,
  });
}

export default materialXHandler;

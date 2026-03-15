/**
 * Portable Trait
 *
 * Asset portability across worlds and platforms.
 * Handles export, import, and interoperability standards.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

type ExportFormat = 'gltf' | 'glb' | 'usdz' | 'vrm' | 'fbx';
type MetadataStandard = 'gltf_pbr' | 'usd_preview' | 'vrm_meta' | 'custom';

interface PortableState {
  isExportReady: boolean;
  lastExportTime: number;
  exportedFormats: Set<ExportFormat>;
  portabilityScore: number; // 0-1, how portable the asset is
  warnings: string[];
}

interface PortableConfig {
  interoperable: boolean;
  export_formats: ExportFormat[];
  metadata_standard: MetadataStandard;
  cross_platform: boolean;
  version: string;
  preserve_animations: boolean;
  preserve_physics: boolean;
  optimize_for_web: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const portableHandler: TraitHandler<PortableConfig> = {
  name: 'portable',

  defaultConfig: {
    interoperable: true,
    export_formats: ['gltf'],
    metadata_standard: 'gltf_pbr',
    cross_platform: true,
    version: '1.0',
    preserve_animations: true,
    preserve_physics: false,
    optimize_for_web: true,
  },

  onAttach(node, config, context) {
    const state: PortableState = {
      isExportReady: false,
      lastExportTime: 0,
      exportedFormats: new Set(),
      portabilityScore: 0,
      warnings: [],
    };
    (node as any).__portableState = state;

    // Analyze portability
    analyzePortability(node, state, config, context);
  },

  onDetach(node) {
    delete (node as any).__portableState;
  },

  onUpdate(_node, _config, _context, _delta) {
    // Portability is event-driven, no per-frame updates
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__portableState as PortableState;
    if (!state) return;

    if (event.type === 'portable_export') {
      const format = (event.format as ExportFormat) || config.export_formats[0];

      if (!config.export_formats.includes(format)) {
        context.emit?.('on_portable_error', {
          node,
          error: `Format ${format} not in allowed formats`,
        });
        return;
      }

      context.emit?.('portable_generate_export', {
        node,
        format,
        metadataStandard: config.metadata_standard,
        preserveAnimations: config.preserve_animations,
        preservePhysics: config.preserve_physics,
        optimizeForWeb: config.optimize_for_web,
        version: config.version,
      });
    } else if (event.type === 'portable_export_complete') {
      const format = event.format as ExportFormat;
      state.exportedFormats.add(format);
      state.lastExportTime = Date.now();
      state.isExportReady = true;

      context.emit?.('on_asset_ported', {
        node,
        format,
        size: event.size as number,
        url: event.url as string,
      });
    } else if (event.type === 'portable_import') {
      const data = event.data as ArrayBuffer;
      const format = event.format as ExportFormat;

      context.emit?.('portable_process_import', {
        node,
        data,
        format,
        applyToNode: (event.applyToNode as boolean) ?? true,
      });
    } else if (event.type === 'portable_import_complete') {
      context.emit?.('on_asset_imported', {
        node,
        format: event.format,
      });
    } else if (event.type === 'portable_validate') {
      analyzePortability(node, state, config, context);

      context.emit?.('portable_validation_result', {
        node,
        score: state.portabilityScore,
        warnings: state.warnings,
        isReady: state.isExportReady,
      });
    } else if (event.type === 'portable_get_metadata') {
      context.emit?.('portable_extract_metadata', {
        node,
        standard: config.metadata_standard,
      });
    } else if (event.type === 'portable_query') {
      context.emit?.('portable_info', {
        queryId: event.queryId,
        node,
        isExportReady: state.isExportReady,
        exportedFormats: Array.from(state.exportedFormats),
        portabilityScore: state.portabilityScore,
        warnings: state.warnings,
        supportedFormats: config.export_formats,
      });
    }
  },
};

function analyzePortability(
  node: unknown,
  state: PortableState,
  config: PortableConfig,
  context: { emit?: (event: string, data: unknown) => void }
): void {
  state.warnings = [];
  let score = 1.0;

  // Check for non-portable features
  const nodeAny = node as Record<string, unknown>;

  if (nodeAny.customShader) {
    state.warnings.push('Custom shaders may not be portable');
    score -= 0.2;
  }

  if (nodeAny.scripts && !config.cross_platform) {
    state.warnings.push('Scripts require cross-platform mode');
    score -= 0.1;
  }

  if (config.preserve_physics) {
    state.warnings.push('Physics preservation is experimental');
    score -= 0.1;
  }

  state.portabilityScore = Math.max(0, score);
  state.isExportReady = score >= 0.5;

  context.emit?.('portable_analysis_complete', {
    node,
    score: state.portabilityScore,
    warnings: state.warnings,
  });
}

export default portableHandler;

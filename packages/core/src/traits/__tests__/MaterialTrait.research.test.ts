/**
 * MaterialTrait Research Implementation Tests
 *
 * Tests for neural material type (W.SIG25.06) and GS-editable config (P.SIG25.01).
 */

import { describe, it, expect } from 'vitest';
import type {
  MaterialType,
  NeuralMaterialConfig,
  NeuralInputFeature,
  GSEditableConfig,
} from '../MaterialTrait';

// =============================================================================
// MaterialType — neural type
// =============================================================================

describe('MaterialType (neural)', () => {
  it('accepts "neural" as a valid MaterialType', () => {
    const type: MaterialType = 'neural';
    expect(type).toBe('neural');
  });

  it('accepts all standard types alongside neural', () => {
    const types: MaterialType[] = [
      'pbr',
      'standard',
      'unlit',
      'transparent',
      'volumetric',
      'custom',
      'neural',
    ];
    expect(types).toHaveLength(7);
  });
});

// =============================================================================
// NeuralMaterialConfig (W.SIG25.06)
// =============================================================================

describe('NeuralMaterialConfig', () => {
  it('accepts a complete neural config', () => {
    const config: NeuralMaterialConfig = {
      modelPath: '/models/subsurface.onnx',
      inputFeatures: ['view_direction', 'light_direction', 'surface_normal'],
      device: 'gpu',
      maxInferenceMs: 1.0,
      fallbackType: 'pbr',
    };
    expect(config.modelPath).toBe('/models/subsurface.onnx');
    expect(config.inputFeatures).toHaveLength(3);
    expect(config.device).toBe('gpu');
    expect(config.maxInferenceMs).toBe(1.0);
    expect(config.fallbackType).toBe('pbr');
  });

  it('supports all inference devices', () => {
    const devices: NeuralMaterialConfig['device'][] = ['gpu', 'cpu', 'npu'];
    expect(devices).toHaveLength(3);
  });

  it('supports all input features', () => {
    const features: NeuralInputFeature[] = [
      'view_direction',
      'light_direction',
      'surface_normal',
      'uv_coordinates',
      'world_position',
      'time',
    ];
    expect(features).toHaveLength(6);
  });
});

// =============================================================================
// GSEditableConfig (P.SIG25.01)
// =============================================================================

describe('GSEditableConfig', () => {
  it('accepts a complete GS-editable config', () => {
    const config: GSEditableConfig = {
      enabled: true,
      maxEditRadius: 2.5,
      brushType: 'sculpt',
      undoSteps: 50,
      networkSync: true,
    };
    expect(config.enabled).toBe(true);
    expect(config.maxEditRadius).toBe(2.5);
    expect(config.brushType).toBe('sculpt');
    expect(config.undoSteps).toBe(50);
    expect(config.networkSync).toBe(true);
  });

  it('supports all brush types', () => {
    const brushes: GSEditableConfig['brushType'][] = ['paint', 'sculpt', 'erase', 'clone'];
    expect(brushes).toHaveLength(4);
  });
});
